"use strict";

class YamlParseError extends Error {
  constructor(message, lineNumber) {
    super(lineNumber ? `YAML parse error at line ${lineNumber}: ${message}` : `YAML parse error: ${message}`);
    this.name = "YamlParseError";
    this.lineNumber = lineNumber;
  }
}

function stripComment(line) {
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "'" && !doubleQuoted) {
      if (singleQuoted && line[i + 1] === "'") {
        i += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      continue;
    }
    if (char === '"' && !singleQuoted) {
      const prev = line[i - 1];
      if (prev !== "\\") {
        doubleQuoted = !doubleQuoted;
      }
      continue;
    }
    if (char === "#" && !singleQuoted && !doubleQuoted) {
      const prev = i === 0 ? " " : line[i - 1];
      if (/\s/.test(prev)) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function tokenize(text) {
  const rawLines = text.split(/\r?\n/);
  const tokens = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const rawLine = rawLines[i];
    if (/\t/.test(rawLine)) {
      throw new YamlParseError("tabs are not allowed for indentation", i + 1);
    }
    const uncommented = stripComment(rawLine).replace(/[ \t]+$/, "");
    if (!uncommented.trim()) {
      continue;
    }
    const trimmed = uncommented.trim();
    if (trimmed === "---" || trimmed === "...") {
      continue;
    }
    const indent = uncommented.match(/^ */)[0].length;
    tokens.push({
      indent,
      content: uncommented.slice(indent),
      lineNumber: i + 1,
    });
  }
  return tokens;
}

function findUnquotedColon(input) {
  let singleQuoted = false;
  let doubleQuoted = false;
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "'" && !doubleQuoted) {
      if (singleQuoted && input[i + 1] === "'") {
        i += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      continue;
    }
    if (char === '"' && !singleQuoted) {
      const prev = input[i - 1];
      if (prev !== "\\") {
        doubleQuoted = !doubleQuoted;
      }
      continue;
    }
    if (!singleQuoted && !doubleQuoted) {
      if (char === "[" || char === "{") {
        depth += 1;
      } else if (char === "]" || char === "}") {
        depth -= 1;
      } else if (char === ":" && depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function splitInlineList(input) {
  const items = [];
  let current = "";
  let singleQuoted = false;
  let doubleQuoted = false;
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "'" && !doubleQuoted) {
      if (singleQuoted && input[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      current += char;
      continue;
    }
    if (char === '"' && !singleQuoted) {
      const prev = input[i - 1];
      if (prev !== "\\") {
        doubleQuoted = !doubleQuoted;
      }
      current += char;
      continue;
    }
    if (!singleQuoted && !doubleQuoted) {
      if (char === "[" || char === "{") {
        depth += 1;
      } else if (char === "]" || char === "}") {
        depth -= 1;
      } else if (char === "," && depth === 0) {
        items.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) {
    items.push(current.trim());
  }
  return items;
}

function parseScalar(input, lineNumber) {
  if (input === "null" || input === "~") {
    return null;
  }
  if (input === "true") {
    return true;
  }
  if (input === "false") {
    return false;
  }
  if (/^-?\d+$/.test(input)) {
    return Number.parseInt(input, 10);
  }
  if (/^-?(\d+\.\d*|\d*\.\d+)$/.test(input)) {
    return Number.parseFloat(input);
  }
  if (input.startsWith('"') && input.endsWith('"')) {
    try {
      return JSON.parse(input);
    } catch (error) {
      throw new YamlParseError(`invalid double-quoted string: ${error.message}`, lineNumber);
    }
  }
  if (input.startsWith("'") && input.endsWith("'")) {
    return input.slice(1, -1).replace(/''/g, "'");
  }
  if (input.startsWith("[") && input.endsWith("]")) {
    const content = input.slice(1, -1).trim();
    if (!content) {
      return [];
    }
    return splitInlineList(content).map((item) => parseScalar(item, lineNumber));
  }
  if (input.startsWith("{") && input.endsWith("}")) {
    const content = input.slice(1, -1).trim();
    if (!content) {
      return {};
    }
    const obj = {};
    const pieces = splitInlineList(content);
    for (const piece of pieces) {
      const colonIndex = findUnquotedColon(piece);
      if (colonIndex < 0) {
        throw new YamlParseError(`invalid inline object entry: ${piece}`, lineNumber);
      }
      const key = piece.slice(0, colonIndex).trim();
      const value = piece.slice(colonIndex + 1).trim();
      obj[stripKey(key, lineNumber)] = parseScalar(value, lineNumber);
    }
    return obj;
  }
  return input;
}

function stripKey(rawKey, lineNumber) {
  const key = rawKey.trim();
  if (!key) {
    throw new YamlParseError("mapping key cannot be empty", lineNumber);
  }
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    return parseScalar(key, lineNumber);
  }
  return key;
}

function parseBlock(tokens, index, indent) {
  if (index >= tokens.length) {
    return { value: null, nextIndex: index };
  }
  if (tokens[index].indent < indent) {
    return { value: null, nextIndex: index };
  }
  if (tokens[index].indent > indent) {
    throw new YamlParseError("unexpected indentation", tokens[index].lineNumber);
  }
  if (tokens[index].content.startsWith("- ") || tokens[index].content === "-") {
    return parseSequence(tokens, index, indent);
  }
  return parseMapping(tokens, index, indent, {});
}

function parseSequence(tokens, index, indent) {
  const array = [];
  let cursor = index;

  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token.indent < indent) {
      break;
    }
    if (token.indent > indent) {
      throw new YamlParseError("unexpected indentation inside sequence", token.lineNumber);
    }
    if (!token.content.startsWith("- ") && token.content !== "-") {
      break;
    }

    const inline = token.content === "-" ? "" : token.content.slice(2).trim();
    cursor += 1;

    if (!inline) {
      const parsed = parseBlock(tokens, cursor, indent + 2);
      array.push(parsed.value);
      cursor = parsed.nextIndex;
      continue;
    }

    const colonIndex = findUnquotedColon(inline);
    if (colonIndex >= 0) {
      const key = stripKey(inline.slice(0, colonIndex), token.lineNumber);
      const remainder = inline.slice(colonIndex + 1).trim();
      const objectValue = {};
      if (!remainder) {
        const nested = parseBlock(tokens, cursor, indent + 2);
        objectValue[key] = nested.value;
        cursor = nested.nextIndex;
      } else {
        objectValue[key] = parseScalar(remainder, token.lineNumber);
      }
      const mapping = parseMapping(tokens, cursor, indent + 2, objectValue, true);
      array.push(mapping.value);
      cursor = mapping.nextIndex;
      continue;
    }

    array.push(parseScalar(inline, token.lineNumber));
  }

  return { value: array, nextIndex: cursor };
}

function parseMapping(tokens, index, indent, seedObject, allowEmpty = false) {
  const objectValue = seedObject || {};
  let cursor = index;

  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token.indent < indent) {
      break;
    }
    if (token.indent > indent) {
      throw new YamlParseError("unexpected indentation inside mapping", token.lineNumber);
    }
    if (token.content.startsWith("- ") || token.content === "-") {
      break;
    }

    const colonIndex = findUnquotedColon(token.content);
    if (colonIndex < 0) {
      throw new YamlParseError("mapping entry must contain ':'", token.lineNumber);
    }

    const key = stripKey(token.content.slice(0, colonIndex), token.lineNumber);
    const remainder = token.content.slice(colonIndex + 1).trim();
    cursor += 1;

    if (!remainder) {
      const nested = parseBlock(tokens, cursor, indent + 2);
      objectValue[key] = nested.value;
      cursor = nested.nextIndex;
      continue;
    }

    objectValue[key] = parseScalar(remainder, token.lineNumber);
  }

  if (!allowEmpty && Object.keys(objectValue).length === 0) {
    throw new YamlParseError("empty mapping is not allowed in this context", tokens[index] ? tokens[index].lineNumber : undefined);
  }

  return { value: objectValue, nextIndex: cursor };
}

function parseYaml(text) {
  if (typeof text !== "string") {
    throw new YamlParseError("input must be a string");
  }
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return {};
  }
  const parsed = parseBlock(tokens, 0, tokens[0].indent);
  if (parsed.nextIndex !== tokens.length) {
    const token = tokens[parsed.nextIndex];
    throw new YamlParseError("unexpected trailing content", token.lineNumber);
  }
  return parsed.value;
}

module.exports = {
  YamlParseError,
  parseYaml,
};

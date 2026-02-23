(function () {
  "use strict";

  function escapeHtml(input) {
    return String(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getExplicitLanguage(codeEl) {
    if (codeEl.dataset && codeEl.dataset.lang) {
      return codeEl.dataset.lang.toLowerCase();
    }

    for (const className of codeEl.classList) {
      if (className.startsWith("language-")) {
        return className.slice("language-".length).toLowerCase();
      }
    }
    return "";
  }

  function inferLanguage(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return "text";
    }

    try {
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
        || (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        JSON.parse(trimmed);
        return "json";
      }
    } catch (_error) {
      // Not JSON.
    }

    if (/^\s*[A-Za-z0-9_.-]+\s*:\s/m.test(text) || /^\s*-\s+[A-Za-z0-9_.-]+\s*:/m.test(text)) {
      return "yaml";
    }

    if (
      /^\s*(\$ )?(curl|node|pnpm|npm|git|covenant|python|cat|echo|cd|ls|grep|rg)\b/m.test(text)
      || /^\s*#(?!\{)/m.test(text)
    ) {
      return "bash";
    }

    if (/\b(function|const|let|var|return|if|else|=>|document\.|window\.)\b/.test(text)) {
      return "javascript";
    }

    return "text";
  }

  function highlightNumbers(input) {
    return input.replace(/(^|[^\w."])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=$|[^\w."])/g, "$1<span class=\"tok-num\">$2</span>");
  }

  function highlightJson(text) {
    let out = escapeHtml(text);
    out = out.replace(/("(?:\\.|[^"\\])*")(\s*:)/g, "<span class=\"tok-key\">$1</span>$2");
    out = out.replace(/(:\s*)("(?:\\.|[^"\\])*")/g, "$1<span class=\"tok-str\">$2</span>");
    out = out.replace(/\b(true|false)\b/g, "<span class=\"tok-bool\">$1</span>");
    out = out.replace(/\bnull\b/g, "<span class=\"tok-null\">null</span>");
    out = highlightNumbers(out);
    return out;
  }

  function highlightYamlValue(valueEscaped) {
    let out = valueEscaped;
    out = out.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, "<span class=\"tok-str\">$1</span>");
    out = out.replace(/\b(true|false)\b/g, "<span class=\"tok-bool\">$1</span>");
    out = out.replace(/\bnull\b|~\b/g, "<span class=\"tok-null\">null</span>");
    out = highlightNumbers(out);
    return out;
  }

  function highlightYaml(text) {
    return text
      .split("\n")
      .map((line) => {
        if (/^\s*#/.test(line)) {
          return "<span class=\"tok-comment\">" + escapeHtml(line) + "</span>";
        }

        const escaped = escapeHtml(line);
        const match = escaped.match(/^(\s*-\s*)?([A-Za-z0-9_.-]+)(\s*:\s*)(.*)$/);
        if (!match) {
          return highlightYamlValue(escaped);
        }

        const prefix = match[1] || "";
        const key = "<span class=\"tok-key\">" + match[2] + "</span>";
        const colon = "<span class=\"tok-punc\">" + match[3] + "</span>";
        const value = highlightYamlValue(match[4]);
        return prefix + key + colon + value;
      })
      .join("\n");
  }

  function highlightBash(text) {
    return text
      .split("\n")
      .map((line) => {
        if (/^\s*#/.test(line)) {
          return "<span class=\"tok-comment\">" + escapeHtml(line) + "</span>";
        }

        const escaped = escapeHtml(line);
        const promptMatch = escaped.match(/^(\s*\$\s+)(.*)$/);
        const input = promptMatch ? promptMatch[2] : escaped;
        const prompt = promptMatch ? "<span class=\"tok-punc\">" + promptMatch[1] + "</span>" : "";
        const cmdMatch = input.match(/^(\s*)([A-Za-z0-9._/:-]+)(\b)(.*)$/);
        if (!cmdMatch) {
          return prompt + input;
        }
        let tail = cmdMatch[4];
        tail = tail.replace(/(^|\s)(--?[A-Za-z0-9][A-Za-z0-9-]*)/g, "$1<span class=\"tok-flag\">$2</span>");
        tail = tail.replace(/(^|\s)(\/[A-Za-z0-9._/\-]+)/g, "$1<span class=\"tok-path\">$2</span>");
        return (
          prompt
          + cmdMatch[1]
          + "<span class=\"tok-cmd\">" + cmdMatch[2] + "</span>"
          + cmdMatch[3]
          + tail
        );
      })
      .join("\n");
  }

  function highlightJavascript(text) {
    let out = escapeHtml(text);
    out = out.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, "<span class=\"tok-str\">$1</span>");
    out = out.replace(/\b(const|let|var|function|return|if|else|for|while|new|try|catch|throw)\b/g, "<span class=\"tok-kw\">$1</span>");
    out = out.replace(/\b(true|false)\b/g, "<span class=\"tok-bool\">$1</span>");
    out = out.replace(/\bnull\b|\bundefined\b/g, "<span class=\"tok-null\">$&</span>");
    out = out.replace(/(^|\s)(\/\/.*)$/gm, "$1<span class=\"tok-comment\">$2</span>");
    out = highlightNumbers(out);
    return out;
  }

  function highlightByLanguage(language, text) {
    switch (language) {
      case "json":
        return highlightJson(text);
      case "yaml":
      case "yml":
        return highlightYaml(text);
      case "bash":
      case "shell":
      case "sh":
        return highlightBash(text);
      case "js":
      case "javascript":
        return highlightJavascript(text);
      default:
        return escapeHtml(text);
    }
  }

  function highlightText(text, language) {
    return highlightByLanguage(normalizeLangLabel(language || inferLanguage(text)), text || "");
  }

  function normalizeLangLabel(language) {
    switch (language) {
      case "yml":
        return "yaml";
      case "sh":
      case "shell":
        return "bash";
      case "js":
        return "javascript";
      default:
        return language;
    }
  }

  function ensureCodeNode(preEl) {
    if (!preEl) {
      return null;
    }
    let codeEl = preEl.querySelector(":scope > code");
    if (codeEl) {
      return codeEl;
    }
    codeEl = document.createElement("code");
    codeEl.textContent = preEl.textContent || "";
    preEl.textContent = "";
    preEl.appendChild(codeEl);
    return codeEl;
  }

  function highlightBlock(codeEl) {
    if (!codeEl || codeEl.dataset.highlighted === "true") {
      return;
    }

    const rawText = codeEl.textContent || "";
    const explicit = getExplicitLanguage(codeEl);
    const detected = explicit || inferLanguage(rawText);
    const language = normalizeLangLabel(detected);
    const pre = codeEl.closest("pre");

    codeEl.innerHTML = highlightByLanguage(language, rawText);
    codeEl.dataset.highlighted = "true";
    codeEl.classList.add("code-highlighted");

    if (pre) {
      pre.classList.add("code-block");
      pre.dataset.codeLang = language;
    }
  }

  function highlightPre(preEl) {
    const codeEl = ensureCodeNode(preEl);
    if (!codeEl) {
      return;
    }
    if (codeEl.dataset.highlighted === "true") {
      codeEl.dataset.highlighted = "false";
    }
    highlightBlock(codeEl);
  }

  function refreshAll(root) {
    const scope = root || document;
    if (scope.tagName && scope.tagName.toLowerCase() === "pre") {
      highlightPre(scope);
      return;
    }
    const preNodes = scope.querySelectorAll ? scope.querySelectorAll("pre") : [];
    preNodes.forEach(highlightPre);
  }

  function init() {
    refreshAll(document);
  }

  if (typeof window !== "undefined") {
    window.CovenantHighlight = {
      inferLanguage,
      highlightText,
      refresh: refreshAll,
      highlightPre,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
    return;
  }
  init();
})();

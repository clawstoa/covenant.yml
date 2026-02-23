(function () {
  "use strict";

  const ACTIONS = [
    "issue.open",
    "issue.comment",
    "issue.label",
    "issue.solve",
    "pull_request.open",
    "pull_request.update",
    "pull_request.review.submit",
    "pull_request.review.approve",
    "pull_request.merge",
    "conversation.intervene_human_thread",
    "conversation.intervene_agent_thread",
    "maintenance.cleanup",
    "routing.to_develop_bot"
  ];

  const OUTCOME_SEVERITY = {
    allow: 0,
    warn: 1,
    deny: 2
  };

  function stripComment(line) {
    let single = false;
    let double = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "'" && !double) {
        if (single && line[i + 1] === "'") {
          i += 1;
          continue;
        }
        single = !single;
        continue;
      }
      if (ch === '"' && !single) {
        if (line[i - 1] !== "\\") {
          double = !double;
        }
        continue;
      }
      if (ch === "#" && !single && !double && (i === 0 || /\s/.test(line[i - 1]))) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function findColon(input) {
    let single = false;
    let double = false;
    let depth = 0;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (ch === "'" && !double) {
        if (single && input[i + 1] === "'") {
          i += 1;
          continue;
        }
        single = !single;
        continue;
      }
      if (ch === '"' && !single) {
        if (input[i - 1] !== "\\") {
          double = !double;
        }
        continue;
      }
      if (!single && !double) {
        if (ch === "[" || ch === "{") depth += 1;
        if (ch === "]" || ch === "}") depth -= 1;
        if (ch === ":" && depth === 0) return i;
      }
    }
    return -1;
  }

  function splitInlineList(input) {
    const out = [];
    let current = "";
    let single = false;
    let double = false;
    let depth = 0;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (ch === "'" && !double) {
        if (single && input[i + 1] === "'") {
          current += "''";
          i += 1;
          continue;
        }
        single = !single;
        current += ch;
        continue;
      }
      if (ch === '"' && !single) {
        if (input[i - 1] !== "\\") {
          double = !double;
        }
        current += ch;
        continue;
      }
      if (!single && !double) {
        if (ch === "[" || ch === "{") depth += 1;
        if (ch === "]" || ch === "}") depth -= 1;
        if (ch === "," && depth === 0) {
          out.push(current.trim());
          current = "";
          continue;
        }
      }
      current += ch;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  }

  function parseScalar(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "~") return null;
    if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
    if (/^-?(\d+\.\d*|\d*\.\d+)$/.test(value)) return Number.parseFloat(value);
    if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      if (!inner) return [];
      return splitInlineList(inner).map(parseScalar);
    }
    return value;
  }

  function tokenize(text) {
    const lines = text.split(/\r?\n/);
    const tokens = [];
    for (let i = 0; i < lines.length; i += 1) {
      const raw = stripComment(lines[i]).replace(/[ \t]+$/, "");
      if (!raw.trim() || raw.trim() === "---" || raw.trim() === "...") continue;
      if (/\t/.test(raw)) throw new Error(`tabs are not allowed (line ${i + 1})`);
      const indent = raw.match(/^ */)[0].length;
      tokens.push({ indent, content: raw.slice(indent), line: i + 1 });
    }
    return tokens;
  }

  function parseBlock(tokens, index, indent) {
    if (index >= tokens.length) return { value: null, next: index };
    if (tokens[index].indent < indent) return { value: null, next: index };
    if (tokens[index].indent > indent) throw new Error(`unexpected indentation at line ${tokens[index].line}`);
    if (tokens[index].content === "-" || tokens[index].content.startsWith("- ")) {
      return parseSequence(tokens, index, indent);
    }
    return parseMapping(tokens, index, indent, {});
  }

  function parseSequence(tokens, index, indent) {
    const arr = [];
    let i = index;
    while (i < tokens.length && tokens[i].indent === indent && (tokens[i].content === "-" || tokens[i].content.startsWith("- "))) {
      const inline = tokens[i].content === "-" ? "" : tokens[i].content.slice(2).trim();
      i += 1;
      if (!inline) {
        const nested = parseBlock(tokens, i, indent + 2);
        arr.push(nested.value);
        i = nested.next;
        continue;
      }
      const colonIndex = findColon(inline);
      if (colonIndex >= 0) {
        const key = inline.slice(0, colonIndex).trim();
        const rest = inline.slice(colonIndex + 1).trim();
        const obj = {};
        if (!rest) {
          const nested = parseBlock(tokens, i, indent + 2);
          obj[key] = nested.value;
          i = nested.next;
        } else {
          obj[key] = parseScalar(rest);
        }
        const merged = parseMapping(tokens, i, indent + 2, obj, true);
        arr.push(merged.value);
        i = merged.next;
      } else {
        arr.push(parseScalar(inline));
      }
    }
    return { value: arr, next: i };
  }

  function parseMapping(tokens, index, indent, seed, allowEmpty) {
    const obj = seed || {};
    let i = index;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.indent < indent) break;
      if (token.indent > indent) throw new Error(`unexpected indentation at line ${token.line}`);
      if (token.content === "-" || token.content.startsWith("- ")) break;

      const colonIndex = findColon(token.content);
      if (colonIndex < 0) throw new Error(`expected ':' in mapping at line ${token.line}`);
      const key = token.content.slice(0, colonIndex).trim();
      const rest = token.content.slice(colonIndex + 1).trim();
      i += 1;
      if (!rest) {
        const nested = parseBlock(tokens, i, indent + 2);
        obj[key] = nested.value;
        i = nested.next;
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    if (!allowEmpty && Object.keys(obj).length === 0) {
      throw new Error("empty mapping is not allowed");
    }
    return { value: obj, next: i };
  }

  function parseYaml(text) {
    const tokens = tokenize(text);
    if (tokens.length === 0) return {};
    const parsed = parseBlock(tokens, 0, tokens[0].indent);
    return parsed.value;
  }

  function validatePolicy(policy) {
    const errors = [];
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      return { valid: false, errors: ["policy must be an object"] };
    }

    if (!/^1\.\d+\.\d+$/.test(policy.spec_version || "")) {
      errors.push("spec_version must be v1 semantic version");
    }
    if (!policy.defaults || !["allow", "warn", "deny"].includes(policy.defaults.unmatched)) {
      errors.push("defaults.unmatched must be allow|warn|deny");
    }
    if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
      errors.push("rules must be a non-empty array");
    } else {
      for (const rule of policy.rules) {
        if (!rule.id || !rule.actor || !rule.action || !rule.outcome) {
          errors.push("each rule requires id, actor, action, outcome");
          continue;
        }
        if (!["allow", "warn", "deny"].includes(rule.outcome)) {
          errors.push(`rule ${rule.id} has invalid outcome`);
        }
        if (!(ACTIONS.includes(rule.action) || rule.action === "*" || /^[a-z_]+\.\*$/.test(rule.action))) {
          errors.push(`rule ${rule.id} has invalid action pattern`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function actorMatchScore(ruleActor, actorKind, actorId) {
    if (ruleActor === "any") return 0;
    if (ruleActor === actorKind) return 1;
    if (ruleActor === actorId) return 2;
    return -1;
  }

  function actionMatchScore(pattern, action) {
    if (pattern === "*") return 0;
    if (pattern === action) return 2;
    if (pattern.endsWith(".*") && action.startsWith(pattern.slice(0, -1))) return 1;
    return -1;
  }

  function targetMatchScore(ruleTarget, target) {
    if (!ruleTarget) return { matched: true, score: 0 };
    let score = 0;
    for (const [key, value] of Object.entries(ruleTarget)) {
      if (!target || target[key] !== value) return { matched: false, score: 0 };
      score += 1;
    }
    return { matched: true, score };
  }

  function evaluatePolicy(policy, event) {
    const actorKind = event.actor && event.actor.kind ? event.actor.kind : "human";
    const actorId = event.actor && event.actor.id ? event.actor.id : "unknown";

    const candidates = [];
    for (const rule of policy.rules) {
      const actorScore = actorMatchScore(rule.actor, actorKind, actorId);
      if (actorScore < 0) continue;
      const actionScore = actionMatchScore(rule.action, event.action);
      if (actionScore < 0) continue;
      const target = targetMatchScore(rule.target, event.target);
      if (!target.matched) continue;
      const conditionScore = rule.conditions ? Object.keys(rule.conditions).length : 0;
      candidates.push({
        rule,
        actorScore,
        actionScore,
        targetScore: target.score,
        conditionScore,
        outcomeScore: OUTCOME_SEVERITY[rule.outcome]
      });
    }

    candidates.sort((a, b) => {
      const keys = ["actorScore", "actionScore", "targetScore", "conditionScore", "outcomeScore"];
      for (const key of keys) {
        if (a[key] !== b[key]) return b[key] - a[key];
      }
      return a.rule.id.localeCompare(b.rule.id);
    });

    if (!candidates.length) {
      return {
        decision: policy.defaults.unmatched,
        selected_rule_id: null,
        reason_codes: ["defaults.unmatched"]
      };
    }

    return {
      decision: candidates[0].rule.outcome,
      selected_rule_id: candidates[0].rule.id,
      reason_codes: [`rule.selected.${candidates[0].rule.id}`]
    };
  }

  const samplePolicy = `spec_version: 1.0.0
defaults:
  unmatched: warn
rules:
  - id: block-agent-on-human-thread
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
  - id: agent-pr-open
    actor: agent
    action: pull_request.open
    target:
      branch: main
    outcome: warn
  - id: human-pr-open
    actor: human
    action: pull_request.open
    target:
      branch: main
    outcome: allow
`;

  const sampleEvent = {
    action: "pull_request.open",
    actor: { id: "ci-agent[bot]", kind: "agent" },
    target: { branch: "main", thread_mode: "mixed", labels: ["thread:agent"] }
  };

  const policyInput = document.getElementById("policyInput");
  const eventInput = document.getElementById("eventInput");
  const output = document.getElementById("playgroundOutput");
  const validateBtn = document.getElementById("validateBtn");
  const evaluateBtn = document.getElementById("evaluateBtn");
  const downloadButtons = document.querySelectorAll(".download-editor-btn");

  policyInput.value = samplePolicy;
  eventInput.value = JSON.stringify(sampleEvent, null, 2);

  function downloadText(filename, content, mimeType = "text/plain") {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function renderLineNumbers(textarea, numberColumn) {
    const lineCount = textarea.value.split("\n").length;
    const buffer = [];
    for (let i = 1; i <= lineCount; i += 1) {
      buffer.push(`<span>${i}</span>`);
    }
    numberColumn.innerHTML = buffer.join("");
    numberColumn.scrollTop = textarea.scrollTop;
  }

  function renderEditorHighlight(textarea, highlightCode, highlightPre) {
    if (!window.CovenantHighlight || !highlightCode) {
      return false;
    }
    const language = textarea.dataset.entryLang || window.CovenantHighlight.inferLanguage(textarea.value || "");
    highlightCode.innerHTML = window.CovenantHighlight.highlightText(textarea.value || "", language);
    highlightPre.dataset.codeLang = language;
    highlightPre.classList.add("code-block");
    return true;
  }

  function setupCodeEditors() {
    document.querySelectorAll("textarea.code-entry").forEach((textarea) => {
      const linedEditor = textarea.closest(".lined-editor");
      if (!linedEditor) {
        return;
      }
      const numberColumn = linedEditor.querySelector(".line-numbers");
      const highlightPre = linedEditor.querySelector(".editor-highlight");
      const highlightCode = highlightPre && highlightPre.querySelector("code");

      const update = () => {
        renderLineNumbers(textarea, numberColumn);
        const enhanced = renderEditorHighlight(textarea, highlightCode, highlightPre);
        textarea.classList.toggle("enhanced", enhanced);
        if (highlightPre) {
          highlightPre.scrollTop = textarea.scrollTop;
          highlightPre.scrollLeft = textarea.scrollLeft;
        }
      };

      textarea.addEventListener("input", update);
      textarea.addEventListener("scroll", update);
      update();
    });
  }

  function writeOutput(value) {
    output.textContent = JSON.stringify(value, null, 2);
    if (window.CovenantHighlight) {
      window.CovenantHighlight.refresh(output);
    }
  }

  validateBtn.addEventListener("click", function () {
    try {
      const policy = parseYaml(policyInput.value);
      const validation = validatePolicy(policy);
      writeOutput(validation);
    } catch (error) {
      writeOutput({ valid: false, errors: [error.message] });
    }
  });

  evaluateBtn.addEventListener("click", function () {
    try {
      const policy = parseYaml(policyInput.value);
      const validation = validatePolicy(policy);
      if (!validation.valid) {
        writeOutput(validation);
        return;
      }
      const event = JSON.parse(eventInput.value);
      const result = evaluatePolicy(policy, event);
      writeOutput(result);
    } catch (error) {
      writeOutput({ error: error.message });
    }
  });

  downloadButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target || "");
      if (!target) {
        return;
      }
      downloadText(
        button.dataset.filename || "entry.txt",
        target.value,
        button.dataset.mime || "text/plain"
      );
    });
  });

  setupCodeEditors();
})();

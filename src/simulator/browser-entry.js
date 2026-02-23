/* eslint-disable no-var */
(function attachSimulator(global) {
  "use strict";

  var ACTIONS = [
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
    "routing.to_develop_bot",
  ];

  var SIM_TYPES = [
    "code_evolution",
    "branch_operation",
    "issue_bug",
    "issue_feature_request",
    "discussion",
    "error_regression",
    "release",
    "maintenance",
  ];

  var DEFAULT_MAPPING = {
    code_evolution: "pull_request.update",
    branch_operation: "pull_request.open",
    issue_bug: "issue.open",
    issue_feature_request: "issue.open",
    discussion: "conversation.intervene_human_thread",
    error_regression: "issue.comment",
    release: "pull_request.merge",
    maintenance: "maintenance.cleanup",
  };

  var DEFAULT_WEIGHTS = {
    balanced: {
      code_evolution: 0.2,
      branch_operation: 0.1,
      issue_bug: 0.14,
      issue_feature_request: 0.12,
      discussion: 0.1,
      error_regression: 0.11,
      release: 0.11,
      maintenance: 0.12,
    },
    churn: {
      code_evolution: 0.26,
      branch_operation: 0.2,
      issue_bug: 0.08,
      issue_feature_request: 0.06,
      discussion: 0.05,
      error_regression: 0.19,
      release: 0.1,
      maintenance: 0.06,
    },
    "strict-stress": {
      code_evolution: 0.17,
      branch_operation: 0.16,
      issue_bug: 0.17,
      issue_feature_request: 0.13,
      discussion: 0.08,
      error_regression: 0.14,
      release: 0.07,
      maintenance: 0.08,
    },
  };

  var DEFAULT_FAULT_RATES = {
    missing_evidence: 0.1,
    missing_attestation: 0.08,
    invalid_attestation: 0.04,
    ineligible_label: 0.12,
    thread_mode_mismatch: 0.08,
  };

  function stableStringify(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      var items = value.map(stableStringify);
      return "[" + items.join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    var parts = keys.map(function (key) {
      return JSON.stringify(key) + ":" + stableStringify(value[key]);
    });
    return "{" + parts.join(",") + "}";
  }

  function computePolicyHash(policy) {
    var canonical = stableStringify(policy);
    var hash = 0;
    for (var i = 0; i < canonical.length; i += 1) {
      hash = (hash * 31 + canonical.charCodeAt(i)) >>> 0;
    }
    return "sim-" + hash.toString(16);
  }

  function stripComment(line) {
    var single = false;
    var double = false;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line[i];
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
    var single = false;
    var double = false;
    var depth = 0;
    for (var i = 0; i < input.length; i += 1) {
      var ch = input[i];
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
    var out = [];
    var current = "";
    var single = false;
    var double = false;
    var depth = 0;
    for (var i = 0; i < input.length; i += 1) {
      var ch = input[i];
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
      var inner = value.slice(1, -1).trim();
      if (!inner) return [];
      return splitInlineList(inner).map(parseScalar);
    }
    return value;
  }

  function tokenize(text) {
    var lines = text.split(/\r?\n/);
    var tokens = [];
    for (var i = 0; i < lines.length; i += 1) {
      var raw = stripComment(lines[i]).replace(/[ \t]+$/, "");
      if (!raw.trim() || raw.trim() === "---" || raw.trim() === "...") continue;
      if (/\t/.test(raw)) throw new Error("tabs are not allowed (line " + (i + 1) + ")");
      var indent = raw.match(/^ */)[0].length;
      tokens.push({ indent: indent, content: raw.slice(indent), line: i + 1 });
    }
    return tokens;
  }

  function parseBlock(tokens, index, indent) {
    if (index >= tokens.length) return { value: null, next: index };
    if (tokens[index].indent < indent) return { value: null, next: index };
    if (tokens[index].indent > indent) throw new Error("unexpected indentation at line " + tokens[index].line);
    if (tokens[index].content === "-" || tokens[index].content.startsWith("- ")) {
      return parseSequence(tokens, index, indent);
    }
    return parseMapping(tokens, index, indent, {});
  }

  function parseSequence(tokens, index, indent) {
    var arr = [];
    var i = index;
    while (i < tokens.length && tokens[i].indent === indent && (tokens[i].content === "-" || tokens[i].content.startsWith("- "))) {
      var inline = tokens[i].content === "-" ? "" : tokens[i].content.slice(2).trim();
      i += 1;
      if (!inline) {
        var nested = parseBlock(tokens, i, indent + 2);
        arr.push(nested.value);
        i = nested.next;
        continue;
      }
      var colon = findColon(inline);
      if (colon >= 0) {
        var key = inline.slice(0, colon).trim();
        var rest = inline.slice(colon + 1).trim();
        var obj = {};
        if (!rest) {
          var nestedObj = parseBlock(tokens, i, indent + 2);
          obj[key] = nestedObj.value;
          i = nestedObj.next;
        } else {
          obj[key] = parseScalar(rest);
        }
        var merged = parseMapping(tokens, i, indent + 2, obj, true);
        arr.push(merged.value);
        i = merged.next;
      } else {
        arr.push(parseScalar(inline));
      }
    }
    return { value: arr, next: i };
  }

  function parseMapping(tokens, index, indent, seed, allowEmpty) {
    var obj = seed || {};
    var i = index;
    while (i < tokens.length) {
      var token = tokens[i];
      if (token.indent < indent) break;
      if (token.indent > indent) throw new Error("unexpected indentation at line " + token.line);
      if (token.content === "-" || token.content.startsWith("- ")) break;
      var colon = findColon(token.content);
      if (colon < 0) throw new Error("expected ':' in mapping at line " + token.line);
      var key = token.content.slice(0, colon).trim();
      var rest = token.content.slice(colon + 1).trim();
      i += 1;
      if (!rest) {
        var nested = parseBlock(tokens, i, indent + 2);
        obj[key] = nested.value;
        i = nested.next;
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    if (!allowEmpty && Object.keys(obj).length === 0) throw new Error("empty mapping is not allowed");
    return { value: obj, next: i };
  }

  function parseYaml(text) {
    var tokens = tokenize(text);
    if (!tokens.length) return {};
    return parseBlock(tokens, 0, tokens[0].indent).value;
  }

  function validatePolicy(policy) {
    var errors = [];
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      return { valid: false, errors: ["policy must be an object"] };
    }
    if (!/^1\.\d+\.\d+$/.test(policy.spec_version || "")) errors.push("spec_version must be v1 semantic version");
    if (!policy.defaults || !["allow", "warn", "deny"].includes(policy.defaults.unmatched)) {
      errors.push("defaults.unmatched must be allow|warn|deny");
    }
    if (!Array.isArray(policy.rules) || policy.rules.length === 0) errors.push("rules must be a non-empty array");
    return { valid: errors.length === 0, errors: errors };
  }

  function includesAny(haystack, needles) {
    return needles.some(function (needle) { return haystack.includes(needle); });
  }

  function evaluatePolicy(policy, event) {
    var labels = Array.isArray(event.target && event.target.labels) ? event.target.labels : [];
    if (
      event.actor && event.actor.kind === "agent"
      && policy.policies
      && policy.policies.agent_eligible_labels
      && event.action.indexOf("issue.") === 0
    ) {
      var gate = policy.policies.agent_eligible_labels;
      var gateActions = Array.isArray(gate.actions) && gate.actions.length ? gate.actions : ["issue.open", "issue.comment", "issue.label", "issue.solve"];
      if (gateActions.includes(event.action) && !includesAny(labels, gate.labels || [])) {
        return {
          decision: gate.on_missing || "deny",
          selected_rule_id: null,
          reason_codes: ["policies.agent_eligible_labels.missing"],
          matched_rule_count: 0,
        };
      }
    }

    var best = null;
    for (var i = 0; i < policy.rules.length; i += 1) {
      var rule = policy.rules[i];
      var actorOk = rule.actor === "any" || rule.actor === (event.actor && event.actor.kind) || rule.actor === (event.actor && event.actor.id);
      if (!actorOk) continue;
      var actionOk = rule.action === "*" || rule.action === event.action || (rule.action.endsWith(".*") && event.action.indexOf(rule.action.slice(0, -1)) === 0);
      if (!actionOk) continue;
      var targetOk = true;
      var targetScore = 0;
      if (rule.target) {
        for (var key in rule.target) {
          if (!event.target || event.target[key] !== rule.target[key]) {
            targetOk = false;
            break;
          }
          targetScore += 1;
        }
      }
      if (!targetOk) continue;
      var score = {
        actor: rule.actor === "any" ? 0 : (rule.actor === (event.actor && event.actor.id) ? 2 : 1),
        action: rule.action === "*" ? 0 : (rule.action === event.action ? 2 : 1),
        target: targetScore,
        strictness: rule.outcome === "deny" ? 2 : (rule.outcome === "warn" ? 1 : 0),
      };
      if (!best || score.actor > best.score.actor || (score.actor === best.score.actor && (score.action > best.score.action || (score.action === best.score.action && (score.target > best.score.target || (score.target === best.score.target && score.strictness > best.score.strictness)))))) {
        best = { rule: rule, score: score };
      }
    }

    if (!best) {
      return {
        decision: policy.defaults.unmatched,
        selected_rule_id: null,
        reason_codes: ["defaults.unmatched"],
        matched_rule_count: 0,
      };
    }

    var reasonCodes = ["rule.selected." + best.rule.id];
    var decision = best.rule.outcome;
    var requiredFields = null;
    if (policy.requirements && policy.requirements.default_provenance_profile && policy.requirements.provenance_profiles) {
      var defaultProfile = policy.requirements.provenance_profiles[policy.requirements.default_provenance_profile];
      if (defaultProfile && Array.isArray(defaultProfile.required_fields)) {
        requiredFields = defaultProfile.required_fields;
      }
    }
    if (best.rule.requirements && best.rule.requirements.provenance_profile && policy.requirements && policy.requirements.provenance_profiles) {
      var profile = policy.requirements.provenance_profiles[best.rule.requirements.provenance_profile];
      if (profile && Array.isArray(profile.required_fields)) {
        requiredFields = profile.required_fields;
      }
    }
    if (Array.isArray(requiredFields)) {
      var evidence = event.evidence || {};
      for (var j = 0; j < requiredFields.length; j += 1) {
        var field = requiredFields[j];
        if (evidence[field] === undefined || evidence[field] === null || evidence[field] === "") {
          reasonCodes.push("requirements.provenance.missing." + field);
          decision = "deny";
        }
      }
    }

    return {
      decision: decision,
      selected_rule_id: best.rule.id,
      reason_codes: reasonCodes,
      matched_rule_count: 1,
    };
  }

  function hashSeed(input) {
    var text = String(input);
    var h = 1779033703 ^ text.length;
    for (var i = 0; i < text.length; i += 1) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function createRng(seed) {
    var state = hashSeed(seed);
    return {
      next: function () {
        state += 0x6D2B79F5;
        var v = Math.imul(state ^ (state >>> 15), state | 1);
        v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
        return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
      },
      weighted: function (weights) {
        var entries = Object.entries(weights || {}).filter(function (entry) { return Number(entry[1]) > 0; });
        if (!entries.length) return null;
        var total = entries.reduce(function (sum, entry) { return sum + Number(entry[1]); }, 0);
        var threshold = this.next() * total;
        var running = 0;
        for (var i = 0; i < entries.length; i += 1) {
          running += Number(entries[i][1]);
          if (threshold <= running) return entries[i][0];
        }
        return entries[entries.length - 1][0];
      },
      pick: function (items) {
        if (!items || !items.length) return null;
        return items[Math.floor(this.next() * items.length)];
      },
      bool: function (p) {
        return this.next() < p;
      },
    };
  }

  function buildStoryChoices(input) {
    var reasons = new Set((input.policy_decision && input.policy_decision.reason_codes) || []);
    var choices = [];
    if ([].concat(Array.from(reasons)).some(function (code) { return code.indexOf("requirements.provenance.missing.") === 0; })) {
      choices.push({
        id: "add_provenance",
        label: "Attach complete provenance",
        explanation: "Adds model/provider/prompt/test evidence and retries the same action.",
      });
    }
    if (reasons.has("policies.agent_eligible_labels.missing")) {
      choices.push({
        id: "add_agent_eligible_label",
        label: "Add agent-friendly label",
        explanation: "Adds an eligible issue label to pass the pre-rule gate.",
      });
    }
    choices.push({
      id: "retry_as_human",
      label: "Retry as human actor",
      explanation: "Re-evaluates the same action with a human actor identity.",
    });
    choices.push({
      id: "reroute_branch",
      label: "Retarget to develop-bot",
      explanation: "Retargets to develop-bot to probe branch-sensitive rules.",
    });
    return choices.slice(0, 4);
  }

  function applyStoryChoice(input) {
    var event = JSON.parse(JSON.stringify(input.event || {}));
    if (input.choice_id === "add_provenance") {
      event.evidence = {
        model: "gpt-5",
        provider: "openai",
        prompt_record: "prompt://story/retry",
        test_proof: "tests://story/retry",
      };
    } else if (input.choice_id === "add_agent_eligible_label") {
      var labels = Array.isArray(event.target && event.target.labels) ? event.target.labels.slice() : [];
      if (!labels.includes("agent-friendly")) labels.push("agent-friendly");
      event.target = Object.assign({}, event.target, { labels: labels });
    } else if (input.choice_id === "retry_as_human") {
      event.actor = { id: "alice", kind: "human" };
      event.attestation = null;
    } else if (input.choice_id === "reroute_branch") {
      event.target = Object.assign({}, event.target, { branch: "develop-bot" });
    }
    return event;
  }

  function simulateRun(input) {
    var policies = input.policies || [];
    if (!policies.length) throw new Error("simulateRun requires at least one policy");
    var count = Math.max(1, Math.min(10000, Number(input.count || 500)));
    var seed = String(input.seed === undefined ? "1337" : input.seed);
    var profile = DEFAULT_WEIGHTS[input.profile] ? input.profile : "balanced";
    var weights = Object.assign({}, DEFAULT_WEIGHTS[profile], input.event_weights || {});
    var mapping = Object.assign({}, DEFAULT_MAPPING, input.mapping_overrides || {});
    var faults = Object.assign({}, DEFAULT_FAULT_RATES, input.fault_rates || {});
    var rng = createRng(seed);
    var start = Date.parse(input.start_time || new Date().toISOString());
    var hours = Math.max(1, Number(input.hours || 72));
    var step = Math.max(1000, Math.round((hours * 3600 * 1000) / count));

    var events = [];
    for (var i = 0; i < count; i += 1) {
      var simType = rng.weighted(weights) || "code_evolution";
      var action = mapping[simType] || "issue.comment";
      var actorKind = rng.weighted({ human: 0.45, agent: 0.45, manager: 0.1 }) || "human";
      var actorId = actorKind === "agent" ? "ci-bot[bot]" : (actorKind === "manager" ? "stoa-manager[bot]" : "alice");
      var labels = simType === "issue_bug" ? ["bug", "agent-friendly", "thread:human"] : (simType === "discussion" ? ["thread:human"] : ["thread:agent"]);
      var event = {
        action: action,
        actor: { id: actorId, kind: actorKind },
        repository: { name: "acme/project", visibility: "public" },
        target: {
          branch: rng.pick(["main", "develop", "develop-bot", "release"]) || "main",
          labels: labels,
          thread_mode: labels.includes("thread:human") ? "human" : "agent",
        },
        evidence: {
          model: "gpt-5",
          provider: "openai",
          prompt_record: "prompt://sim/" + i,
          test_proof: "tests://sim/" + i,
        },
      };
      var faultsApplied = [];
      if (rng.bool(faults.missing_evidence)) {
        delete event.evidence.prompt_record;
        faultsApplied.push("missing_evidence:prompt_record");
      }
      if (actorKind === "agent" && action.indexOf("issue.") === 0 && rng.bool(faults.ineligible_label)) {
        event.target.labels = event.target.labels.filter(function (label) { return label !== "agent-friendly"; });
        faultsApplied.push("ineligible_label");
      }
      if (action.indexOf("conversation.") === 0 && rng.bool(faults.thread_mode_mismatch)) {
        event.target.thread_mode = event.target.thread_mode === "human" ? "agent" : "human";
        faultsApplied.push("thread_mode_mismatch");
      }
      events.push({
        id: "evt-" + String(i + 1).padStart(6, "0"),
        index: i,
        timestamp: new Date(start + (i * step)).toISOString(),
        simulator_type: simType,
        canonical_action: action,
        faults_applied: faultsApplied,
        event: event,
      });
    }

    var logs = events.map(function (item) {
      var decisions = policies.map(function (policyEntry, index) {
        var policy = policyEntry.policy || policyEntry;
        var decision = evaluatePolicy(policy, item.event);
        return {
          policy_id: policyEntry.id || ("policy-" + (index + 1)),
          decision: decision.decision,
          selected_rule_id: decision.selected_rule_id,
          matched_rule_count: decision.matched_rule_count,
          reason_codes: decision.reason_codes || [],
        };
      });
      return Object.assign({}, item, { decisions: decisions });
    });

    var byPolicy = {};
    policies.forEach(function (policyEntry, index) {
      byPolicy[policyEntry.id || ("policy-" + (index + 1))] = {
        totals: { allow: 0, warn: 0, deny: 0 },
        reason_counts: {},
        series: [],
      };
    });
    var disagreements = 0;
    logs.forEach(function (entry, idx) {
      var decisionSet = new Set(entry.decisions.map(function (d) { return d.decision; }));
      if (decisionSet.size > 1) disagreements += 1;
      entry.decisions.forEach(function (decision) {
        var target = byPolicy[decision.policy_id];
        if (!target) return;
        target.totals[decision.decision] += 1;
        if (decision.decision === "deny") {
          (decision.reason_codes || []).forEach(function (reason) {
            target.reason_counts[reason] = (target.reason_counts[reason] || 0) + 1;
          });
        }
        target.series.push({
          index: idx + 1,
          timestamp: entry.timestamp,
          allow: target.totals.allow,
          warn: target.totals.warn,
          deny: target.totals.deny,
          deny_rate: target.totals.deny / (idx + 1),
        });
      });
    });
    Object.keys(byPolicy).forEach(function (policyId) {
      var target = byPolicy[policyId];
      var total = target.totals.allow + target.totals.warn + target.totals.deny;
      target.total_events = total;
      target.rates = {
        allow: total ? target.totals.allow / total : 0,
        warn: total ? target.totals.warn / total : 0,
        deny: total ? target.totals.deny / total : 0,
      };
      target.top_rejection_reasons = Object.entries(target.reason_counts)
        .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
        .slice(0, 10)
        .map(function (entry) { return { reason_code: entry[0], count: entry[1] }; });
    });

    return {
      config: {
        count: count,
        seed: seed,
        hours: hours,
        profile: profile,
      },
      mapping: mapping,
      policies: policies.map(function (entry, index) {
        var policy = entry.policy || entry;
        return {
          id: entry.id || ("policy-" + (index + 1)),
          policy_hash: entry.policy_hash || computePolicyHash(policy),
        };
      }),
      events: events,
      logs: logs,
      metrics: {
        by_policy: byPolicy,
        cross_policy: {
          compared_events: logs.length,
          disagreement_count: disagreements,
          disagreement_rate: logs.length ? disagreements / logs.length : 0,
        },
      },
      story: logs.length ? logs[logs.length - 1].decisions.map(function (decision) {
        return {
          policy_id: decision.policy_id,
          event_id: logs[logs.length - 1].id,
          choices: buildStoryChoices({
            event: logs[logs.length - 1].event,
            policy_decision: decision,
          }),
        };
      }) : [],
    };
  }

  function parsePolicyText(text) {
    var policy = parseYaml(text);
    var validation = validatePolicy(policy);
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }
    return policy;
  }

  function exportRunJson(runArtifact) {
    return JSON.stringify(runArtifact, null, 2);
  }

  function exportMetricsCsv(metrics) {
    var lines = ["policy_id,total_events,allow,warn,deny,allow_rate,warn_rate,deny_rate"];
    Object.keys(metrics.by_policy || {}).forEach(function (policyId) {
      var data = metrics.by_policy[policyId];
      lines.push([
        policyId,
        data.total_events || 0,
        data.totals.allow || 0,
        data.totals.warn || 0,
        data.totals.deny || 0,
        ((data.rates.allow || 0) * 100).toFixed(2) + "%",
        ((data.rates.warn || 0) * 100).toFixed(2) + "%",
        ((data.rates.deny || 0) * 100).toFixed(2) + "%",
      ].join(","));
    });
    return lines.join("\n");
  }

  global.CovenantSimulator = {
    ACTIONS: ACTIONS,
    SIM_TYPES: SIM_TYPES,
    DEFAULT_MAPPING: DEFAULT_MAPPING,
    applyStoryChoice: applyStoryChoice,
    buildStoryChoices: buildStoryChoices,
    computePolicyHash: computePolicyHash,
    evaluatePolicy: evaluatePolicy,
    exportMetricsCsv: exportMetricsCsv,
    exportRunJson: exportRunJson,
    parsePolicyText: parsePolicyText,
    simulateRun: simulateRun,
    validatePolicy: validatePolicy,
  };
})(typeof window !== "undefined" ? window : globalThis);

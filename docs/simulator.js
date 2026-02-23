(function () {
  "use strict";

  var sim = window.CovenantSimulator;
  var state = {
    run: null,
    policies: [],
    selectedLogIndex: -1,
    lastValidationReport: null,
    lineEditors: [],
  };

  var samplePolicyA = "spec_version: 1.0.0\n" +
    "defaults:\n" +
    "  unmatched: warn\n" +
    "rules:\n" +
    "  - id: any-issues\n" +
    "    actor: any\n" +
    "    action: issue.*\n" +
    "    outcome: allow\n" +
    "  - id: any-prs\n" +
    "    actor: any\n" +
    "    action: pull_request.*\n" +
    "    outcome: warn\n" +
    "  - id: protect-human-thread\n" +
    "    actor: agent\n" +
    "    action: conversation.intervene_human_thread\n" +
    "    outcome: deny\n";

  var samplePolicyB = "spec_version: 1.0.0\n" +
    "defaults:\n" +
    "  unmatched: deny\n" +
    "policies:\n" +
    "  agent_eligible_labels:\n" +
    "    labels: [agent-friendly]\n" +
    "    on_missing: deny\n" +
    "requirements:\n" +
    "  default_provenance_profile: strict\n" +
    "  provenance_profiles:\n" +
    "    strict:\n" +
    "      required_fields: [model, provider, prompt_record, test_proof]\n" +
    "rules:\n" +
    "  - id: manager-all\n" +
    "    actor: manager\n" +
    "    action: '*'\n" +
    "    outcome: allow\n" +
    "  - id: agent-pr\n" +
    "    actor: agent\n" +
    "    action: pull_request.*\n" +
    "    requirements:\n" +
    "      provenance_profile: strict\n" +
    "    outcome: deny\n" +
    "  - id: human-pr\n" +
    "    actor: human\n" +
    "    action: pull_request.*\n" +
    "    outcome: allow\n";

  var samplePolicyC = "spec_version: 1.0.0\n" +
    "defaults:\n" +
    "  unmatched: allow\n" +
    "rules:\n" +
    "  - id: allow-all\n" +
    "    actor: any\n" +
    "    action: '*'\n" +
    "    outcome: allow\n";

  var statusEl = document.getElementById("simStatus");
  var metricsEl = document.getElementById("simMetrics");
  var interpretationEl = document.getElementById("simInterpretation");
  var crossPolicyEl = document.getElementById("simCrossPolicy");
  var validationOutputEl = document.getElementById("simValidationOutput");
  var policyLayoutContainerEl = document.querySelector(".sim-policies");
  var togglePolicyLayoutBtnEl = document.getElementById("togglePolicyLayoutBtn");
  var logsBodyEl = document.querySelector("#simLogsTable tbody");
  var storyChoicesEl = document.getElementById("storyChoices");

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#b42318" : "";
  }

  function downloadText(filename, content, mimeType) {
    var blob = new Blob([content], { type: (mimeType || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function renderLineNumbers(textarea, numberColumn) {
    var count = textarea.value.split("\n").length;
    var buffer = [];
    for (var i = 1; i <= count; i += 1) {
      buffer.push("<span>" + i + "</span>");
    }
    numberColumn.innerHTML = buffer.join("");
    numberColumn.scrollTop = textarea.scrollTop;
  }

  function renderEditorHighlight(textarea, highlightCode, highlightPre) {
    if (!highlightCode || !window.CovenantHighlight) {
      return false;
    }
    var explicitLang = textarea.dataset.entryLang || "";
    var language = explicitLang || window.CovenantHighlight.inferLanguage(textarea.value || "");
    highlightCode.innerHTML = window.CovenantHighlight.highlightText(textarea.value || "", language);
    if (highlightPre) {
      highlightPre.dataset.codeLang = language;
      highlightPre.classList.add("code-block");
    }
    return true;
  }

  function setupLineNumberEditors() {
    state.lineEditors = [];
    document.querySelectorAll("textarea.line-numbered").forEach(function (textarea) {
      var numberColumn = textarea.closest(".lined-editor") && textarea.closest(".lined-editor").querySelector(".line-numbers");
      var highlightPre = textarea.closest(".lined-editor") && textarea.closest(".lined-editor").querySelector(".editor-highlight");
      var highlightCode = highlightPre && highlightPre.querySelector("code");
      if (!numberColumn) {
        return;
      }
      function onInput() {
        renderLineNumbers(textarea, numberColumn);
        var enhanced = renderEditorHighlight(textarea, highlightCode, highlightPre);
        textarea.classList.toggle("enhanced", enhanced);
      }
      function onScroll() {
        numberColumn.scrollTop = textarea.scrollTop;
        if (highlightPre) {
          highlightPre.scrollTop = textarea.scrollTop;
          highlightPre.scrollLeft = textarea.scrollLeft;
        }
      }
      textarea.addEventListener("input", onInput);
      textarea.addEventListener("scroll", onScroll);
      state.lineEditors.push({
        render: function () {
          renderLineNumbers(textarea, numberColumn);
          var enhanced = renderEditorHighlight(textarea, highlightCode, highlightPre);
          textarea.classList.toggle("enhanced", enhanced);
          onScroll();
        },
      });
      onInput();
    });
  }

  function refreshLineNumberEditors() {
    state.lineEditors.forEach(function (editor) {
      editor.render();
    });
  }

  function setPolicyLayout(mode) {
    if (!policyLayoutContainerEl || !togglePolicyLayoutBtnEl) {
      return;
    }
    var stacked = mode === "stacked";
    if (stacked) {
      policyLayoutContainerEl.classList.add("stacked");
      togglePolicyLayoutBtnEl.textContent = "Side-by-Side Editors";
    } else {
      policyLayoutContainerEl.classList.remove("stacked");
      togglePolicyLayoutBtnEl.textContent = "Stack Editors";
    }
    try {
      window.localStorage.setItem("simPolicyLayoutMode", stacked ? "stacked" : "side-by-side");
    } catch (_error) {
      // Ignore persistence failure.
    }
    refreshLineNumberEditors();
  }

  function togglePolicyLayout() {
    var isStacked = policyLayoutContainerEl && policyLayoutContainerEl.classList.contains("stacked");
    setPolicyLayout(isStacked ? "side-by-side" : "stacked");
  }

  function parseSinglePolicy(text) {
    var trimmed = text.trim();
    if (!trimmed) {
      return {
        ok: false,
        skipped: true,
        error: "empty",
      };
    }
    try {
      var parsed = sim.parsePolicyText(trimmed);
      return {
        ok: true,
        policy: parsed,
        policy_hash: sim.computePolicyHash(parsed),
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message,
      };
    }
  }

  function validateFaultRates(faultRates) {
    var issues = [];
    Object.entries(faultRates).forEach(function (entry) {
      var name = entry[0];
      var value = entry[1];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        issues.push(name + " must be between 0 and 1");
      }
    });
    return issues;
  }

  function validateInputs() {
    var report = {
      checked_at: new Date().toISOString(),
      valid: true,
      errors: [],
      warnings: [],
      run_config: {},
      policies: [],
      mapping: {
        valid: true,
        errors: [],
      },
      faults: {
        valid: true,
        errors: [],
      },
    };

    var count = Number(document.getElementById("simCount").value || 0);
    var hours = Number(document.getElementById("simHours").value || 0);
    report.run_config = {
      count: count,
      hours: hours,
      seed: document.getElementById("simSeed").value || "",
      profile: document.getElementById("simProfile").value || "",
    };

    if (!Number.isFinite(count) || count < 1 || count > 10000) {
      report.errors.push("Event count must be between 1 and 10000.");
    }
    if (!Number.isFinite(hours) || hours < 1 || hours > 8760) {
      report.errors.push("Window (hours) must be between 1 and 8760.");
    }

    var policyInputs = [
      { id: "policy-a", text: document.getElementById("policyAInput").value },
      { id: "policy-b", text: document.getElementById("policyBInput").value },
      { id: "policy-c", text: document.getElementById("policyCInput").value },
    ];

    var validPolicyCount = 0;
    policyInputs.forEach(function (entry) {
      var result = parseSinglePolicy(entry.text);
      if (result.ok) {
        validPolicyCount += 1;
        report.policies.push({
          id: entry.id,
          valid: true,
          policy_hash: result.policy_hash,
        });
      } else if (result.skipped) {
        report.policies.push({
          id: entry.id,
          valid: false,
          skipped: true,
          message: "slot is empty",
        });
      } else {
        report.errors.push(entry.id + ": " + result.error);
        report.policies.push({
          id: entry.id,
          valid: false,
          message: result.error,
        });
      }
    });

    if (validPolicyCount === 0) {
      report.errors.push("At least one policy must be valid.");
    }

    var mappingRaw = document.getElementById("mappingOverridesInput").value.trim();
    if (mappingRaw) {
      try {
        var mapping = JSON.parse(mappingRaw);
        if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
          report.mapping.valid = false;
          report.mapping.errors.push("Mapping overrides must be a JSON object.");
        } else {
          Object.entries(mapping).forEach(function (entry) {
            var key = entry[0];
            var action = entry[1];
            if (!sim.SIM_TYPES.includes(key)) {
              report.mapping.valid = false;
              report.mapping.errors.push("Unknown simulator type: " + key);
            }
            if (!sim.ACTIONS.includes(action)) {
              report.mapping.valid = false;
              report.mapping.errors.push("Invalid canonical action for " + key + ": " + action);
            }
          });
        }
      } catch (error) {
        report.mapping.valid = false;
        report.mapping.errors.push("Invalid JSON: " + error.message);
      }
    }

    if (!report.mapping.valid) {
      report.errors.push.apply(report.errors, report.mapping.errors);
    }

    var faultErrors = validateFaultRates(readFaultRates());
    if (faultErrors.length > 0) {
      report.faults.valid = false;
      report.faults.errors = faultErrors;
      report.errors.push.apply(report.errors, faultErrors);
    }

    if (validPolicyCount < 3) {
      report.warnings.push("Fewer than 3 policy slots are active; disagreement analysis may be less informative.");
    }

    report.valid = report.errors.length === 0;
    state.lastValidationReport = report;
    validationOutputEl.textContent = JSON.stringify(report, null, 2);
    if (window.CovenantHighlight) {
      window.CovenantHighlight.refresh(validationOutputEl);
    }
    return report;
  }

  function readFaultRates() {
    return {
      missing_evidence: Number(document.getElementById("faultMissingEvidence").value || 0),
      missing_attestation: Number(document.getElementById("faultMissingAttestation").value || 0),
      invalid_attestation: Number(document.getElementById("faultInvalidAttestation").value || 0),
      ineligible_label: Number(document.getElementById("faultIneligibleLabel").value || 0),
      thread_mode_mismatch: Number(document.getElementById("faultThreadMismatch").value || 0),
    };
  }

  function parsePolicies() {
    var policyInputs = [
      { id: "policy-a", text: document.getElementById("policyAInput").value },
      { id: "policy-b", text: document.getElementById("policyBInput").value },
      { id: "policy-c", text: document.getElementById("policyCInput").value },
    ];
    var policies = [];
    for (var i = 0; i < policyInputs.length; i += 1) {
      var result = parseSinglePolicy(policyInputs[i].text);
      if (result.skipped) {
        continue;
      }
      if (!result.ok) {
        throw new Error(policyInputs[i].id + ": " + result.error);
      }
      policies.push({
        id: policyInputs[i].id,
        policy: result.policy,
        policy_hash: result.policy_hash,
      });
    }
    if (!policies.length) {
      throw new Error("At least one policy is required.");
    }
    return policies;
  }

  function parseMappingOverrides() {
    var raw = document.getElementById("mappingOverridesInput").value.trim();
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  }

  function formatDecisionCell(decisions) {
    return decisions.map(function (decision) {
      var reasons = (decision.reason_codes || []).length;
      var suffix = reasons ? " (" + reasons + ")" : "";
      return decision.policy_id + ":" + decision.decision + suffix;
    }).join(" | ");
  }

  function describeRate(rate) {
    if (rate >= 0.4) {
      return "very high";
    }
    if (rate >= 0.2) {
      return "high";
    }
    if (rate >= 0.08) {
      return "moderate";
    }
    return "low";
  }

  function decisionTooltip(decisions) {
    return decisions.map(function (decision) {
      var reasons = (decision.reason_codes || []).join(", ") || "none";
      return decision.policy_id + ": " + decision.decision + " | reasons: " + reasons;
    }).join("\n");
  }

  function escapeHtmlAttr(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("\n", " | ");
  }

  function topReason(metrics) {
    if (!metrics || !metrics.top_rejection_reasons || !metrics.top_rejection_reasons.length) {
      return "none";
    }
    var top = metrics.top_rejection_reasons[0];
    return top.reason_code + " (" + top.count + ")";
  }

  function renderInterpretation(run) {
    interpretationEl.innerHTML = "";
    var cross = run.metrics.cross_policy || {};
    var disagreementRate = Number(cross.disagreement_rate || 0);
    var disagreementDescription = describeRate(disagreementRate);

    var crossCard = document.createElement("div");
    crossCard.className = "sim-insight";
    crossCard.innerHTML =
      "<strong>Policy compatibility:</strong> disagreement rate is " +
      (disagreementRate * 100).toFixed(2) +
      "% (" + disagreementDescription + ").";
    interpretationEl.appendChild(crossCard);

    Object.entries(run.metrics.by_policy || {}).forEach(function (entry) {
      var policyId = entry[0];
      var metrics = entry[1];
      var denyRate = Number(metrics.rates && metrics.rates.deny ? metrics.rates.deny : 0);
      var denyDescription = describeRate(denyRate);
      var card = document.createElement("div");
      card.className = "sim-insight";
      card.innerHTML =
        "<strong>" + policyId + ":</strong> deny rate is " +
        (denyRate * 100).toFixed(2) +
        "% (" + denyDescription + "); top rejection reason: " +
        topReason(metrics) + ".";
      interpretationEl.appendChild(card);
    });
  }

  function recomputeMetricsFromLogs(logs, policies) {
    var byPolicy = {};
    var ids = policies.map(function (entry) { return entry.id; });
    ids.forEach(function (id) {
      byPolicy[id] = {
        totals: { allow: 0, warn: 0, deny: 0 },
        reason_counts: {},
        series: [],
      };
    });
    var disagreements = 0;
    logs.forEach(function (log, idx) {
      var decisionSet = new Set(log.decisions.map(function (item) { return item.decision; }));
      if (decisionSet.size > 1) {
        disagreements += 1;
      }
      log.decisions.forEach(function (item) {
        var target = byPolicy[item.policy_id];
        if (!target) {
          return;
        }
        target.totals[item.decision] += 1;
        if (item.decision === "deny") {
          (item.reason_codes || []).forEach(function (reason) {
            target.reason_counts[reason] = (target.reason_counts[reason] || 0) + 1;
          });
        }
        target.series.push({
          index: idx + 1,
          timestamp: log.timestamp,
          allow: target.totals.allow,
          warn: target.totals.warn,
          deny: target.totals.deny,
          deny_rate: target.totals.deny / (idx + 1),
        });
      });
    });
    Object.keys(byPolicy).forEach(function (id) {
      var target = byPolicy[id];
      var total = target.totals.allow + target.totals.warn + target.totals.deny;
      target.total_events = total;
      target.rates = {
        allow: total ? target.totals.allow / total : 0,
        warn: total ? target.totals.warn / total : 0,
        deny: total ? target.totals.deny / total : 0,
      };
      target.top_rejection_reasons = Object.entries(target.reason_counts)
        .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
        .slice(0, 6)
        .map(function (entry) { return { reason_code: entry[0], count: entry[1] }; });
    });
    return {
      by_policy: byPolicy,
      cross_policy: {
        policy_ids: ids,
        disagreement_count: disagreements,
        disagreement_rate: logs.length ? disagreements / logs.length : 0,
        compared_events: logs.length,
      },
    };
  }

  function renderMetrics(run) {
    metricsEl.innerHTML = "";
    Object.entries(run.metrics.by_policy || {}).forEach(function (entry) {
      var policyId = entry[0];
      var metrics = entry[1];
      var card = document.createElement("div");
      card.className = "badge-card sim-metric-card";
      card.innerHTML = [
        "<p><strong>" + policyId + "</strong></p>",
        "<p>allow: <code>" + metrics.totals.allow + "</code></p>",
        "<p>warn: <code>" + metrics.totals.warn + "</code></p>",
        "<p>deny: <code>" + metrics.totals.deny + "</code></p>",
        "<p>deny rate: <code>" + (metrics.rates.deny * 100).toFixed(2) + "%</code></p>",
      ].join("");
      metricsEl.appendChild(card);
    });

    renderInterpretation(run);
    crossPolicyEl.textContent = JSON.stringify(run.metrics.cross_policy, null, 2);
    if (window.CovenantHighlight) {
      window.CovenantHighlight.refresh(crossPolicyEl);
    }
  }

  function renderLogs(run) {
    logsBodyEl.innerHTML = "";
    var logs = run.logs || [];
    for (var i = 0; i < logs.length; i += 1) {
      var log = logs[i];
      var row = document.createElement("tr");
      row.dataset.index = String(i);
      row.innerHTML = [
        "<td>" + (i + 1) + "</td>",
        "<td><code>" + log.timestamp + "</code></td>",
        "<td><code>" + log.simulator_type + "</code></td>",
        "<td><code>" + log.canonical_action + "</code></td>",
        "<td><code>" + log.event.actor.kind + ":" + log.event.actor.id + "</code></td>",
        "<td><code>" + ((log.faults_applied || []).join(",") || "-") + "</code></td>",
        "<td title=\"" + escapeHtmlAttr(decisionTooltip(log.decisions || [])) + "\"><code>" + formatDecisionCell(log.decisions || []) + "</code></td>",
      ].join("");
      logsBodyEl.appendChild(row);
    }
  }

  function renderStoryForLog(logIndex) {
    storyChoicesEl.innerHTML = "";
    if (!state.run || !state.run.logs || !state.run.logs[logIndex]) {
      return;
    }
    state.selectedLogIndex = logIndex;
    var log = state.run.logs[logIndex];
    var title = document.createElement("p");
    title.innerHTML = "<strong>Story Choices for Event " + (logIndex + 1) + "</strong>";
    storyChoicesEl.appendChild(title);

    (log.decisions || []).forEach(function (decision) {
      var block = document.createElement("div");
      block.className = "sim-story-block";

      var policyTitle = document.createElement("p");
      policyTitle.innerHTML = "<code>" + decision.policy_id + "</code> decision: <strong>" + decision.decision + "</strong>";
      block.appendChild(policyTitle);

      var choices = sim.buildStoryChoices({
        event: log.event,
        policy_decision: decision,
      });

      if (!choices.length) {
        var none = document.createElement("p");
        none.className = "note";
        none.textContent = "No branch suggestions.";
        block.appendChild(none);
      } else {
        choices.forEach(function (choice) {
          var button = document.createElement("button");
          button.className = "filter-btn";
          button.textContent = choice.label;
          button.dataset.choiceId = choice.id;
          button.dataset.policyId = decision.policy_id;
          button.title = choice.explanation;
          block.appendChild(button);
        });
      }
      storyChoicesEl.appendChild(block);
    });
  }

  function runSimulation() {
    if (!sim || typeof sim.simulateRun !== "function") {
      setStatus("Simulator bundle is missing. Run `node scripts/build-site-simulator.mjs`.", true);
      return;
    }
    try {
      var validation = validateInputs();
      if (!validation.valid) {
        setStatus("Validation failed. Check the Validation section for details.", true);
        return;
      }

      var policies = parsePolicies();
      var mappingOverrides = parseMappingOverrides();

      state.policies = policies;
      state.run = sim.simulateRun({
        policies: policies,
        count: Number(document.getElementById("simCount").value || 500),
        seed: document.getElementById("simSeed").value || "1337",
        hours: Number(document.getElementById("simHours").value || 72),
        profile: document.getElementById("simProfile").value || "balanced",
        mapping_overrides: mappingOverrides,
        fault_rates: readFaultRates(),
      });

      renderMetrics(state.run);
      renderLogs(state.run);
      renderStoryForLog((state.run.logs || []).length - 1);
      setStatus("Simulation completed with " + state.run.logs.length + " events.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function appendManualAction() {
    if (!state.run) {
      setStatus("Run a simulation first.", true);
      return;
    }
    try {
      var manualType = document.getElementById("manualType").value;
      var actorKind = document.getElementById("manualActorKind").value;
      var branch = (document.getElementById("manualBranch").value || "main").trim() || "main";
      var action = state.run.mapping[manualType] || sim.DEFAULT_MAPPING[manualType] || "issue.comment";
      var actorId = actorKind === "agent" ? "manual-agent[bot]" : (actorKind === "manager" ? "manual-manager[bot]" : "manual-human");
      var labels = manualType.indexOf("issue_") === 0 ? ["agent-friendly", "thread:human"] : ["thread:agent"];
      if (manualType === "discussion") {
        labels = ["thread:human"];
      }

      var event = {
        action: action,
        actor: { id: actorId, kind: actorKind },
        repository: { name: "acme/project", visibility: "public" },
        target: {
          branch: branch,
          labels: labels,
          thread_mode: labels.indexOf("thread:human") >= 0 ? "human" : "agent",
        },
        evidence: {
          model: "gpt-5",
          provider: "openai",
          prompt_record: "prompt://manual",
          test_proof: "tests://manual",
        },
      };

      var decisions = state.policies.map(function (policyEntry) {
        var evaluation = sim.evaluatePolicy(policyEntry.policy, event);
        return {
          policy_id: policyEntry.id,
          decision: evaluation.decision,
          selected_rule_id: evaluation.selected_rule_id,
          matched_rule_count: evaluation.matched_rule_count,
          reason_codes: evaluation.reason_codes || [],
        };
      });

      var nextIndex = state.run.logs.length;
      state.run.events.push({
        id: "evt-manual-" + String(nextIndex + 1),
        index: nextIndex,
        timestamp: new Date().toISOString(),
        simulator_type: manualType,
        canonical_action: action,
        faults_applied: [],
        event: event,
      });
      state.run.logs.push({
        id: "evt-manual-" + String(nextIndex + 1),
        index: nextIndex,
        timestamp: new Date().toISOString(),
        simulator_type: manualType,
        canonical_action: action,
        faults_applied: [],
        event: event,
        decisions: decisions,
      });
      state.run.metrics = recomputeMetricsFromLogs(state.run.logs, state.policies);

      renderMetrics(state.run);
      renderLogs(state.run);
      renderStoryForLog(state.run.logs.length - 1);
      setStatus("Manual action appended and evaluated.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function exportJson() {
    if (!state.run) {
      setStatus("Run a simulation first.", true);
      return;
    }
    var json = sim.exportRunJson(state.run);
    downloadText("simulation-run.json", json, "application/json");
    setStatus("JSON exported.", false);
  }

  function exportCsv() {
    if (!state.run) {
      setStatus("Run a simulation first.", true);
      return;
    }
    var csv = sim.exportMetricsCsv(state.run.metrics);
    downloadText("simulation-metrics.csv", csv, "text/csv");
    setStatus("CSV exported.", false);
  }

  function exportValidationReport() {
    if (!state.lastValidationReport) {
      validateInputs();
    }
    if (!state.lastValidationReport) {
      setStatus("No validation report available.", true);
      return;
    }
    var stamp = state.lastValidationReport.checked_at.replaceAll(":", "-");
    downloadText(
      "simulation-validation-" + stamp + ".json",
      JSON.stringify(state.lastValidationReport, null, 2),
      "application/json"
    );
    setStatus("Validation report exported.", false);
  }

  function downloadEditorContent(button) {
    var targetId = button.dataset.target;
    var textarea = document.getElementById(targetId);
    if (!textarea) {
      setStatus("Unable to find editor target: " + targetId, true);
      return;
    }
    var filename = button.dataset.filename || (targetId + ".txt");
    var mimeType = button.dataset.mime || "text/plain";
    downloadText(filename, textarea.value, mimeType);
    setStatus("Downloaded " + filename + ".", false);
  }

  function applyStoryChoice(choiceId, policyId) {
    if (!state.run || state.selectedLogIndex < 0) {
      return;
    }
    var sourceLog = state.run.logs[state.selectedLogIndex];
    if (!sourceLog) {
      return;
    }
    var nextEvent = sim.applyStoryChoice({
      event: sourceLog.event,
      choice_id: choiceId,
    });

    var decisions = state.policies.map(function (policyEntry) {
      var evaluation = sim.evaluatePolicy(policyEntry.policy, nextEvent);
      return {
        policy_id: policyEntry.id,
        decision: evaluation.decision,
        selected_rule_id: evaluation.selected_rule_id,
        matched_rule_count: evaluation.matched_rule_count,
        reason_codes: evaluation.reason_codes || [],
      };
    });

    var nextIndex = state.run.logs.length;
    state.run.logs.push({
      id: "evt-story-" + String(nextIndex + 1),
      index: nextIndex,
      timestamp: new Date().toISOString(),
      simulator_type: "story_next_step:" + choiceId,
      canonical_action: nextEvent.action,
      faults_applied: ["story:" + choiceId, "from:" + policyId],
      event: nextEvent,
      decisions: decisions,
    });
    state.run.metrics = recomputeMetricsFromLogs(state.run.logs, state.policies);
    renderMetrics(state.run);
    renderLogs(state.run);
    renderStoryForLog(state.run.logs.length - 1);
    setStatus("Applied story choice: " + choiceId, false);
  }

  document.getElementById("runSimulationBtn").addEventListener("click", runSimulation);
  document.getElementById("appendManualActionBtn").addEventListener("click", appendManualAction);
  document.getElementById("exportJsonBtn").addEventListener("click", exportJson);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  if (togglePolicyLayoutBtnEl) {
    togglePolicyLayoutBtnEl.addEventListener("click", togglePolicyLayout);
  }
  document.getElementById("validateInputsBtn").addEventListener("click", function () {
    var validation = validateInputs();
    setStatus(validation.valid ? "Validation passed." : "Validation failed.", !validation.valid);
  });
  document.getElementById("downloadValidationBtn").addEventListener("click", exportValidationReport);
  document.querySelectorAll(".download-editor-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      downloadEditorContent(button);
    });
  });

  logsBodyEl.addEventListener("click", function (event) {
    var row = event.target.closest("tr");
    if (!row || row.dataset.index === undefined) {
      return;
    }
    renderStoryForLog(Number(row.dataset.index));
  });

  storyChoicesEl.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-choice-id]");
    if (!button) {
      return;
    }
    applyStoryChoice(button.dataset.choiceId, button.dataset.policyId || "unknown");
  });

  document.getElementById("policyAInput").value = samplePolicyA;
  document.getElementById("policyBInput").value = samplePolicyB;
  document.getElementById("policyCInput").value = samplePolicyC;
  try {
    setPolicyLayout(window.localStorage.getItem("simPolicyLayoutMode") || "side-by-side");
  } catch (_error) {
    setPolicyLayout("side-by-side");
  }
  setupLineNumberEditors();
  refreshLineNumberEditors();
  validateInputs();
  setStatus("Ready to run deterministic simulation.", false);
})();

"use strict";

function createCounter() {
  return {
    allow: 0,
    warn: 0,
    deny: 0,
  };
}

function countDecision(counter, decision) {
  if (decision === "allow" || decision === "warn" || decision === "deny") {
    counter[decision] += 1;
  }
}

function toTopReasons(reasonCounts, limit = 10) {
  return Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([reason_code, count]) => ({ reason_code, count }));
}

function computeDisagreement(decisions) {
  const unique = new Set(decisions.map((entry) => entry.decision));
  return unique.size > 1;
}

function computeMetrics(replayResult) {
  const policyIds = (replayResult.policies || []).map((policy) => policy.id);
  const byPolicy = {};

  for (const policyId of policyIds) {
    byPolicy[policyId] = {
      totals: createCounter(),
      reason_counts: {},
      series: [],
    };
  }

  let disagreementCount = 0;
  const logs = Array.isArray(replayResult.logs) ? replayResult.logs : [];

  for (let i = 0; i < logs.length; i += 1) {
    const entry = logs[i];
    if (computeDisagreement(entry.decisions || [])) {
      disagreementCount += 1;
    }

    for (const decision of entry.decisions || []) {
      const metrics = byPolicy[decision.policy_id];
      if (!metrics) {
        continue;
      }
      countDecision(metrics.totals, decision.decision);
      if (decision.decision === "deny") {
        for (const reasonCode of decision.reason_codes || []) {
          metrics.reason_counts[reasonCode] = (metrics.reason_counts[reasonCode] || 0) + 1;
        }
      }
      const total = i + 1;
      metrics.series.push({
        index: total,
        timestamp: entry.timestamp,
        allow: metrics.totals.allow,
        warn: metrics.totals.warn,
        deny: metrics.totals.deny,
        deny_rate: total > 0 ? metrics.totals.deny / total : 0,
      });
    }
  }

  for (const policyId of policyIds) {
    const metrics = byPolicy[policyId];
    const total = metrics.totals.allow + metrics.totals.warn + metrics.totals.deny;
    metrics.total_events = total;
    metrics.rates = {
      allow: total > 0 ? metrics.totals.allow / total : 0,
      warn: total > 0 ? metrics.totals.warn / total : 0,
      deny: total > 0 ? metrics.totals.deny / total : 0,
    };
    metrics.top_rejection_reasons = toTopReasons(metrics.reason_counts);
  }

  return {
    by_policy: byPolicy,
    cross_policy: {
      policy_ids: policyIds,
      disagreement_count: disagreementCount,
      disagreement_rate: logs.length > 0 ? disagreementCount / logs.length : 0,
      compared_events: logs.length,
    },
  };
}

module.exports = {
  computeMetrics,
};


"use strict";

function exportRunJson(runArtifact) {
  return JSON.stringify(runArtifact, null, 2);
}

function toPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function exportMetricsCsv(metrics) {
  const lines = [
    [
      "policy_id",
      "total_events",
      "allow",
      "warn",
      "deny",
      "allow_rate",
      "warn_rate",
      "deny_rate",
      "top_rejection_reason_1",
      "top_rejection_reason_1_count",
      "top_rejection_reason_2",
      "top_rejection_reason_2_count",
      "top_rejection_reason_3",
      "top_rejection_reason_3_count",
    ].join(","),
  ];

  for (const [policyId, policyMetrics] of Object.entries(metrics.by_policy || {})) {
    const reasons = Array.isArray(policyMetrics.top_rejection_reasons)
      ? policyMetrics.top_rejection_reasons
      : [];
    const first = reasons[0] || { reason_code: "", count: 0 };
    const second = reasons[1] || { reason_code: "", count: 0 };
    const third = reasons[2] || { reason_code: "", count: 0 };

    lines.push([
      policyId,
      policyMetrics.total_events || 0,
      policyMetrics.totals && policyMetrics.totals.allow ? policyMetrics.totals.allow : 0,
      policyMetrics.totals && policyMetrics.totals.warn ? policyMetrics.totals.warn : 0,
      policyMetrics.totals && policyMetrics.totals.deny ? policyMetrics.totals.deny : 0,
      toPercent(policyMetrics.rates && policyMetrics.rates.allow),
      toPercent(policyMetrics.rates && policyMetrics.rates.warn),
      toPercent(policyMetrics.rates && policyMetrics.rates.deny),
      first.reason_code,
      first.count,
      second.reason_code,
      second.count,
      third.reason_code,
      third.count,
    ].join(","));
  }

  lines.push("");
  lines.push("cross_policy_metric,value");
  lines.push(`compared_events,${metrics.cross_policy && metrics.cross_policy.compared_events ? metrics.cross_policy.compared_events : 0}`);
  lines.push(`disagreement_count,${metrics.cross_policy && metrics.cross_policy.disagreement_count ? metrics.cross_policy.disagreement_count : 0}`);
  lines.push(`disagreement_rate,${toPercent(metrics.cross_policy && metrics.cross_policy.disagreement_rate)}`);

  return lines.join("\n");
}

module.exports = {
  exportMetricsCsv,
  exportRunJson,
};


"use strict";

const { ACTIONS } = require("../core/constants");
const { SIM_EVENT_CATALOG, SIM_EVENT_TYPES } = require("./catalog");

function defaultMapping() {
  const mapping = {};
  for (const [type, entry] of Object.entries(SIM_EVENT_CATALOG)) {
    mapping[type] = entry.default_action;
  }
  return mapping;
}

function validateMapping(mapping) {
  const errors = [];

  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return {
      valid: false,
      errors: ["mapping must be an object"],
    };
  }

  for (const [type, action] of Object.entries(mapping)) {
    if (!SIM_EVENT_TYPES.includes(type)) {
      errors.push(`unknown simulator type '${type}'`);
      continue;
    }
    if (!ACTIONS.includes(action)) {
      errors.push(`type '${type}' has unsupported canonical action '${action}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function mergeMapping(overrides) {
  const merged = defaultMapping();
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return merged;
  }
  for (const [type, action] of Object.entries(overrides)) {
    merged[type] = action;
  }
  return merged;
}

module.exports = {
  defaultMapping,
  mergeMapping,
  validateMapping,
};


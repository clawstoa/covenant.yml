"use strict";

function hashSeed(input) {
  const text = String(input);
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeWeights(entries) {
  const out = [];
  let sum = 0;
  for (const entry of entries) {
    const weight = Number(entry.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    sum += weight;
    out.push({
      value: entry.value,
      weight,
    });
  }
  if (sum === 0) {
    return [];
  }
  return out.map((entry) => ({
    value: entry.value,
    weight: entry.weight / sum,
  }));
}

function createRng(seed) {
  const nextFloat = mulberry32(hashSeed(seed));

  return {
    next() {
      return nextFloat();
    },
    int(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        return 0;
      }
      return Math.floor(nextFloat() * maxExclusive);
    },
    bool(probability = 0.5) {
      if (probability <= 0) {
        return false;
      }
      if (probability >= 1) {
        return true;
      }
      return nextFloat() < probability;
    },
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) {
        return null;
      }
      return items[this.int(items.length)];
    },
    weighted(weightsMap) {
      const weightedEntries = normalizeWeights(
        Object.entries(weightsMap || {}).map(([value, weight]) => ({ value, weight }))
      );
      if (weightedEntries.length === 0) {
        return null;
      }
      const threshold = nextFloat();
      let cumulative = 0;
      for (const entry of weightedEntries) {
        cumulative += entry.weight;
        if (threshold <= cumulative) {
          return entry.value;
        }
      }
      return weightedEntries[weightedEntries.length - 1].value;
    },
  };
}

module.exports = {
  createRng,
};


function normalizeMode(mode) {
  const m = String(mode || "open_joker").toLowerCase();
  if (m === "no_joker") return "no_joker";
  if (m === "closed_joker") return "closed_joker";
  return "open_joker";
}

function parseSequenceList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isRevealActionAllowed(mode) {
  return normalizeMode(mode) === "closed_joker";
}

function isWildJokerRevealedForPlayer(mode, wildJokerRank, playersWithFirstSequence, userId) {
  if (!wildJokerRank) return false;
  const m = normalizeMode(mode);
  if (m === "no_joker") return false;
  if (m === "open_joker") return true;
  const seq = parseSequenceList(playersWithFirstSequence);
  return seq.includes(String(userId));
}

function isWildJokerRevealedGlobally(mode, wildJokerRank, playersWithFirstSequence) {
  if (!wildJokerRank) return false;
  const m = normalizeMode(mode);
  if (m === "no_joker") return false;
  if (m === "open_joker") return true;
  const seq = parseSequenceList(playersWithFirstSequence);
  return seq.length > 0;
}

module.exports = {
  normalizeMode,
  parseSequenceList,
  isRevealActionAllowed,
  isWildJokerRevealedForPlayer,
  isWildJokerRevealedGlobally,
};

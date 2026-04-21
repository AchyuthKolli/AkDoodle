export function normalizeWildMode(mode) {
  const m = String(mode || "open_joker").toLowerCase();
  if (m === "no_joker") return "no_joker";
  if (m === "closed_joker") return "closed_joker";
  return "open_joker";
}

export function canRevealInMode(mode) {
  return normalizeWildMode(mode) === "closed_joker";
}

export function shouldShowWildCard(mode, revealedRank) {
  const m = normalizeWildMode(mode);
  if (m === "no_joker") return false;
  if (m === "open_joker") return true;
  return !!revealedRank;
}

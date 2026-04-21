export function normalizeLoserScoringMode(mode) {
  return String(mode || "auto_optimal").toLowerCase() === "submit_or_full"
    ? "submit_or_full"
    : "auto_optimal";
}

export function isStrictLoserScoringMode(mode) {
  return normalizeLoserScoringMode(mode) === "submit_or_full";
}

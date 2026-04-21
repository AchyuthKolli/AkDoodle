function normalizeLoserMode(mode) {
  return String(mode || "auto_optimal").toLowerCase() === "submit_or_full"
    ? "submit_or_full"
    : "auto_optimal";
}

function isStrictLoserMode(mode) {
  return normalizeLoserMode(mode) === "submit_or_full";
}

module.exports = {
  normalizeLoserMode,
  isStrictLoserMode,
};

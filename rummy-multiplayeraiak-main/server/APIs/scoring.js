// server/APIs/scoring.js
// FINAL RUMMY SCORING MODULE — Compatible with RummyEngine Option B

const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_POINTS = {
  "A": 10,
  "K": 10, "Q": 10, "J": 10,
  "10": 10, "9": 9, "8": 8, "7": 7,
  "6": 6, "5": 5, "4": 4, "3": 3, "2": 2
};

/* ----------------------------------
   Helper Extractor
----------------------------------- */
function _getAttr(card, attr, def = null) {
  if (!card || typeof card !== "object") return def;
  return card[attr] !== undefined ? card[attr] : def;
}

/* ----------------------------------
   Joker Detection
----------------------------------- */
function isJokerCard(card, wildRank = null, revealed = false) {
  const rank = _getAttr(card, "rank");

  if (rank === "JOKER") return true;              // printed joker
  if (revealed && wildRank && rank === wildRank) return true; // wild joker AFTER REVEAL
  return false;
}

function canActAsOptionalWildJoker(card, wildRank = null, revealed = false) {
  if (!revealed || !wildRank) return false;
  if (!card || typeof card !== "object") return false;
  return _getAttr(card, "rank") === wildRank && _getAttr(card, "rank") !== "JOKER";
}

/* ----------------------------------
   Card Points
----------------------------------- */
function cardPoints(card, aceValue = 10, faceCardMode = "ten") {
  if (!card) return 0;
  if (_getAttr(card, "rank") === "JOKER") return 0;

  const rank = _getAttr(card, "rank");
  if (rank === "A") return aceValue;  // 1 or 10
  if (faceCardMode === "rank") {
    if (rank === "J") return 11;
    if (rank === "Q") return 12;
    if (rank === "K") return 13;
  }
  return RANK_POINTS[rank] || 0;
}

function naiveHandPoints(hand = [], aceValue = 10, faceCardMode = "ten") {
  const total = hand.reduce((s, c) => s + cardPoints(c, aceValue, faceCardMode), 0);
  return Math.min(total, 80);
}

/* ----------------------------------
   Rank Helpers
----------------------------------- */
const rankIndex = (rank) => RANK_ORDER.indexOf(String(rank));

function canMakeStraightFromIndexes(indexes = [], jokerCount = 0) {
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] < 0) return false;
    if (i > 0 && sorted[i] === sorted[i - 1]) return false;
  }
  const gapsNeeded = sorted.reduce((gaps, v, i) => {
    if (i === 0) return 0;
    const gap = v - sorted[i - 1] - 1;
    return gaps + Math.max(gap, 0);
  }, 0);
  return gapsNeeded <= jokerCount;
}

/* ----------------------------------
   Sequence With Jokers
----------------------------------- */
function isSequence(cards = [], wildRank = null, revealed = false) {
  if (!Array.isArray(cards) || cards.length < 3) return false;
  const printedJokers = cards.filter((c) => _getAttr(c, "rank") === "JOKER");
  const optionalWilds = cards.filter((c) => canActAsOptionalWildJoker(c, wildRank, revealed));
  const fixedNaturals = cards.filter(
    (c) => _getAttr(c, "rank") !== "JOKER" && !canActAsOptionalWildJoker(c, wildRank, revealed)
  );

  // Try all ways of treating revealed wild-rank cards as either natural cards or jokers.
  const combos = 1 << optionalWilds.length;
  for (let mask = 0; mask < combos; mask++) {
    let jokerCount = printedJokers.length;
    const nonJokers = fixedNaturals.slice();

    for (let i = 0; i < optionalWilds.length; i++) {
      if ((mask & (1 << i)) !== 0) jokerCount += 1;
      else nonJokers.push(optionalWilds[i]);
    }

    if (nonJokers.length < 1) continue;

    const suits = nonJokers.map((c) => _getAttr(c, "suit"));
    if (suits.length > 0 && new Set(suits).size > 1) continue;

    const ranks = nonJokers.map((c) => String(_getAttr(c, "rank")));
    const baseIndexes = ranks.map((r) => rankIndex(r));

    // Standard low-ace sequences (A-2-3, A-2-3-4, 10-J-Q, 10-J-Q-K, etc.)
    if (canMakeStraightFromIndexes(baseIndexes, jokerCount)) return true;

    // High-ace sequences (J-Q-K-A and joker-assisted high-ace runs).
    if (ranks.includes("A")) {
      const highAceIndexes = baseIndexes.map((v, i) => (ranks[i] === "A" ? 13 : v));
      if (canMakeStraightFromIndexes(highAceIndexes, jokerCount)) return true;
    }
  }
  return false;
}

/* ----------------------------------
   Pure Sequence (no jokers)
----------------------------------- */
function isPureSequence(cards = [], wildRank = null, revealed = false) {
  // Pure sequence: valid sequence WITHOUT treating any card as a joker (except printed joker which is banned).
  if (cards.some(c => _getAttr(c, "rank") === "JOKER")) return false;

  return isSequence(cards, null, false);
}

/* ----------------------------------
   Set Validation
----------------------------------- */
function isSet(cards = [], wildRank = null, revealed = false) {
  if (!Array.isArray(cards) || cards.length < 3 || cards.length > 4) return false;
  const printedJokers = cards.filter((c) => _getAttr(c, "rank") === "JOKER");
  const optionalWilds = cards.filter((c) => canActAsOptionalWildJoker(c, wildRank, revealed));
  const fixedNaturals = cards.filter(
    (c) => _getAttr(c, "rank") !== "JOKER" && !canActAsOptionalWildJoker(c, wildRank, revealed)
  );

  const combos = 1 << optionalWilds.length;
  for (let mask = 0; mask < combos; mask++) {
    let jokerCount = printedJokers.length;
    const nonJokers = fixedNaturals.slice();
    for (let i = 0; i < optionalWilds.length; i++) {
      if ((mask & (1 << i)) !== 0) jokerCount += 1;
      else nonJokers.push(optionalWilds[i]);
    }

    if (jokerCount + nonJokers.length !== cards.length) continue;
    if (nonJokers.length < 1) continue;

    const ranks = [...new Set(nonJokers.map((c) => _getAttr(c, "rank")))];
    if (ranks.length !== 1) continue;

    const suits = nonJokers.map((c) => _getAttr(c, "suit"));
    if (new Set(suits).size !== suits.length) continue;

    return true;
  }
  return false;
}

/* ----------------------------------
   Full Declare Validation
----------------------------------- */
function validateHand(melds = [], leftover = [], wildRank = null, revealed = false) {
  if (!Array.isArray(melds) || melds.length === 0)
    return { valid: false, reason: "No melds provided" };

  if (melds.length !== 4)
    return { valid: false, reason: `Exactly 4 melds required, got ${melds.length}` };

  const total = melds.reduce((s, g) => s + (Array.isArray(g) ? g.length : 0), 0);
  if (total !== 13)
    return { valid: false, reason: `Total cards must be 13, got ${total}` };

  const sizes = melds.map((g) => (Array.isArray(g) ? g.length : 0)).sort((a, b) => a - b);
  const okSizes = sizes.length === 4 && sizes[0] === 3 && sizes[1] === 3 && sizes[2] === 3 && sizes[3] === 4;
  if (!okSizes)
    return { valid: false, reason: "Meld sizes must be exactly 3,3,3,4" };

  let hasPure = false;
  for (const g of melds) {
    if (!Array.isArray(g) || g.length < 3)
      return { valid: false, reason: "Each meld must have ≥3 cards" };

    const seq = isSequence(g, wildRank, revealed);
    const pure = isPureSequence(g, wildRank, revealed);
    const set = isSet(g, wildRank, revealed);

    if (!(seq || set))
      return { valid: false, reason: "Invalid meld detected" };

    if (pure) hasPure = true;
  }

  if (!hasPure)
    return { valid: false, reason: "At least one pure sequence required" };

  return { valid: true, reason: "Valid hand" };
}

/* ----------------------------------
   Deadwood
----------------------------------- */
function calculateDeadwoodPoints(cards = [], wildRank = null, revealed = false, aceValue = 10, faceCardMode = "ten") {
  const total = cards.reduce((sum, c) => {
    if (isJokerCard(c, wildRank, revealed)) return sum;
    return sum + cardPoints(c, aceValue, faceCardMode);
  }, 0);
  return Math.min(total, 80);
}

/**
 * Opponent penalty when someone else wins with a valid declare: only cards that are
 * not part of any rule-valid pure sequence, impure sequence, or set count toward
 * deadwood (greedy extraction). Cards the player left in fake/invalid meld slots
 * on their device are not sent to the server — only mathematically valid melds
 * reduce their score; everything else pays points.
 */
function calculateUngroupedDeadwoodPoints(hand = [], wildRank = null, revealed = false, aceValue = 10, faceCardMode = "ten") {
  const organized = organizeHandByMelds(hand, wildRank, revealed);
  const ungrouped = organized.ungrouped || [];
  return calculateDeadwoodPoints(ungrouped, wildRank, revealed, aceValue, faceCardMode);
}

function _cardMatchesHandCard(h, c) {
  return h.rank === c.rank && (h.suit || null) === (c.suit || null) && (!!h.joker) === (!!c.joker);
}

function _removeCardsFromHandCopy(handCopy, cards) {
  for (const c of cards) {
    const idx = handCopy.findIndex((h) => _cardMatchesHandCard(h, c));
    if (idx === -1) return false;
    handCopy.splice(idx, 1);
  }
  return true;
}

/** Pure / impure sequence or set (length ≥ 3). */
function isValidMeldGroup(group, wildRank = null, revealed = false) {
  if (!Array.isArray(group) || group.length < 3) return false;
  if (isPureSequence(group, wildRank, revealed)) return true;
  if (isSequence(group, wildRank, revealed) && !isPureSequence(group, wildRank, revealed)) return true;
  if (isSet(group, wildRank, revealed)) return true;
  return false;
}

function slotGroupsFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return [];
  const out = [];
  for (const k of ["meld1", "meld2", "meld3", "meld4"]) {
    const arr = snap[k];
    if (!Array.isArray(arr)) continue;
    const cards = arr.filter((x) => x != null && typeof x === "object");
    if (cards.length) out.push(cards);
  }
  return out;
}

function leftoverFromSnapshot(snap) {
  if (!snap || !Array.isArray(snap.leftover)) return [];
  return snap.leftover.filter((x) => x != null && typeof x === "object");
}

function snapshotHasAnyPlacedCards(snap) {
  return slotGroupsFromSnapshot(snap).length > 0 || leftoverFromSnapshot(snap).length > 0;
}

/**
 * Remove snapshot-placed cards from a copy of hand. Returns ok:false if a snapshot card is not in hand.
 * unplaced = cards the player never put on the meld board (still count for scoring).
 */
function analyzeHandVsSnapshot(hand, snap) {
  if (!Array.isArray(hand)) return { ok: false, unplaced: [], slotGroups: [] };
  const handCopy = hand.slice();
  const slotGroups = [];
  for (const g of slotGroupsFromSnapshot(snap)) {
    if (!_removeCardsFromHandCopy(handCopy, g)) return { ok: false, unplaced: hand.slice(), slotGroups: [] };
    slotGroups.push(g);
  }
  const lo = leftoverFromSnapshot(snap);
  if (!_removeCardsFromHandCopy(handCopy, lo)) return { ok: false, unplaced: hand.slice(), slotGroups: [] };
  return { ok: true, unplaced: handCopy, slotGroups };
}

/** Index combinations C(n,k) as index arrays (sorted ascending). */
function combinationsChooseIndices(n, k) {
  const results = [];
  if (k < 0 || k > n) return results;
  function backtrack(start, path) {
    if (path.length === k) {
      results.push(path.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      path.push(i);
      backtrack(i + 1, path);
      path.pop();
    }
  }
  backtrack(0, []);
  return results;
}

/**
 * For auto_optimal losers: try every 3+3+3+4 partition of all 13 cards; if any matches
 * full declare rules (incl. one pure sequence), deadwood is 0. Otherwise fall back to
 * greedy ungrouped scoring (same as calculateUngroupedDeadwoodPoints).
 */
function findBestValidDeclareLayout(hand = [], wildRank = null, revealed = false) {
  if (!Array.isArray(hand) || hand.length !== 13) return null;
  const n = 13;
  const comb4 = combinationsChooseIndices(n, 4);
  for (const c4 of comb4) {
    const set4 = new Set(c4);
    const restIdx = [];
    for (let i = 0; i < n; i++) if (!set4.has(i)) restIdx.push(i);
    const comb3a = combinationsChooseIndices(9, 3);
    for (const rel3a of comb3a) {
      const i3a = rel3a.map((r) => restIdx[r]);
      const set3a = new Set(i3a);
      const rest6 = restIdx.filter((i) => !set3a.has(i));
      const comb3b = combinationsChooseIndices(6, 3);
      for (const rel3b of comb3b) {
        const i3b = rel3b.map((r) => rest6[r]);
        const set3b = new Set(i3b);
        const i3c = rest6.filter((i) => !set3b.has(i));
        const g4 = c4.map((i) => hand[i]);
        const ga = i3a.map((i) => hand[i]);
        const gb = i3b.map((i) => hand[i]);
        const gc = i3c.map((i) => hand[i]);
        const groups = [ga, gb, gc, g4];
        const v = validateHand(groups, [], wildRank, revealed);
        if (v.valid) return { meld1: ga, meld2: gb, meld3: gc, meld4: g4 };
      }
    }
  }
  return null;
}

function minimalDeadwoodAutoFullHand(hand = [], wildRank = null, revealed = false, aceValue = 10, faceCardMode = "ten") {
  if (findBestValidDeclareLayout(hand, wildRank, revealed)) return 0;
  return calculateUngroupedDeadwoodPoints(hand, wildRank, revealed, aceValue, faceCardMode);
}

/**
 * loser_deadwood_mode:
 * - auto_optimal: for a full 13-card loser hand, ignore meld-board layout and score using
 *   best legal 3+3+3+4 partition if one exists (0 pts), else greedy ungrouped deadwood.
 *   For other hand sizes, invalid / short meld slots pay; valid slots free; unplaced uses greedy melds.
 * - submit_or_full: same for slots; unplaced pays full card values (no greedy melds). Missing/invalid snapshot → full hand pays.
 */
function calculateLoserDeadwoodPoints(hand = [], loserMode, snapshot, wildRank = null, revealed = false, aceValue = 10, faceCardMode = "ten") {
  const mode = loserMode === "submit_or_full" ? "submit_or_full" : "auto_optimal";
  const snap = snapshot && typeof snapshot === "object" ? snapshot : null;

  if (mode === "auto_optimal" && Array.isArray(hand) && hand.length === 13) {
    return Math.min(minimalDeadwoodAutoFullHand(hand, wildRank, revealed, aceValue, faceCardMode), 80);
  }

  if (!snap || !snapshotHasAnyPlacedCards(snap)) {
    if (mode === "submit_or_full") {
      return calculateDeadwoodPoints(hand, wildRank, revealed, aceValue, faceCardMode);
    }
    return calculateUngroupedDeadwoodPoints(hand, wildRank, revealed, aceValue, faceCardMode);
  }

  const analysis = analyzeHandVsSnapshot(hand, snap);
  if (!analysis.ok) {
    if (mode === "submit_or_full") {
      return calculateDeadwoodPoints(hand, wildRank, revealed, aceValue, faceCardMode);
    }
    return calculateUngroupedDeadwoodPoints(hand, wildRank, revealed, aceValue, faceCardMode);
  }

  const { unplaced, slotGroups } = analysis;
  const leftoverPlaced = leftoverFromSnapshot(snap);
  let pts = 0;
  for (const g of slotGroups) {
    if (isValidMeldGroup(g, wildRank, revealed)) continue;
    pts += calculateDeadwoodPoints(g, wildRank, revealed, aceValue, faceCardMode);
  }
  // Cards in snapshot "leftover" / deadwood slot: not meld slots — score with unplaced (were removed from hand in analyze).
  if (mode === "submit_or_full") {
    pts += calculateDeadwoodPoints(unplaced, wildRank, revealed, aceValue, faceCardMode);
    pts += calculateDeadwoodPoints(leftoverPlaced, wildRank, revealed, aceValue, faceCardMode);
  } else {
    pts += calculateUngroupedDeadwoodPoints([...unplaced, ...leftoverPlaced], wildRank, revealed, aceValue, faceCardMode);
  }
  return Math.min(pts, 80);
}

/* ----------------------------------
   Combinations
----------------------------------- */
function combinations(arr, k) {
  const out = [];
  const n = arr.length;

  function back(i, temp) {
    if (temp.length === k) return out.push(temp.slice());
    for (let j = i; j < n; j++) {
      temp.push(arr[j]);
      back(j + 1, temp);
      temp.pop();
    }
  }

  back(0, []);
  return out;
}

/* ----------------------------------
   Auto Organize Helper
----------------------------------- */
function tryFormSequence(pool, wildRank, revealed) {
  if (pool.length < 3) return null;

  for (const size of [4, 3]) {
    if (pool.length < size) continue;

    for (const combo of combinations(pool, size)) {
      if (isSequence(combo, wildRank, revealed)) return combo;
    }
  }

  return null;
}

function tryFormSet(pool, wildRank, revealed) {
  if (pool.length < 3) return null;

  for (const size of [4, 3]) {
    if (pool.length < size) continue;

    for (const combo of combinations(pool, size)) {
      if (isSet(combo, wildRank, revealed)) return combo;
    }
  }

  return null;
}

/* ----------------------------------
   Auto Organize Hand (Opponent scoring)
----------------------------------- */
function autoOrganizeHand(hand = [], wildRank = null, revealed = false) {
  if (!Array.isArray(hand)) return { melds: [], leftover: [] };

  let remaining = hand.slice();
  const melds = [];

  // PURE sequence first
  while (remaining.length >= 3) {
    const seq = tryFormSequence(remaining, wildRank, revealed);
    if (!seq || !isPureSequence(seq, wildRank, revealed)) break;

    melds.push(seq);
    seq.forEach(c => remaining.splice(remaining.indexOf(c), 1));
  }

  // IMPURE sequences
  while (remaining.length >= 3) {
    const seq = tryFormSequence(remaining, wildRank, revealed);
    if (!seq) break;

    melds.push(seq);
    seq.forEach(c => remaining.splice(remaining.indexOf(c), 1));
  }

  // Sets
  while (remaining.length >= 3) {
    const set = tryFormSet(remaining, wildRank, revealed);
    if (!set) break;

    melds.push(set);
    set.forEach(c => remaining.splice(remaining.indexOf(c), 1));
  }

  return { melds, leftover: remaining };
}

/* ----------------------------------
   Organize for UI Display
----------------------------------- */
function organizeHandByMelds(hand = [], wildRank = null, revealed = false) {
  if (!Array.isArray(hand))
    return { pure_sequences: [], impure_sequences: [], sets: [], ungrouped: [] };

  let remaining = hand.slice();
  const pure = [], impure = [], setsArr = [];

  function find(type) {
    if (remaining.length < 3) return null;
    for (const size of [4, 3]) {
      if (remaining.length < size) continue;

      for (const combo of combinations(remaining, size)) {
        if (type === "pure" && isPureSequence(combo, wildRank, revealed)) return combo;
        if (type === "seq" && isSequence(combo, wildRank, revealed) && !isPureSequence(combo, wildRank, revealed)) return combo;
        if (type === "set" && isSet(combo, wildRank, revealed)) return combo;
      }
    }
    return null;
  }

  let m;

  while ((m = find("pure"))) {
    pure.push(m);
    m.forEach(c => remaining.splice(remaining.indexOf(c), 1));
  }

  while ((m = find("seq"))) {
    impure.push(m);
    m.forEach(c => remaining.splice(remaining.indexOf(c), 1));
  }

  while ((m = find("set"))) {
    setsArr.push(m);
    m.forEach(c => remaining.splice(remaining.indexOf(c), 1));
  }

  return {
    pure_sequences: pure,
    impure_sequences: impure,
    sets: setsArr,
    ungrouped: remaining
  };
}

/* ----------------------------------
   EXPORTS
----------------------------------- */
module.exports = {
  isJokerCard,
  cardPoints,
  naiveHandPoints,

  isSequence,
  isPureSequence,
  isSet,

  validateHand,
  validate_hand: validateHand,

  calculateDeadwoodPoints,
  calculate_deadwood_points: calculateDeadwoodPoints,

  calculateUngroupedDeadwoodPoints,
  calculate_ungrouped_deadwood_points: calculateUngroupedDeadwoodPoints,

  calculateLoserDeadwoodPoints,
  calculate_loser_deadwood_points: calculateLoserDeadwoodPoints,
  findBestValidDeclareLayout,
  find_best_valid_declare_layout: findBestValidDeclareLayout,
  minimalDeadwoodAutoFullHand,
  minimal_deadwood_auto_full_hand: minimalDeadwoodAutoFullHand,
  isValidMeldGroup,
  is_valid_meld_group: isValidMeldGroup,

  autoOrganizeHand,
  auto_organize_hand: autoOrganizeHand,

  organizeHandByMelds,
  organize_hand_by_melds: organizeHandByMelds
};

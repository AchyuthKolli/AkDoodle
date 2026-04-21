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

/* ----------------------------------
   Card Points
----------------------------------- */
function cardPoints(card, aceValue = 10) {
  if (!card) return 0;
  if (_getAttr(card, "rank") === "JOKER") return 0;

  const rank = _getAttr(card, "rank");
  if (rank === "A") return aceValue;  // 1 or 10
  return RANK_POINTS[rank] || 0;
}

function naiveHandPoints(hand = [], aceValue = 10) {
  const total = hand.reduce((s, c) => s + cardPoints(c, aceValue), 0);
  return Math.min(total, 80);
}

/* ----------------------------------
   Rank Helpers
----------------------------------- */
const rankIndex = (rank) => RANK_ORDER.indexOf(String(rank));

/* ----------------------------------
   Sequence With Jokers
----------------------------------- */
function isSequence(cards = [], wildRank = null, revealed = false) {
  if (!Array.isArray(cards) || cards.length < 3) return false;

  const suits = cards
    .filter(c => !isJokerCard(c, wildRank, revealed))
    .map(c => _getAttr(c, "suit"));

  // all non-jokers must match suit
  if (suits.length > 0 && new Set(suits).size > 1) return false;

  const jokerCount = cards.filter(c => isJokerCard(c, wildRank, revealed)).length;
  const nonJokers = cards.filter(c => !isJokerCard(c, wildRank, revealed));

  if (nonJokers.length < 2) return false;

  const idx = nonJokers
    .map(c => rankIndex(_getAttr(c, "rank")))
    .sort((a, b) => a - b);

  // Duplicate non-joker ranks cannot form a run (e.g. Q♦, Q♦, Joker is invalid).
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] === idx[i - 1]) return false;
  }

  // gaps between card ranks
  const gapsNeeded = idx.reduce((gaps, v, i) => {
    if (i === 0) return 0;
    const gap = v - idx[i - 1] - 1;
    return gaps + Math.max(gap, 0);
  }, 0);

  return gapsNeeded <= jokerCount;
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

  const nonJokers = cards.filter(c => !isJokerCard(c, wildRank, revealed));
  if (nonJokers.length < 2) return false;

  const ranks = [...new Set(nonJokers.map(c => _getAttr(c, "rank")))];
  if (ranks.length !== 1) return false;

  // suits must be all different
  const suits = nonJokers.map(c => _getAttr(c, "suit"));
  if (new Set(suits).size !== suits.length) return false;

  return true;
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
function calculateDeadwoodPoints(cards = [], wildRank = null, revealed = false, aceValue = 10) {
  const total = cards.reduce((sum, c) => {
    if (isJokerCard(c, wildRank, revealed)) return sum;
    return sum + cardPoints(c, aceValue);
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
function calculateUngroupedDeadwoodPoints(hand = [], wildRank = null, revealed = false, aceValue = 10) {
  const organized = organizeHandByMelds(hand, wildRank, revealed);
  const ungrouped = organized.ungrouped || [];
  return calculateDeadwoodPoints(ungrouped, wildRank, revealed, aceValue);
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

/**
 * loser_deadwood_mode:
 * - auto_optimal: invalid / short meld slots pay; valid slots free; unplaced cards use greedy valid melds then pay remainder.
 * - submit_or_full: same for slots; unplaced pays full card values (no greedy melds). Missing/invalid snapshot → full hand pays.
 */
function calculateLoserDeadwoodPoints(hand = [], loserMode, snapshot, wildRank = null, revealed = false, aceValue = 10) {
  const mode = loserMode === "submit_or_full" ? "submit_or_full" : "auto_optimal";
  const snap = snapshot && typeof snapshot === "object" ? snapshot : null;

  if (!snap || !snapshotHasAnyPlacedCards(snap)) {
    if (mode === "submit_or_full") {
      return calculateDeadwoodPoints(hand, wildRank, revealed, aceValue);
    }
    return calculateUngroupedDeadwoodPoints(hand, wildRank, revealed, aceValue);
  }

  const analysis = analyzeHandVsSnapshot(hand, snap);
  if (!analysis.ok) {
    if (mode === "submit_or_full") {
      return calculateDeadwoodPoints(hand, wildRank, revealed, aceValue);
    }
    return calculateUngroupedDeadwoodPoints(hand, wildRank, revealed, aceValue);
  }

  const { unplaced, slotGroups } = analysis;
  const leftoverPlaced = leftoverFromSnapshot(snap);
  let pts = 0;
  for (const g of slotGroups) {
    if (isValidMeldGroup(g, wildRank, revealed)) continue;
    pts += calculateDeadwoodPoints(g, wildRank, revealed, aceValue);
  }
  // Cards in snapshot "leftover" / deadwood slot: not meld slots — score with unplaced (were removed from hand in analyze).
  if (mode === "submit_or_full") {
    pts += calculateDeadwoodPoints(unplaced, wildRank, revealed, aceValue);
    pts += calculateDeadwoodPoints(leftoverPlaced, wildRank, revealed, aceValue);
  } else {
    pts += calculateUngroupedDeadwoodPoints([...unplaced, ...leftoverPlaced], wildRank, revealed, aceValue);
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
  isValidMeldGroup,
  is_valid_meld_group: isValidMeldGroup,

  autoOrganizeHand,
  auto_organize_hand: autoOrganizeHand,

  organizeHandByMelds,
  organize_hand_by_melds: organizeHandByMelds
};

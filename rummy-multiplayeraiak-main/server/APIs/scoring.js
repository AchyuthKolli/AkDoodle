// server/APIs/scoring.js
// FINAL RUMMY SCORING MODULE — Compatible with RummyEngine Option B

const RANK_ORDER = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
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
  const rank = _getAttr(card,"rank");

  if (rank === "JOKER") return true;              // printed joker
  if (revealed && wildRank && rank === wildRank) return true; // wild joker AFTER REVEAL
  return false;
}

/* ----------------------------------
   Card Points
----------------------------------- */
function cardPoints(card, aceValue = 10) {
  if (!card) return 0;
  if (_getAttr(card,"rank") === "JOKER") return 0;

  const rank = _getAttr(card,"rank");
  if (rank === "A") return aceValue;  // 1 or 10
  return RANK_POINTS[rank] || 0;
}

function naiveHandPoints(hand = [], aceValue = 10) {
  const total = hand.reduce((s,c)=>s+cardPoints(c,aceValue),0);
  return Math.min(total,80);
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
    .filter(c=>!isJokerCard(c,wildRank,revealed))
    .map(c=>_getAttr(c,"suit"));

  // all non-jokers must match suit
  if (suits.length > 0 && new Set(suits).size > 1) return false;

  const jokerCount = cards.filter(c=>isJokerCard(c,wildRank,revealed)).length;
  const nonJokers = cards.filter(c=>!isJokerCard(c,wildRank,revealed));

  if (nonJokers.length < 2) return false;

  const idx = nonJokers
    .map(c=>rankIndex(_getAttr(c,"rank")))
    .sort((a,b)=>a-b);

  // gaps between card ranks
  const gapsNeeded = idx.reduce((gaps,v,i)=>{
    if (i===0) return 0;
    const gap = v - idx[i-1] - 1;
    return gaps + Math.max(gap,0);
  },0);

  return gapsNeeded <= jokerCount;
}

/* ----------------------------------
   Pure Sequence (no jokers)
----------------------------------- */
function isPureSequence(cards = [], wildRank = null, revealed = false) {
  if (!isSequence(cards, wildRank, revealed)) return false;

  // printed jokers not allowed ever
  if (cards.some(c => _getAttr(c,"rank")==="JOKER")) return false;

  // wild jokers also forbidden in pure sequence
  if (revealed && wildRank) {
    if (cards.some(c => _getAttr(c,"rank") === wildRank)) return false;
  }

  // must be strictly consecutive in rankIndex
  const idx = cards
    .map(c=>rankIndex(_getAttr(c,"rank")))
    .sort((a,b)=>a-b);

  return idx.every((v,i)=>i===0 || v - idx[i-1] === 1);
}

/* ----------------------------------
   Set Validation
----------------------------------- */
function isSet(cards = [], wildRank = null, revealed = false) {
  if (!Array.isArray(cards) || cards.length < 3 || cards.length > 4) return false;

  const nonJokers = cards.filter(c=>!isJokerCard(c,wildRank,revealed));
  if (nonJokers.length < 2) return false;

  const ranks = [...new Set(nonJokers.map(c => _getAttr(c,"rank")))];
  if (ranks.length !== 1) return false;

  // suits must be all different
  const suits = nonJokers.map(c=>_getAttr(c,"suit"));
  if (new Set(suits).size !== suits.length) return false;

  return true;
}

/* ----------------------------------
   Full Declare Validation
----------------------------------- */
function validateHand(melds = [], leftover = [], wildRank = null, revealed = false) {
  if (!Array.isArray(melds) || melds.length === 0)
    return { valid:false, reason:"No melds provided" };

  const total = melds.reduce((s,g)=>s+(Array.isArray(g)?g.length:0),0);
  if (total !== 13)
    return { valid:false, reason:`Total cards must be 13, got ${total}` };

  let hasPure = false;

  for (const g of melds) {
    if (!Array.isArray(g) || g.length < 3)
      return { valid:false, reason:"Each meld must have ≥3 cards" };

    const seq  = isSequence(g, wildRank, revealed);
    const pure = isPureSequence(g, wildRank, revealed);
    const set  = isSet(g, wildRank, revealed);

    if (!(seq || set))
      return { valid:false, reason:"Invalid meld detected" };

    if (pure) hasPure = true;
  }

  if (!hasPure)
    return { valid:false, reason:"At least one pure sequence required" };

  return { valid:true, reason:"Valid hand" };
}

/* ----------------------------------
   Deadwood
----------------------------------- */
function calculateDeadwoodPoints(cards = [], wildRank = null, revealed = false, aceValue = 10) {
  const total = cards.reduce((sum,c)=>{
    if (isJokerCard(c,wildRank,revealed)) return sum;
    return sum + cardPoints(c,aceValue);
  },0);
  return Math.min(total,80);
}

/* ----------------------------------
   Combinations
----------------------------------- */
function combinations(arr, k) {
  const out = [];
  const n = arr.length;

  function back(i,temp){
    if (temp.length === k) return out.push(temp.slice());
    for (let j=i;j<n;j++){
      temp.push(arr[j]);
      back(j+1,temp);
      temp.pop();
    }
  }

  back(0,[]);
  return out;
}

/* ----------------------------------
   Auto Organize Helper
----------------------------------- */
function tryFormSequence(pool, wildRank, revealed) {
  if (pool.length < 3) return null;

  for (const size of [4,3]) {
    if (pool.length < size) continue;

    for (const combo of combinations(pool,size)) {
      if (isSequence(combo,wildRank,revealed)) return combo;
    }
  }

  return null;
}

function tryFormSet(pool, wildRank, revealed) {
  if (pool.length < 3) return null;

  for (const size of [4,3]) {
    if (pool.length < size) continue;

    for (const combo of combinations(pool,size)) {
      if (isSet(combo,wildRank,revealed)) return combo;
    }
  }

  return null;
}

/* ----------------------------------
   Auto Organize Hand (Opponent scoring)
----------------------------------- */
function autoOrganizeHand(hand = [], wildRank = null, revealed = false) {
  if (!Array.isArray(hand)) return { melds:[], leftover:[] };

  let remaining = hand.slice();
  const melds = [];

  // PURE sequence first
  while (remaining.length >= 3) {
    const seq = tryFormSequence(remaining,wildRank,revealed);
    if (!seq || !isPureSequence(seq,wildRank,revealed)) break;

    melds.push(seq);
    seq.forEach(c=>remaining.splice(remaining.indexOf(c),1));
  }

  // IMPURE sequences
  while (remaining.length >= 3) {
    const seq = tryFormSequence(remaining,wildRank,revealed);
    if (!seq) break;

    melds.push(seq);
    seq.forEach(c=>remaining.splice(remaining.indexOf(c),1));
  }

  // Sets
  while (remaining.length >= 3) {
    const set = tryFormSet(remaining,wildRank,revealed);
    if (!set) break;

    melds.push(set);
    set.forEach(c=>remaining.splice(remaining.indexOf(c),1));
  }

  return { melds, leftover:remaining };
}

/* ----------------------------------
   Organize for UI Display
----------------------------------- */
function organizeHandByMelds(hand = [], wildRank = null, revealed = false) {
  if (!Array.isArray(hand))
    return { pure_sequences:[], impure_sequences:[], sets:[], ungrouped:[] };

  let remaining = hand.slice();
  const pure=[], impure=[], setsArr=[];

  function find(type) {
    if (remaining.length < 3) return null;
    for (const size of [4,3]) {
      if (remaining.length < size) continue;

      for (const combo of combinations(remaining,size)) {
        if (type==="pure"  && isPureSequence(combo,wildRank,revealed)) return combo;
        if (type==="seq"   && isSequence(combo,wildRank,revealed) && !isPureSequence(combo,wildRank,revealed)) return combo;
        if (type==="set"   && isSet(combo,wildRank,revealed)) return combo;
      }
    }
    return null;
  }

  let m;

  while ((m = find("pure"))) {
    pure.push(m);
    m.forEach(c => remaining.splice(remaining.indexOf(c),1));
  }

  while ((m = find("seq"))) {
    impure.push(m);
    m.forEach(c => remaining.splice(remaining.indexOf(c),1));
  }

  while ((m = find("set"))) {
    setsArr.push(m);
    m.forEach(c => remaining.splice(remaining.indexOf(c),1));
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

  autoOrganizeHand,
  auto_organize_hand: autoOrganizeHand,

  organizeHandByMelds,
  organize_hand_by_melds: organizeHandByMelds
};

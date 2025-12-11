
const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_POINTS = {
    "A": 10,
    "K": 10, "Q": 10, "J": 10,
    "10": 10, "9": 9, "8": 8, "7": 7,
    "6": 6, "5": 5, "4": 4, "3": 3, "2": 2
};

function _getAttr(card, attr, def = null) {
    if (!card || typeof card !== "object") return def;
    return card[attr] !== undefined ? card[attr] : def;
}

function isJokerCard(card, wildRank = null, revealed = false) {
    const rank = _getAttr(card, "rank");
    if (rank === "JOKER") return true;
    if (revealed && wildRank && rank === wildRank) return true;
    return false;
}

const rankIndex = (rank) => RANK_ORDER.indexOf(String(rank));

function isSequence(cards = [], wildRank = null, revealed = false) {
    if (!Array.isArray(cards) || cards.length < 3) return false;

    const suits = cards
        .filter(c => !isJokerCard(c, wildRank, revealed))
        .map(c => _getAttr(c, "suit"));

    if (suits.length > 0 && new Set(suits).size > 1) return false;

    const jokerCount = cards.filter(c => isJokerCard(c, wildRank, revealed)).length;
    const nonJokers = cards.filter(c => !isJokerCard(c, wildRank, revealed));

    if (nonJokers.length < 2) return true; // 2 cards + joker(s) is sequence if jokerCount fills gap. A sequence needs >=3 cards handled by caller. logic here: check gaps.

    const idx = nonJokers
        .map(c => rankIndex(_getAttr(c, "rank")))
        .sort((a, b) => a - b);

    const gapsNeeded = idx.reduce((gaps, v, i) => {
        if (i === 0) return 0;
        const gap = v - idx[i - 1] - 1;
        return gaps + Math.max(gap, 0);
    }, 0);

    return gapsNeeded <= jokerCount;
}

function isPureSequence(cards = [], wildRank = null, revealed = false) {
    // Pure sequence: valid sequence WITHOUT treating any card as a joker (except printed joker which is banned).
    // So we pass wildRank=null, revealed=false to isSequence to force natural check.
    if (cards.some(c => _getAttr(c, "rank") === "JOKER")) return false;

    return isSequence(cards, null, false);
}

function isSet(cards = [], wildRank = null, revealed = false) {
    if (!Array.isArray(cards) || cards.length < 3 || cards.length > 4) return false;

    const nonJokers = cards.filter(c => !isJokerCard(c, wildRank, revealed));
    if (nonJokers.length < 2) return true; // All jokers or 1 card + jokers is a set

    const ranks = [...new Set(nonJokers.map(c => _getAttr(c, "rank")))];
    if (ranks.length !== 1) return false;

    const suits = nonJokers.map(c => _getAttr(c, "suit"));
    if (new Set(suits).size !== suits.length) return false;

    return true;
}

export function validateHand(melds = [], wildRank = null, revealed = false) {
    if (!Array.isArray(melds) || melds.length === 0)
        return { valid: false, reason: "No melds provided" };

    const total = melds.reduce((s, g) => s + (Array.isArray(g) ? g.length : 0), 0);
    if (total !== 13)
        return { valid: false, reason: `Total cards must be 13, got ${total}` };

    let hasPure = false;
    let hasFirstSeq = false; // "First sequence" logic: usually implies Pure. But standard Rummy needs 2 sequences, one pure.
    // Wait, standard Indian Rummy:
    // 1. One pure sequence required.
    // 2. Second sequence required (can be pure or impure).
    // The server implementation in scoring.js checked:
    // if (!hasPure) return { ... "At least one pure sequence required" }
    // And loop checks each g is (Sequence OR Set).
    // It does NOT strictly enforce "Two sequences".
    // However, for purposes of "client-side check strictly", I will stick to what scoring.js implements.
    // scoring.js validation:
    // - All groups must be valid (Seq or Set)
    // - At least one Pure Sequence.

    for (const g of melds) {
        if (!Array.isArray(g) || g.length < 3)
            return { valid: false, reason: "Each meld must have ≥3 cards" };

        const seq = isSequence(g, wildRank, revealed);
        const pure = isPureSequence(g, wildRank, revealed);
        const set = isSet(g, wildRank, revealed);

        if (!(seq || set))
            return { valid: false, reason: "Invalid meld detected: Not a sequence or set" };

        if (pure) hasPure = true;
    }

    if (!hasPure)
        return { valid: false, reason: "At least one pure sequence required" };

    return { valid: true, reason: "Valid hand" };
}

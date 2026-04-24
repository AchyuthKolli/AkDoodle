
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

function canActAsOptionalWildJoker(card, wildRank = null, revealed = false) {
    if (!revealed || !wildRank) return false;
    if (!card || typeof card !== "object") return false;
    return _getAttr(card, "rank") === wildRank && _getAttr(card, "rank") !== "JOKER";
}

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

function isSequence(cards = [], wildRank = null, revealed = false) {
    if (!Array.isArray(cards) || cards.length < 3) return false;
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

        if (nonJokers.length < 1) continue;

        const suits = nonJokers.map((c) => _getAttr(c, "suit"));
        if (suits.length > 0 && new Set(suits).size > 1) continue;

        const ranks = nonJokers.map((c) => String(_getAttr(c, "rank")));
        const baseIndexes = ranks.map((r) => rankIndex(r));

        // Standard low-ace sequence check (A-2-3, A-2-3-4, 10-J-Q, 10-J-Q-K, etc.)
        if (canMakeStraightFromIndexes(baseIndexes, jokerCount)) return true;

        // High-ace sequence check (J-Q-K-A and joker-assisted variants like J-Q-JOKER-A).
        if (ranks.includes("A")) {
            const highAceIndexes = baseIndexes.map((v, i) => (ranks[i] === "A" ? 13 : v));
            if (canMakeStraightFromIndexes(highAceIndexes, jokerCount)) return true;
        }
    }
    return false;
}

function isPureSequence(cards = [], wildRank = null, revealed = false) {
    // Pure sequence: valid sequence WITHOUT treating any card as a joker (except printed joker which is banned).
    // So we pass wildRank=null, revealed=false to isSequence to force natural check.
    if (cards.some(c => _getAttr(c, "rank") === "JOKER")) return false;

    return isSequence(cards, null, false);
}

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

export function validateHand(melds = [], wildRank = null, revealed = false) {
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
            return { valid: false, reason: "Invalid meld detected: Not a sequence or set" };

        if (pure) hasPure = true;
    }

    if (!hasPure)
        return { valid: false, reason: "At least one pure sequence required" };

    return { valid: true, reason: "Valid hand" };
}

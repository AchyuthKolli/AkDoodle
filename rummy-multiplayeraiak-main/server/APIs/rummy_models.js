// server/APIs/rummy_models.js
// FINAL — 100% Compatible With RummyEngine Option B

/* ----------------------------------
   Card Class
----------------------------------- */
class Card {
  constructor(rank, suit = null, joker = false) {
    this.rank = rank;  // "A".."K" or "JOKER"
    this.suit = suit;  // "S", "H", "D", "C", or null
    this.joker = joker; // true for printed jokers
  }

  code() {
    if (this.joker && this.rank === "JOKER") return "JOKER";
    return `${this.rank}${this.suit || ""}`;
  }
}

/* ----------------------------------
   Deck Config
----------------------------------- */
class DeckConfig {
  constructor({ decks = 1, include_printed_jokers = true } = {}) {
    this.decks = decks;
    this.include_printed_jokers = include_printed_jokers;
  }
}

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["S","H","D","C"];

/* ----------------------------------
   BUILD DECK — Option B Engine expects buildDeck()
----------------------------------- */
function buildDeck(cfg = new DeckConfig()) {
  const cards = [];

  for (let i = 0; i < cfg.decks; i++) {
    // 52 normal cards
    for (const s of SUITS) {
      for (const r of RANKS) {
        cards.push(new Card(r, s, false));
      }
    }

    // Printed jokers
    if (cfg.include_printed_jokers) {
      cards.push(new Card("JOKER", null, true));
      cards.push(new Card("JOKER", null, true));
    }
  }

  return cards;
}

/* ----------------------------------
   SHUFFLE — Option B Engine expects shuffleDeck(cards, seed)
----------------------------------- */
function shuffleDeck(cards, seed = null) {
  const array = [...cards];

  let rng = seed !== null ? mulberry32(seed) : Math.random;

  for (let i = array.length - 1; i > 0; i--) {
    const j =
      seed !== null
        ? Math.floor(rng() * (i + 1))
        : Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}

/* ----------------------------------
   Deterministic RNG (seed mode)
----------------------------------- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------------
   EXPORTS
----------------------------------- */
module.exports = {
  Card,
  DeckConfig,
  buildDeck,
  shuffleDeck,
  RANKS,
  SUITS
};

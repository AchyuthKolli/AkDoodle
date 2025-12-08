// server/engine/rummy_engine.js
// Full Rummy Engine — Option B (Node.js)
// Depends on: ../APIs/rummy_models.js and ../APIs/scoring.js
// Exports: class RummyEngine

const { v4: uuidv4 } = require("uuid");

// rummy_models should export buildDeck(opts) and shuffleDeck(cards, seed)
// scoring should export validation & scoring helpers (many aliases provided)
const models = require("../APIs/rummy_models");
const scoring = require("../APIs/scoring");

// Safe accessors for scoring functions (support multiple alias names)
const validateHandFn = scoring.validate_hand || scoring.validateHand || scoring.validateHand || null;
const calculateDeadwoodFn =
  scoring.calculate_deadwood_points ||
  scoring.calculateDeadwoodPoints ||
  scoring.calculate_deadwood_points ||
  null;
const autoOrganizeFn =
  scoring.auto_organize_hand || scoring.autoOrganizeHand || scoring.auto_organize_hand || null;
const isSequenceFn = scoring.is_sequence || scoring.isSequence || null;
const isPureSequenceFn = scoring.is_pure_sequence || scoring.isPureSequence || null;
const isSetFn = scoring.is_set || scoring.isSet || null;

function pickDeckCount(playerCount) {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  return 3;
}

// encode card object to short code for UI ('10H', 'AS', 'JOKER')
function encodeCard(card) {
  if (!card) return "";
  if (card.joker || card.rank === "JOKER") return "JOKER";
  return `${card.rank}${card.suit || ""}`;
}

// deep clone helper
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * RummyEngine
 *
 * tableMeta: {
 *   table_id?, host_user_id?, wild_joker_mode? ('no_joker'|'open_joker'|'closed_joker'),
 *   ace_value?, disqualify_score?, max_players?
 * }
 *
 * players: [{ user_id, display_name, seat? }]
 */
class RummyEngine {
  constructor(tableMeta = {}, players = []) {
    this.table = {
      table_id: tableMeta.table_id || uuidv4(),
      host_user_id: tableMeta.host_user_id || null,
      wild_joker_mode: tableMeta.wild_joker_mode || "open_joker",
      ace_value: tableMeta.ace_value || 10,
      disqualify_score: tableMeta.disqualify_score || 200,
      max_players: tableMeta.max_players || 4,
      status: "waiting",
    };

    // players state
    this.players = (players || []).map((p, idx) => ({
      user_id: p.user_id,
      display_name: p.display_name || `Player-${String(p.user_id).slice(-6)}`,
      seat: p.seat || idx + 1,
      hand: [],
      hasDrawn: false,
      dropped: false,
      drop_points: 0,
    }));

    // round / engine state
    this.round_number = 0;
    this.stock = [];
    this.discard = [];
    this.discard_top = null;
    this.active_index = 0;
    this.wild_joker_rank = null;
    this.wild_joker_revealed = false;
    this.players_with_first_sequence = [];
    this.round_over = false;
    this.history = []; // history of rounds
  }

  // -----------------------
  // Utility
  // -----------------------
  serializeCard(card) {
    return encodeCard(card);
  }

  getPlayerIndex(userId) {
    return this.players.findIndex((p) => p.user_id === userId);
  }

  getActiveUserId() {
    return this.players[this.active_index] ? this.players[this.active_index].user_id : null;
  }

  snapshotTable() {
    return {
      table_id: this.table.table_id,
      status: this.table.status,
      host_user_id: this.table.host_user_id,
      round_number: this.round_number,
      players: this.players.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        seat: p.seat,
        hand_count: p.hand.length,
        dropped: !!p.dropped,
      })),
      game_mode: this.table.wild_joker_mode,
    };
  }

  // -----------------------
  // PART 1 — START ROUND (deck build / shuffle / deal finalization)
  // -----------------------
  startRound(seed = null) {
    if (this.table.status === "playing") {
      return { ok: false, message: "Round already playing" };
    }
    const activePlayers = this.players.filter((p) => !p.dropped);
    if (activePlayers.length < 2) {
      return { ok: false, message: "Need at least 2 players to start" };
    }

    this.round_number += 1;
    this.round_over = false;
    // reset per-player state
    this.players.forEach((p) => {
      p.hand = [];
      p.hasDrawn = false;
      p.dropped = false;
      p.drop_points = 0;
    });

    // determine wild joker rank behavior per mode
    if (this.table.wild_joker_mode === "no_joker") {
      this.wild_joker_rank = null;
      this.wild_joker_revealed = false;
    } else if (this.table.wild_joker_mode === "open_joker") {
      // pick immediately and reveal
      const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      const idx = seed ? Math.abs(seed) % ranks.length : Math.floor(Math.random() * ranks.length);
      this.wild_joker_rank = ranks[idx];
      this.wild_joker_revealed = true;
    } else if (this.table.wild_joker_mode === "closed_joker") {
      // pick rank but keep closed until first pure sequence lock
      const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      const idx = seed ? Math.abs(seed) % ranks.length : Math.floor(Math.random() * ranks.length);
      this.wild_joker_rank = ranks[idx];
      this.wild_joker_revealed = false;
    } else {
      // defensive fallback: treat as open
      const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      const idx = seed ? Math.abs(seed) % ranks.length : Math.floor(Math.random() * ranks.length);
      this.wild_joker_rank = ranks[idx];
      this.wild_joker_revealed = this.table.wild_joker_mode.startsWith("open");
    }

    // Build deck(s)
    const decks = pickDeckCount(this.players.length);
    let fullDeck = [];
    for (let d = 0; d < decks; d++) {
      // buildDeck accepts an options object in rummy_models
      const part = typeof models.buildDeck === "function" ? models.buildDeck({ include_printed_jokers: true }) : [];
      fullDeck = fullDeck.concat(part);
    }

    // shuffle
    if (typeof models.shuffleDeck === "function") {
      fullDeck = models.shuffleDeck(fullDeck, seed);
    } else {
      // in-case shuffleDeck not available, do a simple Fisher-Yates
      for (let i = fullDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fullDeck[i], fullDeck[j]] = [fullDeck[j], fullDeck[i]];
      }
    }

    // deal 13 cards each (round-robin)
    for (let i = 0; i < 13; i++) {
      for (const p of this.players) {
        const c = fullDeck.pop();
        p.hand.push(c);
      }
    }

    // reveal discard top: keep popping until non-printed-joker on top (printed jokers have joker===true && rank==='JOKER')
    this.discard = [];
    this.discard_top = null;
    while (fullDeck.length > 0) {
      const top = fullDeck.pop();
      this.discard.push(top);
      this.discard_top = this.serializeCard(top);
      // printed joker detection: card.joker===true and card.rank === "JOKER"
      if (!(top && top.joker === true && top.rank === "JOKER")) break;
      // otherwise continue to move printed jokers on discard
    }

    // remaining = stock
    this.stock = fullDeck.slice();

    // set starting player: host rotates each round (host first in round 1)
    let startIndex = 0;
    if (this.table.host_user_id) {
      const hostIdx = this.getPlayerIndex(this.table.host_user_id);
      if (hostIdx >= 0) {
        startIndex = (hostIdx + (this.round_number - 1)) % this.players.length;
      }
    }
    this.active_index = startIndex;

    this.table.status = "playing";

    return {
      ok: true,
      round_number: this.round_number,
      active_user_id: this.getActiveUserId(),
      stock_count: this.stock.length,
      discard_top: this.discard_top,
      wild_joker_rank: this.wild_joker_rank,
      wild_joker_revealed: this.wild_joker_revealed,
    };
  }

  // -----------------------
  // PART 2 — Player personal view
  // -----------------------
  getRoundMe(userId) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Not part of this table" };

    const p = this.players[idx];
    const handView = p.hand.map((c) => ({
      rank: c.rank,
      suit: c.suit || null,
      joker: !!c.joker,
      code: c.joker || c.rank === "JOKER" ? "JOKER" : `${c.rank}${c.suit || ""}`,
    }));

    return {
      ok: true,
      table_id: this.table.table_id,
      round_number: this.round_number,
      hand: handView,
      stock_count: this.stock.length,
      discard_top: this.discard_top,
      wild_joker_revealed: this.wild_joker_revealed,
      wild_joker_rank: this.wild_joker_rank,
      active_user_id: this.getActiveUserId(),
      finished_at: this.round_over ? new Date().toISOString() : null,
    };
  }

  // -----------------------
  // PART 3 — Draw / Discard / Turn
  // -----------------------
  drawStock(userId) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    if (this.getActiveUserId() !== userId) return { ok: false, message: "Not your turn" };
    const p = this.players[idx];
    if (p.hasDrawn) return { ok: false, message: "Already drawn this turn" };
    if (this.stock.length === 0) return { ok: false, message: "Stock empty" };

    const card = this.stock.pop();
    p.hand.push(card);
    p.hasDrawn = true;

    return {
      ok: true,
      hand: deepClone(p.hand),
      stock_count: this.stock.length,
      discard_top: this.discard_top,
    };
  }

  drawDiscard(userId) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    if (this.getActiveUserId() !== userId) return { ok: false, message: "Not your turn" };
    const p = this.players[idx];
    if (p.hasDrawn) return { ok: false, message: "Already drawn this turn" };
    if (this.discard.length === 0) return { ok: false, message: "Discard pile empty" };

    const card = this.discard.pop();
    p.hand.push(card);
    p.hasDrawn = true;

    this.discard_top = this.discard.length ? this.serializeCard(this.discard[this.discard.length - 1]) : null;

    return {
      ok: true,
      hand: deepClone(p.hand),
      stock_count: this.stock.length,
      discard_top: this.discard_top,
    };
  }

  discardCard(userId, cardObj) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    if (this.getActiveUserId() !== userId) return { ok: false, message: "Not your turn" };
    const p = this.players[idx];
    if (!p.hasDrawn) return { ok: false, message: "Must draw before discarding" };

    // find matching card in hand
    const removeIdx = p.hand.findIndex((c) => {
      const csuit = c.suit || null;
      const rsuit = cardObj.suit || null;
      return c.rank === cardObj.rank && csuit === rsuit && (!!c.joker) === (!!cardObj.joker);
    });
    if (removeIdx === -1) return { ok: false, message: "Card not found in hand" };

    const [removed] = p.hand.splice(removeIdx, 1);
    this.discard.push(removed);
    this.discard_top = this.serializeCard(removed);

    // advance turn
    this.advanceTurn();

    return {
      ok: true,
      hand: deepClone(p.hand),
      discard_top: this.discard_top,
      next_active_user_id: this.getActiveUserId(),
    };
  }

  advanceTurn() {
    if (this.players.length === 0) {
      this.active_index = 0;
      return;
    }

    let next = (this.active_index + 1) % this.players.length;
    let attempts = 0;
    while (this.players[next].dropped && attempts < this.players.length) {
      next = (next + 1) % this.players.length;
      attempts++;
    }
    this.active_index = next;

    // Reset hasDrawn for next player's turn (server-wide simpler approach)
    this.players.forEach((p) => (p.hasDrawn = false));
  }

  // -----------------------
  // PART 4 — Drop logic & penalties
  // -----------------------
  dropPlayer(userId) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    const p = this.players[idx];
    if (p.dropped) return { ok: false, message: "Player already dropped" };

    let penalty = 0;
    // Early drop before drawing => 20
    if (!p.hasDrawn) penalty = 20;
    else penalty = 40; // middle drop (configurable: 60 if you want)

    p.dropped = true;
    p.drop_points = penalty;

    // If only one active player remains -> auto finish round
    const activePlayers = this.players.filter((pl) => !pl.dropped);
    if (activePlayers.length === 1) {
      const winnerId = activePlayers[0].user_id;
      return this._autoFinishAfterDrops(winnerId);
    }

    // If dropped player was active, advance turn
    if (this.getActiveUserId() === userId) this.advanceTurn();

    return { ok: true, message: `Player dropped with penalty ${penalty}`, penalty };
  }

  _autoFinishAfterDrops(winnerId) {
    const scores = {};
    for (const p of this.players) {
      if (p.user_id === winnerId) scores[p.user_id] = 0;
      else if (p.dropped) scores[p.user_id] = p.drop_points || 0;
      else scores[p.user_id] = 40; // fallback penalty
    }

    const record = {
      round_number: this.round_number,
      winner: winnerId,
      valid: true,
      auto_finished: true,
      scores,
      time: new Date().toISOString(),
      wild_joker_rank: this.wild_joker_rank,
      wild_joker_revealed: this.wild_joker_revealed,
    };
    this.history.push(record);
    this.round_over = true;
    this.table.status = "round_complete";

    return { ok: true, auto_finished: true, winner: winnerId, scores };
  }

  // -----------------------
  // PART 5 — Lock sequence (reveal wild in closed_joker mode)
  // -----------------------
  lockSequence(userId, meld) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    if (!Array.isArray(meld) || meld.length < 3) return { ok: false, message: "Meld must be at least 3 cards" };

    // Prefer specific isPureSequence logic from scoring if available
    try {
      let pure = false;
      if (typeof isPureSequenceFn === "function") {
        pure = !!isPureSequenceFn(meld, this.wild_joker_rank, this.wild_joker_revealed || this.players_with_first_sequence.includes(userId));
      } else if (typeof validateHandFn === "function") {
        // call validateHand with single meld as a full-hand fallback (defensive)
        const out = validateHandFn([meld], [], this.wild_joker_rank, this.players_with_first_sequence.includes(userId));
        if (Array.isArray(out)) {
          pure = !!out[0];
        } else if (out && out.valid !== undefined) {
          // object style
          pure = !!out.valid;
        } else {
          // be conservative
          pure = true;
        }
      } else {
        // fallback accept (less safe)
        pure = true;
      }

      if (!pure) return { ok: false, message: "Meld is not a pure sequence" };

      if (!this.players_with_first_sequence.includes(userId)) {
        this.players_with_first_sequence.push(userId);
      }

      // If mode is closed_joker, reveal on first lock; if open_joker, already revealed
      if (this.table.wild_joker_mode === "closed_joker") {
        this.wild_joker_revealed = true;
      } else if (this.table.wild_joker_mode === "open_joker") {
        this.wild_joker_revealed = true;
      }

      return { ok: true, message: "Pure sequence locked", wild_joker_rank: this.wild_joker_rank, wild_joker_revealed: this.wild_joker_revealed };
    } catch (e) {
      return { ok: false, message: `Lock sequence failed: ${String(e)}` };
    }
  }

  // -----------------------
  // PART 6 — Prepare declare (light client-side check)
  // -----------------------
  prepareDeclare(userId, groups) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    const p = this.players[idx];

    const flattened = Array.isArray(groups) ? [].concat(...groups) : [];
    if (flattened.length !== 13) return { ok: false, message: "Declared groups must contain exactly 13 cards" };

    const handCopy = p.hand.slice();
    for (const card of flattened) {
      const findIdx = handCopy.findIndex((c) => c.rank === card.rank && (c.suit || null) === (card.suit || null) && (!!c.joker) === (!!card.joker));
      if (findIdx === -1) return { ok: false, message: `Declared card ${card.rank}${card.suit || ""} not in your hand` };
      handCopy.splice(findIdx, 1);
    }

    return { ok: true, declared_groups: groups };
  }

  // -----------------------
  // PART 7 — Declare (full validation + scoring integration)
  // -----------------------
  declare(userId, groups) {
    const idx = this.getPlayerIndex(userId);
    if (idx === -1) return { ok: false, message: "Player not in round" };
    const p = this.players[idx];

    if (p.hand.length !== 14) return { ok: false, message: `Must have 14 cards to declare. You have ${p.hand.length}` };

    const prep = this.prepareDeclare(userId, groups);
    if (!prep.ok) return { ok: false, message: prep.message };

    // snapshot hands for scoring
    const handsSnapshot = {};
    for (const pl of this.players) handsSnapshot[pl.user_id] = pl.hand.slice();

    // decide validation function
    let valid = false;
    let reason = "Validation not executed";

    try {
      if (typeof validateHandFn === "function") {
        const out = validateHandFn(groups, [], this.wild_joker_rank, this.players_with_first_sequence.includes(userId));
        if (Array.isArray(out)) {
          valid = !!out[0];
          reason = out[1] || (valid ? "Valid hand" : "Invalid hand");
        } else if (out && out.valid !== undefined) {
          valid = !!out.valid;
          reason = out.reason || (valid ? "Valid hand" : "Invalid hand");
        } else if (typeof out === "boolean") {
          valid = out;
          reason = valid ? "Valid hand" : "Invalid hand";
        } else {
          valid = true;
          reason = "Validation tool returned unknown shape; accepted by default";
        }
      } else {
        // No scoring validator present — accept declaration (NOT RECOMMENDED)
        valid = true;
        reason = "No server-side validator available; accepted by default";
      }
    } catch (e) {
      valid = false;
      reason = `Validation error: ${String(e)}`;
    }

    const organized_melds = {};
    const scores = {};

    if (valid) {
      // winner gets 0
      scores[userId] = 0;
      organized_melds[userId] = { pure_sequences: groups, sequences: [], sets: [], deadwood: [] };

      for (const opp of this.players) {
        if (opp.user_id === userId) continue;

        if (opp.dropped) {
          scores[opp.user_id] = opp.drop_points || 0;
          organized_melds[opp.user_id] = { pure_sequences: [], sequences: [], sets: [], deadwood: [] };
          continue;
        }

        // auto-organize opponent hand using scoring.auto_organize_hand if available
        let melds = [];
        let leftover = opp.hand.slice();
        if (typeof autoOrganizeFn === "function") {
          try {
            const out = autoOrganizeFn(opp.hand.slice(), this.wild_joker_rank, this.players_with_first_sequence.includes(opp.user_id));
            if (out && (out.melds || Array.isArray(out))) {
              // support both shapes:
              if (out.melds && out.leftover) {
                melds = out.melds;
                leftover = out.leftover;
              } else if (Array.isArray(out) && out.length === 2) {
                melds = out[0];
                leftover = out[1];
              } else if (Array.isArray(out.melds)) {
                melds = out.melds;
                leftover = out.leftover || leftover;
              }
            }
          } catch (e) {
            // fallback: leave as leftover whole hand
            melds = [];
            leftover = opp.hand.slice();
          }
        }

        // compute deadwood points
        let deadwood = 0;
        if (typeof calculateDeadwoodFn === "function") {
          try {
            deadwood = calculateDeadwoodFn(leftover, this.wild_joker_rank, this.players_with_first_sequence.includes(opp.user_id), this.table.ace_value);
          } catch (e) {
            deadwood = leftover.reduce((s, c) => s + this._cardPoints(c, this.table.ace_value), 0);
          }
        } else {
          deadwood = leftover.reduce((s, c) => s + this._cardPoints(c, this.table.ace_value), 0);
        }
        scores[opp.user_id] = Math.min(deadwood, 80);

        organized_melds[opp.user_id] = {
          pure_sequences: melds.filter((m) => (typeof isPureSequenceFn === "function" ? isPureSequenceFn(m, this.wild_joker_rank, this.players_with_first_sequence.includes(opp.user_id)) : false)),
          sequences: melds.filter((m) => (typeof isSequenceFn === "function" ? isSequenceFn(m, this.wild_joker_rank, this.players_with_first_sequence.includes(opp.user_id)) && !(isPureSequenceFn && isPureSequenceFn(m, this.wild_joker_rank, this.players_with_first_sequence.includes(opp.user_id))) : false)),
          sets: melds.filter((m) => (typeof isSetFn === "function" ? isSetFn(m, this.wild_joker_rank, this.players_with_first_sequence.includes(opp.user_id)) : false)),
          deadwood: leftover,
        };
      }
    } else {
      // wrong show: declarer gets full deadwood (cap 80), others 0
      let declarerPts = 0;
      if (typeof calculateDeadwoodFn === "function") {
        try {
          declarerPts = calculateDeadwoodFn(p.hand.slice(), this.wild_joker_rank, this.players_with_first_sequence.includes(userId), this.table.ace_value);
        } catch (e) {
          declarerPts = p.hand.reduce((s, c) => s + this._cardPoints(c, this.table.ace_value), 0);
        }
      } else {
        declarerPts = p.hand.reduce((s, c) => s + this._cardPoints(c, this.table.ace_value), 0);
      }
      declarerPts = Math.min(declarerPts, 80);

      for (const pl of this.players) {
        if (pl.user_id === userId) {
          scores[pl.user_id] = declarerPts;
          organized_melds[pl.user_id] = { pure_sequences: [], sequences: [], sets: [], deadwood: pl.hand.slice() };
        } else {
          scores[pl.user_id] = 0;
          organized_melds[pl.user_id] = { pure_sequences: [], sequences: [], sets: [], deadwood: [] };
        }
      }
    }

    // persist record to history and mark round finished
    const record = {
      round_number: this.round_number,
      declared_by: userId,
      valid,
      reason,
      scores,
      organized_melds,
      hands_snapshot: handsSnapshot,
      wild_joker_rank: this.wild_joker_rank,
      wild_joker_revealed: this.wild_joker_revealed,
      time: new Date().toISOString(),
    };
    this.history.push(record);
    this.round_over = true;
    this.table.status = "round_complete";

    return {
      ok: true,
      valid,
      message: reason,
      scores,
      organized_melds,
    };
  }

  // -----------------------
  // PART 8 — Prepare next round
  // -----------------------
  prepareNextRound() {
    if (!this.round_over) return { ok: false, message: "Cannot start next round — previous not finished" };

    // reset round-level flags and re-deal
    this.round_over = false;
    this.wild_joker_rank = null;
    this.wild_joker_revealed = false;
    this.players_with_first_sequence = [];

    // rotate host-start or reuse host logic in startRound
    return this.startRound();
  }

  // -----------------------
  // Internal helpers
  // -----------------------
  _cardPoints(card, aceValue = 10) {
    if (!card) return 0;
    if (card.joker || card.rank === "JOKER") return 0;
    const r = card.rank;
    if (["J", "Q", "K", "10"].includes(r)) return 10;
    if (r === "A") return aceValue === 1 ? 1 : 10;
    const n = Number(r);
    return Number.isNaN(n) ? 0 : n;
  }

  _isJokerCard(card, forPlayerId = null) {
    if (!card) return false;
    if (card.rank === "JOKER") return true;
    if (!this.wild_joker_rank) return false;
    // wild joker only acts as joker when revealed (global reveal or per-player reveal if implemented)
    return !!this.wild_joker_revealed && card.rank === this.wild_joker_rank;
  }

  // prepare DB payload to save round
  toRoundDBPayload() {
    const hands = {};
    for (const p of this.players) hands[p.user_id] = deepClone(p.hand);

    return {
      id: uuidv4(),
      table_id: this.table.table_id,
      number: this.round_number,
      printed_joker: null,
      wild_joker_rank: this.wild_joker_rank,
      stock: deepClone(this.stock),
      discard: deepClone(this.discard),
      hands: deepClone(hands),
      active_user_id: this.getActiveUserId(),
      game_mode: this.table.wild_joker_mode,
      ace_value: this.table.ace_value,
      players_with_first_sequence: deepClone(this.players_with_first_sequence),
    };
  }
}

module.exports = RummyEngine;

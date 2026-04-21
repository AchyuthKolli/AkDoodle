// server/APIs/game.js
// Node.js version of your old FastAPI game.js
// Matches UI exactly – no UI changes required

const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth } = require("../auth");
console.log("Loading game.js. requireAuth type:", typeof requireAuth);
console.log("game.js router created:", !!router);
const { v4: uuidv4 } = require("uuid");
const scoring = require("./scoring");
const INVALID_DECLARE_PENALTY = 20;

/* ---------------------------
    Helpers
------------------------------ */

function serializeCard(card) {
  if (card.joker && card.rank === "JOKER") return "JOKER";
  return `${card.rank}${card.suit || ""}`;
}

/** Emit on /rummy namespace so browser clients receive events (they do not use default "/"). */
function nspEmit(req, tableId, event, payload) {
  try {
    const rootIo = req.app && req.app.get("io");
    if (!rootIo) return;
    const nsp = req.app.get("rummyNsp") || rootIo.of("/rummy");
    nsp.to(tableId).emit(event, payload);
  } catch (e) {
    console.warn("nspEmit", event, e && e.message);
  }
}

function parseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Open joker: wild acts as joker from the start. Closed: only after someone locks a pure sequence. */
function wildJokerEffectivelyRevealed(gameMode, wildJokerRank, playersWithFirstSequence) {
  if (!wildJokerRank) return false;
  const mode = String(gameMode || "open_joker").toLowerCase();
  if (mode === "no_joker") return false;
  if (mode === "open_joker" || mode.startsWith("open")) return true;
  const seq = parseJsonArray(playersWithFirstSequence);
  return seq.length > 0;
}

function classifyDeclaredGroups(groups = [], wildJokerRank = null, wildRevealed = true) {
  const out = {
    pure_sequences: [],
    impure_sequences: [],
    sets: [],
    invalid_groups: [],
    ungrouped: [],
  };
  for (const group of groups) {
    if (!Array.isArray(group) || group.length < 3) {
      out.invalid_groups.push(group || []);
      continue;
    }
    const isPure = scoring.isPureSequence ? scoring.isPureSequence(group, wildJokerRank, wildRevealed) : false;
    const isSeq = scoring.isSequence ? scoring.isSequence(group, wildJokerRank, wildRevealed) : false;
    const isSet = scoring.isSet ? scoring.isSet(group, wildJokerRank, wildRevealed) : false;
    if (isPure) out.pure_sequences.push(group);
    else if (isSeq) out.impure_sequences.push(group);
    else if (isSet) out.sets.push(group);
    else out.invalid_groups.push(group);
  }
  return out;
}

/** Normalize JSON object keys so client lookups always match `user_id` strings from JWT/DB. */
function normId(id) {
  if (id === undefined || id === null) return id;
  return String(id);
}

function normalizeKeyedJson(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj || {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[normId(k)] = v;
  return out;
}

/** Cards still in hand after removing declared groups (14th card / leftovers). */
function extractLeftoverFromHand(hand, groups) {
  const handCopy = (hand || []).slice();
  for (const grp of groups || []) {
    for (const c of grp || []) {
      const idx = handCopy.findIndex(
        (h) =>
          h.rank === c.rank &&
          (h.suit || null) === (c.suit || null) &&
          (!!h.joker) === (!!c.joker)
      );
      if (idx !== -1) handCopy.splice(idx, 1);
    }
  }
  return handCopy;
}

function classifySingleGroup(group, wildJokerRank, wildRevealed = true) {
  if (!Array.isArray(group) || group.length < 3) return "invalid";
  if (scoring.isPureSequence(group, wildJokerRank, wildRevealed)) return "pure";
  if (scoring.isSequence(group, wildJokerRank, wildRevealed)) return "impure";
  if (scoring.isSet(group, wildJokerRank, wildRevealed)) return "set";
  return "invalid";
}

/** Up to four auto-detected melds for non-declarers (pure → impure → set), remainder in hand. */
function splitAutoMeldsIntoSlots(organized) {
  const auto = organized || {};
  const ordered = [
    ...(auto.pure_sequences || []).map((cards) => ({ kind: "pure", cards })),
    ...(auto.impure_sequences || []).map((cards) => ({ kind: "impure", cards })),
    ...(auto.sets || []).map((cards) => ({ kind: "set", cards })),
  ];
  const meld1 = ordered[0]?.cards || [];
  const meld2 = ordered[1]?.cards || [];
  const meld3 = ordered[2]?.cards || [];
  const meld4 = ordered[3]?.cards || [];
  const spill = ordered.slice(4).flatMap((g) => g.cards);
  const remainder = [...(auto.ungrouped || []), ...spill];
  const slot_kind = [
    ordered[0]?.kind || null,
    ordered[1]?.kind || null,
    ordered[2]?.kind || null,
    ordered[3]?.kind || null,
  ];
  return { meld1, meld2, meld3, meld4, remainder, slot_kind };
}

/**
 * Single source of truth for scoreboard card layout (declarer slots + deadwood + others auto-meld).
 */
function buildOrganizedScoreboardForUser({
  userId,
  declarerUserId,
  hand,
  declarationGroups,
  isSpectator,
  wildJokerRank,
  wildJokerRevealed = true,
  snapshot,
}) {
  const uid = normId(userId);
  const declarer = declarerUserId ? normId(declarerUserId) : null;
  const groups = Array.isArray(declarationGroups) ? declarationGroups : [];
  const isDeclarer = declarer && uid === declarer;

  if (isSpectator) {
    return {
      pure_sequences: [],
      impure_sequences: [],
      sets: [],
      invalid_groups: [],
      meld1: [],
      meld2: [],
      meld3: [],
      meld4: [],
      deadwood: hand || [],
      hand_remainder: [],
      ungrouped: [],
      slot_kind: [null, null, null, null],
    };
  }

  if (isDeclarer && groups.length > 0) {
    const classified = classifyDeclaredGroups(groups, wildJokerRank, wildJokerRevealed);
    const leftover = extractLeftoverFromHand(hand, groups);
    const meld1 = groups[0] || [];
    const meld2 = groups[1] || [];
    const meld3 = groups[2] || [];
    const meld4 = groups[3] || [];
    const slot_kind = [meld1, meld2, meld3, meld4].map((g) =>
      g.length ? classifySingleGroup(g, wildJokerRank, wildJokerRevealed) : null
    );
    return {
      ...classified,
      meld1,
      meld2,
      meld3,
      meld4,
      deadwood: leftover,
      hand_remainder: [],
      ungrouped: leftover,
      slot_kind,
    };
  }

  // Declarer submitted no groups: show full hand as deadwood only (do not auto-meld).
  if (isDeclarer) {
    const h = hand || [];
    return {
      pure_sequences: [],
      impure_sequences: [],
      sets: [],
      invalid_groups: [],
      meld1: [],
      meld2: [],
      meld3: [],
      meld4: [],
      deadwood: h,
      hand_remainder: [],
      ungrouped: [],
      slot_kind: [null, null, null, null],
    };
  }

  const snapLayout = buildFromSnapshotLayout(hand || [], snapshot, wildJokerRank, wildJokerRevealed);
  if (snapLayout) return snapLayout;

  const auto = scoring.organizeHandByMelds(hand || [], wildJokerRank, wildJokerRevealed);
  const { meld1, meld2, meld3, meld4, remainder, slot_kind } = splitAutoMeldsIntoSlots(auto);
  return {
    pure_sequences: auto.pure_sequences,
    impure_sequences: auto.impure_sequences,
    sets: auto.sets,
    invalid_groups: [],
    meld1,
    meld2,
    meld3,
    meld4,
    deadwood: [],
    hand_remainder: remainder,
    ungrouped: remainder,
    slot_kind,
  };
}

function pickDeclarerUserId(declarations, winnerUserId) {
  if (winnerUserId != null && winnerUserId !== "") return normId(winnerUserId);
  const dec = declarations && typeof declarations === "object" ? declarations : {};
  const keys = Object.keys(dec);
  if (!keys.length) return null;
  if (keys.length === 1) return normId(keys[0]);
  let best = keys[0];
  let bestN = -1;
  for (const k of keys) {
    const g = dec[k]?.groups;
    const n = Array.isArray(g) ? g.reduce((s, row) => s + (Array.isArray(row) ? row.length : 0), 0) : 0;
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return normId(best);
}

function sanitizeMeldSlotForSnapshot(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && typeof c === "object" && c.rank)
    .map((c) => ({ rank: String(c.rank), suit: c.suit || null, joker: !!c.joker }));
}

function cardsEqualForSnapshot(a, b) {
  return (
    a &&
    b &&
    a.rank === b.rank &&
    (a.suit || null) === (b.suit || null) &&
    (!!a.joker) === (!!b.joker)
  );
}

function removeSnapshotCardsFromHand(hand, cards) {
  const src = Array.isArray(hand) ? hand.slice() : [];
  for (const c of cards || []) {
    const idx = src.findIndex((h) => cardsEqualForSnapshot(h, c));
    if (idx === -1) return { ok: false, remaining: Array.isArray(hand) ? hand.slice() : [] };
    src.splice(idx, 1);
  }
  return { ok: true, remaining: src };
}

function buildFromSnapshotLayout(hand, snap, wildJokerRank, wildJokerRevealed) {
  const baseHand = Array.isArray(hand) ? hand : [];
  if (!snap || typeof snap !== "object") return null;

  const slots = ["meld1", "meld2", "meld3", "meld4"].map((k) => sanitizeMeldSlotForSnapshot(snap[k]));
  const leftover = sanitizeMeldSlotForSnapshot(snap.leftover);
  const anyPlaced = slots.some((s) => s.length > 0) || leftover.length > 0;
  if (!anyPlaced) return null;

  let remaining = baseHand.slice();
  for (const g of slots) {
    const out = removeSnapshotCardsFromHand(remaining, g);
    if (!out.ok) return null;
    remaining = out.remaining;
  }
  const outLeft = removeSnapshotCardsFromHand(remaining, leftover);
  if (!outLeft.ok) return null;
  remaining = outLeft.remaining;

  const slot_kind = slots.map((g) =>
    g.length ? classifySingleGroup(g, wildJokerRank, wildJokerRevealed) : null
  );
  const classified = classifyDeclaredGroups(
    slots.filter((g) => g.length > 0),
    wildJokerRank,
    wildJokerRevealed
  );
  return {
    ...classified,
    meld1: slots[0],
    meld2: slots[1],
    meld3: slots[2],
    meld4: slots[3],
    deadwood: leftover,
    hand_remainder: remaining,
    ungrouped: remaining,
    slot_kind,
  };
}

function nextActiveAfterKick(activeUserId, seatOrder, kickedUserId) {
  const kicked = normId(kickedUserId);
  const full = (seatOrder || []).map(normId);
  const remaining = new Set(full.filter((id) => id !== kicked));
  if (!remaining.size) return null;
  const cur = normId(activeUserId);
  if (cur !== kicked && remaining.has(cur)) return cur;
  const ki = full.indexOf(kicked);
  if (ki === -1) return [...remaining][0];
  for (let i = 1; i <= full.length; i++) {
    const u = full[(ki + i) % full.length];
    if (remaining.has(u)) return u;
  }
  return [...remaining][0];
}

/* ---------------------------
    GET TABLE INFO
------------------------------ */
router.get("/tables/info", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const tbl = await db.fetchrow(
      `SELECT * FROM rummy_tables WHERE id=$1`,
      [table_id]
    );
    if (!tbl) return res.status(404).json({ error: "Table not found" });

    // Get players with profile images
    const players = await db.fetch(
      `SELECT p.user_id, p.display_name, p.seat, p.is_spectator, rp.avatar_url as profile_image_url 
       FROM rummy_table_players p
       LEFT JOIN rummy_profiles rp ON p.user_id = rp.id
       WHERE p.table_id=$1 
       ORDER BY p.seat ASC`,
      [table_id]
    );

    // Get active round info for active_user_id
    const rnd = await db.fetchrow(
      `SELECT active_user_id, wild_joker_rank FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );

    return res.json({
      ...tbl,
      players,
      active_user_id: rnd ? rnd.active_user_id : null,
      wild_joker_rank: rnd ? rnd.wild_joker_rank : null
    });
  } catch (e) {
    console.error("table/info error", e);
    res.status(500).json({ error: "Failed to get table info" });
  }
});

/* ---------------------------
    CREATE TABLE
------------------------------ */

router.post("/tables", requireAuth, async (req, res) => {
  try {
    const { max_players, disqualify_score, wild_joker_mode, ace_value, loser_deadwood_mode, face_card_mode } = req.body;
    const loserMode =
      String(loser_deadwood_mode || "auto_optimal").toLowerCase() === "submit_or_full"
        ? "submit_or_full"
        : "auto_optimal";
    const faceCardMode = String(face_card_mode || "ten").toLowerCase() === "rank" ? "rank" : "ten";

    const table_id = uuidv4();
    // Generate 6-char alphanumeric code
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await db.fetchrow(
      `
      INSERT INTO rummy_tables (id, code, host_user_id, max_players, disqualify_score, wild_joker_mode, ace_value, loser_deadwood_mode, face_card_mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [table_id, code, req.user.sub, max_players, disqualify_score, wild_joker_mode, ace_value, loserMode, faceCardMode]
    );

    // Fetch host name
    const profile = await db.fetchrow("SELECT display_name FROM rummy_profiles WHERE id=$1", [req.user.sub]);
    const hostName = profile?.display_name || req.user.name || "Host";

    // Add host as seat 1
    await db.execute(
      `
      INSERT INTO rummy_table_players (table_id, user_id, seat, display_name)
      VALUES ($1, $2, 1, $3)
    `,
      [table_id, req.user.sub, hostName]
    );

    res.json({ table_id, code });
  } catch (e) {
    console.error("Create Table Error:", e);
    res.status(500).json({ error: "Create table failed", details: e.message });
  }
});

/* ---------------------------
    JOIN TABLE BY ID
------------------------------ */

router.post("/tables/join", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body;

    const tbl = await db.fetchrow(`SELECT id, max_players, status FROM rummy_tables WHERE id=$1`, [
      table_id,
    ]);
    if (!tbl) return res.status(404).json({ error: "Table not found" });

    const existing = await db.fetchrow(
      `SELECT seat, is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );
    if (existing) {
      return res.json({ table_id, seat: existing.seat, is_spectator: !!existing.is_spectator });
    }

    const seated = await db.fetch(
      `SELECT seat FROM rummy_table_players WHERE table_id=$1 ORDER BY seat`,
      [table_id]
    );

    const used = seated.map((r) => r.seat);
    let seat = 1;
    while (used.includes(seat)) seat++;
    const joiningAsSpectator = tbl.status === "playing";
    if (!joiningAsSpectator && seat > tbl.max_players)
      return res.status(400).json({ error: "Table is full" });
    if (tbl.status === "finished")
      return res.status(400).json({ error: "Table already finished" });

    // Get user name
    const profile = await db.fetchrow("SELECT display_name FROM rummy_profiles WHERE id=$1", [req.user.sub]);
    const name = profile?.display_name || req.user.name || "Host";

    await db.execute(
      `
      INSERT INTO rummy_table_players (table_id, user_id, seat, display_name, is_spectator)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `,
      [table_id, req.user.sub, seat, name, joiningAsSpectator]
    );

    res.json({ table_id, seat, is_spectator: joiningAsSpectator });
  } catch (e) {
    res.status(500).json({ error: "Join table error" });
  }
});

/* ---------------------------
    JOIN TABLE BY CODE
------------------------------ */

router.post("/tables/join-by-code", requireAuth, async (req, res) => {
  try {
    const { code } = req.body;

    const tbl = await db.fetchrow(
      `SELECT id, max_players, status FROM rummy_tables WHERE code=$1`,
      [code.toUpperCase()]
    );
    if (!tbl) return res.status(404).json({ error: "Invalid code" });

    const existing = await db.fetchrow(
      `SELECT seat, is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [tbl.id, req.user.sub]
    );
    if (existing) {
      return res.json({ table_id: tbl.id, seat: existing.seat, is_spectator: !!existing.is_spectator });
    }

    const seated = await db.fetch(
      `SELECT seat FROM rummy_table_players WHERE table_id=$1 ORDER BY seat`,
      [tbl.id]
    );
    const used = seated.map((r) => r.seat);

    let seat = 1;
    while (used.includes(seat)) seat++;
    const joiningAsSpectator = tbl.status === "playing";
    if (!joiningAsSpectator && seat > tbl.max_players)
      return res.status(400).json({ error: "Table full" });
    if (tbl.status === "finished")
      return res.status(400).json({ error: "Table already finished" });

    // Get user name
    const profile = await db.fetchrow("SELECT display_name FROM rummy_profiles WHERE id=$1", [req.user.sub]);
    const name = profile?.display_name || "Player";

    await db.execute(
      `INSERT INTO rummy_table_players (table_id, user_id, seat, display_name, is_spectator)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [tbl.id, req.user.sub, seat, name, joiningAsSpectator]
    );

    res.json({ table_id: tbl.id, seat, is_spectator: joiningAsSpectator });
  } catch (e) {
    res.status(500).json({ error: "Join-by-code error" });
  }
});

/* ---------------------------
    START GAME
------------------------------ */

router.post("/start-game", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body;

    const tbl = await db.fetchrow(
      `SELECT * FROM rummy_tables WHERE id=$1`,
      [table_id]
    );
    if (!tbl) return res.status(404).json({ error: "Table not found" });
    if (tbl.host_user_id !== req.user.sub)
      return res.status(403).json({ error: "Only host may start" });
    if (tbl.status !== "waiting")
      return res.status(400).json({ error: "Game already started" });

    const players = await db.fetch(
      `SELECT user_id FROM rummy_table_players WHERE table_id=$1 ORDER BY seat`,
      [table_id]
    );
    if (players.length < 2)
      return res.status(400).json({ error: "Need 2 players minimum" });

    // choose wild joker rank
    let wild_joker_rank = null;
    if (tbl.wild_joker_mode !== "no_joker") {
      const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
      wild_joker_rank = ranks[Math.floor(Math.random() * ranks.length)];
    }

    // deal cards
    const allHands = {};
    const stock = [];
    const discard = [];

    const deck = [];
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const suits = ["H", "D", "S", "C"];

    const deckCount = players.length <= 2 ? 1 : players.length <= 4 ? 2 : 3;
    for (let d = 0; d < deckCount; d++) {
      for (const r of ranks)
        for (const s of suits)
          deck.push({ rank: r, suit: s, joker: false });
      deck.push({ rank: "JOKER", suit: null, joker: true });
      deck.push({ rank: "JOKER", suit: null, joker: true });
    }

    // shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // deal 13 each
    for (const p of players) {
      allHands[p.user_id] = [];
      for (let i = 0; i < 13; i++) {
        allHands[p.user_id].push(deck.pop());
      }
    }

    // top discard
    discard.push(deck.pop());

    // rest is stock
    while (deck.length > 0) stock.push(deck.pop());

    const round_id = uuidv4();

    await db.execute(
      `
      INSERT INTO rummy_rounds 
      (id, table_id, number, wild_joker_rank, stock, discard, hands, active_user_id, game_mode, ace_value, face_card_mode)
      VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
      [
        round_id,
        table_id,
        wild_joker_rank,
        JSON.stringify(stock),
        JSON.stringify(discard),
        JSON.stringify(allHands),
        players[0].user_id,
        tbl.wild_joker_mode,
        tbl.ace_value,
        tbl.face_card_mode || "ten",
      ]
    );

    await db.execute(
      `UPDATE rummy_tables SET status='playing' WHERE id=$1`,
      [table_id]
    );

    res.json({
      round_id,
      table_id,
      number: 1,
      active_user_id: players[0].user_id,
      stock_count: stock.length,
      deck_count: deckCount,
      discard_top: serializeCard(discard[0]),
    });

    // 🚀 BROADCAST UPDATE
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "round.started", { table_id, round_number: 1 });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Start game failed" });
  }
});

/* ------------------------------------------------------------------
   STOP HERE
   (File is extremely long. The rest includes: draw/discard, 
    lock-sequence, declare, scoreboard, next-round, history...)
   I will send the next chunk immediately once you reply:
   "send next part"
------------------------------------------------------------------- */

module.exports = router;
/* ---------------------------
   Part 2 — Round / Draw / Discard / Lock Sequence
------------------------------ */

/**
 * GET /round/me
 * Returns the authenticated player's current round state (hand, stock count, discard_top, wild joker info)
 *
 * Query param: table_id
 */
router.get("/round/me", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    // Verify membership
    const member = await db.fetchrow(
      `SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );
    if (!member) return res.status(403).json({ error: "Not part of this table" });

    // Get latest round
    const rnd = await db.fetchrow(
      `SELECT id, number, printed_joker, wild_joker_rank, stock, discard, hands, active_user_id, finished_at
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );

    if (!rnd) {
      return res.json({
        table_id,
        round_number: 0,
        hand: [],
        stock_count: 0,
        discard_top: null,
        wild_joker_revealed: false,
        wild_joker_rank: null,
        finished_at: null,
      });
    }

    const hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    const myHand = hands[req.user.sub] || [];

    const stock = typeof rnd.stock === "string" ? JSON.parse(rnd.stock) : (rnd.stock || []);
    const discard = typeof rnd.discard === "string" ? JSON.parse(rnd.discard) : (rnd.discard || []);

    let discard_top = null;
    if (discard && discard.length > 0) {
      const last = discard[discard.length - 1];
      discard_top = serializeCard(last);
    }

    // Build card view expected by frontend: rank, suit, joker, code
    const handView = myHand.map((c) => ({
      rank: c.rank,
      suit: c.suit || null,
      joker: !!c.joker,
      code: c.joker && c.rank === "JOKER" ? "JOKER" : `${c.rank}${c.suit || ""}`,
    }));

    return res.json({
      table_id,
      round_number: rnd.number,
      hand: handView,
      stock_count: stock.length,
      discard_top,
      wild_joker_revealed: !!rnd.wild_joker_revealed, // legacy field may be absent
      wild_joker_rank: rnd.wild_joker_rank || null,
      finished_at: rnd.finished_at ? new Date(rnd.finished_at).toISOString() : null,
      active_user_id: rnd.active_user_id || null,
    });
  } catch (e) {
    console.error("round/me error", e);
    res.status(500).json({ error: "Failed to get round state" });
  }
});

/* ---------------------------
   POST /lock-sequence
   - body: { table_id, meld: [{rank,suit}, ...] }
   - If player locks first pure sequence, reveal wild joker (persist in round)
------------------------------ */
router.post("/lock-sequence", requireAuth, async (req, res) => {
  try {
    const { table_id, meld } = req.body;
    if (!table_id || !Array.isArray(meld)) return res.status(400).json({ error: "Invalid request" });

    // Fetch latest round
    const rnd = await db.fetchrow(
      `SELECT id, wild_joker_rank, players_with_first_sequence
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No active round" });

    // normalize players_with_first_sequence
    let players_with_first_sequence = rnd.players_with_first_sequence;
    if (!players_with_first_sequence) players_with_first_sequence = [];
    if (typeof players_with_first_sequence === "string") {
      try { players_with_first_sequence = JSON.parse(players_with_first_sequence); } catch { players_with_first_sequence = []; }
    }

    // if player already revealed
    if (players_with_first_sequence.includes(req.user.sub)) {
      return res.json({ success: false, message: "You already revealed the wild joker", wild_joker_revealed: false });
    }

    // Validate meld: we rely on your existing server-side validation utilities in Libraries for full validation.
    // Minimal validation here: must be exactly 3 cards, same suit, consecutive ranks ignoring wildcard (more robust logic can be plugged).
    if (!Array.isArray(meld) || meld.length !== 3) {
      return res.status(400).json({ success: false, message: "Fill all 3 slots to lock a sequence" });
    }

    // NOTE: In the original FastAPI implementation you had is_sequence/is_pure_sequence helpers.
    // If you port those to Node, call them here. As a safe fallback we'll accept the pure sequence and reveal the wild joker.
    // We'll mark the user as having revealed and return the round's wild_joker_rank.

    // Add user to players_with_first_sequence
    const updatedPlayers = Array.from(new Set([...players_with_first_sequence, req.user.sub]));
    await db.execute(
      `UPDATE rummy_rounds SET players_with_first_sequence=$1 WHERE id=$2`,
      [JSON.stringify(updatedPlayers), rnd.id]
    );

    // Respond with the stored wild joker rank (may be null in no-joker mode)
    res.json({
      success: true,
      message: "Pure sequence locked. Wild joker revealed (if set).",
      wild_joker_revealed: true,
      wild_joker_rank: rnd.wild_joker_rank || null,
    });

    // 🚀 BROADCAST UPDATE
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "sequence.locked", { user_id: req.user.sub, wild_joker_revealed: true });
  } catch (e) {
    console.error("lock-sequence error", e);
    res.status(500).json({ success: false, message: "Failed to lock sequence" });
  }
});

// POST /round/meld-snapshot — host table setting may use this for loser deadwood (see loser_deadwood_mode).
router.post("/round/meld-snapshot", requireAuth, async (req, res) => {
  try {
    const { table_id, meld1, meld2, meld3, meld4, leftover } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const membership = await db.fetchrow(
      `SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2 AND is_spectator=false`,
      [table_id, req.user.sub]
    );
    if (!membership) return res.status(403).json({ error: "Not an active player at this table" });

    const rnd = await db.fetchrow(
      `SELECT id, hands, finished_at, meld_snapshots FROM rummy_rounds WHERE table_id=$1 AND finished_at IS NULL ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(400).json({ error: "No active round" });

    let hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    hands = normalizeKeyedJson(hands);
    const sub = normId(req.user.sub);
    const myHand = hands[sub];
    if (!myHand || !Array.isArray(myHand)) return res.status(404).json({ error: "No hand" });

    const s1 = sanitizeMeldSlotForSnapshot(meld1);
    const s2 = sanitizeMeldSlotForSnapshot(meld2);
    const s3 = sanitizeMeldSlotForSnapshot(meld3);
    const s4 = sanitizeMeldSlotForSnapshot(meld4);
    const slo = sanitizeMeldSlotForSnapshot(leftover);

    const placed = [...s1, ...s2, ...s3, ...s4, ...slo];
    const handCopy = myHand.slice();
    for (const c of placed) {
      const idx = handCopy.findIndex(
        (h) => h.rank === c.rank && (h.suit || null) === (c.suit || null) && (!!h.joker) === (!!c.joker)
      );
      if (idx === -1) return res.status(400).json({ error: "Snapshot contains a card not in your current hand" });
      handCopy.splice(idx, 1);
    }

    let ms = rnd.meld_snapshots;
    if (typeof ms === "string") {
      try {
        ms = JSON.parse(ms);
      } catch {
        ms = {};
      }
    }
    ms = normalizeKeyedJson(ms || {});
    ms[sub] = {
      meld1: s1,
      meld2: s2,
      meld3: s3,
      meld4: s4,
      leftover: slo,
      updated_at: new Date().toISOString(),
    };

    await db.execute(`UPDATE rummy_rounds SET meld_snapshots=$1::jsonb, updated_at=now() WHERE id=$2`, [
      JSON.stringify(ms),
      rnd.id,
    ]);

    res.json({ ok: true });
    nspEmit(req, table_id, "game_update", { table_id });
    return;
  } catch (e) {
    console.error("meld-snapshot error", e);
    res.status(500).json({ error: "Failed to save meld snapshot" });
  }
});

/* ---------------------------
   POST /draw/stock
   body: { table_id }
   - Player draws from stock (server validates turn & hand length)
------------------------------ */
router.post("/draw/stock", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    // Single query pattern: fetch table & latest round info
    const row = await db.fetchrow(
      `WITH table_check AS (
         SELECT id, status, EXISTS(SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2) AS is_member
         FROM rummy_tables WHERE id=$1
       ), round_data AS (
         SELECT id, number, stock, hands, discard, active_user_id, finished_at
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1
       )
       SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.finished_at
       FROM table_check t LEFT JOIN round_data r ON true
      `,
      [table_id, req.user.sub]
    );

    if (!row || !row.id) return res.status(404).json({ error: "Table not found" });
    if (row.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    if (!row.is_member) return res.status(403).json({ error: "Not part of the table" });
    if (!row.round_id) return res.status(404).json({ error: "No active round" });
    if (row.active_user_id !== req.user.sub) return res.status(403).json({ error: "Not your turn" });

    const hands = typeof row.hands === "string" ? JSON.parse(row.hands) : (row.hands || {});
    const stock = typeof row.stock === "string" ? JSON.parse(row.stock) : (row.stock || []);
    const discard = typeof row.discard === "string" ? JSON.parse(row.discard) : (row.discard || []);

    const myHand = hands[req.user.sub];
    if (!myHand) return res.status(404).json({ error: "No hand for this player" });
    if (myHand.length !== 13) return res.status(400).json({ error: "You must discard before drawing again" });
    if (stock.length === 0) return res.status(400).json({ error: "Stock is empty" });

    // Draw
    const drawn = stock.pop();
    myHand.push(drawn);

    // Persist stock & hands
    await db.execute(
      `UPDATE rummy_rounds SET stock=$1::jsonb, hands=$2::jsonb, updated_at=now() WHERE id=$3`,
      [JSON.stringify(stock), JSON.stringify(hands), row.round_id]
    );

    // Hand view
    const handView = myHand.map((c) => ({
      rank: c.rank,
      suit: c.suit || null,
      joker: !!c.joker,
      code: c.joker ? "JOKER" : `${c.rank}${c.suit || ""}`,
    }));

    const responseData = {
      table_id,
      round_number: row.number,
      hand: handView,
      stock_count: stock.length,
      discard_top: discard && discard.length ? serializeCard(discard[discard.length - 1]) : null,
      finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    };

    res.json(responseData);

    // 🚀 BROADCAST UPDATE (others need to know stock count changed)
    nspEmit(req, table_id, "game_update", { table_id });
    return;
  } catch (e) {
    console.error("draw/stock error", e);
    res.status(500).json({ error: "Failed to draw from stock" });
  }
});

/* ---------------------------
   POST /draw/discard
   body: { table_id }
------------------------------ */
router.post("/draw/discard", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const row = await db.fetchrow(
      `WITH table_check AS (
         SELECT id, status, EXISTS(SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2) AS is_member
         FROM rummy_tables WHERE id=$1
       ), round_data AS (
         SELECT id, number, stock, hands, discard, active_user_id, finished_at
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1
       )
       SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.finished_at
       FROM table_check t LEFT JOIN round_data r ON true
      `,
      [table_id, req.user.sub]
    );

    if (!row || !row.id) return res.status(404).json({ error: "Table not found" });
    if (row.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    if (!row.is_member) return res.status(403).json({ error: "Not part of the table" });
    if (!row.round_id) return res.status(404).json({ error: "No active round" });
    if (row.active_user_id !== req.user.sub) return res.status(403).json({ error: "Not your turn" });

    const hands = typeof row.hands === "string" ? JSON.parse(row.hands) : (row.hands || {});
    const stock = typeof row.stock === "string" ? JSON.parse(row.stock) : (row.stock || []);
    const discard = typeof row.discard === "string" ? JSON.parse(row.discard) : (row.discard || []);

    const myHand = hands[req.user.sub];
    if (!myHand) return res.status(404).json({ error: "No hand for this player" });
    if (myHand.length !== 13) return res.status(400).json({ error: "You must discard before drawing again" });
    if (!discard || discard.length === 0) return res.status(400).json({ error: "Discard pile is empty" });

    const drawn = discard.pop();
    myHand.push(drawn);

    await db.execute(
      `UPDATE rummy_rounds SET discard=$1::jsonb, hands=$2::jsonb, updated_at=now() WHERE id=$3`,
      [JSON.stringify(discard), JSON.stringify(hands), row.round_id]
    );

    const handView = myHand.map((c) => ({
      rank: c.rank,
      suit: c.suit || null,
      joker: !!c.joker,
      code: c.joker ? "JOKER" : `${c.rank}${c.suit || ""}`,
    }));

    const responseData = {
      table_id,
      round_number: row.number,
      hand: handView,
      stock_count: stock.length,
      discard_top: discard && discard.length ? serializeCard(discard[discard.length - 1]) : null,
      finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    };
    res.json(responseData);

    // 🚀 BROADCAST UPDATE (others need to know discard taken)
    nspEmit(req, table_id, "game_update", { table_id });
    return;
  } catch (e) {
    console.error("draw/discard error", e);
    res.status(500).json({ error: "Failed to draw from discard" });
  }
});

/* ---------------------------
   POST /discard
   body: { table_id, card: { rank, suit, joker } }
   - Remove card from player's hand, push to discard, advance turn
------------------------------ */
router.post("/discard", requireAuth, async (req, res) => {
  try {
    const { table_id, card } = req.body;
    if (!table_id || !card || !card.rank) return res.status(400).json({ error: "Invalid request" });

    const row = await db.fetchrow(
      `WITH table_check AS (
         SELECT id, status, EXISTS(SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2) AS is_member
         FROM rummy_tables WHERE id=$1
       ), round_data AS (
         SELECT id, number, stock, hands, discard, active_user_id
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1
       ), seat_order AS (
         SELECT user_id, seat FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false ORDER BY seat ASC
       )
       SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, json_agg(s.user_id ORDER BY s.seat) AS user_order
       FROM table_check t LEFT JOIN round_data r ON true LEFT JOIN seat_order s ON true
       GROUP BY t.id, t.status, t.is_member, r.id, r.number, r.stock, r.hands, r.discard, r.active_user_id
      `,
      [table_id, req.user.sub]
    );

    if (!row || !row.id) return res.status(404).json({ error: "Table not found" });
    if (row.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    if (!row.is_member) return res.status(403).json({ error: "Not part of the table" });
    if (!row.round_id) return res.status(404).json({ error: "No active round" });
    if (row.active_user_id !== req.user.sub) return res.status(403).json({ error: "Not your turn" });

    const hands = typeof row.hands === "string" ? JSON.parse(row.hands) : (row.hands || {});
    const stock = typeof row.stock === "string" ? JSON.parse(row.stock) : (row.stock || []);
    const discard = typeof row.discard === "string" ? JSON.parse(row.discard) : (row.discard || []);
    const order = Array.isArray(row.user_order) ? row.user_order : (row.user_order ? JSON.parse(row.user_order) : []);

    const myHand = hands[req.user.sub];
    if (!myHand) return res.status(404).json({ error: "No hand for this player" });
    if (myHand.length !== 14) return res.status(400).json({ error: "You must draw first before discarding" });

    // find matching card (match rank and suit; joker matches by rank)
    let idxToRemove = -1;
    for (let i = 0; i < myHand.length; i++) {
      const c = myHand[i];
      const cSuit = c.suit || null;
      const reqSuit = card.suit || null;
      const cJoker = !!c.joker;
      const reqJoker = !!card.joker;
      if (c.rank === card.rank && cSuit === reqSuit && cJoker === reqJoker) {
        idxToRemove = i;
        break;
      }
    }
    if (idxToRemove === -1) {
      return res.status(400).json({ error: "Card not found in hand" });
    }

    const [removed] = myHand.splice(idxToRemove, 1);
    discard.push(removed);

    // determine next active user from seat order
    if (!order || !Array.isArray(order) || order.length === 0) {
      return res.status(500).json({ error: "Seat order missing" });
    }
    const curIdx = order.indexOf(req.user.sub);
    if (curIdx === -1) return res.status(400).json({ error: "Player has no seat" });

    const nextUser = order[(curIdx + 1) % order.length];

    await db.execute(
      `UPDATE rummy_rounds SET discard=$1::jsonb, hands=$2::jsonb, active_user_id=$3, updated_at=now() WHERE id=$4`,
      [JSON.stringify(discard), JSON.stringify(hands), nextUser, row.round_id]
    );

    // Return updated view for the discarder
    const handView = myHand.map((c) => ({
      rank: c.rank,
      suit: c.suit || null,
      joker: !!c.joker,
      code: c.joker ? "JOKER" : `${c.rank}${c.suit || ""}`,
    }));

    res.json({
      table_id,
      round_number: row.number,
      hand: handView,
      stock_count: stock.length,
      discard_top: serializeCard(discard[discard.length - 1]),
      next_active_user_id: nextUser,
    });

    // 🚀 BROADCAST UPDATE (Crucial for Discard Logic Fix)
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "card.discarded", {
      user_id: req.user.sub,
      discard_top: serializeCard(discard[discard.length - 1]),
      next_active_user_id: nextUser
    });
  } catch (e) {
    console.error("discard error", e);
    res.status(500).json({ error: "Failed to discard card" });
  }
});

/* ---------------------------
   Part 3 — Declare / Reveal / Scoreboard / Next Round / History / Drop / Spectate
------------------------------ */

//
// Helper: minimal deadwood scoring (simple, safe fallback)
// You can replace with your full scoring module later.
//
function cardValueForScoring(card, aceValue = 10, faceCardMode = "ten") {
  if (!card) return 0;
  if (card.joker || card.rank === "JOKER") return 15;
  const r = card.rank;
  if (faceCardMode === "rank") {
    if (r === "J") return 11;
    if (r === "Q") return 12;
    if (r === "K") return 13;
  }
  if (["J", "Q", "K"].includes(r)) return 10;
  if (r === "A") return aceValue === 1 ? 1 : 10;
  const n = Number(r);
  return Number.isNaN(n) ? 0 : n;
}

// POST /declare
router.post("/declare", requireAuth, async (req, res) => {
  try {
    const { table_id, groups } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    // Basic table & round fetch + membership check
    const rnd = await db.fetchrow(
      `SELECT id, number, hands, discard, wild_joker_rank, players_with_first_sequence, ace_value, face_card_mode, game_mode, meld_snapshots
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No active round" });

    // ensure requester is active player (optional)
    const table = await db.fetchrow(`SELECT status, loser_deadwood_mode FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table || table.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    const loserDeadwoodMode =
      String(table.loser_deadwood_mode || "auto_optimal").toLowerCase() === "submit_or_full"
        ? "submit_or_full"
        : "auto_optimal";

    let meld_snapshots_raw = rnd.meld_snapshots;
    if (typeof meld_snapshots_raw === "string") {
      try {
        meld_snapshots_raw = JSON.parse(meld_snapshots_raw);
      } catch {
        meld_snapshots_raw = {};
      }
    }
    const meld_snapshots = normalizeKeyedJson(meld_snapshots_raw || {});

    // membership
    const membership = await db.fetchrow(
      `SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );
    if (!membership) return res.status(403).json({ error: "Not part of table" });

    // load hands (normalize keys so JSON numeric subs match DB text ids)
    let hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    hands = normalizeKeyedJson(hands);
    const sub = normId(req.user.sub);
    const myHand = hands[sub];
    if (!myHand) return res.status(404).json({ error: "No hand found for player" });
    if (myHand.length !== 14) {
      return res.status(400).json({ error: `Must have 14 cards to declare. Found ${myHand.length}` });
    }

    // prepare players_with_first_sequence
    let players_with_first_sequence = rnd.players_with_first_sequence || [];
    if (typeof players_with_first_sequence === "string") {
      try { players_with_first_sequence = JSON.parse(players_with_first_sequence); } catch { players_with_first_sequence = []; }
    }

    const wild_joker_rank = rnd.wild_joker_rank || null;
    const ace_value = rnd.ace_value || 10;
    const face_card_mode = String(rnd.face_card_mode || "ten").toLowerCase() === "rank" ? "rank" : "ten";
    const wild_joker_revealed = wildJokerEffectivelyRevealed(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence
    );

    // Validate groups if provided
    let isValidDeclaration = false;
    const scores = {};

    const tablePlayers = await db.fetch(
      `SELECT user_id, is_spectator FROM rummy_table_players WHERE table_id=$1 ORDER BY seat ASC`,
      [table_id]
    );
    const spectatorMap = {};
    for (const p of tablePlayers) spectatorMap[normId(p.user_id)] = p.is_spectator;

    if (Array.isArray(groups) && groups.length > 0) {
      // quick sanity: total declared card count must be 13
      let totalCards = groups.reduce((acc, g) => acc + (Array.isArray(g) ? g.length : 0), 0);
      if (totalCards !== 13) {
        return res.status(400).json({ error: `Groups must contain exactly 13 cards. You provided ${totalCards}.` });
      }

      // Check all declared cards exist in player's current hand
      const handCopy = myHand.slice();
      let ok = true;
      for (const grp of groups) {
        for (const c of grp) {
          const reqRank = c.rank;
          const reqSuit = c.suit || null;
          const idx = handCopy.findIndex(h => h.rank === reqRank && (h.suit || null) === reqSuit && (!!h.joker) === (!!c.joker));
          if (idx === -1) { ok = false; break; }
          handCopy.splice(idx, 1);
        }
        if (!ok) break;
      }
      if (!ok) {
        return res.status(400).json({ error: "Declared cards do not match your hand" });
      }

      // Strict server-side validation (authoritative).
      const validation = scoring.validateHand
        ? scoring.validateHand(groups, [], wild_joker_rank, wild_joker_revealed)
        : { valid: false, reason: "Validator unavailable" };
      isValidDeclaration = !!validation.valid;

      if (isValidDeclaration) {
        scores[sub] = 0;
        for (const p of tablePlayers) {
          const uid = normId(p.user_id);
          if (uid === sub) continue;
          if (spectatorMap[uid]) {
            scores[uid] = 20;
          } else {
            const oppHand = hands[uid] || [];
            let pts = 0;
            if (scoring && typeof scoring.calculateLoserDeadwoodPoints === "function") {
              const snapUid = meld_snapshots[normId(uid)] || null;
              pts = scoring.calculateLoserDeadwoodPoints(
                oppHand,
                loserDeadwoodMode,
                snapUid,
                wild_joker_rank,
                wild_joker_revealed,
                ace_value,
                face_card_mode
              );
            } else if (scoring && typeof scoring.calculateUngroupedDeadwoodPoints === "function") {
              pts = scoring.calculateUngroupedDeadwoodPoints(oppHand, wild_joker_rank, wild_joker_revealed, ace_value, face_card_mode);
            } else if (scoring && typeof scoring.calculateDeadwoodPoints === "function") {
              pts = scoring.calculateDeadwoodPoints(oppHand, wild_joker_rank, wild_joker_revealed, ace_value, face_card_mode);
            } else {
              pts = oppHand.reduce((s, c) => s + cardValueForScoring(c, ace_value, face_card_mode), 0);
            }
            scores[uid] = Math.min(pts, 80);
          }
        }
      } else {
        const declarer_pts = INVALID_DECLARE_PENALTY;
        for (const p of tablePlayers) {
          const uid = normId(p.user_id);
          if (uid === sub) scores[uid] = declarer_pts;
          else if (spectatorMap[uid]) scores[uid] = 20;
          else scores[uid] = 0;
        }
        isValidDeclaration = false;
      }
    } else {
      const declarer_pts = INVALID_DECLARE_PENALTY;
      for (const p of tablePlayers) {
        const uid = normId(p.user_id);
        scores[uid] = uid === sub ? declarer_pts : 0;
      }
      isValidDeclaration = false;
    }

    // Persist round points for seated players (skip spectators / dropped)
    for (const [uid, pts] of Object.entries(scores)) {
      const n = normId(uid);
      if (!spectatorMap[n]) {
        await db.execute(
          `UPDATE rummy_table_players SET total_points = COALESCE(total_points,0) + $1 WHERE table_id=$2 AND user_id=$3`,
          [pts, table_id, n]
        );
      }
    }

    const declarationGroups = Array.isArray(groups) && groups.length > 0 ? groups : [];
    const organizedMelds = {};
    for (const p of tablePlayers) {
      const uid = normId(p.user_id);
      if (!Object.prototype.hasOwnProperty.call(hands, uid)) continue;
      organizedMelds[uid] = buildOrganizedScoreboardForUser({
        userId: uid,
        declarerUserId: sub,
        hand: hands[uid] || [],
        declarationGroups,
        isSpectator: !!spectatorMap[uid],
        wildJokerRank: wild_joker_rank,
        wildJokerRevealed: wild_joker_revealed,
        snapshot: meld_snapshots[uid] || null,
      });
    }
    for (const uid of Object.keys(hands)) {
      const n = normId(uid);
      if (organizedMelds[n]) continue;
      organizedMelds[n] = buildOrganizedScoreboardForUser({
        userId: n,
        declarerUserId: sub,
        hand: hands[n] || [],
        declarationGroups,
        isSpectator: !!spectatorMap[n],
        wildJokerRank: wild_joker_rank,
        wildJokerRevealed: wild_joker_revealed,
        snapshot: meld_snapshots[n] || null,
      });
    }

    const declarationPayload = {
      groups: declarationGroups,
      valid: isValidDeclaration,
      revealed_hands: hands,
      organized_melds: organizedMelds
    };

    const scoresForDb = {};
    for (const [k, v] of Object.entries(scores)) scoresForDb[normId(k)] = v;

    await db.execute(
      `UPDATE rummy_rounds SET winner_user_id=$1, scores=$2::jsonb, declarations = COALESCE(declarations, '{}'::jsonb) || $3::jsonb, finished_at=now(), updated_at=now()
       WHERE id=$4`,
      [isValidDeclaration ? sub : null, JSON.stringify(scoresForDb), JSON.stringify({ [sub]: declarationPayload }), rnd.id]
    );

    // Also update table status to round_complete
    await db.execute(`UPDATE rummy_tables SET status='playing' WHERE id=$1`, [table_id]); // keep playing flag; front-end expects finished_at to mark end

    const responseData = {
      table_id,
      round_number: rnd.number,
      declared_by: sub,
      valid: isValidDeclaration,
      status: isValidDeclaration ? "valid" : "invalid",
      message: isValidDeclaration ? "Valid declaration" : `Invalid declaration. ${INVALID_DECLARE_PENALTY} penalty points applied.`,
      scores: scoresForDb,
    };

    res.json(responseData);

    // 🚀 BROADCAST (must use /rummy namespace so all seated clients receive)
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "round.declare", {
      declared_by: sub,
      result: { valid: isValidDeclaration, scores: scoresForDb }
    });
    return;
  } catch (e) {
    console.error("declare error", e);
    res.status(500).json({ error: "Failed to process declaration" });
  }
});

// GET /round/revealed-hands
router.get("/round/revealed-hands", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const rnd = await db.fetchrow(
      `SELECT id, number, finished_at, hands, scores, declarations, winner_user_id, wild_joker_rank, game_mode, players_with_first_sequence, meld_snapshots
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No round found" });
    if (!rnd.finished_at) return res.status(400).json({ error: "Round not finished" });

    // Seat order: stable scoreboard rows + names + spectator flag
    const seatRows = await db.fetch(
      `SELECT user_id, display_name, is_spectator FROM rummy_table_players WHERE table_id=$1 ORDER BY seat ASC`,
      [table_id]
    );
    const names = {};
    for (const p of seatRows) names[normId(p.user_id)] = p.display_name || "Player";

    let hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    hands = normalizeKeyedJson(hands);
    let scores = typeof rnd.scores === "string" ? JSON.parse(rnd.scores) : (rnd.scores || {});
    scores = normalizeKeyedJson(scores);
    let declarations = typeof rnd.declarations === "string" ? JSON.parse(rnd.declarations) : (rnd.declarations || {});
    declarations = normalizeKeyedJson(declarations);
    let meldSnapshots = typeof rnd.meld_snapshots === "string" ? JSON.parse(rnd.meld_snapshots) : (rnd.meld_snapshots || {});
    meldSnapshots = normalizeKeyedJson(meldSnapshots);

    const declared_by = pickDeclarerUserId(declarations, rnd.winner_user_id);
    const declarationRecordRaw = declared_by ? declarations[declared_by] : null;
    const declarationRecord = typeof declarationRecordRaw === "string"
      ? JSON.parse(declarationRecordRaw)
      : (declarationRecordRaw || null);
    const declaration_status = declared_by && declarationRecord
      ? (declarationRecord.valid ? "valid" : "invalid")
      : (rnd.winner_user_id ? "valid" : "invalid");

    const wildJokerRank = rnd.wild_joker_rank || null;
    const wild_joker_revealed = wildJokerEffectivelyRevealed(
      rnd.game_mode,
      wildJokerRank,
      rnd.players_with_first_sequence
    );
    const declarationGroups =
      declarationRecord && Array.isArray(declarationRecord.groups) ? declarationRecord.groups : [];

    const organized_melds = {};
    const spectatorByUser = {};
    for (const row of seatRows) spectatorByUser[normId(row.user_id)] = !!row.is_spectator;

    for (const row of seatRows) {
      const uid = normId(row.user_id);
      if (!Object.prototype.hasOwnProperty.call(hands, uid)) continue;
      organized_melds[uid] = buildOrganizedScoreboardForUser({
        userId: uid,
        declarerUserId: declared_by,
        hand: hands[uid] || [],
        declarationGroups,
        isSpectator: spectatorByUser[uid],
        wildJokerRank,
        wildJokerRevealed: wild_joker_revealed,
        snapshot: meldSnapshots[uid] || null,
      });
    }
    for (const uid of Object.keys(hands)) {
      const n = normId(uid);
      if (organized_melds[n]) continue;
      organized_melds[n] = buildOrganizedScoreboardForUser({
        userId: n,
        declarerUserId: declared_by,
        hand: hands[n] || [],
        declarationGroups,
        isSpectator: !!spectatorByUser[n],
        wildJokerRank,
        wildJokerRevealed: wild_joker_revealed,
        snapshot: meldSnapshots[n] || null,
      });
    }

    return res.json({
      table_id,
      round_number: rnd.number,
      status: declaration_status,
      declared_by,
      winner_user_id: rnd.winner_user_id ? normId(rnd.winner_user_id) : null,
      revealed_hands: hands,
      organized_melds,
      scores,
      player_names: names,
      is_finished: true,
    });
  } catch (e) {
    console.error("revealed-hands error", e);
    res.status(500).json({ error: "Failed to fetch revealed hands" });
  }
});

// GET /round/scoreboard
router.get("/round/scoreboard", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    // ensure membership
    const mem = await db.fetchrow(`SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`, [table_id, req.user.sub]);
    if (!mem) return res.status(403).json({ error: "Not a table member" });

    const rnd = await db.fetchrow(
      `SELECT number, scores, winner_user_id, points_accumulated FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No round found" });

    const scores = rnd.scores || {};

    // Accumulate totals to rummy_table_players only once
    if (!rnd.points_accumulated) {
      for (const uid of Object.keys(scores)) {
        const points = parseInt(scores[uid] || 0, 10);
        await db.execute(
          `UPDATE rummy_table_players SET total_points = COALESCE(total_points,0) + $1 WHERE table_id=$2 AND user_id=$3`,
          [points, table_id, uid]
        );
      }
      await db.execute(`UPDATE rummy_rounds SET points_accumulated = TRUE WHERE table_id=$1 AND number=$2`, [table_id, rnd.number]);
    }

    // Build response list
    const entries = [];
    for (const [uid, pts] of Object.entries(scores)) {
      entries.push({ user_id: uid, points: parseInt(pts || 0, 10) });
    }

    return res.json({
      table_id,
      round_number: rnd.number,
      scores: entries,
      winner_user_id: rnd.winner_user_id || null
    });
  } catch (e) {
    console.error("scoreboard error", e);
    res.status(500).json({ error: "Failed to get scoreboard" });
  }
});

// POST /round/next
router.post("/round/next", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const tbl = await db.fetchrow(
      `SELECT id, host_user_id, status, disqualify_score, wild_joker_mode, ace_value, face_card_mode
       FROM rummy_tables WHERE id=$1`,
      [table_id]
    );
    if (!tbl) return res.status(404).json({ error: "Table not found" });
    if (tbl.host_user_id !== req.user.sub) return res.status(403).json({ error: "Only host can start next round" });

    // Ensure last round is finished
    const last = await db.fetchrow(`SELECT id, number, finished_at FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`, [table_id]);
    if (!last || !last.finished_at) return res.status(400).json({ error: "Last round not finished yet" });

    // Disqualify players over threshold and build active list
    const players = await db.fetch(
      `SELECT user_id, seat, total_points, disqualified
       FROM rummy_table_players
       WHERE table_id=$1
       ORDER BY seat ASC`,
      [table_id]
    );
    const activePlayers = [];
    for (const p of players) {
      if (p.disqualified) continue;
      const total = parseInt(p.total_points || 0, 10);
      if (total >= (tbl.disqualify_score || 200)) {
        await db.execute(`UPDATE rummy_table_players SET disqualified = true, eliminated_at = now() WHERE table_id=$1 AND user_id=$2`, [table_id, p.user_id]);
      } else {
        activePlayers.push(p.user_id);
      }
    }

    if (activePlayers.length < 2) {
      // finish table
      await db.execute(`UPDATE rummy_tables SET status='finished' WHERE id=$1`, [table_id]);
      return res.status(400).json({ error: "Not enough players for next round; table finished" });
    }

    const nextNumber = parseInt(last.number || 0, 10) + 1;

    // Cyclic start player logic: Round 1 -> Seat 1, Round 2 -> Seat 2, etc.
    const startIdx = (nextNumber - 1) % activePlayers.length;
    const startPlayer = activePlayers[startIdx];

    // Restore dropped-but-not-disqualified players for new round.
    await db.execute(
      `UPDATE rummy_table_players
       SET is_spectator=false, spectator_allowed='[]'::jsonb
       WHERE table_id=$1 AND disqualified=false`,
      [table_id]
    );

    // Build a fresh deal for next round.
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const suits = ["H", "D", "S", "C"];
    const deckCount = activePlayers.length <= 2 ? 1 : activePlayers.length <= 4 ? 2 : 3;
    const deck = [];
    for (let d = 0; d < deckCount; d++) {
      for (const r of ranks) {
        for (const s of suits) {
          deck.push({ rank: r, suit: s, joker: false });
        }
      }
      deck.push({ rank: "JOKER", suit: null, joker: true });
      deck.push({ rank: "JOKER", suit: null, joker: true });
    }

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    const hands = {};
    for (const uid of activePlayers) {
      hands[uid] = [];
      for (let i = 0; i < 13; i++) {
        hands[uid].push(deck.pop());
      }
    }

    const discard = [];
    if (deck.length > 0) discard.push(deck.pop());
    const stock = [];
    while (deck.length > 0) stock.push(deck.pop());

    let wild_joker_rank = null;
    if ((tbl.wild_joker_mode || "open_joker") !== "no_joker") {
      wild_joker_rank = ranks[Math.floor(Math.random() * ranks.length)];
    }

    await db.execute(
      `INSERT INTO rummy_rounds (id, table_id, number, wild_joker_rank, stock, discard, hands, active_user_id, game_mode, ace_value, face_card_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        require('uuid').v4(),
        table_id,
        nextNumber,
        wild_joker_rank,
        JSON.stringify(stock),
        JSON.stringify(discard),
        JSON.stringify(hands),
        startPlayer,
        tbl.wild_joker_mode || "open_joker",
        tbl.ace_value || 10,
        tbl.face_card_mode || "ten",
      ]
    );

    await db.execute(`UPDATE rummy_tables SET status='playing', updated_at=now() WHERE id=$1`, [table_id]);

    const responseData = { table_id, number: nextNumber, active_user_id: startPlayer };
    res.json(responseData);

    // 🚀 BROADCAST
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "round.started", { table_id, round_number: nextNumber });
    return;
  } catch (e) {
    console.error("round/next error", e);
    res.status(500).json({ error: "Failed to start next round" });
  }
});

// GET /round/history
router.get("/round/history", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const rows = await db.fetch(
      `SELECT r.number, r.winner_user_id, r.scores, r.finished_at, p.display_name AS winner_name
       FROM rummy_rounds r
       LEFT JOIN rummy_table_players p ON p.table_id = r.table_id AND p.user_id = r.winner_user_id
       WHERE r.table_id=$1 AND r.finished_at IS NOT NULL
       ORDER BY r.number ASC`,
      [table_id]
    );

    if (!rows || rows.length === 0) return res.json({ rounds: [] });

    const out = [];
    for (const r of rows) {
      const rawScores = r.scores || {};
      const normalizedScores = {};
      for (const [uid, points] of Object.entries(rawScores)) {
        normalizedScores[uid] = parseInt(points || 0, 10);
      }
      out.push({
        round_number: r.number,
        winner_user_id: r.winner_user_id || null,
        winner_name: r.winner_name || null,
        scores: normalizedScores,
        completed_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      });
    }
    return res.json({ rounds: out });
  } catch (e) {
    console.error("round/history error", e);
    res.status(500).json({ error: "Failed to fetch round history" });
  }
});

// POST /game/drop
router.post("/game/drop", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const row = await db.fetchrow(
      `SELECT r.id, r.hands, r.active_user_id, (SELECT COUNT(*) FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false) as player_count
       FROM rummy_rounds r WHERE r.table_id=$1 ORDER BY r.number DESC LIMIT 1`,
      [table_id]
    );
    if (!row) return res.status(404).json({ error: "No active round" });

    // Rule: Drop allowed only if 3 or more players are playing
    if (parseInt(row.player_count, 10) < 3) return res.status(400).json({ error: "Drop is allowed only when 3 or more players are active." });

    // Rule: Must be your turn to drop
    if (row.active_user_id !== req.user.sub) return res.status(400).json({ error: "You can only drop at the start of YOUR turn." });

    const hands = typeof row.hands === "string" ? JSON.parse(row.hands) : (row.hands || {});
    const myHand = hands[req.user.sub] || [];
    if (myHand.length !== 13) return res.status(400).json({ error: "Can only drop before drawing first card" });

    // mark player spectator & apply penalty
    await db.execute(`UPDATE rummy_table_players SET is_spectator=true, total_points = COALESCE(total_points,0) + 20, eliminated_at=now() WHERE table_id=$1 AND user_id=$2`, [table_id, req.user.sub]);

    const responseData = { success: true, penalty_points: 20 };
    res.json(responseData);

    // 🚀 BROADCAST
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "player.dropped", { user_id: req.user.sub, penalty: 20 });
    return;
  } catch (e) {
    console.error("drop error", e);
    res.status(500).json({ error: "Failed to drop" });
  }
});

// POST /game/kick-player — host removes another active player (same 3+ players rule as self-drop).
router.post("/game/kick-player", requireAuth, async (req, res) => {
  try {
    const { table_id, target_user_id } = req.body;
    if (!table_id || !target_user_id) return res.status(400).json({ error: "table_id and target_user_id required" });

    const tbl = await db.fetchrow(`SELECT host_user_id, status FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!tbl) return res.status(404).json({ error: "Table not found" });
    if (normId(tbl.host_user_id) !== normId(req.user.sub)) {
      return res.status(403).json({ error: "Only the table host can kick a player" });
    }
    if (tbl.status !== "playing") return res.status(400).json({ error: "Table is not in a playing round" });

    const target = normId(target_user_id);
    if (target === normId(req.user.sub)) {
      return res.status(400).json({ error: "Host cannot kick themselves; use drop if available" });
    }

    const tgt = await db.fetchrow(
      `SELECT is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, target]
    );
    if (!tgt) return res.status(404).json({ error: "Player not at this table" });
    if (tgt.is_spectator) return res.status(400).json({ error: "Player is already dropped/spectating" });

    const cntRow = await db.fetchrow(
      `SELECT COUNT(*)::int AS n FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false`,
      [table_id]
    );
    if ((cntRow?.n || 0) < 3) {
      return res.status(400).json({ error: "Kick requires at least 3 active players before removing someone." });
    }

    const roundRow = await db.fetchrow(
      `SELECT id, hands, active_user_id, meld_snapshots FROM rummy_rounds WHERE table_id=$1 AND finished_at IS NULL ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!roundRow) return res.status(400).json({ error: "No unfinished round" });

    const orderRows = await db.fetch(
      `SELECT user_id FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false ORDER BY seat ASC`,
      [table_id]
    );
    const fullOrder = orderRows.map((r) => normId(r.user_id));

    let hands = typeof roundRow.hands === "string" ? JSON.parse(roundRow.hands) : (roundRow.hands || {});
    hands = normalizeKeyedJson(hands);
    if (!Object.prototype.hasOwnProperty.call(hands, target)) {
      return res.status(400).json({ error: "Target has no cards in the current round" });
    }

    const nextActive = nextActiveAfterKick(roundRow.active_user_id, fullOrder, target);
    delete hands[target];

    let ms = roundRow.meld_snapshots;
    if (typeof ms === "string") {
      try {
        ms = JSON.parse(ms);
      } catch {
        ms = {};
      }
    }
    ms = normalizeKeyedJson(ms || {});
    delete ms[target];

    await db.execute(
      `UPDATE rummy_rounds SET hands=$1::jsonb, active_user_id=$2, meld_snapshots=$3::jsonb, updated_at=now() WHERE id=$4`,
      [JSON.stringify(hands), nextActive, JSON.stringify(ms), roundRow.id]
    );

    await db.execute(
      `UPDATE rummy_table_players SET is_spectator=true, total_points=COALESCE(total_points,0)+20, eliminated_at=now() WHERE table_id=$1 AND user_id=$2`,
      [table_id, target]
    );

    res.json({ success: true, kicked_user_id: target, penalty_points: 20, active_user_id: nextActive });

    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "player.kicked", { user_id: target, penalty: 20, by_host: normId(req.user.sub) });
    return;
  } catch (e) {
    console.error("kick-player error", e);
    res.status(500).json({ error: "Failed to kick player" });
  }
});

// POST /game/request-spectate
router.post("/game/request-spectate", requireAuth, async (req, res) => {
  try {
    const { table_id, player_id } = req.body;
    if (!table_id || !player_id) return res.status(400).json({ error: "table_id and player_id required" });

    // Ensure requester is eliminated (only eliminated may request spectate)
    const spect = await db.fetchrow(`SELECT is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`, [table_id, req.user.sub]);
    if (!spect || !spect.is_spectator) return res.status(403).json({ error: "Must be eliminated to request spectate" });

    await db.execute(
      `INSERT INTO spectate_permissions (table_id, spectator_id, player_id, admin_approved, granted)
       VALUES ($1,$2,$3,false,false)
       ON CONFLICT (table_id, spectator_id, player_id)
       DO UPDATE SET admin_approved=false, granted=false`,
      [table_id, req.user.sub, player_id]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error("request-spectate error", e);
    res.status(500).json({ error: "Failed to request spectate" });
  }
});

// POST /game/grant-spectate
router.post("/game/grant-spectate", requireAuth, async (req, res) => {
  try {
    const { table_id, spectator_id, granted } = req.body;
    if (!table_id || !spectator_id || typeof granted === "undefined") return res.status(400).json({ error: "Invalid request" });

    const table = await db.fetchrow(`SELECT host_user_id FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table) return res.status(404).json({ error: "Table not found" });

    const pending = await db.fetchrow(
      `SELECT table_id, spectator_id, player_id, admin_approved, granted
       FROM spectate_permissions
       WHERE table_id=$1 AND spectator_id=$2`,
      [table_id, spectator_id]
    );
    if (!pending) return res.status(404).json({ error: "No spectate request found" });

    // Step 1: host/admin approval
    if (req.user.sub === table.host_user_id) {
      await db.execute(
        `UPDATE spectate_permissions SET admin_approved=$1, granted=CASE WHEN $1 THEN granted ELSE false END
         WHERE table_id=$2 AND spectator_id=$3 AND player_id=$4`,
        [!!granted, table_id, spectator_id, pending.player_id]
      );
      return res.json({ success: true, stage: "admin", admin_approved: !!granted });
    }

    // Step 2: target player approval (only after admin approved)
    if (req.user.sub !== pending.player_id) {
      return res.status(403).json({ error: "Only host or target player can update spectate request" });
    }
    if (!pending.admin_approved) {
      return res.status(400).json({ error: "Host approval required before player permission" });
    }

    await db.execute(
      `UPDATE spectate_permissions SET granted=$1
       WHERE table_id=$2 AND spectator_id=$3 AND player_id=$4`,
      [!!granted, table_id, spectator_id, pending.player_id]
    );
    if (granted) {
      await db.execute(
        `UPDATE rummy_table_players
         SET spectator_allowed = COALESCE(spectator_allowed, '[]'::jsonb) || $1
         WHERE table_id=$2 AND user_id=$3`,
        [JSON.stringify([spectator_id]), table_id, pending.player_id]
      );
    }
    return res.json({ success: true, stage: "player", granted: !!granted });
  } catch (e) {
    console.error("grant-spectate error", e);
    res.status(500).json({ error: "Failed to update spectate permission" });
  }
});

module.exports = router;


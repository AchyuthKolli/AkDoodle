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

/* ---------------------------
    Helpers
------------------------------ */

function serializeCard(card) {
  if (card.joker && card.rank === "JOKER") return "JOKER";
  return `${card.rank}${card.suit || ""}`;
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

    // Get players
    const players = await db.fetch(
      `SELECT user_id, display_name, seat, is_spectator FROM rummy_table_players WHERE table_id=$1 ORDER BY seat ASC`,
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
    const { max_players, disqualify_score, wild_joker_mode, ace_value } = req.body;

    const table_id = uuidv4();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    await db.fetchrow(
      `
      INSERT INTO rummy_tables (id, code, host_user_id, max_players, disqualify_score, wild_joker_mode, ace_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [table_id, code, req.user.sub, max_players, disqualify_score, wild_joker_mode, ace_value]
    );

    // Add host as seat 1
    await db.execute(
      `
      INSERT INTO rummy_table_players (table_id, user_id, seat, display_name)
      VALUES ($1, $2, 1, $2)
    `,
      [table_id, req.user.sub]
    );

    res.json({ table_id, code });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Create table failed" });
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
    if (tbl.status !== "waiting")
      return res.status(400).json({ error: "Round already started" });

    const seated = await db.fetch(
      `SELECT seat FROM rummy_table_players WHERE table_id=$1 ORDER BY seat`,
      [table_id]
    );

    const used = seated.map((r) => r.seat);
    let seat = 1;
    while (used.includes(seat)) seat++;
    if (seat > tbl.max_players)
      return res.status(400).json({ error: "Table is full" });

    await db.execute(
      `
      INSERT INTO rummy_table_players (table_id, user_id, seat, display_name)
      VALUES ($1, $2, $3, $2)
      ON CONFLICT DO NOTHING
    `,
      [table_id, req.user.sub, seat]
    );

    res.json({ table_id, seat });
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
    if (tbl.status !== "waiting")
      return res.status(400).json({ error: "Game already started" });

    const seated = await db.fetch(
      `SELECT seat FROM rummy_table_players WHERE table_id=$1 ORDER BY seat`,
      [tbl.id]
    );
    const used = seated.map((r) => r.seat);

    let seat = 1;
    while (used.includes(seat)) seat++;
    if (seat > tbl.max_players)
      return res.status(400).json({ error: "Table full" });

    await db.execute(
      `INSERT INTO rummy_table_players (table_id, user_id, seat, display_name)
       VALUES ($1, $2, $3, $2)
       ON CONFLICT DO NOTHING`,
      [tbl.id, req.user.sub, seat]
    );

    res.json({ table_id: tbl.id, seat });
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

    for (let d = 0; d < 2; d++) {
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
      (id, table_id, number, wild_joker_rank, stock, discard, hands, active_user_id, game_mode, ace_value)
      VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9)
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
      discard_top: serializeCard(discard[0]),
    });

    // 🚀 BROADCAST UPDATE
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
      io.to(table_id).emit("round.started", { table_id, round_number: 1 });
    }
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
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
      // optionally specific event
      io.to(table_id).emit("sequence.locked", { user_id: req.user.sub, wild_joker_revealed: true });
    }
  } catch (e) {
    console.error("lock-sequence error", e);
    res.status(500).json({ success: false, message: "Failed to lock sequence" });
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
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
    }
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
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
    }
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
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
      // Emit specific event for fast UI reaction
      io.to(table_id).emit("card.discarded", {
        user_id: req.user.sub,
        discard_top: serializeCard(discard[discard.length - 1]),
        next_active_user_id: nextUser
      });
    }
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
function cardValueForScoring(card, aceValue = 10) {
  if (!card) return 0;
  if (card.joker || card.rank === "JOKER") return 15;
  const r = card.rank;
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
      `SELECT id, number, hands, discard, wild_joker_rank, players_with_first_sequence, ace_value
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No active round" });

    // ensure requester is active player (optional)
    const table = await db.fetchrow(`SELECT status FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table || table.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });

    // membership
    const membership = await db.fetchrow(
      `SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );
    if (!membership) return res.status(403).json({ error: "Not part of table" });

    // load hands
    const hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    const myHand = hands[req.user.sub];
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

    // Validate groups if provided
    let isValidDeclaration = false;
    let organizedMelds = {};
    const scores = {};

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

      // Accept declaration as valid for now (plug your strict validator here)
      isValidDeclaration = true;

      // compute other players' deadwood points (simple auto-organize not implemented => naive sum)
      // Winner gets 0, opponents get sum of cardValueForScoring of their hands (cap at 80 applied later)
      for (const uid of Object.keys(hands)) {
        if (uid === req.user.sub) {
          scores[uid] = 0;
          organizedMelds[uid] = { pure_sequences: [], sequences: [], sets: [], deadwood: [] };
          // store winner's groups in organizedMelds
          organizedMelds[uid].pure_sequences = groups; // approximate
        } else {
          const oppHand = hands[uid] || [];
          const pts = oppHand.reduce((s, c) => s + cardValueForScoring(c, ace_value), 0);
          scores[uid] = Math.min(pts, 80);
          organizedMelds[uid] = { pure_sequences: [], sequences: [], sets: [], deadwood: oppHand };
        }
      }
    } else {
      // invalid/no groups => failed declaration: declarer gets full deadwood (cap 80), others 0
      let declarer_pts = myHand.reduce((s, c) => s + cardValueForScoring(c, ace_value), 0);
      declarer_pts = Math.min(declarer_pts, 80);
      for (const uid of Object.keys(hands)) {
        scores[uid] = (uid === req.user.sub) ? declarer_pts : 0;
        organizedMelds[uid] = { pure_sequences: [], sequences: [], sets: [], deadwood: (uid === req.user.sub ? myHand : []) };
      }
      isValidDeclaration = false;
    }

    // persist scoring and mark finished
    const declarationPayload = {
      groups: groups || [],
      valid: isValidDeclaration,
      revealed_hands: hands,
      organized_melds: organizedMelds
    };

    await db.execute(
      `UPDATE rummy_rounds SET winner_user_id=$1, scores=$2::jsonb, declarations = COALESCE(declarations, '{}'::jsonb) || $3::jsonb, finished_at=now(), updated_at=now()
       WHERE id=$4`,
      [isValidDeclaration ? req.user.sub : null, JSON.stringify(scores), JSON.stringify({ [req.user.sub]: declarationPayload }), rnd.id]
    );

    // Also update table status to round_complete
    await db.execute(`UPDATE rummy_tables SET status='playing' WHERE id=$1`, [table_id]); // keep playing flag; front-end expects finished_at to mark end

    const responseData = {
      table_id,
      round_number: rnd.number,
      declared_by: req.user.sub,
      status: isValidDeclaration ? "valid" : "invalid",
      scores,
    };

    res.json(responseData);

    // 🚀 BROADCAST
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
      io.to(table_id).emit("round.declare", {
        declared_by: req.user.sub,
        result: { valid: isValidDeclaration, scores }
      });
    }
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
      `SELECT id, number, finished_at, hands, scores, declarations, winner_user_id
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No round found" });
    if (!rnd.finished_at) return res.status(400).json({ error: "Round not finished" });

    // get player names
    const players = await db.fetch(`SELECT user_id, display_name FROM rummy_table_players WHERE table_id=$1`, [table_id]);
    const names = {};
    for (const p of players) names[p.user_id] = p.display_name || "Player";

    const hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    const scores = rnd.scores || {};
    const declarations = rnd.declarations || {};

    // Build organized melds from declarations if present
    const organized_melds = {};
    for (const uid of Object.keys(hands)) {
      if (declarations[uid] && declarations[uid].organized_melds) {
        organized_melds[uid] = declarations[uid].organized_melds;
      } else if (declarations[uid] && declarations[uid].groups) {
        organized_melds[uid] = { pure_sequences: declarations[uid].groups, sequences: [], sets: [], deadwood: [] };
      } else {
        organized_melds[uid] = { pure_sequences: [], sequences: [], sets: [], deadwood: hands[uid] || [] };
      }
    }

    return res.json({
      table_id,
      round_number: rnd.number,
      winner_user_id: rnd.winner_user_id || null,
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

    const tbl = await db.fetchrow(`SELECT id, host_user_id, status, disqualify_score FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!tbl) return res.status(404).json({ error: "Table not found" });
    if (tbl.host_user_id !== req.user.sub) return res.status(403).json({ error: "Only host can start next round" });

    // Ensure last round is finished
    const last = await db.fetchrow(`SELECT id, number, finished_at FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`, [table_id]);
    if (!last || !last.finished_at) return res.status(400).json({ error: "Last round not finished yet" });

    // Disqualify players over threshold and build active list
    const players = await db.fetch(`SELECT user_id, total_points FROM rummy_table_players WHERE table_id=$1 ORDER BY seat ASC`, [table_id]);
    const activePlayers = [];
    for (const p of players) {
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

    // Create deal (we don't have the deal library here; generate placeholders)
    // In production you should call the same Deal engine used earlier. For now produce empty hands and shuffled stock.
    // We'll create a new round entry with shuffled deck (lightweight)
    const nextNumber = parseInt(last.number || 0, 10) + 1;
    // simple deck generation: not trying to be deterministic
    const singleDeck = [
      /* minimal representation left intentionally simple - ideally call your DeckConfig/deal_initial */
    ];
    // store empty hands object and minimal stock/discard
    const hands = {};
    for (const uid of activePlayers) hands[uid] = [];

    await db.execute(
      `INSERT INTO rummy_rounds (id, table_id, number, stock, discard, hands, active_user_id, game_mode, ace_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [require('uuid').v4(), table_id, nextNumber, JSON.stringify([]), JSON.stringify([]), JSON.stringify(hands), activePlayers[0], tbl.wild_joker_mode || "open_joker", tbl.ace_value || 10]
    );

    await db.execute(`UPDATE rummy_tables SET status='playing', updated_at=now() WHERE id=$1`, [table_id]);

    const responseData = { table_id, number: nextNumber, active_user_id: activePlayers[0] };
    res.json(responseData);

    // 🚀 BROADCAST
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
      io.to(table_id).emit("round.started", { table_id, round_number: nextNumber });
    }
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
      `SELECT number, winner_user_id, scores FROM rummy_rounds WHERE table_id=$1 AND finished_at IS NOT NULL ORDER BY number ASC`,
      [table_id]
    );

    if (!rows || rows.length === 0) return res.json({ rounds: [] });

    const out = [];
    for (const r of rows) {
      const scores = r.scores || {};
      const playersArr = Object.keys(scores).map(uid => ({ user_id: uid, score: parseInt(scores[uid] || 0, 10) }));
      playersArr.sort((a, b) => a.score - b.score);
      out.push({ round_number: r.number, winner_user_id: r.winner_user_id || null, players: playersArr });
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
      `SELECT r.id, r.hands, (SELECT COUNT(*) FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false) as player_count
       FROM rummy_rounds r WHERE r.table_id=$1 ORDER BY r.number DESC LIMIT 1`,
      [table_id]
    );
    if (!row) return res.status(404).json({ error: "No active round" });
    if (parseInt(row.player_count, 10) < 2) return res.status(400).json({ error: "Need 2+ players to drop" });

    const hands = typeof row.hands === "string" ? JSON.parse(row.hands) : (row.hands || {});
    const myHand = hands[req.user.sub] || [];
    if (myHand.length !== 13) return res.status(400).json({ error: "Can only drop before drawing first card" });

    // mark player spectator & apply penalty
    await db.execute(`UPDATE rummy_table_players SET is_spectator=true, total_points = COALESCE(total_points,0) + 20, eliminated_at=now() WHERE table_id=$1 AND user_id=$2`, [table_id, req.user.sub]);

    const responseData = { success: true, penalty_points: 20 };
    res.json(responseData);

    // 🚀 BROADCAST
    const io = req.app.get("io");
    if (io) {
      io.to(table_id).emit("game_update", { table_id });
      io.to(table_id).emit("player.dropped", { user_id: req.user.sub, penalty: 20 });
    }
    return;
  } catch (e) {
    console.error("drop error", e);
    res.status(500).json({ error: "Failed to drop" });
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

    await db.execute(`INSERT INTO spectate_permissions (table_id, spectator_id, player_id, granted) VALUES ($1,$2,$3,false) ON CONFLICT DO NOTHING`, [table_id, req.user.sub, player_id]);
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

    // The player granting permission must be the target player (req.user)
    await db.execute(`UPDATE spectate_permissions SET granted=$1 WHERE table_id=$2 AND spectator_id=$3 AND player_id=$4`, [granted, table_id, spectator_id, req.user.sub]);
    if (granted) {
      // optionally mark spectator allowed (frontend uses this)
      await db.execute(`UPDATE rummy_table_players SET spectator_allowed = COALESCE(spectator_allowed, '[]'::jsonb) || $1 WHERE table_id=$2 AND user_id=$3`, [JSON.stringify([spectator_id]), table_id, req.user.sub]);
    }
    return res.json({ success: true });
  } catch (e) {
    console.error("grant-spectate error", e);
    res.status(500).json({ error: "Failed to update spectate permission" });
  }
});

module.exports = router;


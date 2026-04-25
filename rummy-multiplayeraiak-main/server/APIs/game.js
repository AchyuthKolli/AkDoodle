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
const wildMode = require("./wildJokerMode");
const loserMode = require("./loserScoringMode");
const INVALID_DECLARE_PENALTY = 20;
const STRICT_DECLARE_ARRANGE_MS = 30000;

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

/**
 * After total_points change: anyone at/above disqualify_score is disqualified and moved to spectator.
 * If fewer than two active competitors remain (not spectator, not disqualified), table status becomes finished
 * (remaining single player is match winner in a 2-player game).
 */
async function applyDisqualificationAndMaybeFinishTable(req, table_id) {
  const tbl = await db.fetchrow(
    `SELECT id, disqualify_score, status FROM rummy_tables WHERE id=$1`,
    [table_id]
  );
  if (!tbl) {
    return { disqualified_user_ids: [], table_finished: false, champion_user_id: null };
  }
  if (tbl.status === "finished") {
    return { disqualified_user_ids: [], table_finished: true, champion_user_id: null };
  }

  const limitParsed = parseInt(tbl.disqualify_score, 10);
  const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : 200;

  const rows = await db.fetch(
    `SELECT user_id, total_points, disqualified FROM rummy_table_players WHERE table_id=$1 ORDER BY seat ASC`,
    [table_id]
  );

  const newlyDisqualified = [];
  for (const p of rows) {
    if (p.disqualified) continue;
    const total = parseInt(p.total_points || 0, 10);
    if (total >= limit) {
      const uid = normId(p.user_id);
      await db.execute(
        `UPDATE rummy_table_players
         SET disqualified = true, is_spectator = true, spectator_allowed='[]'::jsonb, eliminated_at = COALESCE(eliminated_at, now())
         WHERE table_id=$1 AND user_id=$2`,
        [table_id, uid]
      );
      newlyDisqualified.push(uid);
      nspEmit(req, table_id, "player.disqualified", { user_id: uid, total_points: total, limit });
    }
  }

  const competitors = await db.fetch(
    `SELECT user_id FROM rummy_table_players WHERE table_id=$1 AND disqualified = false AND is_spectator = false ORDER BY seat ASC`,
    [table_id]
  );
  const competitorIds = competitors.map((r) => normId(r.user_id));

  if (competitorIds.length < 2) {
    await db.execute(`UPDATE rummy_tables SET status = 'finished', updated_at = now() WHERE id = $1`, [table_id]);
    const champion = competitorIds.length === 1 ? competitorIds[0] : null;
    nspEmit(req, table_id, "table.finished", { champion_user_id: champion, reason: "disqualification_or_elimination" });
    return {
      disqualified_user_ids: newlyDisqualified,
      table_finished: true,
      champion_user_id: champion,
    };
  }

  return { disqualified_user_ids: newlyDisqualified, table_finished: false, champion_user_id: null };
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
  wildJokerRevealedForLayout = null,
  snapshot,
  loserDeadwoodMode = null,
}) {
  const uid = normId(userId);
  const declarer = declarerUserId ? normId(declarerUserId) : null;
  const groups = Array.isArray(declarationGroups) ? declarationGroups : [];
  const isDeclarer = declarer && uid === declarer;
  const layoutReveal =
    wildJokerRevealedForLayout !== undefined && wildJokerRevealedForLayout !== null
      ? wildJokerRevealedForLayout
      : wildJokerRevealed;
  const normLoserMode = loserDeadwoodMode != null ? loserMode.normalizeLoserMode(loserDeadwoodMode) : null;

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
    const classified = classifyDeclaredGroups(groups, wildJokerRank, layoutReveal);
    const leftover = extractLeftoverFromHand(hand, groups);
    const meld1 = groups[0] || [];
    const meld2 = groups[1] || [];
    const meld3 = groups[2] || [];
    const meld4 = groups[3] || [];
    const slot_kind = [meld1, meld2, meld3, meld4].map((g) =>
      g.length ? classifySingleGroup(g, wildJokerRank, layoutReveal) : null
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

  if (
    !isDeclarer &&
    !isSpectator &&
    normLoserMode === "auto_optimal" &&
    Array.isArray(hand) &&
    hand.length === 13 &&
    scoring.findBestValidDeclareLayout
  ) {
    const best = scoring.findBestValidDeclareLayout(hand, wildJokerRank, layoutReveal);
    if (best) {
      const slots = [best.meld1, best.meld2, best.meld3, best.meld4];
      const classified = classifyDeclaredGroups(
        slots.filter((g) => g && g.length),
        wildJokerRank,
        layoutReveal
      );
      const slot_kind = slots.map((g) =>
        g && g.length ? classifySingleGroup(g, wildJokerRank, layoutReveal) : null
      );
      return {
        ...classified,
        meld1: best.meld1,
        meld2: best.meld2,
        meld3: best.meld3,
        meld4: best.meld4,
        deadwood: [],
        hand_remainder: [],
        ungrouped: [],
        slot_kind,
      };
    }
  }

  const snapLayout = buildFromSnapshotLayout(hand || [], snapshot, wildJokerRank, layoutReveal);
  if (snapLayout) return snapLayout;

  const auto = scoring.organizeHandByMelds(hand || [], wildJokerRank, layoutReveal);
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

/** Preserve slot indices (null holes) so spectators see cards in the correct meld slots. */
function sanitizeMeldSlotForSnapshot(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => {
    if (!c || typeof c !== "object" || !c.rank) return null;
    return { rank: String(c.rank), suit: c.suit || null, joker: !!c.joker };
  });
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
    if (c == null) continue;
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
  const anyPlaced =
    slots.some((s) => s.some((c) => c && c.rank)) || leftover.some((c) => c && c.rank);
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

  const slot_kind = slots.map((g) => {
    const cards = g.filter((c) => c && c.rank);
    return cards.length ? classifySingleGroup(cards, wildJokerRank, wildJokerRevealed) : null;
  });
  const classified = classifyDeclaredGroups(
    slots.map((g) => g.filter((c) => c && c.rank)).filter((g) => g.length > 0),
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
      `SELECT p.user_id, p.display_name, p.seat, p.is_spectator, p.spectator_allowed, p.total_points, p.disqualified, rp.avatar_url as profile_image_url 
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

    let champion_user_id = null;
    if (tbl.status === "finished") {
      const survivors = (players || []).filter((p) => !p.disqualified && !p.is_spectator);
      if (survivors.length === 1) champion_user_id = normId(survivors[0].user_id);
    }

    return res.json({
      ...tbl,
      players,
      champion_user_id,
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
    const loserModeNormalized = loserMode.normalizeLoserMode(loser_deadwood_mode);
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
      [table_id, code, req.user.sub, max_players, disqualify_score, wild_joker_mode, ace_value, loserModeNormalized, faceCardMode]
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
      `SELECT user_id FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false ORDER BY seat`,
      [table_id]
    );
    if (players.length < 2)
      return res.status(400).json({ error: "Need 2 players minimum" });
    const requiredSeats = Number(tbl.max_players || 2);
    if (players.length < requiredSeats) {
      return res.status(400).json({
        error: `All seats must be filled to start (${players.length}/${requiredSeats} joined).`,
      });
    }

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
    let rnd = await db.fetchrow(
      `SELECT id, number, printed_joker, wild_joker_rank, stock, discard, hands, active_user_id, finished_at, game_mode, players_with_first_sequence, post_declare_pending, meld_snapshots
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

    // Safety net: if strict arrangement deadline already elapsed, finalize now so clients never stay stuck at 0s.
    const pendingForAutoFinalize = parsePostDeclarePending(rnd.post_declare_pending);
    if (pendingForAutoFinalize && !rnd.finished_at) {
      const deadlineMs = getPendingDeadlineMs(pendingForAutoFinalize);
      if (!Number.isFinite(deadlineMs) || Date.now() >= deadlineMs) {
        await finalizeStrictDeclareRound(req.app, table_id, rnd.id);
        const refreshed = await db.fetchrow(
          `SELECT id, number, printed_joker, wild_joker_rank, stock, discard, hands, active_user_id, finished_at, game_mode, players_with_first_sequence, post_declare_pending, meld_snapshots
           FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
          [table_id]
        );
        if (refreshed) rnd = refreshed;
      }
    }

    const hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    const myPlayer = await db.fetchrow(
      `SELECT is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );

    let meld_snapshots_raw = rnd.meld_snapshots;
    if (typeof meld_snapshots_raw === "string") {
      try {
        meld_snapshots_raw = JSON.parse(meld_snapshots_raw);
      } catch {
        meld_snapshots_raw = {};
      }
    }
    const meld_snapshots = normalizeKeyedJson(meld_snapshots_raw || {});

    let effectiveUserId = req.user.sub;
    let spectating_user_id = null;
    if (myPlayer?.is_spectator) {
      const allowed = await db.fetchrow(
        `SELECT player_id
         FROM spectate_permissions
         WHERE table_id=$1 AND spectator_id=$2 AND granted=true
         ORDER BY created_at DESC
         LIMIT 1`,
        [table_id, req.user.sub]
      );
      if (allowed?.player_id) {
        effectiveUserId = allowed.player_id;
        spectating_user_id = allowed.player_id;
      }
    }
    const myHand = hands[effectiveUserId] || [];

    let followed_meld_snapshot = null;
    let spectate_all_snapshots = null;
    if (myPlayer?.is_spectator && spectating_user_id) {
      const sid = normId(spectating_user_id);
      followed_meld_snapshot = meld_snapshots[sid] || null;
      spectate_all_snapshots = {};
      for (const uid of Object.keys(hands)) {
        const n = normId(uid);
        spectate_all_snapshots[n] = meld_snapshots[n] || null;
      }
    }

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

    const wildRevealSubject = spectating_user_id ? normId(spectating_user_id) : normId(req.user.sub);
    const wild_joker_revealed = wildMode.isWildJokerRevealedForPlayer(
      rnd.game_mode,
      rnd.wild_joker_rank,
      rnd.players_with_first_sequence,
      wildRevealSubject
    );
    const players_with_first_sequence = wildMode.parseSequenceList(rnd.players_with_first_sequence);

    const pendingMe = parsePostDeclarePending(rnd.post_declare_pending);
    let strict_declare_arrangement = null;
    if (pendingMe && !rnd.finished_at) {
      const deadlineMs = getPendingDeadlineMs(pendingMe);
      const decRow = await db.fetchrow(
        `SELECT display_name FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
        [table_id, pendingMe.declarer_user_id]
      );
      strict_declare_arrangement = {
        declarer_user_id: normId(pendingMe.declarer_user_id),
        declarer_name: decRow?.display_name || "Player",
        expires_at: Number.isFinite(deadlineMs) ? new Date(deadlineMs).toISOString() : null,
        loser_user_ids: (pendingMe.loser_user_ids || []).map(normId),
        done_user_ids: (pendingMe.done_user_ids || []).map(normId),
        invalid_declaration: pendingMe.declare_valid === false,
      };
    }

    return res.json({
      table_id,
      round_number: rnd.number,
      hand: handView,
      stock_count: stock.length,
      discard_top,
      wild_joker_revealed,
      wild_joker_rank: rnd.wild_joker_rank || null,
      players_with_first_sequence,
      spectating_user_id,
      followed_meld_snapshot,
      spectate_all_snapshots,
      finished_at: rnd.finished_at ? new Date(rnd.finished_at).toISOString() : null,
      active_user_id: rnd.active_user_id || null,
      strict_declare_arrangement,
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

    const tbl = await db.fetchrow(`SELECT wild_joker_mode FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!tbl) return res.status(404).json({ error: "Table not found" });
    if (!wildMode.isRevealActionAllowed(tbl.wild_joker_mode)) {
      return res.status(400).json({ success: false, message: "Lock & Reveal is available only in closed wildcard mode" });
    }

    // Fetch latest round
    const rnd = await db.fetchrow(
      `SELECT id, wild_joker_rank, players_with_first_sequence, post_declare_pending
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No active round" });
    if (parsePostDeclarePending(rnd.post_declare_pending)) {
      return res.status(400).json({ success: false, message: "Cannot lock sequence while the round is settling a declaration." });
    }

    // normalize players_with_first_sequence
    const players_with_first_sequence = wildMode.parseSequenceList(rnd.players_with_first_sequence);

    // if player already revealed
    if (players_with_first_sequence.includes(req.user.sub)) {
      return res.json({ success: false, message: "You already revealed the wild joker", wild_joker_revealed: false });
    }

    // Pure sequence can be 3 or 4 cards for lock/reveal.
    if (!Array.isArray(meld) || (meld.length !== 3 && meld.length !== 4)) {
      return res.status(400).json({ success: false, message: "Use a pure sequence of 3 or 4 cards to lock" });
    }

    if (scoring && typeof scoring.isPureSequence === "function") {
      const pure = !!scoring.isPureSequence(meld, rnd.wild_joker_rank || null, false);
      if (!pure) {
        return res.status(400).json({ success: false, message: "Selected cards are not a pure sequence" });
      }
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
      message: "Pure sequence locked. Wild joker revealed.",
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
      `SELECT is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );
    if (!membership) return res.status(403).json({ error: "Not a member of this table" });
    if (membership.is_spectator) {
      return res.status(403).json({ error: "Spectators are view-only; meld snapshots are saved by active players." });
    }

    const rnd = await db.fetchrow(
      `SELECT id, hands, finished_at, meld_snapshots, post_declare_pending FROM rummy_rounds WHERE table_id=$1 AND finished_at IS NULL ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(400).json({ error: "No active round" });

    const pendingSnap = parsePostDeclarePending(rnd.post_declare_pending);
    if (pendingSnap && pendingSnap.declarer_user_id && normId(pendingSnap.declarer_user_id) === normId(req.user.sub)) {
      return res.status(400).json({ error: "The declarer cannot update melds during the loser arrangement window." });
    }
    if (pendingSnap && Array.isArray(pendingSnap.loser_user_ids)) {
      const losers = pendingSnap.loser_user_ids.map(normId);
      if (!losers.includes(normId(req.user.sub))) {
        return res.status(400).json({ error: "Only losers may arrange melds during the strict countdown." });
      }
    }

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

    const placed = [...s1, ...s2, ...s3, ...s4, ...slo].filter(Boolean);
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
         SELECT id, number, stock, hands, discard, active_user_id, finished_at, post_declare_pending
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1
       )
       SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.finished_at, r.post_declare_pending
       FROM table_check t LEFT JOIN round_data r ON true
      `,
      [table_id, req.user.sub]
    );

    if (!row || !row.id) return res.status(404).json({ error: "Table not found" });
    if (row.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    if (!row.is_member) return res.status(403).json({ error: "Not part of the table" });
    if (!row.round_id) return res.status(404).json({ error: "No active round" });
    if (parsePostDeclarePending(row.post_declare_pending)) {
      return res.status(400).json({ error: "Round is settling after a declaration. Please wait." });
    }
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
         SELECT id, number, stock, hands, discard, active_user_id, finished_at, post_declare_pending
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1
       )
       SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.finished_at, r.post_declare_pending
       FROM table_check t LEFT JOIN round_data r ON true
      `,
      [table_id, req.user.sub]
    );

    if (!row || !row.id) return res.status(404).json({ error: "Table not found" });
    if (row.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    if (!row.is_member) return res.status(403).json({ error: "Not part of the table" });
    if (!row.round_id) return res.status(404).json({ error: "No active round" });
    if (parsePostDeclarePending(row.post_declare_pending)) {
      return res.status(400).json({ error: "Round is settling after a declaration. Please wait." });
    }
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
         SELECT id, number, stock, hands, discard, active_user_id, post_declare_pending
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1
       ), seat_order AS (
         SELECT user_id, seat FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false ORDER BY seat ASC
       )
       SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.post_declare_pending, json_agg(s.user_id ORDER BY s.seat) AS user_order
       FROM table_check t LEFT JOIN round_data r ON true LEFT JOIN seat_order s ON true
       GROUP BY t.id, t.status, t.is_member, r.id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.post_declare_pending
      `,
      [table_id, req.user.sub]
    );

    if (!row || !row.id) return res.status(404).json({ error: "Table not found" });
    if (row.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    if (!row.is_member) return res.status(403).json({ error: "Not part of the table" });
    if (!row.round_id) return res.status(404).json({ error: "No active round" });
    if (parsePostDeclarePending(row.post_declare_pending)) {
      return res.status(400).json({ error: "Round is settling after a declaration. Please wait." });
    }
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

function parsePostDeclarePending(raw) {
  if (raw == null || raw === "") return null;
  let o = raw;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  if (!o.declarer_user_id) return null;
  return o;
}

function getPendingDeadlineMs(pending) {
  const direct = Number(pending?.deadline_ms);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromIso = Date.parse(pending?.expires_at || "");
  if (Number.isFinite(fromIso) && fromIso > 0) return fromIso;
  return NaN;
}

async function finishValidDeclaredRoundCore(
  table_id,
  rnd,
  sub,
  hands,
  tablePlayers,
  spectatorMap,
  meld_snapshots,
  groups,
  loserDeadwoodMode
) {
  const wild_joker_rank = rnd.wild_joker_rank || null;
  const ace_value = rnd.ace_value || 10;
  const face_card_mode = String(rnd.face_card_mode || "ten").toLowerCase() === "rank" ? "rank" : "ten";

  const scores = {};
  scores[sub] = 0;
  for (const p of tablePlayers) {
    const uid = normId(p.user_id);
    if (uid === sub) continue;
    if (spectatorMap[uid]) {
      scores[uid] = 0;
    } else {
      const oppHand = hands[uid] || [];
      let pts = 0;
      const oppWildRevealed = wildMode.isWildJokerRevealedForPlayer(
        rnd.game_mode,
        wild_joker_rank,
        rnd.players_with_first_sequence,
        uid
      );
      if (scoring && typeof scoring.calculateLoserDeadwoodPoints === "function") {
        const snapUid = meld_snapshots[uid] || null;
        pts = scoring.calculateLoserDeadwoodPoints(
          oppHand,
          loserDeadwoodMode,
          snapUid,
          wild_joker_rank,
          oppWildRevealed,
          ace_value,
          face_card_mode
        );
      } else if (scoring && typeof scoring.calculateUngroupedDeadwoodPoints === "function") {
        pts = scoring.calculateUngroupedDeadwoodPoints(oppHand, wild_joker_rank, oppWildRevealed, ace_value, face_card_mode);
      } else if (scoring && typeof scoring.calculateDeadwoodPoints === "function") {
        pts = scoring.calculateDeadwoodPoints(oppHand, wild_joker_rank, oppWildRevealed, ace_value, face_card_mode);
      } else {
        pts = oppHand.reduce((s, c) => s + cardValueForScoring(c, ace_value, face_card_mode), 0);
      }
      scores[uid] = Math.min(pts, 80);
    }
  }

  const wild_joker_revealed = wildMode.isWildJokerRevealedGlobally(
    rnd.game_mode,
    wild_joker_rank,
    rnd.players_with_first_sequence
  );

  const declarationGroups = Array.isArray(groups) && groups.length > 0 ? groups : [];
  const organizedMelds = {};
  for (const p of tablePlayers) {
    const uid = normId(p.user_id);
    if (!Object.prototype.hasOwnProperty.call(hands, uid)) continue;
    const uidWild = wildMode.isWildJokerRevealedForPlayer(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence,
      uid
    );
    organizedMelds[uid] = buildOrganizedScoreboardForUser({
      userId: uid,
      declarerUserId: sub,
      hand: hands[uid] || [],
      declarationGroups,
      isSpectator: !!spectatorMap[uid],
      wildJokerRank: wild_joker_rank,
      wildJokerRevealed: wild_joker_revealed,
      wildJokerRevealedForLayout: uidWild,
      snapshot: meld_snapshots[uid] || null,
      loserDeadwoodMode,
    });
  }
  for (const uid of Object.keys(hands)) {
    const n = normId(uid);
    if (organizedMelds[n]) continue;
    const uidWild = wildMode.isWildJokerRevealedForPlayer(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence,
      n
    );
    organizedMelds[n] = buildOrganizedScoreboardForUser({
      userId: n,
      declarerUserId: sub,
      hand: hands[n] || [],
      declarationGroups,
      isSpectator: !!spectatorMap[n],
      wildJokerRank: wild_joker_rank,
      wildJokerRevealed: wild_joker_revealed,
      wildJokerRevealedForLayout: uidWild,
      snapshot: meld_snapshots[n] || null,
      loserDeadwoodMode,
    });
  }

  const declarationPayload = {
    groups: declarationGroups,
    valid: true,
    revealed_hands: hands,
    organized_melds: organizedMelds,
  };

  const scoresForDb = {};
  for (const [k, v] of Object.entries(scores)) scoresForDb[normId(k)] = v;

  return { scores, scoresForDb, declarationPayload };
}

/** After strict-mode arrangement when the original declare was invalid (declarer penalized; others score 0). */
async function finishInvalidStrictDeclaredRoundCore(
  table_id,
  rnd,
  sub,
  hands,
  tablePlayers,
  spectatorMap,
  meld_snapshots,
  groups,
  _loserDeadwoodMode
) {
  const wild_joker_rank = rnd.wild_joker_rank || null;

  const scores = {};
  scores[sub] = INVALID_DECLARE_PENALTY;
  for (const p of tablePlayers) {
    const uid = normId(p.user_id);
    if (uid === sub) continue;
    scores[uid] = 0;
  }

  const wild_joker_revealed = wildMode.isWildJokerRevealedGlobally(
    rnd.game_mode,
    wild_joker_rank,
    rnd.players_with_first_sequence
  );

  const declarationGroups = Array.isArray(groups) && groups.length > 0 ? groups : [];
  const organizedMelds = {};
  for (const p of tablePlayers) {
    const uid = normId(p.user_id);
    if (!Object.prototype.hasOwnProperty.call(hands, uid)) continue;
    const uidWild = wildMode.isWildJokerRevealedForPlayer(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence,
      uid
    );
    organizedMelds[uid] = buildOrganizedScoreboardForUser({
      userId: uid,
      declarerUserId: sub,
      hand: hands[uid] || [],
      declarationGroups,
      isSpectator: !!spectatorMap[uid],
      wildJokerRank: wild_joker_rank,
      wildJokerRevealed: wild_joker_revealed,
      wildJokerRevealedForLayout: uidWild,
      snapshot: meld_snapshots[uid] || null,
      loserDeadwoodMode,
    });
  }
  for (const uid of Object.keys(hands)) {
    const n = normId(uid);
    if (organizedMelds[n]) continue;
    const uidWild = wildMode.isWildJokerRevealedForPlayer(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence,
      n
    );
    organizedMelds[n] = buildOrganizedScoreboardForUser({
      userId: n,
      declarerUserId: sub,
      hand: hands[n] || [],
      declarationGroups,
      isSpectator: !!spectatorMap[n],
      wildJokerRank: wild_joker_rank,
      wildJokerRevealed: wild_joker_revealed,
      wildJokerRevealedForLayout: uidWild,
      snapshot: meld_snapshots[n] || null,
      loserDeadwoodMode,
    });
  }

  const declarationPayload = {
    groups: declarationGroups,
    valid: false,
    revealed_hands: hands,
    organized_melds: organizedMelds,
  };

  const scoresForDb = {};
  for (const [k, v] of Object.entries(scores)) scoresForDb[normId(k)] = v;

  return { scores, scoresForDb, declarationPayload };
}

async function finalizeStrictDeclareRound(app, table_id, round_id) {
  const fakeReq = { app };
  try {
    const rnd = await db.fetchrow(
      `SELECT id, number, hands, meld_snapshots, wild_joker_rank, players_with_first_sequence, ace_value, face_card_mode, game_mode,
              finished_at, post_declare_pending
       FROM rummy_rounds WHERE id=$1`,
      [round_id]
    );
    if (!rnd || rnd.finished_at) return;
    const pending = parsePostDeclarePending(rnd.post_declare_pending);
    if (!pending) return;

    const sub = normId(pending.declarer_user_id);
    const groups = pending.declaration_groups || [];

    const table = await db.fetchrow(`SELECT loser_deadwood_mode FROM rummy_tables WHERE id=$1`, [table_id]);
    const loserDeadwoodMode = loserMode.normalizeLoserMode(table && table.loser_deadwood_mode);

    let hands = typeof rnd.hands === "string" ? JSON.parse(rnd.hands) : (rnd.hands || {});
    hands = normalizeKeyedJson(hands);
    let meld_snapshots_raw = rnd.meld_snapshots;
    if (typeof meld_snapshots_raw === "string") {
      try {
        meld_snapshots_raw = JSON.parse(meld_snapshots_raw);
      } catch {
        meld_snapshots_raw = {};
      }
    }
    const meld_snapshots = normalizeKeyedJson(meld_snapshots_raw || {});

    const tablePlayers = await db.fetch(
      `SELECT user_id, is_spectator FROM rummy_table_players WHERE table_id=$1 ORDER BY seat ASC`,
      [table_id]
    );
    const spectatorMap = {};
    for (const p of tablePlayers) spectatorMap[normId(p.user_id)] = p.is_spectator;

    const declareValid = pending.declare_valid !== false;
    const pack = declareValid
      ? await finishValidDeclaredRoundCore(
          table_id,
          rnd,
          sub,
          hands,
          tablePlayers,
          spectatorMap,
          meld_snapshots,
          groups,
          loserDeadwoodMode
        )
      : await finishInvalidStrictDeclaredRoundCore(
          table_id,
          rnd,
          sub,
          hands,
          tablePlayers,
          spectatorMap,
          meld_snapshots,
          groups,
          loserDeadwoodMode
        );
    const { scores, scoresForDb, declarationPayload } = pack;

    const updated = await db.fetchrow(
      `UPDATE rummy_rounds SET post_declare_pending=NULL, winner_user_id=$1, scores=$2::jsonb,
         declarations = COALESCE(declarations, '{}'::jsonb) || $3::jsonb, finished_at=now(), updated_at=now(), points_accumulated = true
       WHERE id=$4 AND post_declare_pending IS NOT NULL
       RETURNING id`,
      [declareValid ? sub : null, JSON.stringify(scoresForDb), JSON.stringify({ [sub]: declarationPayload }), round_id]
    );
    if (!updated) return;

    for (const [uid, pts] of Object.entries(scores)) {
      const n = normId(uid);
      if (!spectatorMap[n]) {
        await db.execute(
          `UPDATE rummy_table_players SET total_points = COALESCE(total_points,0) + $1 WHERE table_id=$2 AND user_id=$3`,
          [pts, table_id, n]
        );
      }
    }

    await db.execute(`UPDATE rummy_tables SET status='playing', updated_at=now() WHERE id=$1`, [table_id]);

    const dqResult = await applyDisqualificationAndMaybeFinishTable(fakeReq, table_id);

    nspEmit(fakeReq, table_id, "game_update", { table_id });
    nspEmit(fakeReq, table_id, "round.declare", {
      declared_by: sub,
      result: {
        valid: declareValid,
        scores: scoresForDb,
        table_finished: dqResult.table_finished,
        champion_user_id: dqResult.champion_user_id,
        disqualified_user_ids: dqResult.disqualified_user_ids,
      },
    });
  } catch (e) {
    console.error("finalizeStrictDeclareRound", e);
  }
}

// POST /declare
router.post("/declare", requireAuth, async (req, res) => {
  try {
    const { table_id, groups } = req.body;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    // Basic table & round fetch + membership check
    const rnd = await db.fetchrow(
      `SELECT id, number, hands, discard, wild_joker_rank, players_with_first_sequence, ace_value, face_card_mode, game_mode, meld_snapshots, post_declare_pending, finished_at
       FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No active round" });
    if (parsePostDeclarePending(rnd.post_declare_pending)) {
      return res.status(400).json({ error: "This round is waiting for losers to arrange melds (strict mode)." });
    }

    // ensure requester is active player (optional)
    const table = await db.fetchrow(`SELECT status, loser_deadwood_mode FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table || table.status !== "playing") return res.status(400).json({ error: "Game not in playing state" });
    const loserDeadwoodMode = loserMode.normalizeLoserMode(table.loser_deadwood_mode);

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
    const wild_joker_revealed = wildMode.isWildJokerRevealedGlobally(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence
    );
    const declarer_wild_joker_revealed = wildMode.isWildJokerRevealedForPlayer(
      rnd.game_mode,
      wild_joker_rank,
      rnd.players_with_first_sequence,
      sub
    );

    // Validate groups if provided
    let isValidDeclaration = false;
    let validationReason = "";
    let scores = {};

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
        ? scoring.validateHand(groups, [], wild_joker_rank, declarer_wild_joker_revealed)
        : { valid: false, reason: "Validator unavailable" };
      isValidDeclaration = !!validation.valid;
      validationReason = validation?.reason || "";

      if (!isValidDeclaration) {
        const declarer_pts = INVALID_DECLARE_PENALTY;
        for (const p of tablePlayers) {
          const uid = normId(p.user_id);
          if (uid === sub) scores[uid] = declarer_pts;
          else if (spectatorMap[uid]) scores[uid] = 0;
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

    let declarationPayload;
    let scoresForDb = {};

    if (isValidDeclaration) {
      const core = await finishValidDeclaredRoundCore(
        table_id,
        rnd,
        sub,
        hands,
        tablePlayers,
        spectatorMap,
        meld_snapshots,
        groups,
        loserDeadwoodMode
      );
      scores = core.scores;
      scoresForDb = core.scoresForDb;
      declarationPayload = core.declarationPayload;

      if (
        loserMode.isStrictLoserMode(loserDeadwoodMode) &&
        tablePlayers.some((p) => {
          const uid = normId(p.user_id);
          return !spectatorMap[uid] && uid !== sub;
        })
      ) {
        const loser_user_ids = tablePlayers
          .filter((p) => !spectatorMap[normId(p.user_id)] && normId(p.user_id) !== sub)
          .map((p) => normId(p.user_id));
        const deadlineMs = Date.now() + STRICT_DECLARE_ARRANGE_MS;
        const pending = {
          declarer_user_id: sub,
          declaration_groups: groups,
          loser_user_ids,
          done_user_ids: [],
          deadline_ms: deadlineMs,
        };
        await db.execute(`UPDATE rummy_rounds SET post_declare_pending=$1::jsonb, updated_at=now() WHERE id=$2`, [
          JSON.stringify(pending),
          rnd.id,
        ]);

        const decRow = await db.fetchrow(
          `SELECT display_name FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
          [table_id, sub]
        );
        const declarer_name = decRow?.display_name || "Player";

        const dqEmpty = { disqualified_user_ids: [], table_finished: false, champion_user_id: null };
        const responseData = {
          table_id,
          round_number: rnd.number,
          declared_by: sub,
          valid: true,
          status: "valid",
          arrangement_pending: true,
          expires_at: new Date(deadlineMs).toISOString(),
          loser_user_ids,
          declarer_name,
          message: `${declarer_name} declared. Losers have ${STRICT_DECLARE_ARRANGE_MS / 1000} seconds to arrange melds for scoring.`,
          scores: {},
          disqualified_user_ids: dqEmpty.disqualified_user_ids,
          table_finished: dqEmpty.table_finished,
          champion_user_id: dqEmpty.champion_user_id,
        };

        res.json(responseData);
        nspEmit(req, table_id, "game_update", { table_id });
        nspEmit(req, table_id, "declare.arrangement_started", {
          table_id,
          round_number: rnd.number,
          declarer_user_id: sub,
          declarer_name,
          expires_at: responseData.expires_at,
          loser_user_ids,
        });
        const app = req.app;
        setTimeout(() => {
          finalizeStrictDeclareRound(app, table_id, rnd.id).catch((err) => console.error(err));
        }, STRICT_DECLARE_ARRANGE_MS);
        return;
      }
    } else {
      const loser_user_ids_invalid = tablePlayers
        .filter((p) => !spectatorMap[normId(p.user_id)] && normId(p.user_id) !== sub)
        .map((p) => normId(p.user_id));

      if (loserMode.isStrictLoserMode(loserDeadwoodMode) && loser_user_ids_invalid.length > 0) {
        const declarationGroupsPending = Array.isArray(groups) && groups.length > 0 ? groups : [];
        const deadlineMs = Date.now() + STRICT_DECLARE_ARRANGE_MS;
        const pendingInvalid = {
          declarer_user_id: sub,
          declaration_groups: declarationGroupsPending,
          loser_user_ids: loser_user_ids_invalid,
          done_user_ids: [],
          deadline_ms: deadlineMs,
          declare_valid: false,
        };
        await db.execute(`UPDATE rummy_rounds SET post_declare_pending=$1::jsonb, updated_at=now() WHERE id=$2`, [
          JSON.stringify(pendingInvalid),
          rnd.id,
        ]);

        const decRowInv = await db.fetchrow(
          `SELECT display_name FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
          [table_id, sub]
        );
        const declarer_name_inv = decRowInv?.display_name || "Player";

        const dqEmptyInv = { disqualified_user_ids: [], table_finished: false, champion_user_id: null };
        const responseDataInv = {
          table_id,
          round_number: rnd.number,
          declared_by: sub,
          valid: false,
          status: "invalid_arrangement_pending",
          arrangement_pending: true,
          expires_at: new Date(deadlineMs).toISOString(),
          loser_user_ids: loser_user_ids_invalid,
          declarer_name: declarer_name_inv,
          message: `That declaration is not valid. Other players have ${STRICT_DECLARE_ARRANGE_MS / 1000} seconds to confirm (strict mode). They score 0 for this round; only the declarer takes the ${INVALID_DECLARE_PENALTY}-point penalty.`,
          scores: {},
          disqualified_user_ids: dqEmptyInv.disqualified_user_ids,
          table_finished: dqEmptyInv.table_finished,
          champion_user_id: dqEmptyInv.champion_user_id,
        };

        res.json(responseDataInv);
        nspEmit(req, table_id, "game_update", { table_id });
        nspEmit(req, table_id, "declare.arrangement_started", {
          table_id,
          round_number: rnd.number,
          declarer_user_id: sub,
          declarer_name: declarer_name_inv,
          expires_at: responseDataInv.expires_at,
          loser_user_ids: loser_user_ids_invalid,
          invalid_declaration: true,
        });
        const appInv = req.app;
        setTimeout(() => {
          finalizeStrictDeclareRound(appInv, table_id, rnd.id).catch((err) => console.error(err));
        }, STRICT_DECLARE_ARRANGE_MS);
        return;
      }

      const declarationGroups = Array.isArray(groups) && groups.length > 0 ? groups : [];
      const organizedMelds = {};
      for (const p of tablePlayers) {
        const uid = normId(p.user_id);
        if (!Object.prototype.hasOwnProperty.call(hands, uid)) continue;
        const uidWild = wildMode.isWildJokerRevealedForPlayer(
          rnd.game_mode,
          wild_joker_rank,
          rnd.players_with_first_sequence,
          uid
        );
        organizedMelds[uid] = buildOrganizedScoreboardForUser({
          userId: uid,
          declarerUserId: sub,
          hand: hands[uid] || [],
          declarationGroups,
          isSpectator: !!spectatorMap[uid],
          wildJokerRank: wild_joker_rank,
          wildJokerRevealed: wild_joker_revealed,
          wildJokerRevealedForLayout: uidWild,
          snapshot: meld_snapshots[uid] || null,
          loserDeadwoodMode,
        });
      }
      for (const uid of Object.keys(hands)) {
        const n = normId(uid);
        if (organizedMelds[n]) continue;
        const uidWild = wildMode.isWildJokerRevealedForPlayer(
          rnd.game_mode,
          wild_joker_rank,
          rnd.players_with_first_sequence,
          n
        );
        organizedMelds[n] = buildOrganizedScoreboardForUser({
          userId: n,
          declarerUserId: sub,
          hand: hands[n] || [],
          declarationGroups,
          isSpectator: !!spectatorMap[n],
          wildJokerRank: wild_joker_rank,
          wildJokerRevealed: wild_joker_revealed,
          wildJokerRevealedForLayout: uidWild,
          snapshot: meld_snapshots[n] || null,
          loserDeadwoodMode,
        });
      }

      declarationPayload = {
        groups: declarationGroups,
        valid: false,
        revealed_hands: hands,
        organized_melds: organizedMelds,
      };
      for (const [k, v] of Object.entries(scores)) scoresForDb[normId(k)] = v;
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

    await db.execute(
      `UPDATE rummy_rounds SET winner_user_id=$1, scores=$2::jsonb, declarations = COALESCE(declarations, '{}'::jsonb) || $3::jsonb, finished_at=now(), updated_at=now(), points_accumulated = true
       WHERE id=$4`,
      [isValidDeclaration ? sub : null, JSON.stringify(scoresForDb), JSON.stringify({ [sub]: declarationPayload }), rnd.id]
    );

    // Also update table status to round_complete
    await db.execute(`UPDATE rummy_tables SET status='playing' WHERE id=$1`, [table_id]); // keep playing flag; front-end expects finished_at to mark end

    const dqResult = await applyDisqualificationAndMaybeFinishTable(req, table_id);

    const responseData = {
      table_id,
      round_number: rnd.number,
      declared_by: sub,
      valid: isValidDeclaration,
      status: isValidDeclaration ? "valid" : "invalid",
      message: isValidDeclaration
        ? "Valid declaration"
        : `Invalid declaration${validationReason ? `: ${validationReason}` : ""}. ${INVALID_DECLARE_PENALTY} penalty points applied.`,
      scores: scoresForDb,
      disqualified_user_ids: dqResult.disqualified_user_ids,
      table_finished: dqResult.table_finished,
      champion_user_id: dqResult.champion_user_id,
    };

    res.json(responseData);

    // 🚀 BROADCAST (must use /rummy namespace so all seated clients receive)
    nspEmit(req, table_id, "game_update", { table_id });
    nspEmit(req, table_id, "round.declare", {
      declared_by: sub,
      result: {
        valid: isValidDeclaration,
        scores: scoresForDb,
        table_finished: dqResult.table_finished,
        champion_user_id: dqResult.champion_user_id,
        disqualified_user_ids: dqResult.disqualified_user_ids,
      }
    });
    return;
  } catch (e) {
    console.error("declare error", e);
    res.status(500).json({ error: "Failed to process declaration" });
  }
});

// POST /round/strict-finalize-if-due — when deadline_ms has passed, close the round (backup if the declare handler's setTimeout never ran).
router.post("/round/strict-finalize-if-due", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body || {};
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const mem = await db.fetchrow(`SELECT 1 FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`, [table_id, req.user.sub]);
    if (!mem) return res.status(403).json({ error: "Not at table" });

    const rnd = await db.fetchrow(
      `SELECT id, finished_at, post_declare_pending FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.json({ ok: true, finalized: false, reason: "no_round" });
    if (rnd.finished_at) return res.json({ ok: true, finalized: false, reason: "already_finished" });

    const pending = parsePostDeclarePending(rnd.post_declare_pending);
    if (!pending) return res.json({ ok: true, finalized: false, reason: "no_pending" });

    const deadline = getPendingDeadlineMs(pending);
    if (!Number.isFinite(deadline)) {
      // Malformed/legacy pending payload: finalize immediately instead of leaving the table stuck.
      await finalizeStrictDeclareRound(req.app, table_id, rnd.id);
      nspEmit(req, table_id, "game_update", { table_id });
      return res.json({ ok: true, finalized: true, reason: "deadline_missing" });
    }
    if (Date.now() < deadline) {
      return res.json({ ok: true, finalized: false, reason: "not_due", deadline_ms: deadline });
    }

    await finalizeStrictDeclareRound(req.app, table_id, rnd.id);
    nspEmit(req, table_id, "game_update", { table_id });
    return res.json({ ok: true, finalized: true });
  } catch (e) {
    console.error("strict-finalize-if-due", e);
    return res.status(500).json({ error: "Finalize failed" });
  }
});

// POST /round/strict-arrange-done — losers tap Done during strict-mode post-declare window
router.post("/round/strict-arrange-done", requireAuth, async (req, res) => {
  try {
    const { table_id } = req.body || {};
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const rnd = await db.fetchrow(
      `SELECT id, post_declare_pending FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
      [table_id]
    );
    if (!rnd) return res.status(404).json({ error: "No round" });
    const pending = parsePostDeclarePending(rnd.post_declare_pending);
    if (!pending) return res.status(400).json({ error: "No active arrangement window" });

    const me = normId(req.user.sub);
    const losers = (pending.loser_user_ids || []).map(normId);
    if (!losers.includes(me)) return res.status(403).json({ error: "Only losers can confirm Done during this window" });

    let done = (pending.done_user_ids || []).map(normId);
    if (!done.includes(me)) done.push(me);
    pending.done_user_ids = done;

    await db.execute(`UPDATE rummy_rounds SET post_declare_pending=$1::jsonb, updated_at=now() WHERE id=$2`, [
      JSON.stringify(pending),
      rnd.id,
    ]);

    nspEmit(req, table_id, "game_update", { table_id });

    const allDone = losers.length > 0 && losers.every((id) => done.includes(id));
    if (allDone) {
      try {
        await finalizeStrictDeclareRound(req.app, table_id, rnd.id);
      } catch (finErr) {
        console.error("finalizeStrictDeclareRound after all_done", finErr);
        return res.status(500).json({ error: "Could not finalize round; please retry or wait for the timer." });
      }
    }

    res.json({ ok: true, done_user_ids: done, all_done: allDone });
  } catch (e) {
    console.error("strict-arrange-done", e);
    res.status(500).json({ error: "Failed to record Done" });
  }
});

// GET /round/revealed-hands
router.get("/round/revealed-hands", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    const requestedRound = Number(req.query.round_number);
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const rnd = Number.isFinite(requestedRound) && requestedRound > 0
      ? await db.fetchrow(
        `SELECT id, number, finished_at, hands, scores, declarations, winner_user_id, wild_joker_rank, game_mode, players_with_first_sequence, meld_snapshots
         FROM rummy_rounds WHERE table_id=$1 AND number=$2 LIMIT 1`,
        [table_id, requestedRound]
      )
      : await db.fetchrow(
        `SELECT id, number, finished_at, hands, scores, declarations, winner_user_id, wild_joker_rank, game_mode, players_with_first_sequence, meld_snapshots
         FROM rummy_rounds WHERE table_id=$1 ORDER BY number DESC LIMIT 1`,
        [table_id]
      );
    if (!rnd) return res.status(404).json({ error: "No round found" });
    if (!rnd.finished_at) return res.status(400).json({ error: "Round not finished" });

    const tblRow = await db.fetchrow(`SELECT loser_deadwood_mode FROM rummy_tables WHERE id=$1`, [table_id]);
    const loserDeadwoodMode = loserMode.normalizeLoserMode(tblRow && tblRow.loser_deadwood_mode);

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
    const wild_joker_revealed = wildMode.isWildJokerRevealedGlobally(
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
      const uidWild = wildMode.isWildJokerRevealedForPlayer(
        rnd.game_mode,
        wildJokerRank,
        rnd.players_with_first_sequence,
        uid
      );
      organized_melds[uid] = buildOrganizedScoreboardForUser({
        userId: uid,
        declarerUserId: declared_by,
        hand: hands[uid] || [],
        declarationGroups,
        isSpectator: spectatorByUser[uid],
        wildJokerRank,
        wildJokerRevealed: wild_joker_revealed,
        wildJokerRevealedForLayout: uidWild,
        snapshot: meldSnapshots[uid] || null,
        loserDeadwoodMode,
      });
    }
    for (const uid of Object.keys(hands)) {
      const n = normId(uid);
      if (organized_melds[n]) continue;
      const uidWild = wildMode.isWildJokerRevealedForPlayer(
        rnd.game_mode,
        wildJokerRank,
        rnd.players_with_first_sequence,
        n
      );
      organized_melds[n] = buildOrganizedScoreboardForUser({
        userId: n,
        declarerUserId: declared_by,
        hand: hands[n] || [],
        declarationGroups,
        isSpectator: !!spectatorByUser[n],
        wildJokerRank,
        wildJokerRevealed: wild_joker_revealed,
        wildJokerRevealedForLayout: uidWild,
        snapshot: meldSnapshots[n] || null,
        loserDeadwoodMode,
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

    const dqAtStart = await applyDisqualificationAndMaybeFinishTable(req, table_id);
    if (dqAtStart.table_finished) {
      return res.status(400).json({
        error: "Match ended — not enough active players for another round.",
        champion_user_id: dqAtStart.champion_user_id,
      });
    }

    // Round-drop spectators return next round; kicked/disqualified spectators remain spectators.
    await db.execute(
      `UPDATE rummy_table_players
       SET is_spectator=false, spectator_allowed='[]'::jsonb
       WHERE table_id=$1 AND disqualified=false AND is_spectator=true AND spectator_allowed @> '["__round_drop__"]'::jsonb`,
      [table_id]
    );

    const activeRows = await db.fetch(
      `SELECT user_id FROM rummy_table_players WHERE table_id=$1 AND disqualified = false AND is_spectator = false ORDER BY seat ASC`,
      [table_id]
    );
    const activePlayers = activeRows.map((r) => r.user_id);

    if (activePlayers.length < 2) {
      await db.execute(`UPDATE rummy_tables SET status='finished', updated_at=now() WHERE id=$1`, [table_id]);
      return res.status(400).json({ error: "Not enough players for next round; table finished" });
    }

    const nextNumber = parseInt(last.number || 0, 10) + 1;

    // Cyclic start player logic: Round 1 -> Seat 1, Round 2 -> Seat 2, etc.
    const startIdx = (nextNumber - 1) % activePlayers.length;
    const startPlayer = activePlayers[startIdx];

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
    await db.execute(
      `UPDATE rummy_table_players
       SET is_spectator=true, spectator_allowed='["__round_drop__"]'::jsonb, total_points = COALESCE(total_points,0) + 20, eliminated_at=now()
       WHERE table_id=$1 AND user_id=$2`,
      [table_id, req.user.sub]
    );

    const dqDrop = await applyDisqualificationAndMaybeFinishTable(req, table_id);
    const responseData = {
      success: true,
      penalty_points: 20,
      table_finished: dqDrop.table_finished,
      champion_user_id: dqDrop.champion_user_id,
      disqualified_user_ids: dqDrop.disqualified_user_ids,
    };
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
      `SELECT COUNT(*)::int AS n FROM rummy_table_players WHERE table_id=$1 AND is_spectator=false AND disqualified=false`,
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
      `UPDATE rummy_table_players
       SET is_spectator=true, spectator_allowed='[]'::jsonb, total_points=COALESCE(total_points,0)+20, eliminated_at=now()
       WHERE table_id=$1 AND user_id=$2`,
      [table_id, target]
    );

    const dqKick = await applyDisqualificationAndMaybeFinishTable(req, table_id);
    res.json({
      success: true,
      kicked_user_id: target,
      penalty_points: 20,
      active_user_id: nextActive,
      table_finished: dqKick.table_finished,
      champion_user_id: dqKick.champion_user_id,
      disqualified_user_ids: dqKick.disqualified_user_ids,
    });

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
    nspEmit(req, table_id, "spectate.requested", {
      spectator_id: normId(req.user.sub),
      player_id: normId(player_id),
    });
    return res.json({ success: true });
  } catch (e) {
    console.error("request-spectate error", e);
    res.status(500).json({ error: "Failed to request spectate" });
  }
});

// POST /game/grant-spectate
router.post("/game/grant-spectate", requireAuth, async (req, res) => {
  try {
    const { table_id, spectator_id, player_id, granted } = req.body;
    if (!table_id || !spectator_id || typeof granted === "undefined") return res.status(400).json({ error: "Invalid request" });

    const table = await db.fetchrow(`SELECT host_user_id FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table) return res.status(404).json({ error: "Table not found" });

    const pending = await db.fetchrow(
      `SELECT table_id, spectator_id, player_id, admin_approved, granted
       FROM spectate_permissions
       WHERE table_id=$1 AND spectator_id=$2 AND ($3::text IS NULL OR player_id=$3)
       ORDER BY created_at DESC LIMIT 1`,
      [table_id, spectator_id, player_id || null]
    );
    if (!pending) return res.status(404).json({ error: "No spectate request found" });

    // Host approval: when host clicks Allow, finish spectate in one step so the spectator
    // immediately gets the target's hand in GET /round/me (which only checks granted=true).
    if (normId(req.user.sub) === normId(table.host_user_id)) {
      const specId = normId(spectator_id);
      const targetPid = normId(pending.player_id);
      if (granted) {
        await db.execute(
          `UPDATE spectate_permissions SET granted=false, admin_approved=false
           WHERE table_id=$1 AND spectator_id=$2 AND granted=true AND player_id<>$3`,
          [table_id, specId, targetPid]
        );
        await db.execute(
          `UPDATE spectate_permissions SET admin_approved=true, granted=true
           WHERE table_id=$1 AND spectator_id=$2 AND player_id=$3`,
          [table_id, specId, targetPid]
        );
        await db.execute(
          `UPDATE rummy_table_players
           SET spectator_allowed = COALESCE(spectator_allowed, '[]'::jsonb) || $1::jsonb
           WHERE table_id=$2 AND user_id=$3`,
          [JSON.stringify([specId]), table_id, targetPid]
        );
      } else {
        await db.execute(
          `UPDATE spectate_permissions SET admin_approved=false, granted=false
           WHERE table_id=$1 AND spectator_id=$2 AND player_id=$3`,
          [table_id, specId, targetPid]
        );
      }
      nspEmit(req, table_id, "spectate.granted", {
        spectator_id: specId,
        player_id: targetPid,
        granted: !!granted,
        stage: "host",
      });
      nspEmit(req, table_id, "game_update", { table_id });
      return res.json({
        success: true,
        stage: "host",
        admin_approved: !!granted,
        granted: !!granted,
      });
    }

    // Optional second step: target player can still grant/deny if row exists (e.g. legacy rows);
    // host path above already sets granted when host allows.
    if (normId(req.user.sub) !== normId(pending.player_id)) {
      return res.status(403).json({ error: "Only host or target player can update spectate request" });
    }
    if (!pending.admin_approved) {
      return res.status(400).json({ error: "Host approval required before player permission" });
    }

    const specId = normId(spectator_id);
    const targetPid = normId(pending.player_id);
    if (granted) {
      await db.execute(
        `UPDATE spectate_permissions SET granted=false, admin_approved=false
         WHERE table_id=$1 AND spectator_id=$2 AND granted=true AND player_id<>$3`,
        [table_id, specId, targetPid]
      );
    }
    await db.execute(
      `UPDATE spectate_permissions SET granted=$1
       WHERE table_id=$2 AND spectator_id=$3 AND player_id=$4`,
      [!!granted, table_id, specId, targetPid]
    );
    if (granted) {
      await db.execute(
        `UPDATE rummy_table_players
         SET spectator_allowed = COALESCE(spectator_allowed, '[]'::jsonb) || $1::jsonb
         WHERE table_id=$2 AND user_id=$3`,
        [JSON.stringify([specId]), table_id, targetPid]
      );
    }
    nspEmit(req, table_id, "spectate.granted", {
      spectator_id: specId,
      player_id: targetPid,
      granted: !!granted,
      stage: "player",
    });
    nspEmit(req, table_id, "game_update", { table_id });
    return res.json({ success: true, stage: "player", granted: !!granted });
  } catch (e) {
    console.error("grant-spectate error", e);
    res.status(500).json({ error: "Failed to update spectate permission" });
  }
});

// GET /game/spectate-requests
router.get("/game/spectate-requests", requireAuth, async (req, res) => {
  try {
    const table_id = req.query.table_id;
    if (!table_id) return res.status(400).json({ error: "table_id required" });

    const table = await db.fetchrow(`SELECT host_user_id FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table) return res.status(404).json({ error: "Table not found" });

    const me = normId(req.user.sub);
    const hostId = normId(table.host_user_id);

    const hostRequests = me === hostId
      ? await db.fetch(
        `SELECT spectator_id, player_id, admin_approved, granted, created_at
         FROM spectate_permissions
         WHERE table_id=$1 AND admin_approved=false
         ORDER BY created_at DESC`,
        [table_id]
      )
      : [];

    const playerRequests = await db.fetch(
      `SELECT spectator_id, player_id, admin_approved, granted, created_at
       FROM spectate_permissions
       WHERE table_id=$1 AND player_id=$2 AND admin_approved=true AND granted=false
       ORDER BY created_at DESC`,
      [table_id, me]
    );

    const myRequests = await db.fetch(
      `SELECT spectator_id, player_id, admin_approved, granted, created_at
       FROM spectate_permissions
       WHERE table_id=$1 AND spectator_id=$2
       ORDER BY created_at DESC`,
      [table_id, me]
    );

    return res.json({
      host_requests: hostRequests,
      player_requests: playerRequests,
      my_requests: myRequests,
    });
  } catch (e) {
    console.error("spectate-requests error", e);
    return res.status(500).json({ error: "Failed to fetch spectate requests" });
  }
});

// POST /game/remove-spectator (host-only permanent remove from table roster)
router.post("/game/remove-spectator", requireAuth, async (req, res) => {
  try {
    const { table_id, spectator_id } = req.body;
    if (!table_id || !spectator_id) return res.status(400).json({ error: "table_id and spectator_id required" });

    const table = await db.fetchrow(`SELECT host_user_id FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table) return res.status(404).json({ error: "Table not found" });
    if (normId(table.host_user_id) !== normId(req.user.sub)) {
      return res.status(403).json({ error: "Only host can remove spectator permanently" });
    }

    const target = await db.fetchrow(
      `SELECT is_spectator FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, spectator_id]
    );
    if (!target) return res.status(404).json({ error: "Player not found at table" });
    if (!target.is_spectator) return res.status(400).json({ error: "Only spectator players can be permanently removed" });

    await db.execute(`DELETE FROM spectate_permissions WHERE table_id=$1 AND spectator_id=$2`, [table_id, spectator_id]);
    await db.execute(`DELETE FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`, [table_id, spectator_id]);

    nspEmit(req, table_id, "game_update", { table_id });
    return res.json({ success: true, removed_user_id: normId(spectator_id) });
  } catch (e) {
    console.error("remove-spectator error", e);
    return res.status(500).json({ error: "Failed to remove spectator" });
  }
});

// POST /table/transfer-host
router.post("/table/transfer-host", requireAuth, async (req, res) => {
  try {
    const { table_id, new_host_user_id } = req.body;
    if (!table_id || !new_host_user_id) {
      return res.status(400).json({ error: "table_id and new_host_user_id required" });
    }

    const table = await db.fetchrow(`SELECT host_user_id FROM rummy_tables WHERE id=$1`, [table_id]);
    if (!table) return res.status(404).json({ error: "Table not found" });
    if (normId(table.host_user_id) !== normId(req.user.sub)) {
      return res.status(403).json({ error: "Only current host can transfer host role" });
    }

    const target = await db.fetchrow(
      `SELECT user_id FROM rummy_table_players WHERE table_id=$1 AND user_id=$2`,
      [table_id, new_host_user_id]
    );
    if (!target) return res.status(400).json({ error: "New host must be in this table" });

    await db.execute(`UPDATE rummy_tables SET host_user_id=$1, updated_at=now() WHERE id=$2`, [new_host_user_id, table_id]);
    nspEmit(req, table_id, "table.host_changed", {
      previous_host_user_id: normId(table.host_user_id),
      host_user_id: normId(new_host_user_id),
    });
    nspEmit(req, table_id, "game_update", { table_id });
    return res.json({ success: true, host_user_id: normId(new_host_user_id) });
  } catch (e) {
    console.error("transfer-host error", e);
    return res.status(500).json({ error: "Failed to transfer host" });
  }
});

module.exports = router;


// server/sockethandlers.js
// Socket handlers for Rummy real-time using server/engine/rummy_engine.js
//
// Usage: require("./sockethandlers")(io)
// Make sure server/index.js creates `io` as shown earlier.

const RummyEngine = require("./engine/rummy_engine");
const { v4: uuidv4 } = require("uuid");

/**
 * In-memory table registry:
 * tables[tableId] = {
 *   engine: RummyEngine instance,
 *   sockets: Set(socket.id),
 *   playersBySocket: { socketId: userId },
 *   timer: { timeoutId, endsAt, duration },
 *   meta: { host, createdAt, spectateRequests: [] }
 * }
 */
const tables = {};

module.exports = function (io) {
  console.log("Initializing socket handlers");

  // default turn timeout (ms). configurable per table in future.
  const DEFAULT_TURN_TIMEOUT = 60 * 1000;

  // helpers
  function ensureTable(tableId) {
    if (!tables[tableId]) {
      tables[tableId] = {
        engine: new RummyEngine({}, []),
        sockets: new Set(),
        playersBySocket: {},
        userIdBySocket: {}, // socketId => userId
        socketByUserId: {}, // userId => socketId
        timer: null,
        meta: { createdAt: Date.now(), spectateRequests: [] },
      };
    }
    return tables[tableId];
  }

  function broadcastTableState(tableId) {
    const t = tables[tableId];
    if (!t) return;
    const engineSnapshot = t.engine.snapshotTable();
    io.to(tableId).emit("table.state", { table: engineSnapshot });
  }

  function broadcastRoundState(tableId) {
    const t = tables[tableId];
    if (!t) return;
    const payload = {
      round_number: t.engine.round_number,
      stock_count: t.engine.stock.length,
      discard_top: t.engine.discard_top,
      wild_joker_rank: t.engine.wild_joker_rank,
      wild_joker_revealed: t.engine.wild_joker_revealed,
      active_user_id: t.engine.getActiveUserId(),
      players: t.engine.players.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        hand_count: p.hand.length,
        dropped: p.dropped,
      })),
    };
    io.to(tableId).emit("round.state", payload);
  }

  function sendPrivate(socket, ev, data) {
    try {
      socket.emit(ev, data);
    } catch (e) {}
  }

  function startTurnTimer(tableId, duration = DEFAULT_TURN_TIMEOUT) {
    const t = tables[tableId];
    if (!t) return;
    // clear previous
    if (t.timer && t.timer.timeoutId) {
      clearTimeout(t.timer.timeoutId);
      t.timer = null;
    }
    const endsAt = Date.now() + duration;
    // broadcast timer start
    io.to(tableId).emit("timer.start", { duration, endsAt });

    const timeoutId = setTimeout(() => {
      // On timeout: auto advance turn (penalty handling optional)
      try {
        // simply advance turn in engine
        t.engine.advanceTurn();
        broadcastRoundState(tableId);
        io.to(tableId).emit("timer.expired", { active_user_id: t.engine.getActiveUserId() });
        // restart timer for next player
        startTurnTimer(tableId, duration);
      } catch (e) {
        console.error("Error in turn timer handler:", e);
      }
    }, duration);

    t.timer = { timeoutId, endsAt, duration };
  }

  function stopTurnTimer(tableId) {
    const t = tables[tableId];
    if (!t || !t.timer) return;
    clearTimeout(t.timer.timeoutId);
    t.timer = null;
    io.to(tableId).emit("timer.stop", {});
  }

  // Socket events
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // attach user metadata if provided (handy for dev/test)
    // client may emit "auth" with { user_id, display_name } right after connect
    socket.on("auth", (payload) => {
      // store on socket for convenience
      socket.user = {
        user_id: payload.user_id || `guest_${socket.id.slice(0, 6)}`,
        display_name: payload.display_name || `Guest-${socket.id.slice(0, 6)}`,
      };
      sendPrivate(socket, "auth.ok", { user: socket.user });
    });

    // Create a new table (returns table id)
    socket.on("create_table", (opts = {}, ack) => {
      const tableId = opts.table_id || uuidv4();
      if (tables[tableId]) {
        if (ack) ack({ ok: false, message: "Table exists" });
        return;
      }
      const engine = new RummyEngine(
        {
          table_id: tableId,
          host_user_id: (socket.user && socket.user.user_id) || null,
          wild_joker_mode: opts.game_mode || "open_joker",
          ace_value: opts.ace_value || 10,
          disqualify_score: opts.disqualify_score || 200,
          max_players: opts.max_players || 4,
        },
        []
      );

      tables[tableId] = {
        engine,
        sockets: new Set(),
        playersBySocket: {},
        userIdBySocket: {},
        socketByUserId: {},
        timer: null,
        meta: { createdAt: Date.now(), spectateRequests: [] },
      };

      if (ack) ack({ ok: true, table_id: tableId });
      console.log("Table created:", tableId);
    });

    // join a table
    socket.on("join_table", (data = {}, ack) => {
      const tableId = data.table_id;
      const userId = (socket.user && socket.user.user_id) || data.user_id || `guest_${socket.id.slice(0, 6)}`;
      const displayName = (socket.user && socket.user.display_name) || data.display_name || userId;

      if (!tableId) {
        if (ack) ack({ ok: false, message: "Missing table_id" });
        return;
      }

      const t = ensureTable(tableId);

      // If engine has no players yet, we must add this user into engine.players
      const existing = t.engine.players.find((p) => p.user_id === userId);
      if (!existing) {
        t.engine.players.push({
          user_id: userId,
          display_name: displayName,
          seat: t.engine.players.length + 1,
          hand: [],
          hasDrawn: false,
          dropped: false,
          drop_points: 0,
        });
      }

      // join socket.io room
      socket.join(tableId);
      t.sockets.add(socket.id);
      t.playersBySocket[socket.id] = userId;
      t.userIdBySocket[socket.id] = userId;
      t.socketByUserId[userId] = socket.id;
      socket.tableId = tableId;
      socket.userId = userId;

      // broadcast update
      broadcastTableState(tableId);
      broadcastRoundState(tableId);

      io.to(tableId).emit("player.join", { user_id: userId, display_name: displayName });

      if (ack) ack({ ok: true, table_id: tableId, user_id: userId });
      console.log(`Socket ${socket.id} joined table ${tableId} as ${userId}`);
    });

    // leave table
    socket.on("leave_table", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) {
        if (ack) ack({ ok: false, message: "Not in a table" });
        return;
      }

      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId || null;

      socket.leave(tableId);
      t.sockets.delete(socket.id);
      delete t.playersBySocket[socket.id];
      delete t.userIdBySocket[socket.id];
      if (userId) delete t.socketByUserId[userId];

      io.to(tableId).emit("player.leave", { user_id: userId });
      broadcastTableState(tableId);

      if (ack) ack({ ok: true });
      console.log(`Socket ${socket.id} left table ${tableId}`);

      // optional: if no sockets left for table => cleanup after delay
      if (t.sockets.size === 0) {
        // cleanup to avoid memory leak (delay 10m recommended for reconnection scenarios)
        setTimeout(() => {
          const cur = tables[tableId];
          if (cur && cur.sockets.size === 0) {
            console.log("Cleaning up idle table", tableId);
            if (cur.timer && cur.timer.timeoutId) clearTimeout(cur.timer.timeoutId);
            delete tables[tableId];
          }
        }, 10 * 60 * 1000);
      }
    });

    // get personal view (hand) — client requests their private view
    socket.on("get_round_me", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) {
        if (ack) ack({ ok: false, message: "Not in table" });
        return;
      }
      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;
      const out = t.engine.getRoundMe(userId);
      if (ack) ack(out);
    });

    // start round (host or allowed user)
    socket.on("start_round", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) {
        if (ack) ack({ ok: false, message: "No table" });
        return;
      }
      const t = tables[tableId];

      const res = t.engine.startRound(data.seed || null);
      broadcastTableState(tableId);
      broadcastRoundState(tableId);

      // start turn timer
      startTurnTimer(tableId);

      if (ack) ack(res);
      io.to(tableId).emit("round.started", res);
    });

    // draw from stock
    socket.on("draw_stock", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });
      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      const res = t.engine.drawStock(userId);
      if (res.ok) {
        // send personal hand update
        sendPrivate(socket, "player.hand", { hand: res.hand });
        broadcastRoundState(tableId);
        // keep timer running (player must still discard)
      }
      if (ack) ack(res);
    });

    // draw from discard
    socket.on("draw_discard", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });
      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      const res = t.engine.drawDiscard(userId);
      if (res.ok) {
        sendPrivate(socket, "player.hand", { hand: res.hand });
        broadcastRoundState(tableId);
      }
      if (ack) ack(res);
    });

    // discard card
    socket.on("discard_card", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const card = data.card;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });
      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      const res = t.engine.discardCard(userId, card);
      if (res.ok) {
        // broadcast discard & next active
        io.to(tableId).emit("card.discarded", { user_id: userId, card: card, discard_top: res.discard_top, next_active_user_id: res.next_active_user_id });
        // personal hand update
        sendPrivate(socket, "player.hand", { hand: res.hand });
        broadcastRoundState(tableId);
      }
      if (ack) ack(res);
    });

    // lock sequence (reveal wild joker in closed mode)
    socket.on("lock_sequence", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const meld = data.meld;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });

      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      const res = t.engine.lockSequence(userId, meld);
      if (res.ok) {
        // broadcast reveal
        io.to(tableId).emit("sequence.locked", { user_id: userId, wild_joker_rank: res.wild_joker_rank, wild_joker_revealed: res.wild_joker_revealed });
      }
      if (ack) ack(res);
    });

    // meld update (player organizes their melds for UI — synced to others)
    socket.on("meld_update", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const melds = data.melds;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });

      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      // Broadcast updated melds to all (include user id)
      io.to(tableId).emit("player.melds.updated", { user_id: userId, melds });
      if (ack) ack({ ok: true });
    });

    // declare (finish round)
    socket.on("declare", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const groups = data.groups;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });

      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      const res = t.engine.declare(userId, groups);
      // broadcast result to table
      io.to(tableId).emit("round.declare", { declared_by: userId, result: res });
      // persist history in engine already
      broadcastRoundState(tableId);
      if (ack) ack(res);
      // stop timer for round end
      stopTurnTimer(tableId);
    });

    // drop player (early/mid)
    socket.on("drop_player", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });

      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;

      const res = t.engine.dropPlayer(userId);
      io.to(tableId).emit("player.dropped", { user_id: userId, penalty: res.penalty || null, message: res.message });
      broadcastRoundState(tableId);
      if (ack) ack(res);
    });

    // prepare next round (host)
    socket.on("prepare_next_round", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });
      const t = tables[tableId];
      const res = t.engine.prepareNextRound();
      broadcastTableState(tableId);
      broadcastRoundState(tableId);
      if (ack) ack(res);
      // restart timer
      startTurnTimer(tableId);
    });

    // chat messages (public or private)
    socket.on("chat_message", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });

      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;
      const msg = {
        id: uuidv4(),
        table_id: tableId,
        user_id: userId,
        sender_name: (socket.user && socket.user.display_name) || userId,
        message: data.message || "",
        is_private: !!data.is_private,
        recipient_id: data.recipient_id || null,
        created_at: new Date().toISOString(),
      };

      if (msg.is_private && msg.recipient_id) {
        // private -> send to recipient socket + sender only
        const recipSocketId = t.socketByUserId[msg.recipient_id];
        if (recipSocketId) {
          io.to(recipSocketId).emit("chat.message", msg);
        }
        socket.emit("chat.message", msg);
      } else {
        // public -> broadcast to table
        io.to(tableId).emit("chat.message", msg);
      }

      if (ack) ack({ ok: true, message: msg });
    });

    // spectate request / grant
    socket.on("request_spectate", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });
      const t = tables[tableId];
      const userId = t.userIdBySocket[socket.id] || socket.userId;
      t.meta.spectateRequests = t.meta.spectateRequests || [];
      if (!t.meta.spectateRequests.includes(userId)) t.meta.spectateRequests.push(userId);
      // notify host(s)
      io.to(tableId).emit("spectate.requested", { user_id: userId });
      if (ack) ack({ ok: true });
    });

    socket.on("grant_spectate", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const userId = data.user_id;
      const granted = !!data.granted;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });

      const t = tables[tableId];
      if (!t.meta.spectateRequests) t.meta.spectateRequests = [];
      t.meta.spectateRequests = t.meta.spectateRequests.filter((u) => u !== userId);
      io.to(tableId).emit("spectate.granted", { user_id: userId, granted });
      if (ack) ack({ ok: true });
    });

    // Voice events (signalling only)
    socket.on("voice.join", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const userId = (socket.user && socket.user.user_id) || data.user_id;
      if (tableId && tables[tableId]) {
        io.to(tableId).emit("voice.joined", { user_id: userId });
        if (ack) ack({ ok: true });
      } else if (ack) ack({ ok: false });
    });

    socket.on("voice.leave", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const userId = (socket.user && socket.user.user_id) || data.user_id;
      if (tableId && tables[tableId]) {
        io.to(tableId).emit("voice.left", { user_id: userId });
        if (ack) ack({ ok: true });
      } else if (ack) ack({ ok: false });
    });

    socket.on("voice.mute", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const userId = (socket.user && socket.user.user_id) || data.user_id;
      io.to(tableId).emit("voice.muted", { user_id: userId });
      if (ack) ack({ ok: true });
    });

    socket.on("voice.unmute", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      const userId = (socket.user && socket.user.user_id) || data.user_id;
      io.to(tableId).emit("voice.unmuted", { user_id: userId });
      if (ack) ack({ ok: true });
    });

    // get full table snapshot (public view)
    socket.on("get_table_state", (data = {}, ack) => {
      const tableId = data.table_id || socket.tableId;
      if (!tableId || !tables[tableId]) return ack && ack({ ok: false, message: "No table" });
      const t = tables[tableId];
      if (ack) ack({ ok: true, table: t.engine.snapshotTable() });
    });

    // disconnect handling
    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
      const tableId = socket.tableId;
      if (!tableId || !tables[tableId]) return;
      const t = tables[tableId];
      t.sockets.delete(socket.id);
      const userId = t.userIdBySocket[socket.id] || socket.userId;
      delete t.playersBySocket[socket.id];
      delete t.userIdBySocket[socket.id];
      if (userId) delete t.socketByUserId[userId];
      io.to(tableId).emit("player.disconnected", { user_id: userId });
      broadcastTableState(tableId);

      // same cleanup logic as leave_table
      if (t.sockets.size === 0) {
        setTimeout(() => {
          const cur = tables[tableId];
          if (cur && cur.sockets.size === 0) {
            console.log("Cleaning up idle table after disconnect", tableId);
            if (cur.timer && cur.timer.timeoutId) clearTimeout(cur.timer.timeoutId);
            delete tables[tableId];
          }
        }, 10 * 60 * 1000);
      }
    });
  });
};

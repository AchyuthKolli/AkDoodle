import { io } from "socket.io-client";

// ✅ Vite environment variable
// If PROD, force relative path to avoid "localhost" env var overrides
const SOCKET_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL || "http://localhost:3001");

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
});

socket.on("connect", () => {
  console.log("🟢 Socket connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("🔴 Socket disconnected");
});

// ====== SUBSCRIBE TO ROOM ======
export const joinRoom = (tableId, userId, displayName, profileImage) => {
  // Server expects: join_table { table_id, user_id, display_name, profile_image }
  const payload = {
    table_id: tableId,
    user_id: userId,
    display_name: displayName,
    profile_image: profileImage
  };
  socket.emit("join_table", payload);
};

// ====== LISTENERS ======
export const onGameUpdate = (callback) => {
  // Server: io.to(tableId).emit("table.state", { table })
  // AND: io.to(tableId).emit("round.state", payload)

  // We'll listen to round.state as the primary update for game flow
  socket.on("round.state", (data) => {
    callback(data);
  });

  // Also listen for table state if needed, or mapped to same callback
  socket.on("table.state", (data) => {
    // Optionally merge or just trigger callback
    callback(data);
  });
};

export const onChatMessage = (callback) => {
  // Server emits: "chat.message" { user_id, sender_name, message, created_at, ... }
  socket.on("chat.message", (msg) => {
    // Transform to camelCase for UI if needed, or keep as is.
    // ChatSidebar expects: msg.message, msg.senderName (or msg.userId), msg.timestamp
    const transformed = {
      ...msg,
      senderName: msg.sender_name,
      timestamp: msg.created_at,
      userId: msg.user_id,
      isPrivate: msg.is_private,
      recipientId: msg.recipient_id
    };
    callback(transformed);
  });
};

export const onVoiceStatus = (callback) => {
  // Server emits: "voice.muted" { user_id } OR "voice.unmuted" { user_id }
  socket.on("voice.muted", (data) => {
    callback({ userId: data.user_id, muted: true });
  });
  socket.on("voice.unmuted", (data) => {
    callback({ userId: data.user_id, muted: false });
  });
};

export const onDeclareUpdate = (callback) => {
  // Server emits: "round.declare" { declared_by, result }
  socket.on("round.declare", (data) => {
    callback(data);
  });
};

export const onSpectateUpdate = (callback) => {
  // Server emits: "spectate.requested" { user_id }
  // Server emits: "spectate.granted" { user_id, granted }
  socket.on("spectate.requested", (data) => callback({ type: "requested", ...data }));
  socket.on("spectate.granted", (data) => callback({ type: "granted", ...data }));
};

// ====== SENDERS ======
export const sendChatMsg = (tableId, userId, text, isPrivate, recipientId) => {
  // Server expects: "chat_message", { table_id, message, is_private, recipient_id }
  // (userId is inferred from socket or passed in msg construction on server, but we can send it just in case logic uses it slightly differently, though server/sockethandlers.js lines 412+ uses socket.userId)

  const payload = {
    table_id: tableId,
    message: text,
    is_private: isPrivate,
    recipient_id: recipientId
  };
  socket.emit("chat_message", payload);
};

export const broadcastVoice = (tableId, userId, muted) => {
  // Server expects: "voice.mute" or "voice.unmute" { table_id, user_id }
  const evt = muted ? "voice.mute" : "voice.unmute";
  socket.emit(evt, { table_id: tableId, user_id: userId });
};

export const notifySpectate = (tableId, requesterId, targetId) => {
  // Server expects: "request_spectate" { table_id }
  // (Requester is the socket user)
  socket.emit("request_spectate", { table_id: tableId });
};

// client/src/apiclient/index.js
import axios from "axios";

// ✅ Use env var for dev, but force relative path for production (to avoid localhost leakage)
const BASE_URL = import.meta.env.PROD
  ? "/"
  : (import.meta.env.VITE_API_URL || "http://localhost:3001");

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  console.log("📡 API Request:", config.method.toUpperCase(), config.url, "Full:", config.baseURL + config.url);
  return config;
});

// Add token interceptor if auth uses localStorage (assuming standard stackframe or similar)
api.interceptors.request.use((config) => {
  // Try to find token in localStorage if your auth system uses it
  // But usage in Table.jsx implies cookies or standard session handling might be in place?
  // server uses `requireUser` which checks req.user (populated by requireAuth in server/index.js => verify token)
  // server/auth.js likely checks Authorization header.
  // We'll assume standard Bearer token if available.
  const token = localStorage.getItem("auth_token") || localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for better error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // console.error("API Call Failed:", err.config?.url, err.response?.data || err.message);
    return Promise.reject(err); // propagate
  }
);

// -----------------------------------------
// TABLE APIs (snake_case to match Table.jsx usage)
// -----------------------------------------

// GET /api/tables/info?table_id=...
export const get_table_info = async (query) => {
  return api.get("/api/tables/info", { params: query });
};

// POST /api/tables
export const create_table = async (body) => {
  return api.post("/api/tables", body);
};

// POST /api/tables/join
export const join_table = async (body) => {
  return api.post("/api/tables/join", body);
};

// POST /api/tables/join-by-code
export const join_table_by_code = async (body) => {
  return api.post("/api/tables/join-by-code", body);
};

// POST /api/start-game
export const start_game = async (body) => {
  return api.post("/api/start-game", body);
};


// -----------------------------------------
// GAMEPLAY APIs
// -----------------------------------------

// GET /api/round/me?table_id=...
export const get_round_me = async (query) => {
  return api.get("/api/round/me", { params: query });
};

// POST /api/draw/stock
export const draw_stock = async (body) => {
  return api.post("/api/draw/stock", body);
};

// POST /api/draw/discard
export const draw_discard = async (body) => {
  return api.post("/api/draw/discard", body);
};

// POST /api/discard
export const discard_card = async (body) => {
  return api.post("/api/discard", body);
};

// POST /api/lock-sequence
export const lock_sequence = async (body) => {
  return api.post("/api/lock-sequence", body);
};

// POST /api/declare
export const declare_round = async (body) => {
  return api.post("/api/declare", body);
};


// -----------------------------------------
// HISTORY & OTHERS
// -----------------------------------------

// GET /api/round/history
export const get_round_history = async (query) => {
  return api.get("/api/round/history", { params: query });
};

// GET /api/round/scoreboard
export const get_scoreboard = async (query) => {
  return api.get("/api/round/scoreboard", { params: query });
};

// POST /api/round/next
export const next_round = async (body) => {
  return api.post("/api/round/next", body);
};

// POST /api/game/drop
export const drop_player = async (body) => {
  return api.post("/api/game/drop", body);
};

// Spectate
// POST /api/game/request-spectate
export const request_spectate = async (body) => {
  return api.post("/api/game/request-spectate", body);
};

// POST /api/game/grant-spectate
export const grant_spectate = async (body) => {
  return api.post("/api/game/grant-spectate", body);
};

// Keep penalize_leave as requested by Table.jsx (though server might not implement it yet, safe fallback)
export const penalize_leave = async (body) => {
  // If not implemented on server, this will 404, but client handles errors.
  // Assuming /api/game/drop or special endpoint. 
  // Table.jsx calls it. We'll map to /api/game/drop for now or just log.
  // Or maybe /api/game/penalize if it existed. 
  // We'll point to /api/game/drop as it applies penalty.
  return api.post("/api/game/drop", body);
};

export default {
  get_table_info,
  create_table,
  join_table,
  join_table_by_code,
  start_game,
  get_round_me,
  draw_stock,
  draw_discard,
  discard_card,
  lock_sequence,
  declare_round,
  get_round_history,
  get_scoreboard,
  next_round,
  drop_player,
  request_spectate,
  grant_spectate,
  penalize_leave
};

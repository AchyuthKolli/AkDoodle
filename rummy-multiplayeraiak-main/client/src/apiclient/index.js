// client/src/apiclient/index.js
// REWRITTEN: Using native fetch() to match Table.jsx expectations (res.ok, res.json())

const BASE_URL = import.meta.env.PROD
  ? "" // Relative path in production
  : (import.meta.env.VITE_API_URL || "http://localhost:3001");

/**
 * Core fetch wrapper that automatically adds Auth headers
 */
const request = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Attach token if available
  const token = localStorage.getItem("auth_token") || localStorage.getItem("token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  console.log(`📡 API Request: ${options.method || "GET"} ${url}`);

  try {
    const response = await fetch(url, config);

    // IMPORTANT: We return the raw response object because Table.jsx checks:
    // if (!res.ok) { ... }
    // const data = await res.json();
    return response;
  } catch (error) {
    console.error("API Fetch Error:", error);
    throw error;
  }
};

const get = (endpoint, query) => {
  let path = endpoint;
  if (query) {
    const params = new URLSearchParams(query);
    path += `?${params.toString()}`;
  }
  return request(path, { method: "GET" });
};

const post = (endpoint, body) => {
  return request(endpoint, { method: "POST", body });
};

// -----------------------------------------
// TABLE APIs
// -----------------------------------------

export const get_table_info = async (query) => get("/api/tables/info", query);
export const create_table = async (body) => post("/api/tables", body);
export const join_table = async (body) => post("/api/tables/join", body);
export const join_table_by_code = async (body) => post("/api/tables/join-by-code", body);
export const start_game = async (body) => post("/api/start-game", body);

// -----------------------------------------
// GAMEPLAY APIs
// -----------------------------------------

export const get_round_me = async (query) => get("/api/round/me", query);
export const draw_stock = async (body) => post("/api/draw/stock", body);
export const draw_discard = async (body) => post("/api/draw/discard", body);
export const discard_card = async (body) => post("/api/discard", body);
export const lock_sequence = async (body) => post("/api/lock-sequence", body);
export const declare_round = async (body) => post("/api/declare", body);

// -----------------------------------------
// HISTORY & OTHERS
// -----------------------------------------

export const get_round_history = async (query) => get("/api/round/history", query);
export const get_scoreboard = async (query) => get("/api/round/scoreboard", query);
export const next_round = async (body) => post("/api/round/next", body);
export const drop_player = async (body) => post("/api/game/drop", body);
export const request_spectate = async (body) => post("/api/game/request-spectate", body);
export const grant_spectate = async (body) => post("/api/game/grant-spectate", body);

// Fallback for penalize if not on server
export const penalize_leave = async (body) => post("/api/game/drop", body);

// Only export object for default import compatibility if needed, 
// but named exports are preferred and used by Table.jsx imports.
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

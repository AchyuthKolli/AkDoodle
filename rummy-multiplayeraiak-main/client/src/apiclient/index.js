// client/src/apiclient/index.js
// REWRITTEN: Using native fetch() to match Table.jsx expectations (res.ok, res.json())

const BASE_URL = import.meta.env.PROD
  ? "" // Relative path in production
  : (import.meta.env.VITE_API_URL || "http://localhost:3001");
const RUMMY_API_PREFIX = import.meta.env.VITE_RUMMY_API_PREFIX || "/api/rummy";

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

    // Server may exchange Google token for a longer-lived local JWT.
    // Persist it so users don't need to re-login frequently.
    const refreshedToken = response.headers.get("X-Auth-Token");
    if (refreshedToken) {
      localStorage.setItem("auth_token", refreshedToken);
      localStorage.setItem("token", refreshedToken);
    }

    // Token can expire in localStorage (Google access token).
    // Clear stale session so user can sign in again cleanly.
    if (response.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      localStorage.removeItem("token");
      console.warn("🔒 Session expired or invalid token. Cleared local auth state.");
    }

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

export const get_table_info = async (query) => get(`${RUMMY_API_PREFIX}/tables/info`, query);
export const create_table = async (body) => post(`${RUMMY_API_PREFIX}/tables`, body);
export const join_table = async (body) => post(`${RUMMY_API_PREFIX}/tables/join`, body);
export const join_table_by_code = async (body) => post(`${RUMMY_API_PREFIX}/tables/join-by-code`, body);
export const start_game = async (body) => post(`${RUMMY_API_PREFIX}/start-game`, body);

// -----------------------------------------
// GAMEPLAY APIs
// -----------------------------------------

export const get_round_me = async (query) => get(`${RUMMY_API_PREFIX}/round/me`, query);
export const draw_stock = async (body) => post(`${RUMMY_API_PREFIX}/draw/stock`, body);
export const draw_discard = async (body) => post(`${RUMMY_API_PREFIX}/draw/discard`, body);
export const discard_card = async (body) => post(`${RUMMY_API_PREFIX}/discard`, body);
export const lock_sequence = async (body) => post(`${RUMMY_API_PREFIX}/lock-sequence`, body);
export const declare_round = async (body) => post(`${RUMMY_API_PREFIX}/declare`, body);

// -----------------------------------------
// HISTORY & OTHERS
// -----------------------------------------

export const get_round_history = async (query) => get(`${RUMMY_API_PREFIX}/round/history`, query);
export const get_scoreboard = async (query) => get(`${RUMMY_API_PREFIX}/round/scoreboard`, query);
export const get_revealed_hands = async (query) => get(`${RUMMY_API_PREFIX}/round/revealed-hands`, query);
export const next_round = async (body) => post(`${RUMMY_API_PREFIX}/round/next`, body);
export const drop_player = async (body) => post(`${RUMMY_API_PREFIX}/game/drop`, body);
export const kick_player = async (body) => post(`${RUMMY_API_PREFIX}/game/kick-player`, body);
export const meld_snapshot = async (body) => post(`${RUMMY_API_PREFIX}/round/meld-snapshot`, body);
export const request_spectate = async (body) => post(`${RUMMY_API_PREFIX}/game/request-spectate`, body);
export const grant_spectate = async (body) => post(`${RUMMY_API_PREFIX}/game/grant-spectate`, body);
export const get_spectate_requests = async (query) => get(`${RUMMY_API_PREFIX}/game/spectate-requests`, query);
export const remove_spectator = async (body) => post(`${RUMMY_API_PREFIX}/game/remove-spectator`, body);
export const transfer_host = async (body) => post(`${RUMMY_API_PREFIX}/table/transfer-host`, body);

// Fallback for penalize if not on server
export const penalize_leave = async (body) => post(`${RUMMY_API_PREFIX}/game/drop`, body);

// -----------------------------------------
// USER & PROFILE
// -----------------------------------------
export const get_my_profile = async () => get("/api/me");

// -----------------------------------------
// VOICE / AUDIO (Mock/Placeholder if not on server)
// -----------------------------------------
export const get_voice_participants = async (query) => get("/api/voice/participants", query);
export const mute_player = async (body) => post("/api/voice/mute", body);
export const update_table_voice_settings = async (body) => post("/api/voice/settings", body);

// Alias start_next_round to next_round for compatibility with Table.jsx
export const start_next_round = next_round;

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
  get_revealed_hands,
  next_round,
  start_next_round, // exported alias
  drop_player,
  drop_game: drop_player,
  kick_player,
  meld_snapshot,
  request_spectate,
  grant_spectate,
  get_spectate_requests,
  remove_spectator,
  transfer_host,
  penalize_leave,
  get_my_profile,
  get_voice_participants,
  mute_player,
  update_table_voice_settings,
  declare: declare_round, // Alias for Table.jsx
  get_revealed_hands
};

export const declare = declare_round; // Named export alias

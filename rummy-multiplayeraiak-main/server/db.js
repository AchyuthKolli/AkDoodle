// server/db.js
const { Pool } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // optionally tune these
  max: 10,
  idleTimeoutMillis: 30000,
});

async function fetchrow(query, ...params) {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

async function fetch(query, ...params) {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res.rows;
  } finally {
    client.release();
  }
}

async function execute(query, ...params) {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  fetchrow,
  fetch,
  execute,
};

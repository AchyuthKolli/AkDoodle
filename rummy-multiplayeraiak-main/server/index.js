// server/index.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
dotenv.config();

const { requireAuth } = require("./auth");
const applySocketHandlers = require("./sockethandlers");   // ✅ IMPORTANT
const { pool } = require("./db"); // Import pool for schema init

// Auto-run schema.sql to ensure DB tables exist
const schemaPath = path.join(__dirname, "schema.sql");
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");
  console.log("Initializing Database Schema...");
  pool.query(schemaSql)
    .then(() => console.log("✅ Database Schema Applied (Tables Created if missing)"))
    .catch(err => console.error("❌ Database Schema Init Failed:", err));
} else {
  console.warn("⚠️ server/schema.sql not found (skipping DB init)");
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Health
app.get("/health", (req, res) => res.json({ status: "ok", ts: Date.now() }));

// DB Health Check - Critical for debugging
app.get("/health/db", async (req, res) => {
  try {
    const { pool } = require("./db");
    // Check if table exists
    const result = await pool.query("SELECT count(*) FROM rummy_tables");
    res.json({ status: "connected", tables_count: result.rows[0].count });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message, stack: e.stack });
  }
});

// Auto-load routers from server/APIs/*.js
const apisDir = path.join(__dirname, "APIs");
if (fs.existsSync(apisDir)) {
  const files = fs.readdirSync(apisDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    try {
      const routerPath = path.join(apisDir, file);
      const mod = require(routerPath);

      if (mod && mod.router) {
        // Standard export: const router = express.Router(); module.exports = { router };
        app.use("/api", mod.router);
        console.log("Mounted router (router exported prop):", file);
      } else if (mod && (mod.name === "router" || typeof mod === "function")) {
        // Express routers are functions, but we must check if it's an API init function or actual Router
        // Best guess: check if it has .get, .post, .stack
        if (mod.stack && mod.use) {
          app.use("/api", mod);
          console.log("Mounted router (export is router):", file);
        } else {
          // It's a custom initializer function: func(app, requireAuth)
          try {
            mod(app, requireAuth);
            console.log("Mounted API initializer function:", file);
          } catch (err) {
            console.error(`Error initializing ${file}:`, err);
          }
        }
      } else {
        console.warn(`Skipped ${file}: unknown export format`);
      }
    } catch (e) {
      console.error("Failed to mount API file", file, e);
      if (e.stack) console.error(e.stack);
    }
  }
} else {
  console.warn("No server/APIs directory found to load routers from");
}

// Example protected route
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// =====================================================
// 📦 SERVE FRONTEND (Production)
// =====================================================
const clientDistPath = path.join(__dirname, "../client/dist");
if (fs.existsSync(clientDistPath)) {
  console.log("Serving static files from:", clientDistPath);
  app.use(express.static(clientDistPath));

  // SPA Fallback: API routes marked above; anything else -> index.html
  app.get("*", (req, res) => {
    console.log("⚠️ Catch-all hit for:", req.url);
    if (req.path.startsWith("/api")) {
      console.log("❌ 404 for API route:", req.path);
      return res.status(404).json({ error: "API route not found" });
    }
    console.log("📄 Serving index.html for:", req.path);
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
} else {
  console.log("❌ No client build found at:", clientDistPath);
}

// =====================================================
// 🚀 CREATE HTTP SERVER + SOCKET.IO SERVER
// =====================================================
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*" }
});

// Attach all socket handlers (your full rummy logic)
applySocketHandlers(io);

// ✅ Attach io to app so APIs can use it (e.g. req.app.get("io"))
app.set("io", io);

// =====================================================
// 🚀 START SERVER (Express + Socket.io)
// =====================================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 Server + Socket.IO running at http://0.0.0.0:${PORT}`);
});

# 🃏 Rummy Multiplayer — AkDoodle

> ⚡ Built with AI assistance — from **Antigravity (AI)** to **Cursor IDE** — continuously updated and deployed.

---

## 📌 Project Overview

A real-time multiplayer **Rummy card game** with live rooms, chat, scoring, spectate mode, wild joker reveals, and a 3D casino-style UI. Players can sign in with Google, create or join game tables, and play full rummy sessions in real time.

---

## 🧠 AI Development Stack

| Tool | Role |
|------|------|
| **Antigravity (Google DeepMind AI)** | Primary code generation, architecture, debugging |
| **Cursor IDE** | Local code editing and AI-assisted development |
| **GitHub Copilot (optional)** | Inline suggestions |

> All major features — game logic, socket handlers, scoring, 3D UI, auth — were built and iterated using Antigravity AI inside Cursor.

---

## 🗂️ Project Structure

```
rummy-multiplayeraiak-main/
├── client/                    # React + Vite Frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── AppProvider.jsx
│   │   ├── socket.js          # Socket.IO client setup
│   │   ├── auth/              # Google Auth context
│   │   ├── pages/             # Profile, Home, etc.
│   │   ├── components/        # UI components (Dialog, ProfileCard, etc.)
│   │   ├── apiclient/         # API call wrappers
│   │   ├── utils/
│   │   └── games/
│   │       └── rummy/
│   │           ├── RummyContext.jsx
│   │           ├── hooks/     # useVoice, etc.
│   │           └── components/
│   │               ├── CasinoTable3D.jsx       # 3D table UI
│   │               ├── GameRules.jsx
│   │               ├── ChatSidebar.jsx
│   │               ├── PlayerProfile.jsx
│   │               ├── PointsTable.jsx
│   │               ├── SpectateControls.jsx
│   │               └── WildJokerRevealModal.jsx
│   ├── index.html
│   └── tailwind.config.js
│
├── server/                    # Node.js + Express Backend
│   ├── index.js               # Main server entry point
│   ├── auth.js                # JWT auth middleware
│   ├── db.js                  # PostgreSQL pool connection
│   ├── schema.sql             # DB table definitions (auto-run on start)
│   ├── sockethandlers.js      # Full Socket.IO rummy game logic
│   └── APIs/
│       ├── game.js            # Game CRUD REST APIs
│       ├── chat.js            # Chat APIs
│       ├── scoring.js         # Scoring system
│       └── rummy_models.js    # DB model helpers
│
├── render-build.sh            # Render.com build script
├── package.json               # Backend dependencies
├── test-kdrive.html           # K Drive → GitHub push test file
└── README.md                  # This file
```

---

## ⚙️ Tech Stack

### Frontend
| Tech | Version | Purpose |
|------|---------|---------|
| React | ^18 | UI Framework |
| Vite | Latest | Build tool & dev server |
| TailwindCSS | Latest | Styling |
| Socket.IO Client | ^4.7.2 | Real-time communication |
| Three.js / 3D | Custom | CasinoTable3D component |

### Backend
| Tech | Version | Purpose |
|------|---------|---------|
| Node.js | Latest LTS | Runtime |
| Express | ^4.18.2 | HTTP server & REST APIs |
| Socket.IO | ^4.7.2 | Real-time game events |
| PostgreSQL (`pg`) | ^8.11.3 | Database |
| JWT (`jsonwebtoken`) | ^9.0.2 | Auth tokens |
| Google Auth Library | ^9.0.0 | Google OAuth login |
| dotenv | ^16.3.1 | Environment variables |
| uuid | ^9.0.0 | Unique room/game IDs |
| cors | ^2.8.5 | Cross-origin requests |

---

## 🗄️ Database

- **Type:** PostgreSQL
- **Hosted on:** Render.com (Managed PostgreSQL)
- **Schema:** Auto-applied from `server/schema.sql` on every server start
- **Key Tables:** `rummy_tables`, `users`, `game_sessions`, `chat_messages`

### Connection
Set the following in your `.env` file or Render environment variables:
```env
DATABASE_URL=postgresql://user:password@host:port/dbname
JWT_SECRET=your_jwt_secret_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
PORT=3001
```

---

## 🚀 Deployment — Render.com

### Services Created on Render

| Service | Type | Details |
|---------|------|---------|
| **Backend + Frontend** | Web Service | Node.js server serves built React app |
| **Database** | PostgreSQL | Managed DB, connected via `DATABASE_URL` |

### Render Web Service Settings
| Setting | Value |
|---------|-------|
| **Repository** | `github.com/AchyuthKolli/AkDoodle` |
| **Branch** | `master` |
| **Build Command** | `./render-build.sh` |
| **Start Command** | `npm start` (runs `node server/index.js`) |
| **Root Directory** | *(leave blank — uses repo root)* |

### What `render-build.sh` does:
```bash
npm install          # Install backend dependencies
cd client
npm install          # Install frontend dependencies
npm run build        # Build React app into client/dist/
cd ..
```
The built `client/dist/` is then served as static files by the Express server in production.

---

## 🔗 GitHub Repository

| Detail | Info |
|--------|------|
| **GitHub URL** | https://github.com/AchyuthKolli/AkDoodle |
| **Branch** | `master` |
| **Remote Name** | `origin` |

### Push Code to GitHub
```powershell
# Open terminal in this folder:
# K:\rummy-multiplayeraiak-main visual Workspace\rummy-multiplayeraiak-main

git add .
git commit -m "describe your changes"
git push origin master
```

> ✅ No re-linking needed — `.git` folder is preserved. Just authenticate with GitHub token on first push from a new machine.

---

## 💻 Local Development

### 1. Start Backend
```bash
cd rummy-multiplayeraiak-main
npm install
node server/index.js
# Server runs at http://localhost:3001
```

### 2. Start Frontend
```bash
cd client
npm install
npm run dev
# Frontend runs at http://localhost:5173
```

> Make sure your `.env` file is set up with `DATABASE_URL` pointing to your PostgreSQL instance.

---

## 📁 Local File Location History

| Drive | Path | Status |
|-------|------|--------|
| C Drive (Downloads) | `C:\Users\achyu\Downloads\rummy-multiplayeraiak-main visual Workspace\` | Original location |
| **K Drive** ✅ | `K:\rummy-multiplayeraiak-main visual Workspace\` | **Current active location** |

> Moved to K Drive on **20 April 2026**. GitHub remote connection was preserved automatically.

---

## 🎮 Key Features

- ♠️ Real-time multiplayer Rummy (Points Rummy rules)
- 🃏 Wild Joker reveal system
- 📊 Live scoring and points table
- 💬 In-game chat sidebar
- 👁️ Spectate mode for observers
- 🔐 Google OAuth login + JWT sessions
- 🎰 3D Casino Table UI (CasinoTable3D)
- 🔊 Voice hooks (useVoice)
- 📱 Responsive design

---

## 🏷️ Credits

| Role | Name/Tool |
|------|-----------|
| Developer | AchyuthKolli |
| AI Assistant | Antigravity (Google DeepMind) |
| IDE | Cursor |
| Hosting | Render.com |
| Source Control | GitHub |

---

*Last updated: April 2026 — K Drive migration complete ✅*

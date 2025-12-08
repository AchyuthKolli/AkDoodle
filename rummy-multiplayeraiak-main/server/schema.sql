-- Rummy Multiplayer Schema

-- Use UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  user_id VARCHAR(255) PRIMARY KEY, -- Google sub or similar
  display_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tables
CREATE TABLE IF NOT EXISTS rummy_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_user_id VARCHAR(255) NOT NULL,
  code VARCHAR(10) UNIQUE, -- 6 char code
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, playing, finished
  max_players INT DEFAULT 6,
  disqualify_score INT DEFAULT 200,
  wild_joker_mode VARCHAR(20) DEFAULT 'open_joker', -- open_joker, closed_joker, no_joker
  ace_value INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Table Players
CREATE TABLE IF NOT EXISTS rummy_table_players (
  table_id UUID REFERENCES rummy_tables(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  seat INT,
  display_name VARCHAR(255),
  is_spectator BOOLEAN DEFAULT false,
  spectator_allowed JSONB, -- List of user_ids allowed to spectate this player
  total_points INT DEFAULT 0,
  disqualified BOOLEAN DEFAULT false,
  eliminated_at TIMESTAMP,
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (table_id, user_id)
);

-- 4. Rounds
CREATE TABLE IF NOT EXISTS rummy_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id UUID REFERENCES rummy_tables(id) ON DELETE CASCADE,
  number INT NOT NULL,
  wild_joker_rank VARCHAR(5),
  printed_joker BOOLEAN DEFAULT false,
  stock JSONB,   -- Array of cards
  discard JSONB, -- Array of cards
  hands JSONB,   -- Map of user_id -> Array of cards
  active_user_id VARCHAR(255),
  game_mode VARCHAR(20),
  ace_value INT,
  winner_user_id VARCHAR(255),
  scores JSONB,  -- Map user_id -> score for this round
  declarations JSONB, -- Map user_id -> declaration details
  players_with_first_sequence JSONB, -- List of users who revealed/locked pure sequence
  points_accumulated BOOLEAN DEFAULT false, -- If scores added to table_players
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Spectate Permissions
CREATE TABLE IF NOT EXISTS spectate_permissions (
  table_id UUID REFERENCES rummy_tables(id) ON DELETE CASCADE,
  spectator_id VARCHAR(255),
  player_id VARCHAR(255),
  granted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (table_id, spectator_id, player_id)
);

-- 6. Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  table_id UUID REFERENCES rummy_tables(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_private BOOLEAN DEFAULT false,
  recipient_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance

CREATE INDEX IF NOT EXISTS idx_rummy_tables_code ON rummy_tables(code);
CREATE INDEX IF NOT EXISTS idx_rummy_rounds_table_id ON rummy_rounds(table_id);

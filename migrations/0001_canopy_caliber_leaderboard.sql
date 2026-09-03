PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS canopy_caliber_runs (
  id TEXT PRIMARY KEY NOT NULL,
  board_version INTEGER NOT NULL DEFAULT 1 CHECK(board_version = 1),
  client_run_id TEXT NOT NULL UNIQUE CHECK(length(client_run_id) BETWEEN 8 AND 80),
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 2 AND 16),
  time_ms INTEGER NOT NULL CHECK(time_ms BETWEEN 10000 AND 86400000),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100000),
  health INTEGER NOT NULL CHECK(health BETWEEN 0 AND 100),
  skin_id TEXT NOT NULL CHECK(skin_id IN ('classic', 'sunset', 'frost', 'shadow', 'neon', 'golden')),
  weapon_id TEXT NOT NULL CHECK(weapon_id IN ('pistol', 'carbine', 'shotgun', 'ghost')),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms > 0)
);

CREATE INDEX IF NOT EXISTS canopy_caliber_rank
ON canopy_caliber_runs(board_version, time_ms ASC, score DESC, health DESC, created_at_ms ASC, id ASC);

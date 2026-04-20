CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  sticky_id TEXT NOT NULL REFERENCES stickies(id) ON DELETE CASCADE,
  item_id TEXT,
  item_index INTEGER NOT NULL,
  text_preview TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  fired_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_reminders_pending ON reminders(fire_at) WHERE fired_at IS NULL;
CREATE INDEX idx_reminders_sticky ON reminders(sticky_id);

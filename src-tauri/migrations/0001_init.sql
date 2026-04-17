CREATE TABLE stickies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  x INTEGER,
  y INTEGER,
  w INTEGER NOT NULL DEFAULT 320,
  h INTEGER NOT NULL DEFAULT 420,
  pinned INTEGER NOT NULL DEFAULT 0,
  bg_color TEXT NOT NULL DEFAULT '#FFDC96',
  opacity REAL NOT NULL DEFAULT 0.85,
  font_size INTEGER NOT NULL DEFAULT 14,
  font_color TEXT,
  z_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  sticky_id TEXT NOT NULL REFERENCES stickies(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  due_at INTEGER,
  completed_at INTEGER,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_items_sticky_sort ON items(sticky_id, sort_order);
CREATE INDEX idx_items_due ON items(due_at) WHERE completed_at IS NULL;

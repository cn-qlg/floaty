-- 全文索引 items.content_md。外部内容（external content）模式不重复存储；
-- 触发器把主表变更同步到 FTS 表。
CREATE VIRTUAL TABLE items_fts USING fts5(
  content_md,
  content='items',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- 回填现有数据
INSERT INTO items_fts(rowid, content_md)
SELECT rowid, content_md FROM items;

-- INSERT / UPDATE / DELETE 时同步
CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, content_md) VALUES (new.rowid, new.content_md);
END;

CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, content_md) VALUES ('delete', old.rowid, old.content_md);
END;

CREATE TRIGGER items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, content_md) VALUES ('delete', old.rowid, old.content_md);
  INSERT INTO items_fts(rowid, content_md) VALUES (new.rowid, new.content_md);
END;

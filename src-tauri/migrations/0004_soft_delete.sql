-- 软删除：deleted_at 为 NULL 表示活跃；毫秒时间戳表示被移到回收站的时刻。
ALTER TABLE stickies ADD COLUMN deleted_at INTEGER;

CREATE INDEX idx_stickies_deleted ON stickies(deleted_at) WHERE deleted_at IS NOT NULL;

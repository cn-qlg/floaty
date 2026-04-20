use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Reminder {
    pub id: String,
    pub sticky_id: String,
    pub item_id: Option<String>,
    pub item_index: i64,
    pub text_preview: String,
    pub fire_at: i64,
    pub kind: String,
    pub fired_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReminderInput {
    pub sticky_id: String,
    pub item_index: i64,
    pub text_preview: String,
    pub fire_at: i64,
    pub kind: String, // "at_due" | "snooze"
}

pub async fn list_pending(db: &Db) -> AppResult<Vec<Reminder>> {
    let rows = sqlx::query_as::<_, Reminder>(
        "SELECT * FROM reminders WHERE fired_at IS NULL ORDER BY fire_at ASC",
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn insert(db: &Db, input: ReminderInput) -> AppResult<Reminder> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO reminders
         (id, sticky_id, item_id, item_index, text_preview, fire_at, kind, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.sticky_id)
    .bind(input.item_index)
    .bind(&input.text_preview)
    .bind(input.fire_at)
    .bind(&input.kind)
    .bind(now)
    .execute(db)
    .await?;
    get(db, &id).await
}

pub async fn get(db: &Db, id: &str) -> AppResult<Reminder> {
    let row = sqlx::query_as::<_, Reminder>("SELECT * FROM reminders WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    Ok(row)
}

/// 清掉某 sticky 的所有 at_due reminders（保留 snooze 的，哪怕未触发）。
/// 用于前端 markdown 变化后的 reconcile。
pub async fn delete_at_due_for_sticky(db: &Db, sticky_id: &str) -> AppResult<u64> {
    let res = sqlx::query(
        "DELETE FROM reminders WHERE sticky_id = ? AND kind = 'at_due' AND fired_at IS NULL",
    )
    .bind(sticky_id)
    .execute(db)
    .await?;
    Ok(res.rows_affected())
}

pub async fn mark_fired(db: &Db, id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE reminders SET fired_at = ? WHERE id = ?")
        .bind(now)
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

/// Snooze：复制原 reminder，fire_at = now + minutes*60000，kind='snooze'。原 reminder 标记 fired_at。
pub async fn snooze(db: &Db, id: &str, minutes: i64) -> AppResult<Reminder> {
    let original = get(db, id).await?;
    mark_fired(db, id).await?;
    let now = chrono::Utc::now().timestamp_millis();
    let new_id = ulid::Ulid::new().to_string();
    sqlx::query(
        "INSERT INTO reminders
         (id, sticky_id, item_id, item_index, text_preview, fire_at, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'snooze', ?)",
    )
    .bind(&new_id)
    .bind(&original.sticky_id)
    .bind(&original.item_id)
    .bind(original.item_index)
    .bind(&original.text_preview)
    .bind(now + minutes * 60_000)
    .bind(now)
    .execute(db)
    .await?;
    get(db, &new_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::stickies;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::migrations::run(&pool).await.unwrap();
        pool
    }

    async fn seed_sticky(pool: &SqlitePool) -> String {
        stickies::create_default(pool).await.unwrap().id
    }

    #[tokio::test]
    async fn insert_and_list_pending() {
        let pool = test_pool().await;
        let sid = seed_sticky(&pool).await;
        let now = chrono::Utc::now().timestamp_millis();
        let r = insert(&pool, ReminderInput {
            sticky_id: sid.clone(),
            item_index: 0,
            text_preview: "hello".into(),
            fire_at: now + 60_000,
            kind: "at_due".into(),
        }).await.unwrap();
        let pending = list_pending(&pool).await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, r.id);
        assert_eq!(pending[0].fired_at, None);
    }

    #[tokio::test]
    async fn mark_fired_removes_from_pending() {
        let pool = test_pool().await;
        let sid = seed_sticky(&pool).await;
        let r = insert(&pool, ReminderInput {
            sticky_id: sid,
            item_index: 0,
            text_preview: "x".into(),
            fire_at: 0,
            kind: "at_due".into(),
        }).await.unwrap();
        mark_fired(&pool, &r.id).await.unwrap();
        assert!(list_pending(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn snooze_creates_new_row_and_marks_original_fired() {
        let pool = test_pool().await;
        let sid = seed_sticky(&pool).await;
        let r = insert(&pool, ReminderInput {
            sticky_id: sid,
            item_index: 0,
            text_preview: "p".into(),
            fire_at: 0,
            kind: "at_due".into(),
        }).await.unwrap();
        let sn = snooze(&pool, &r.id, 10).await.unwrap();
        assert_eq!(sn.kind, "snooze");
        assert!(sn.fire_at >= chrono::Utc::now().timestamp_millis() + 9 * 60_000);

        // 原 reminder 应该已 fired
        let original = get(&pool, &r.id).await.unwrap();
        assert!(original.fired_at.is_some());

        // list_pending 只剩 snooze 那条
        let pending = list_pending(&pool).await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, sn.id);
    }

    #[tokio::test]
    async fn delete_at_due_keeps_snoozed() {
        let pool = test_pool().await;
        let sid = seed_sticky(&pool).await;
        let r = insert(&pool, ReminderInput {
            sticky_id: sid.clone(), item_index: 0, text_preview: "a".into(),
            fire_at: 1000, kind: "at_due".into(),
        }).await.unwrap();
        let _sn = snooze(&pool, &r.id, 5).await.unwrap();
        // 再插一条 at_due（reconcile 模拟）
        insert(&pool, ReminderInput {
            sticky_id: sid.clone(), item_index: 0, text_preview: "b".into(),
            fire_at: 2000, kind: "at_due".into(),
        }).await.unwrap();

        let deleted = delete_at_due_for_sticky(&pool, &sid).await.unwrap();
        assert_eq!(deleted, 1); // 只删 unfired at_due
        let pending = list_pending(&pool).await.unwrap();
        assert_eq!(pending.len(), 1); // 剩 snooze
        assert_eq!(pending[0].kind, "snooze");
    }
}

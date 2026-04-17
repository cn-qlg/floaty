use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Item {
    pub id: String,
    pub sticky_id: String,
    pub content_md: String,
    pub due_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ItemUpsert {
    pub id: Option<String>,
    pub sticky_id: String,
    pub content_md: String,
    pub due_at: Option<i64>,
    pub sort_order: i64,
}

pub async fn list(db: &Db, sticky_id: &str) -> AppResult<Vec<Item>> {
    let rows = sqlx::query_as::<_, Item>(
        "SELECT * FROM items WHERE sticky_id = ? ORDER BY sort_order ASC",
    )
    .bind(sticky_id)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn upsert(db: &Db, input: ItemUpsert) -> AppResult<Item> {
    let now = chrono::Utc::now().timestamp_millis();
    let id = input.id.unwrap_or_else(|| ulid::Ulid::new().to_string());
    sqlx::query(
        "INSERT INTO items (id, sticky_id, content_md, due_at, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            content_md = excluded.content_md,
            due_at = excluded.due_at,
            sort_order = excluded.sort_order,
            updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&input.sticky_id)
    .bind(&input.content_md)
    .bind(input.due_at)
    .bind(input.sort_order)
    .bind(now)
    .bind(now)
    .execute(db)
    .await?;
    get(db, &id).await
}

pub async fn get(db: &Db, id: &str) -> AppResult<Item> {
    let row = sqlx::query_as::<_, Item>("SELECT * FROM items WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    Ok(row)
}

pub async fn toggle(db: &Db, id: &str) -> AppResult<Item> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "UPDATE items SET completed_at =
            CASE WHEN completed_at IS NULL THEN ? ELSE NULL END,
            updated_at = ?
         WHERE id = ?",
    )
    .bind(now)
    .bind(now)
    .bind(id)
    .execute(db)
    .await?;
    get(db, id).await
}

pub async fn delete(db: &Db, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM items WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
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

    #[tokio::test]
    async fn upsert_creates_when_id_is_none() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        let item = upsert(&pool, ItemUpsert {
            id: None,
            sticky_id: s.id.clone(),
            content_md: "- [ ] hello".into(),
            due_at: None,
            sort_order: 0,
        }).await.unwrap();
        assert_eq!(item.content_md, "- [ ] hello");
        assert_eq!(item.completed_at, None);
        assert_eq!(item.sort_order, 0);
    }

    #[tokio::test]
    async fn upsert_updates_when_id_exists() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        let i1 = upsert(&pool, ItemUpsert {
            id: None,
            sticky_id: s.id.clone(),
            content_md: "v1".into(),
            due_at: None,
            sort_order: 0,
        }).await.unwrap();
        let i2 = upsert(&pool, ItemUpsert {
            id: Some(i1.id.clone()),
            sticky_id: s.id,
            content_md: "v2".into(),
            due_at: None,
            sort_order: 0,
        }).await.unwrap();
        assert_eq!(i1.id, i2.id);
        assert_eq!(i2.content_md, "v2");
    }

    #[tokio::test]
    async fn toggle_marks_complete_then_uncomplete() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        let i = upsert(&pool, ItemUpsert {
            id: None, sticky_id: s.id, content_md: "x".into(),
            due_at: None, sort_order: 0,
        }).await.unwrap();
        let i = toggle(&pool, &i.id).await.unwrap();
        assert!(i.completed_at.is_some());
        let i = toggle(&pool, &i.id).await.unwrap();
        assert!(i.completed_at.is_none());
    }

    #[tokio::test]
    async fn list_returns_in_sort_order() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        for (i, txt) in ["c", "a", "b"].iter().enumerate() {
            upsert(&pool, ItemUpsert {
                id: None, sticky_id: s.id.clone(), content_md: txt.to_string(),
                due_at: None, sort_order: i as i64,
            }).await.unwrap();
        }
        let items = list(&pool, &s.id).await.unwrap();
        assert_eq!(items.iter().map(|i| i.content_md.as_str()).collect::<Vec<_>>(),
                   vec!["c", "a", "b"]);
    }
}

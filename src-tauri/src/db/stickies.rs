use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Sticky {
    pub id: String,
    pub title: String,
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub w: i64,
    pub h: i64,
    pub pinned: i64,
    pub bg_color: String,
    pub opacity: f64,
    pub font_size: i64,
    pub font_color: Option<String>,
    pub z_order: i64,
    pub hidden: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn create_default(db: &Db) -> AppResult<Sticky> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO stickies (id, title, w, h, pinned, bg_color, opacity, font_size, z_order, hidden, created_at, updated_at)
         VALUES (?, '', 320, 420, 0, '#FFDC96', 0.85, 14, 0, 0, ?, ?)",
    )
    .bind(&id)
    .bind(now)
    .bind(now)
    .execute(db)
    .await?;
    get(db, &id).await
}

pub async fn get(db: &Db, id: &str) -> AppResult<Sticky> {
    let row = sqlx::query_as::<_, Sticky>("SELECT * FROM stickies WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    Ok(row)
}

pub async fn list_visible(db: &Db) -> AppResult<Vec<Sticky>> {
    let rows = sqlx::query_as::<_, Sticky>(
        "SELECT * FROM stickies WHERE hidden = 0 ORDER BY z_order ASC",
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct StickyPatch {
    pub title: Option<String>,
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub w: Option<i64>,
    pub h: Option<i64>,
    pub pinned: Option<i64>,
    pub bg_color: Option<String>,
    pub opacity: Option<f64>,
    pub font_size: Option<i64>,
    pub font_color: Option<String>,
    pub z_order: Option<i64>,
    pub hidden: Option<i64>,
}

pub async fn list_all(db: &Db) -> AppResult<Vec<Sticky>> {
    let rows = sqlx::query_as::<_, Sticky>(
        "SELECT * FROM stickies ORDER BY z_order ASC, created_at ASC",
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn update(db: &Db, id: &str, patch: StickyPatch) -> AppResult<Sticky> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "UPDATE stickies SET
            title = COALESCE(?, title),
            x = COALESCE(?, x),
            y = COALESCE(?, y),
            w = COALESCE(?, w),
            h = COALESCE(?, h),
            pinned = COALESCE(?, pinned),
            bg_color = COALESCE(?, bg_color),
            opacity = COALESCE(?, opacity),
            font_size = COALESCE(?, font_size),
            font_color = COALESCE(?, font_color),
            z_order = COALESCE(?, z_order),
            hidden = COALESCE(?, hidden),
            updated_at = ?
         WHERE id = ?",
    )
    .bind(patch.title)
    .bind(patch.x)
    .bind(patch.y)
    .bind(patch.w)
    .bind(patch.h)
    .bind(patch.pinned)
    .bind(patch.bg_color)
    .bind(patch.opacity)
    .bind(patch.font_size)
    .bind(patch.font_color)
    .bind(patch.z_order)
    .bind(patch.hidden)
    .bind(now)
    .bind(id)
    .execute(db)
    .await?;
    get(db, id).await
}

pub async fn delete(db: &Db, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM stickies WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::migrations::run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn create_default_returns_sticky_with_defaults() {
        let pool = test_pool().await;
        let s = create_default(&pool).await.unwrap();
        assert_eq!(s.title, "");
        assert_eq!(s.w, 320);
        assert_eq!(s.h, 420);
        assert_eq!(s.bg_color, "#FFDC96");
        assert_eq!(s.opacity, 0.85);
        assert_eq!(s.hidden, 0);
        assert!(s.id.len() == 26);
    }

    #[tokio::test]
    async fn get_returns_not_found_for_missing() {
        let pool = test_pool().await;
        let r = get(&pool, "nonexistent").await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound)));
    }

    #[tokio::test]
    async fn list_visible_excludes_hidden() {
        let pool = test_pool().await;
        let a = create_default(&pool).await.unwrap();
        let _b = create_default(&pool).await.unwrap();
        sqlx::query("UPDATE stickies SET hidden = 1 WHERE id = ?")
            .bind(&a.id)
            .execute(&pool).await.unwrap();
        let visible = list_visible(&pool).await.unwrap();
        assert_eq!(visible.len(), 1);
        assert_ne!(visible[0].id, a.id);
    }

    #[tokio::test]
    async fn update_applies_patch() {
        let pool = test_pool().await;
        let s = create_default(&pool).await.unwrap();
        let updated = update(&pool, &s.id, StickyPatch {
            title: Some("work".into()),
            x: Some(100),
            y: Some(200),
            pinned: Some(1),
            ..Default::default()
        }).await.unwrap();
        assert_eq!(updated.title, "work");
        assert_eq!(updated.x, Some(100));
        assert_eq!(updated.y, Some(200));
        assert_eq!(updated.pinned, 1);
        assert_eq!(updated.w, 320);
    }

    #[tokio::test]
    async fn list_all_includes_hidden() {
        let pool = test_pool().await;
        let a = create_default(&pool).await.unwrap();
        let _b = create_default(&pool).await.unwrap();
        update(&pool, &a.id, StickyPatch { hidden: Some(1), ..Default::default() })
            .await.unwrap();
        let all = list_all(&pool).await.unwrap();
        assert_eq!(all.len(), 2);
        let visible = list_visible(&pool).await.unwrap();
        assert_eq!(visible.len(), 1);
    }

    #[tokio::test]
    async fn delete_cascades_items() {
        let pool = test_pool().await;
        let s = create_default(&pool).await.unwrap();
        sqlx::query("INSERT INTO items (id, sticky_id, content_md, sort_order, created_at, updated_at) VALUES ('i1', ?, 'x', 0, 0, 0)")
            .bind(&s.id).execute(&pool).await.unwrap();
        delete(&pool, &s.id).await.unwrap();
        let items: Vec<(String,)> = sqlx::query_as("SELECT id FROM items WHERE sticky_id = ?")
            .bind(&s.id).fetch_all(&pool).await.unwrap();
        assert!(items.is_empty(), "ON DELETE CASCADE should remove items");
    }
}

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
}

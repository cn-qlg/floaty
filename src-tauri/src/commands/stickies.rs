use crate::db::{self, stickies::{Sticky, StickyPatch}, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub async fn get_or_create_default_sticky(db: State<'_, Db>) -> AppResult<Sticky> {
    let visible = db::stickies::list_visible(&db).await?;
    if let Some(s) = visible.into_iter().next() {
        return Ok(s);
    }
    db::stickies::create_default(&db).await
}

#[tauri::command]
pub async fn list_stickies(db: State<'_, Db>) -> AppResult<Vec<Sticky>> {
    db::stickies::list_visible(&db).await
}

#[tauri::command]
pub async fn list_all_stickies(db: State<'_, Db>) -> AppResult<Vec<Sticky>> {
    db::stickies::list_all(&db).await
}

#[tauri::command]
pub async fn get_sticky(db: State<'_, Db>, id: String) -> AppResult<Sticky> {
    db::stickies::get(&db, &id).await
}

#[tauri::command]
pub async fn create_sticky(db: State<'_, Db>) -> AppResult<Sticky> {
    db::stickies::create_default(&db).await
}

#[tauri::command]
pub async fn update_sticky(db: State<'_, Db>, id: String, patch: StickyPatch) -> AppResult<Sticky> {
    db::stickies::update(&db, &id, patch).await
}

#[tauri::command]
pub async fn delete_sticky(db: State<'_, Db>, id: String) -> AppResult<()> {
    db::stickies::delete(&db, &id).await
}

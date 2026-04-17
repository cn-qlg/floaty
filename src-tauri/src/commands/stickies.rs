use crate::db::{self, stickies::Sticky, Db};
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

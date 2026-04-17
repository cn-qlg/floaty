use crate::db::{self, items::{Item, ItemUpsert}, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub async fn list_items(db: State<'_, Db>, sticky_id: String) -> AppResult<Vec<Item>> {
    db::items::list(&db, &sticky_id).await
}

#[tauri::command]
pub async fn upsert_item(db: State<'_, Db>, input: ItemUpsert) -> AppResult<Item> {
    db::items::upsert(&db, input).await
}

#[tauri::command]
pub async fn toggle_item(db: State<'_, Db>, id: String) -> AppResult<Item> {
    db::items::toggle(&db, &id).await
}

#[tauri::command]
pub async fn delete_item(db: State<'_, Db>, id: String) -> AppResult<()> {
    db::items::delete(&db, &id).await
}

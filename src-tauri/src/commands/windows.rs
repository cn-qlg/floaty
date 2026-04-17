use crate::db::Db;
use crate::error::AppResult;
use crate::windows;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn open_sticky_window(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<()> {
    let sticky = crate::db::stickies::get(&db, &sticky_id).await?;
    windows::open(&app, &sticky).await?;
    Ok(())
}

#[tauri::command]
pub async fn hide_sticky(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<()> {
    windows::hide(&app, &sticky_id, &db).await
}

#[tauri::command]
pub async fn show_sticky(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<()> {
    windows::show(&app, &sticky_id, &db).await?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<bool> {
    windows::toggle_pin(&app, &sticky_id, &db).await
}

#[tauri::command]
pub async fn new_sticky_window(app: AppHandle, db: State<'_, Db>) -> AppResult<String> {
    let sticky = crate::db::stickies::create_default(&db).await?;
    windows::open(&app, &sticky).await?;
    Ok(sticky.id)
}

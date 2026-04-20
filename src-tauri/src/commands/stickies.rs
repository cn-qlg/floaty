use crate::db::{self, stickies::{Sticky, StickyPatch}, Db};
use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_or_create_default_sticky(app: AppHandle, db: State<'_, Db>) -> AppResult<Sticky> {
    let visible = db::stickies::list_visible(&db).await?;
    if let Some(s) = visible.into_iter().next() {
        return Ok(s);
    }
    let s = db::stickies::create_default(&db).await?;
    crate::tray::refresh_menu(&app).await;
    Ok(s)
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
pub async fn create_sticky(app: AppHandle, db: State<'_, Db>) -> AppResult<Sticky> {
    let s = db::stickies::create_default(&db).await?;
    crate::tray::refresh_menu(&app).await;
    Ok(s)
}

#[tauri::command]
pub async fn update_sticky(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    patch: StickyPatch,
) -> AppResult<Sticky> {
    let s = db::stickies::update(&db, &id, patch).await?;
    crate::tray::refresh_menu(&app).await;
    Ok(s)
}

#[tauri::command]
pub async fn delete_sticky(app: AppHandle, db: State<'_, Db>, id: String) -> AppResult<()> {
    // 先关掉窗口（destroy webview），再删 DB（级联删 items + reminders）
    if let Some(w) = app.get_webview_window(&crate::windows::label(&id)) {
        w.close()
            .map_err(|e| AppError::Other(format!("delete_sticky close: {}", e)))?;
    }
    db::stickies::delete(&db, &id).await?;
    crate::tray::refresh_menu(&app).await;
    Ok(())
}

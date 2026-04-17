use crate::db::{self, stickies::Sticky, Db};
use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 标签前缀 + sticky id 构成窗口 label
pub fn label(sticky_id: &str) -> String {
    format!("sticky-{}", sticky_id)
}

/// 从 label 反解 sticky id
pub fn id_from_label(label: &str) -> Option<&str> {
    label.strip_prefix("sticky-")
}

/// 打开一个便签窗口（已存在则 focus）。成功返回 WebviewWindow。
pub async fn open(app: &AppHandle, sticky: &Sticky) -> AppResult<WebviewWindow> {
    let lbl = label(&sticky.id);
    if let Some(w) = app.get_webview_window(&lbl) {
        w.set_focus().ok();
        return Ok(w);
    }

    let url = format!("index.html#/sticky/{}", sticky.id);
    let mut builder = WebviewWindowBuilder::new(app, &lbl, WebviewUrl::App(url.into()))
        .title("Floaty")
        .inner_size(sticky.w as f64, sticky.h as f64)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(sticky.pinned == 1)
        .visible(true);

    if let (Some(x), Some(y)) = (sticky.x, sticky.y) {
        builder = builder.position(x as f64, y as f64);
    }

    let window = builder
        .build()
        .map_err(|e| AppError::Other(format!("window build failed: {}", e)))?;

    attach_geometry_listener(&window, sticky.id.clone())?;
    Ok(window)
}

/// 关闭（隐藏）便签窗口：DB 标记 hidden，销毁 webview。
pub async fn hide(app: &AppHandle, sticky_id: &str, db: &Db) -> AppResult<()> {
    db::stickies::update(
        db,
        sticky_id,
        db::stickies::StickyPatch {
            hidden: Some(1),
            ..Default::default()
        },
    )
    .await?;
    if let Some(w) = app.get_webview_window(&label(sticky_id)) {
        w.close()
            .map_err(|e| AppError::Other(format!("window close: {}", e)))?;
    }
    Ok(())
}

/// 从菜单栏恢复一个已隐藏的便签
pub async fn show(app: &AppHandle, sticky_id: &str, db: &Db) -> AppResult<WebviewWindow> {
    let sticky = db::stickies::update(
        db,
        sticky_id,
        db::stickies::StickyPatch {
            hidden: Some(0),
            ..Default::default()
        },
    )
    .await?;
    open(app, &sticky).await
}

/// 切换 always-on-top。返回新的 pinned 状态。
pub async fn toggle_pin(app: &AppHandle, sticky_id: &str, db: &Db) -> AppResult<bool> {
    let s = db::stickies::get(db, sticky_id).await?;
    let next = if s.pinned == 1 { 0 } else { 1 };
    db::stickies::update(
        db,
        sticky_id,
        db::stickies::StickyPatch {
            pinned: Some(next),
            ..Default::default()
        },
    )
    .await?;
    if let Some(w) = app.get_webview_window(&label(sticky_id)) {
        w.set_always_on_top(next == 1)
            .map_err(|e| AppError::Other(format!("set_always_on_top: {}", e)))?;
    }
    Ok(next == 1)
}

/// 冷启动：打开所有 hidden=0 的便签；若一张都没，新建一张并打开。
pub async fn restore_on_startup(app: &AppHandle, db: &Db) -> AppResult<()> {
    let visible = db::stickies::list_visible(db).await?;
    if visible.is_empty() {
        let fresh = db::stickies::create_default(db).await?;
        open(app, &fresh).await?;
    } else {
        for s in visible {
            open(app, &s).await?;
        }
    }
    Ok(())
}

/// 绑定 Move/Resize → 写回 DB。
fn attach_geometry_listener(window: &WebviewWindow, sticky_id: String) -> AppResult<()> {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        use tauri::WindowEvent;
        let (x, y, w, h) = match event {
            WindowEvent::Moved(pos) => {
                let w = app.get_webview_window(&label);
                let size = w.as_ref().and_then(|w| w.inner_size().ok());
                let (width, height) = size
                    .map(|s| (s.width as i64, s.height as i64))
                    .unwrap_or((320, 420));
                (pos.x as i64, pos.y as i64, width, height)
            }
            WindowEvent::Resized(size) => {
                let w = app.get_webview_window(&label);
                let pos = w.as_ref().and_then(|w| w.outer_position().ok());
                let (x, y) = pos
                    .map(|p| (p.x as i64, p.y as i64))
                    .unwrap_or((0, 0));
                (x, y, size.width as i64, size.height as i64)
            }
            _ => return,
        };
        let sticky_id = sticky_id.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(db) = app.try_state::<Db>() {
                let _ = db::stickies::update(
                    &db,
                    &sticky_id,
                    db::stickies::StickyPatch {
                        x: Some(x),
                        y: Some(y),
                        w: Some(w),
                        h: Some(h),
                        ..Default::default()
                    },
                )
                .await;
            }
        });
    });
    Ok(())
}

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

/// 打开一个便签窗口（已存在则 show + focus）。成功返回 WebviewWindow。
pub async fn open(app: &AppHandle, sticky: &Sticky) -> AppResult<WebviewWindow> {
    let lbl = label(&sticky.id);
    if let Some(w) = app.get_webview_window(&lbl) {
        w.show().ok();
        w.set_focus().ok();
        return Ok(w);
    }

    let url = format!("index.html#/sticky/{}", sticky.id);
    // 防御式 clamp：如果过去因 bug 存了异常大的"逻辑尺寸"，重置为默认
    let (w, h) = sanitize_size(sticky.w, sticky.h);
    let mut builder = WebviewWindowBuilder::new(app, &lbl, WebviewUrl::App(url.into()))
        .title("Floaty")
        .inner_size(w as f64, h as f64)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(sticky.pinned == 1)
        .visible(true);

    if let (Some(x), Some(y)) = (sticky.x, sticky.y) {
        if let Some((sx, sy)) = sanitize_position(x, y) {
            // 进一步确认位置至少在某个显示器可见范围内
            if position_visible_on_any_monitor(app, sx, sy, w, h) {
                builder = builder.position(sx as f64, sy as f64);
            }
        }
    }

    let window = builder
        .build()
        .map_err(|e| AppError::Other(format!("window build failed: {}", e)))?;

    attach_geometry_listener(&window, sticky.id.clone())?;
    Ok(window)
}

/// 关闭（隐藏）便签窗口。策略：
/// 1) DB 标记 hidden=1
/// 2) 不调 w.hide()（会触发 macOS key-window cascade → 另一张 sticky 被拉前）
///    也不调 w.close()（会 destroy + 触发全 app 窗口重排）
///    而是把窗口移到屏幕外（-32000, -32000）+ 设为非 always_on_top，
///    macOS 认为窗口还"可见"于某处，不做 key-window 重新挑选，
///    其它 sticky 的 z-order 完全不变。
///    重新显示时把位置恢复并（如 pinned）重新置顶。
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
        // 先取消 always_on_top，否则即使在屏幕外也会在桌面切换时闪现
        let _ = w.set_always_on_top(false);
        w.set_position(tauri::LogicalPosition::new(-32000.0, -32000.0))
            .map_err(|e| AppError::Other(format!("window set_position offscreen: {}", e)))?;
    }
    Ok(())
}

/// 从菜单栏恢复一个已隐藏的便签：
/// 若窗口已存在（被 hide 挪到屏幕外）→ 恢复位置 + 重新 pinned 状态
/// 不存在 → 当作冷启动打开
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
    if let Some(w) = app.get_webview_window(&label(sticky_id)) {
        // 从 offscreen 恢复位置
        let (x, y) = match (sticky.x, sticky.y) {
            (Some(x), Some(y)) => sanitize_position(x, y).unwrap_or((200, 200)),
            _ => (200, 200),
        };
        w.set_position(tauri::LogicalPosition::new(x as f64, y as f64))
            .map_err(|e| AppError::Other(format!("window set_position restore: {}", e)))?;
        let _ = w.set_always_on_top(sticky.pinned == 1);
        w.set_focus().ok();
        return Ok(w);
    }
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

/// "Bring all to front"：把所有便签都推到桌面最前。
/// - hidden=1：先 un-hide（DB + webview）+ open 窗口
/// - hidden=0 有 window：show + set_focus 提到前面
/// - hidden=0 无 window（异常）：open 重建
/// 返回被操作的便签数。
pub async fn show_all(app: &AppHandle, db: &Db) -> AppResult<usize> {
    let all = db::stickies::list_all(db).await?;
    let mut shown = 0;
    for s in &all {
        if s.hidden == 1 {
            if let Err(e) = show(app, &s.id, db).await {
                eprintln!("[floaty] show_all (hidden): {} failed: {}", s.id, e);
                continue;
            }
        } else if let Some(w) = app.get_webview_window(&label(&s.id)) {
            let _ = w.show();
            let _ = w.set_focus();
        } else if let Err(e) = open(app, s).await {
            eprintln!("[floaty] show_all (reopen): {} failed: {}", s.id, e);
            continue;
        }
        shown += 1;
    }
    Ok(shown)
}

/// 冷启动：打开所有 hidden=0 的便签。
/// 仅当**全库为空**（首次安装）时才自动创建一张默认便签；
/// 有便签但都 hidden=1 时，只启动 tray，让用户通过菜单栏恢复，避免每次重启都冒出空白新便签。
pub async fn restore_on_startup(app: &AppHandle, db: &Db) -> AppResult<()> {
    let visible = db::stickies::list_visible(db).await?;
    if !visible.is_empty() {
        for s in visible {
            open(app, &s).await?;
        }
        return Ok(());
    }
    let all = db::stickies::list_all(db).await?;
    if all.is_empty() {
        let fresh = db::stickies::create_default(db).await?;
        open(app, &fresh).await?;
    }
    Ok(())
}

/// 合理性 clamp：sticky 宽高应在 [200, 1600] 之间，否则重置为默认 320×420
fn sanitize_size(w: i64, h: i64) -> (i64, i64) {
    let w_ok = (200..=1600).contains(&w);
    let h_ok = (200..=1600).contains(&h);
    (if w_ok { w } else { 320 }, if h_ok { h } else { 420 })
}

/// 合理性 clamp：保守屏幕范围（含多显示器）。离谱坐标视为 stale bug 数据。
fn sanitize_position(x: i64, y: i64) -> Option<(i64, i64)> {
    if (-3000..=5000).contains(&x) && (-500..=3000).contains(&y) {
        Some((x, y))
    } else {
        None
    }
}

/// 检查 (x,y,w,h) 矩形是否与任一已连接显示器的可见区域有重叠。
/// 没有重叠（即窗口完全在所有屏幕之外）→ 返回 false，让窗口用默认位置。
fn position_visible_on_any_monitor(app: &AppHandle, x: i64, y: i64, w: i64, h: i64) -> bool {
    // 至少要露出 40 像素宽 + 30 像素高才算"可见"
    let min_overlap_w = 40_i64;
    let min_overlap_h = 30_i64;
    let win_right = x + w;
    let win_bottom = y + h;

    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(_) => return true, // 无法取显示器信息时，保守放行
    };
    // 早期启动时 available_monitors() 可能返回空（系统还没枚举完）→ 保守放行，
    // 避免把合法位置误判为 offscreen 导致用户的便签被重置到默认位置。
    if monitors.is_empty() {
        return true;
    }
    for mon in monitors {
        let scale = mon.scale_factor();
        let pos = mon.position();
        let size = mon.size();
        // 显示器坐标是物理像素；转换为逻辑像素（与 window.position 同单位）
        let mx = (pos.x as f64 / scale) as i64;
        let my = (pos.y as f64 / scale) as i64;
        let mw = (size.width as f64 / scale) as i64;
        let mh = (size.height as f64 / scale) as i64;
        let mon_right = mx + mw;
        let mon_bottom = my + mh;

        let overlap_w = win_right.min(mon_right) - x.max(mx);
        let overlap_h = win_bottom.min(mon_bottom) - y.max(my);
        if overlap_w >= min_overlap_w && overlap_h >= min_overlap_h {
            return true;
        }
    }
    false
}

/// 绑定 Move/Resize → 写回 DB。关键：Tauri 窗口 getter 返回 **物理像素**，
/// 但 WebviewWindowBuilder 接收 **逻辑像素**。保存前必须除以 scale_factor，
/// 否则 Retina 屏下 DB 存成 2× 大小，下次打开窗口变巨大/跑屏幕外。
fn attach_geometry_listener(window: &WebviewWindow, sticky_id: String) -> AppResult<()> {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        use tauri::WindowEvent;
        let Some(win) = app.get_webview_window(&label) else { return; };
        let scale = win.scale_factor().unwrap_or(1.0);
        let (x, y, w, h) = match event {
            WindowEvent::Moved(pos) => {
                let logical_pos = pos.to_logical::<f64>(scale);
                let size = win.inner_size().ok().map(|s| s.to_logical::<f64>(scale));
                let (lw, lh) = size
                    .map(|s| (s.width as i64, s.height as i64))
                    .unwrap_or((320, 420));
                (logical_pos.x as i64, logical_pos.y as i64, lw, lh)
            }
            WindowEvent::Resized(size) => {
                let logical_size = size.to_logical::<f64>(scale);
                let pos = win.outer_position().ok().map(|p| p.to_logical::<f64>(scale));
                let (lx, ly) = pos
                    .map(|p| (p.x as i64, p.y as i64))
                    .unwrap_or((0, 0));
                (lx, ly, logical_size.width as i64, logical_size.height as i64)
            }
            _ => return,
        };
        // Guard: hide() 会把窗口挪到 (-32000,-32000) 屏幕外；这种"伪隐藏"的
        // 移动事件不能覆盖真实位置。用 sanitize_position 统一判定。
        if sanitize_position(x, y).is_none() {
            return;
        }
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

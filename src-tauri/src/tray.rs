use crate::db::{self, Db};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// 初始化 tray。点击时重建菜单（拿到最新便签列表）。
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default window icon missing");

    TrayIconBuilder::with_id("floaty-tray")
        .icon(icon)
        .tooltip("Floaty")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                if let Ok(menu) = build_menu(tray.app_handle()) {
                    let _ = tray.set_menu(Some(menu));
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let db = app.state::<Db>();
    let all = tauri::async_runtime::block_on(db::stickies::list_all(&db))
        .unwrap_or_default();

    let menu = Menu::new(app)?;
    let heading = MenuItem::with_id(
        app,
        "heading",
        format!("便签 ({})", all.len()),
        false,
        None::<&str>,
    )?;
    menu.append(&heading)?;

    for s in &all {
        let label = if s.hidden == 1 {
            format!("· 显示：{}", sticky_display_name(s))
        } else {
            let pin = if s.pinned == 1 { "📌 " } else { "" };
            format!("{}{}", pin, sticky_display_name(s))
        };
        let item = MenuItem::with_id(
            app,
            format!("sticky:{}", s.id),
            label,
            true,
            None::<&str>,
        )?;
        menu.append(&item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let new_item = MenuItem::with_id(
        app,
        "new-sticky",
        "＋ 新建便签",
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?;
    menu.append(&new_item)?;

    let prefs = MenuItem::with_id(app, "preferences", "⚙️ 偏好设置", false, None::<&str>)?;
    menu.append(&prefs)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&PredefinedMenuItem::quit(app, Some("退出"))?)?;
    Ok(menu)
}

fn sticky_display_name(s: &crate::db::stickies::Sticky) -> String {
    if s.title.is_empty() {
        format!("便签 {}", &s.id[..6])
    } else {
        s.title.clone()
    }
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    if id == "new-sticky" {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let db = handle.state::<Db>();
            if let Ok(sticky) = db::stickies::create_default(&db).await {
                let _ = crate::windows::open(&handle, &sticky).await;
            }
        });
    } else if let Some(sticky_id) = id.strip_prefix("sticky:") {
        let handle = app.clone();
        let sticky_id = sticky_id.to_string();
        tauri::async_runtime::spawn(async move {
            let db = handle.state::<Db>();
            if let Ok(s) = db::stickies::get(&db, &sticky_id).await {
                if s.hidden == 1 {
                    let _ = crate::windows::show(&handle, &sticky_id, &db).await;
                } else if let Some(w) = handle.get_webview_window(&crate::windows::label(&sticky_id)) {
                    let _ = w.set_focus();
                }
            }
        });
    }
}

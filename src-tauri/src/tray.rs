use crate::db::{self, stickies::Sticky, Db};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    // setup 不在 tokio worker，block_on 安全
    let db = app.state::<Db>();
    let all = tauri::async_runtime::block_on(db::stickies::list_all(&db))
        .unwrap_or_default();
    let menu = build_menu(app, &all)?;
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
        .build(app)?;
    Ok(())
}

/// 从 IPC（async / tokio worker）调用。必须是 async，不能在里面 block_on。
pub async fn refresh_menu(app: &AppHandle) {
    let db = app.state::<Db>();
    let all = match db::stickies::list_all(&db).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[floaty] tray refresh list_all failed: {}", e);
            return;
        }
    };
    if let Some(tray) = app.tray_by_id("floaty-tray") {
        match build_menu(app, &all) {
            Ok(menu) => {
                if let Err(e) = tray.set_menu(Some(menu)) {
                    eprintln!("[floaty] tray refresh set_menu failed: {}", e);
                }
            }
            Err(e) => eprintln!("[floaty] tray refresh build_menu failed: {}", e),
        }
    }
}

fn build_menu(app: &AppHandle, all: &[Sticky]) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    let heading = MenuItem::with_id(
        app,
        "heading",
        format!("便签 ({})", all.len()),
        false,
        None::<&str>,
    )?;
    menu.append(&heading)?;

    for (i, s) in all.iter().enumerate() {
        let label = if s.hidden == 1 {
            format!("· 显示：{}", sticky_display_name(s, i))
        } else {
            let pin = if s.pinned == 1 { "📌 " } else { "" };
            format!("{}{}", pin, sticky_display_name(s, i))
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

fn sticky_display_name(s: &Sticky, index: usize) -> String {
    if s.title.is_empty() {
        format!("便签 #{}", index + 1)
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
            match db::stickies::create_default(&db).await {
                Ok(sticky) => {
                    if let Err(e) = crate::windows::open(&handle, &sticky).await {
                        eprintln!("[floaty] tray new-sticky open failed: {}", e);
                    }
                    refresh_menu(&handle).await;
                }
                Err(e) => eprintln!("[floaty] tray new-sticky create failed: {}", e),
            }
        });
    } else if let Some(sticky_id) = id.strip_prefix("sticky:") {
        let handle = app.clone();
        let sticky_id = sticky_id.to_string();
        tauri::async_runtime::spawn(async move {
            let db = handle.state::<Db>();
            match db::stickies::get(&db, &sticky_id).await {
                Ok(s) => {
                    if s.hidden == 1 {
                        if let Err(e) = crate::windows::show(&handle, &sticky_id, &db).await {
                            eprintln!("[floaty] tray show failed: {}", e);
                        }
                        refresh_menu(&handle).await;
                    } else if let Some(w) = handle.get_webview_window(&crate::windows::label(&sticky_id)) {
                        if let Err(e) = w.set_focus() {
                            eprintln!("[floaty] tray focus failed: {}", e);
                        }
                    } else {
                        // Window missing despite hidden=0; reopen.
                        if let Err(e) = crate::windows::open(&handle, &s).await {
                            eprintln!("[floaty] tray reopen failed: {}", e);
                        }
                    }
                }
                Err(e) => eprintln!("[floaty] tray get failed: {}", e),
            }
        });
    }
}

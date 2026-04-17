use tauri::Manager;

mod commands;
mod db;
mod error;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(async move {
                let data_dir = handle.path().app_data_dir().expect("app_data_dir");
                db::init(data_dir).await.expect("db init")
            });
            app.manage(pool.clone());

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = windows::restore_on_startup(&handle, &pool).await {
                    eprintln!("[floaty] restore_on_startup failed: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::stickies::get_or_create_default_sticky,
            commands::stickies::list_stickies,
            commands::stickies::list_all_stickies,
            commands::stickies::get_sticky,
            commands::stickies::create_sticky,
            commands::stickies::update_sticky,
            commands::stickies::delete_sticky,
            commands::items::list_items,
            commands::items::upsert_item,
            commands::items::toggle_item,
            commands::items::delete_item,
            commands::windows::open_sticky_window,
            commands::windows::hide_sticky,
            commands::windows::show_sticky,
            commands::windows::toggle_pin,
            commands::windows::new_sticky_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

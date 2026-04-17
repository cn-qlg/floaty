use tauri::Manager;

mod commands;
mod db;
mod error;

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
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::stickies::get_or_create_default_sticky,
            commands::stickies::list_stickies,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

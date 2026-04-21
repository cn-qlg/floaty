use crate::db::{self, reminders::ReminderInput, Db};
use crate::error::AppResult;
use crate::reminders::Scheduler;
use tauri::{AppHandle, Manager, State};

/// 前端从 markdown 提取出所有 @due 后调这个命令。
/// Rust 端：删掉该便签所有未触发的 at_due reminders（保留 snooze 的），
/// 然后把新的 entries 批量 insert。最后 wake 调度器重新排队。
#[tauri::command]
pub async fn sync_reminders(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
    entries: Vec<SyncEntry>,
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    db::reminders::delete_at_due_for_sticky(&db, &sticky_id).await?;
    for e in entries {
        // 跳过已过期的条目：这是用户编辑时的 reconcile，不应把历史 due 重新当作"待触发"
        // 启动时的"漏触发兜底"由 scheduler 的 list_pending + fire_at <= now 分支处理，
        // 那里只在 app 冷启动时跑一次。
        if e.fire_at <= now {
            continue;
        }
        db::reminders::insert(
            &db,
            ReminderInput {
                sticky_id: sticky_id.clone(),
                item_index: e.item_index,
                text_preview: e.text_preview,
                fire_at: e.fire_at,
                kind: "at_due".into(),
            },
        )
        .await?;
    }
    if let Some(sched) = app.try_state::<Scheduler>() {
        sched.wake();
    }
    Ok(())
}

#[tauri::command]
pub async fn snooze_reminder(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    minutes: i64,
) -> AppResult<()> {
    db::reminders::snooze(&db, &id, minutes).await?;
    if let Some(sched) = app.try_state::<Scheduler>() {
        sched.wake();
    }
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
pub struct SyncEntry {
    pub item_index: i64,
    pub text_preview: String,
    pub fire_at: i64, // unix ms
}

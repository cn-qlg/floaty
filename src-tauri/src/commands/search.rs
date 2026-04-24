use crate::db::Db;
use crate::error::AppResult;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub sticky_id: String,
    pub item_id: String,
    pub snippet: String,
    pub bg_color: String,
}

/// 全文搜索 items.content_md。排除回收站里的便签。
/// 返回最多 50 条。snippet 里匹配片段用 `【】` 包裹。
#[tauri::command]
pub async fn search_stickies(db: State<'_, Db>, query: String) -> AppResult<Vec<SearchHit>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    // FTS5 phrase query：双引号括起来做短语匹配，规避特殊字符（*/-/AND/OR 等）
    // 的查询语法冲突。用户输入里的 " 转义成 ""。
    let phrase = format!("\"{}\"", q.replace('"', "\"\""));

    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT i.id, i.sticky_id, s.bg_color,
                snippet(items_fts, 0, '【', '】', '…', 12)
         FROM items_fts
         JOIN items i ON i.rowid = items_fts.rowid
         JOIN stickies s ON s.id = i.sticky_id
         WHERE items_fts MATCH ? AND s.deleted_at IS NULL
         ORDER BY rank
         LIMIT 50",
    )
    .bind(&phrase)
    .fetch_all(db.inner())
    .await?;

    Ok(rows
        .into_iter()
        .map(|(item_id, sticky_id, bg_color, snippet)| SearchHit {
            sticky_id,
            item_id,
            snippet,
            bg_color,
        })
        .collect())
}

use serde_json::{json, Value};

// Rotation and cross-thread serialization are owned by the official Tauri log plugin.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::new()
        .targets([tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("application".into()),
            },
        )])
        .max_file_size(4 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .level(log::LevelFilter::Info)
        .filter(|metadata| metadata.target().starts_with("garupa"))
        .build()
}
pub fn initialize(app: &tauri::AppHandle) {
    record(
        "info",
        "application.start",
        json!({"version":app.package_info().version.to_string(),"os":std::env::consts::OS,"pid":std::process::id()}),
    );
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record(
            "error",
            "native.panic",
            json!({"location":info.location().map(|l| format!("{}:{}",l.file(),l.line()))}),
        );
        log::logger().flush();
        previous(info);
    }));
}
pub fn record(level: &str, event: &str, context: Value) {
    let message = json!({"event":event,"context":context});
    match level {
        "error" => log::error!(target: "garupa", "{message}"),
        "warn" => log::warn!(target: "garupa", "{message}"),
        _ => log::info!(target: "garupa", "{message}"),
    }
}
#[tauri::command]
pub async fn application_log_batch(entries: Vec<Value>) -> Result<(), String> {
    if entries.len() > 64 || entries.iter().any(|entry| entry.to_string().len() > 32768) {
        return Err("log batch exceeds limit".into());
    }
    // File I/O never runs on a WebView/UI thread. Frontend supplies bounded,
    // sanitized batches and waits for one batch before submitting another.
    tauri::async_runtime::spawn_blocking(move || {
        for entry in entries {
            let level = entry.get("level").and_then(Value::as_str).unwrap_or("info");
            match level {
                "error" => log::error!(target: "garupa::webview", "{entry}"),
                "warn" => log::warn!(target: "garupa::webview", "{entry}"),
                _ => log::info!(target: "garupa::webview", "{entry}"),
            }
        }
        log::logger().flush();
    })
    .await
    .map_err(|e| e.to_string())
}
pub fn shutdown() {
    record("info", "application.exit", json!({}));
    log::logger().flush();
}

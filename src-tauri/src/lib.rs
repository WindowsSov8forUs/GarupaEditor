use base64::Engine;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};

const DOWNLOAD_PROGRESS_EVENT: &str = "download-progress";
const BESTDORI_LOGIN_API: &str = "https://bestdori.com/api/user/login";
const BESTDORI_ME_API: &str = "https://bestdori.com/api/user/me";
const SESSION_DIR_NAME: &str = "session";
const SESSION_FILE_NAME: &str = "session.v1.json";
const SESSION_BACKUP_FILE_NAME: &str = "session.v1.bak.json";
const CHART_CACHE_FILE_NAME: &str = "chart.v2.json";
const CHART_CACHE_BACKUP_FILE_NAME: &str = "chart.v2.bak.json";
const CHART_CACHE_TEMP_FILE_NAME: &str = "chart.v2.tmp.json";
const SETTINGS_CACHE_FILE_NAME: &str = "settings.v2.json";
const SETTINGS_CACHE_BACKUP_FILE_NAME: &str = "settings.v2.bak.json";
const SETTINGS_CACHE_TEMP_FILE_NAME: &str = "settings.v2.tmp.json";
const BESTDORI_AUTH_CACHE_FILE_NAME: &str = "bestdori-auth.v1.json";
const SESSION_RESOURCES_DIR_NAME: &str = "resources";
const SESSION_RESOURCES_META_NAME: &str = "resources.v1.json";
const SESSION_COVER_FILE_NAME: &str = "cover.bin";
const SESSION_AUDIO_FILE_NAME: &str = "audio.bin";
const CHART_RESOURCES_DIR_NAME: &str = "chart-resources";
const CHART_RESOURCES_META_NAME: &str = "chart-resources.v2.json";
const CHART_COVER_FILE_NAME: &str = "cover.bin";
const CHART_AUDIO_FILE_NAME: &str = "audio.bin";
const CHART_MV_FILE_NAME: &str = "mv.bin";
const HABAHIRO_RIP_NAME: &str = "habahiro";
const HABAHIRO_SAMPLE_RIP_NAME: &str = "habahiro_sample";
const HABAHIRO_MANIFEST_FILENAMES: &[&str] = &[
    "RhythmGameSprites1.png",
    "RhythmGameSprites16.png",
    "RhythmGameSprites2.png",
    "RhythmGameSprites3.png",
    "RhythmGameSprites4.png",
    "RhythmGameSprites5.png",
    "longNoteLine.png",
    "longNoteLine2.png",
    "simultaneous_line.png",
    ".sprites",
    "ingameskin-noteskin-habahiro.bundle",
];
const HABAHIRO_SAMPLE_MANIFEST_FILENAMES: &[&str] = &[
    "note_flick_3.png",
    "note_flick_top.png",
    "note_long_3.png",
    "note_normal_16_3.png",
    "note_normal_3.png",
    "note_skill_3.png",
    "note_slide_among.png",
    "ingameskin-noteskin-habahiro_sample.bundle",
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgressPayload {
    operation_id: String,
    scope_id: String,
    scope_label: String,
    status: String,
    message: String,
    file_name: Option<String>,
    file_index: Option<usize>,
    file_total: Option<usize>,
    file_ratio: Option<f64>,
    scope_ratio: f64,
}

struct DownloadScopeProgress {
    app: tauri::AppHandle,
    operation_id: String,
    scope_id: String,
    scope_label: String,
    file_total: usize,
    completed_files: usize,
}

impl DownloadScopeProgress {
    fn new(
        app: tauri::AppHandle,
        operation_id: String,
        scope_id: String,
        scope_label: String,
        file_total: usize,
    ) -> Self {
        let progress = Self {
            app,
            operation_id,
            scope_id,
            scope_label,
            file_total,
            completed_files: 0,
        };
        progress.emit(
            "scope_start",
            "开始下载资源…".to_string(),
            None,
            0.0,
            None,
            None,
        );
        if file_total == 0 {
            progress.emit(
                "scope_complete",
                "资源已就绪。".to_string(),
                None,
                1.0,
                None,
                None,
            );
        }
        progress
    }

    fn scope_ratio_with_file_ratio(&self, file_ratio: f64) -> f64 {
        if self.file_total == 0 {
            return 1.0;
        }
        let completed = self.completed_files as f64;
        let total = self.file_total as f64;
        ((completed + file_ratio.clamp(0.0, 1.0)) / total).clamp(0.0, 1.0)
    }

    fn emit(
        &self,
        status: &str,
        message: String,
        file_name: Option<String>,
        file_ratio: f64,
        file_index: Option<usize>,
        file_total: Option<usize>,
    ) {
        let payload = DownloadProgressPayload {
            operation_id: self.operation_id.clone(),
            scope_id: self.scope_id.clone(),
            scope_label: self.scope_label.clone(),
            status: status.to_string(),
            message,
            file_name,
            file_index,
            file_total,
            file_ratio: Some(file_ratio.clamp(0.0, 1.0)),
            scope_ratio: self.scope_ratio_with_file_ratio(file_ratio),
        };
        let _ = self.app.emit(DOWNLOAD_PROGRESS_EVENT, payload);
    }

    fn report_file_cached(&mut self, file_name: &str, file_index: usize) {
        self.completed_files = self.completed_files.saturating_add(1);
        self.emit(
            "file_complete",
            format!("已复用本地资源：{file_name}"),
            Some(file_name.to_string()),
            0.0,
            Some(file_index),
            Some(self.file_total),
        );
    }

    fn report_file_start(&self, file_name: &str, file_index: usize) {
        self.emit(
            "file_start",
            format!("正在下载：{file_name}"),
            Some(file_name.to_string()),
            0.0,
            Some(file_index),
            Some(self.file_total),
        );
    }

    fn report_file_progress(&self, file_name: &str, file_index: usize, file_ratio: f64) {
        self.emit(
            "file_progress",
            format!("下载中：{file_name}"),
            Some(file_name.to_string()),
            file_ratio,
            Some(file_index),
            Some(self.file_total),
        );
    }

    fn report_file_complete(&mut self, file_name: &str, file_index: usize) {
        self.completed_files = self.completed_files.saturating_add(1);
        self.emit(
            "file_complete",
            format!("已下载：{file_name}"),
            Some(file_name.to_string()),
            0.0,
            Some(file_index),
            Some(self.file_total),
        );
    }

    fn report_scope_complete(&self) {
        self.emit(
            "scope_complete",
            "资源下载完成。".to_string(),
            None,
            1.0,
            Some(self.file_total),
            Some(self.file_total),
        );
    }

    fn report_scope_error(&self, message: String) {
        self.emit(
            "scope_error",
            message,
            None,
            0.0,
            None,
            Some(self.file_total),
        );
    }

    fn report_scope_message(&self, message: String) {
        self.emit(
            "scope_message",
            message,
            None,
            0.0,
            None,
            Some(self.file_total),
        );
    }
}

#[derive(Default)]
struct BestdoriAuthState {
    cookie_header: Mutex<Option<String>>,
    user_me: Mutex<Option<BestdoriUserMeResponse>>,
}

#[derive(Deserialize)]
struct BestdoriLoginResponse {
    result: bool,
    code: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
struct BestdoriUserTitle {
    id: i64,
    #[serde(rename = "type")]
    kind: String,
    server: i64,
}

fn deserialize_user_titles_or_default<'de, D>(
    deserializer: D,
) -> Result<Vec<BestdoriUserTitle>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let parsed = Option::<Vec<BestdoriUserTitle>>::deserialize(deserializer)?;
    Ok(parsed.unwrap_or_default())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BestdoriUserMeResponse {
    result: bool,
    username: Option<String>,
    nickname: Option<String>,
    #[serde(default, deserialize_with = "deserialize_user_titles_or_default")]
    titles: Vec<BestdoriUserTitle>,
    email: Option<String>,
    message_count: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BestdoriAuthCache {
    cookie_header: Option<String>,
    user_me: Option<BestdoriUserMeResponse>,
}

fn encode_base64(bytes: impl AsRef<[u8]>) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|error| format!("decode base64 failed: {error}"))
}

fn resolve_executable_directory() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("resolve executable path failed: {error}"))?;
    executable
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "resolve executable directory failed: missing parent".to_string())
}

fn resolve_game_skin_assets_root(
    folder_name: &str,
    create_error_label: &str,
) -> Result<PathBuf, String> {
    let mut directory = resolve_executable_directory()?;
    directory.push("assets");
    directory.push("game");
    directory.push(folder_name);
    fs::create_dir_all(&directory).map_err(|error| format!("{create_error_label}: {error}"))?;
    Ok(directory)
}

fn resolve_skin_assets_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_game_skin_assets_root("noteskin", "create skin assets dir failed")
}

fn resolve_field_skin_assets_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_game_skin_assets_root("fieldskin", "create field skin assets dir failed")
}

fn resolve_bg_skin_assets_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_game_skin_assets_root("bgskin", "create bg skin assets dir failed")
}

fn resolve_judge_skin_assets_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_game_skin_assets_root("judgeskin", "create judge skin assets dir failed")
}

fn resolve_sound_assets_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = resolve_executable_directory()?;
    directory.push("assets");
    directory.push("sound");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("create sound assets dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_tapseskin_assets_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = resolve_sound_assets_root(app)?;
    directory.push("tapseskin");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("create tapseskin assets dir failed: {error}"))?;
    Ok(directory)
}

fn normalize_namespace(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err(format!(
            "{label} contains invalid characters, only [a-zA-Z0-9_-] is allowed"
        ));
    }
    Ok(trimmed.to_string())
}

fn resolve_bestdori_namespace_root(
    app: &tauri::AppHandle,
    namespace: &str,
) -> Result<PathBuf, String> {
    let normalized = normalize_namespace(namespace, "namespace")?;
    match normalized.as_str() {
        "noteskin" => resolve_skin_assets_root(app),
        "fieldskin" => resolve_field_skin_assets_root(app),
        "bgskin" => resolve_bg_skin_assets_root(app),
        "judgeskin" => resolve_judge_skin_assets_root(app),
        "tapseskin" => resolve_tapseskin_assets_root(app),
        "sound-common" => {
            let mut directory = resolve_sound_assets_root(app)?;
            directory.push("common_rip");
            fs::create_dir_all(&directory)
                .map_err(|error| format!("create common sound assets dir failed: {error}"))?;
            Ok(directory)
        }
        _ => {
            let mut directory = resolve_executable_directory()?;
            directory.push("assets");
            directory.push("bestdori");
            directory.push(normalized);
            fs::create_dir_all(&directory)
                .map_err(|error| format!("create bestdori namespace dir failed: {error}"))?;
            Ok(directory)
        }
    }
}

fn resolve_session_cache_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = resolve_executable_directory()?;
    directory.push("cache");
    directory.push(SESSION_DIR_NAME);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("create session cache dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_session_resources_root(root: &Path) -> Result<PathBuf, String> {
    let directory = root.join(SESSION_RESOURCES_DIR_NAME);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("create session resources dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_chart_resources_root(root: &Path) -> Result<PathBuf, String> {
    let directory = root.join(CHART_RESOURCES_DIR_NAME);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("create chart resources dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_bestdori_auth_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = resolve_session_cache_root(app)?;
    Ok(root.join(BESTDORI_AUTH_CACHE_FILE_NAME))
}

fn normalize_rip_name(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err(format!(
            "{label} contains invalid characters, only [a-zA-Z0-9_-] is allowed"
        ));
    }
    Ok(trimmed.to_string())
}

fn normalize_login_value(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    Ok(trimmed.to_string())
}

fn format_login_error_code(code: &Option<serde_json::Value>) -> String {
    match code {
        Some(value) => value.to_string(),
        None => "unknown".to_string(),
    }
}

fn extract_cookie_header_from_response(response: &reqwest::Response) -> Result<String, String> {
    let mut cookie_parts: Vec<String> = Vec::new();
    for value in response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
    {
        let raw = value
            .to_str()
            .map_err(|error| format!("parse Set-Cookie header failed: {error}"))?;
        let Some(pair) = raw.split(';').next() else {
            continue;
        };
        let trimmed = pair.trim();
        if trimmed.is_empty() {
            continue;
        }
        cookie_parts.push(trimmed.to_string());
    }
    if cookie_parts.is_empty() {
        return Err("login response does not contain cookies".to_string());
    }
    Ok(cookie_parts.join("; "))
}

fn get_bestdori_cookie_header(
    state: &tauri::State<BestdoriAuthState>,
) -> Result<Option<String>, String> {
    let guard = state
        .cookie_header
        .lock()
        .map_err(|error| format!("lock bestdori auth state failed: {error}"))?;
    Ok(guard.clone())
}

fn set_bestdori_cookie_header_inner(
    state: &BestdoriAuthState,
    value: Option<String>,
) -> Result<(), String> {
    let mut guard = state
        .cookie_header
        .lock()
        .map_err(|error| format!("lock bestdori auth state failed: {error}"))?;
    *guard = value;
    Ok(())
}

fn set_bestdori_cookie_header(
    state: &tauri::State<BestdoriAuthState>,
    value: Option<String>,
) -> Result<(), String> {
    set_bestdori_cookie_header_inner(state.inner(), value)
}

fn get_bestdori_user_me(
    state: &tauri::State<BestdoriAuthState>,
) -> Result<Option<BestdoriUserMeResponse>, String> {
    let guard = state
        .user_me
        .lock()
        .map_err(|error| format!("lock bestdori auth state failed: {error}"))?;
    Ok(guard.clone())
}

fn set_bestdori_user_me_inner(
    state: &BestdoriAuthState,
    value: Option<BestdoriUserMeResponse>,
) -> Result<(), String> {
    let mut guard = state
        .user_me
        .lock()
        .map_err(|error| format!("lock bestdori auth state failed: {error}"))?;
    *guard = value;
    Ok(())
}

fn set_bestdori_user_me(
    state: &tauri::State<BestdoriAuthState>,
    value: Option<BestdoriUserMeResponse>,
) -> Result<(), String> {
    set_bestdori_user_me_inner(state.inner(), value)
}

fn clear_bestdori_auth_state_and_persist(
    app: &tauri::AppHandle,
    state: &tauri::State<BestdoriAuthState>,
) -> Result<(), String> {
    set_bestdori_cookie_header(state, None)?;
    set_bestdori_user_me(state, None)?;
    persist_bestdori_auth_state(app, state.inner())
}

fn persist_bestdori_user_me_state(
    app: &tauri::AppHandle,
    state: &tauri::State<BestdoriAuthState>,
    user_me: &BestdoriUserMeResponse,
) -> Result<(), String> {
    set_bestdori_user_me(state, Some(user_me.clone()))?;
    persist_bestdori_auth_state(app, state.inner())
}

fn snapshot_bestdori_auth_state(state: &BestdoriAuthState) -> Result<BestdoriAuthCache, String> {
    let cookie_header = state
        .cookie_header
        .lock()
        .map_err(|error| format!("lock bestdori auth state failed: {error}"))?
        .clone();
    let user_me = state
        .user_me
        .lock()
        .map_err(|error| format!("lock bestdori auth state failed: {error}"))?
        .clone();
    Ok(BestdoriAuthCache {
        cookie_header,
        user_me,
    })
}

fn persist_bestdori_auth_state(app: &tauri::AppHandle, state: &BestdoriAuthState) -> Result<(), String> {
    let cache_path = resolve_bestdori_auth_cache_path(app)?;
    let snapshot = snapshot_bestdori_auth_state(state)?;
    let has_cookie = snapshot
        .cookie_header
        .as_deref()
        .map(str::trim)
        .map(|value| !value.is_empty())
        .unwrap_or(false);
    if !has_cookie && snapshot.user_me.is_none() {
        remove_file_if_exists(&cache_path)?;
        return Ok(());
    }

    ensure_parent_directory(&cache_path)?;
    let text = serde_json::to_string(&snapshot)
        .map_err(|error| format!("serialize bestdori auth cache failed: {error}"))?;
    fs::write(&cache_path, text)
        .map_err(|error| format!("write bestdori auth cache failed: {error}"))?;
    Ok(())
}

fn restore_bestdori_auth_state(app: &tauri::AppHandle, state: &BestdoriAuthState) -> Result<(), String> {
    let cache_path = resolve_bestdori_auth_cache_path(app)?;
    if !cache_path.exists() {
        return Ok(());
    }

    let text = fs::read_to_string(&cache_path)
        .map_err(|error| format!("read bestdori auth cache failed: {error}"))?;
    if text.trim().is_empty() {
        remove_file_if_exists(&cache_path)?;
        return Ok(());
    }

    let parsed = match serde_json::from_str::<BestdoriAuthCache>(&text) {
        Ok(value) => value,
        Err(_) => {
            remove_file_if_exists(&cache_path)?;
            return Ok(());
        }
    };

    set_bestdori_cookie_header_inner(state, parsed.cookie_header)?;
    set_bestdori_user_me_inner(state, parsed.user_me)?;
    Ok(())
}

fn ensure_parent_directory(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("create parent dir failed: {error}"))?;
    }
    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("remove file failed: {error}"))?;
    }
    Ok(())
}

async fn ensure_file_from_url(
    path: &Path,
    url: &str,
    client: &reqwest::Client,
    cookie_header: Option<&str>,
    progress: Option<&mut DownloadScopeProgress>,
    file_name: &str,
    file_index: usize,
) -> Result<(), String> {
    if path.exists() {
        if let Some(progress) = progress {
            progress.report_file_cached(file_name, file_index);
        }
        return Ok(());
    }

    if let Some(progress) = progress.as_ref() {
        progress.report_file_start(file_name, file_index);
    }

    let mut request = client.get(url);
    if let Some(cookie_value) = cookie_header {
        if !cookie_value.trim().is_empty() {
            request = request.header(reqwest::header::COOKIE, cookie_value);
        }
    }
    let mut response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("http status {} for {}", response.status(), url));
    }

    ensure_parent_directory(path)?;
    let mut file =
        fs::File::create(path).map_err(|error| format!("create file failed: {error}"))?;

    let total_bytes = response.content_length();
    let mut downloaded_bytes: u64 = 0;
    let mut last_reported_percent: i32 = -1;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("read body failed: {error}"))?
    {
        file.write_all(&chunk)
            .map_err(|error| format!("write file failed: {error}"))?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);

        if let (Some(progress), Some(total)) = (progress.as_ref(), total_bytes) {
            if total > 0 {
                let percent = ((downloaded_bytes as f64 / total as f64) * 100.0).floor() as i32;
                if percent > last_reported_percent {
                    last_reported_percent = percent;
                    progress.report_file_progress(
                        file_name,
                        file_index,
                        (downloaded_bytes as f64 / total as f64).clamp(0.0, 1.0),
                    );
                }
            }
        }
    }

    if let Some(progress) = progress {
        progress.report_file_complete(file_name, file_index);
    }
    Ok(())
}

fn normalize_asset_relative_path(value: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("asset filename from explorer json is empty".to_string());
    }
    let relative = PathBuf::from(trimmed);
    if relative.is_absolute() {
        return Err(format!("asset filename must be relative: {trimmed}"));
    }
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(format!(
                "asset filename contains invalid path component: {trimmed}"
            ));
        }
    }
    Ok(relative)
}

fn resolve_builtin_noteskin_manifest_filenames(rip_name: &str) -> Option<Vec<String>> {
    match rip_name {
        HABAHIRO_RIP_NAME => Some(
            HABAHIRO_MANIFEST_FILENAMES
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        ),
        HABAHIRO_SAMPLE_RIP_NAME => Some(
            HABAHIRO_SAMPLE_MANIFEST_FILENAMES
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        ),
        _ => None,
    }
}

fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|error| format!("canonicalize path failed: {error}"))
}

fn is_path_within(root: &Path, target: &Path) -> bool {
    target.starts_with(root)
}

fn ensure_extension(path: PathBuf, expected_extension: &str) -> PathBuf {
    match path.extension().and_then(|value| value.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case(expected_extension) => path,
        _ => {
            let mut with_extension = path;
            with_extension.set_extension(expected_extension);
            with_extension
        }
    }
}

fn ensure_json_extension(path: PathBuf) -> PathBuf {
    ensure_extension(path, "json")
}

fn ensure_png_extension(path: PathBuf) -> PathBuf {
    ensure_extension(path, "png")
}

fn write_text_with_backup(
    path: &Path,
    backup_path: &Path,
    temp_path: &Path,
    text: &str,
) -> Result<(), String> {
    ensure_parent_directory(path)?;

    if path.exists() {
        fs::copy(path, backup_path)
            .map_err(|error| format!("backup session file failed: {error}"))?;
    }

    fs::write(temp_path, text)
        .map_err(|error| format!("write session temp file failed: {error}"))?;

    if path.exists() {
        remove_file_if_exists(path)?;
    }

    fs::rename(temp_path, path).map_err(|error| format!("replace session file failed: {error}"))?;
    Ok(())
}

fn read_json_text_if_valid(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let text =
        fs::read_to_string(path).map_err(|error| format!("read session file failed: {error}"))?;
    if serde_json::from_str::<serde_json::Value>(&text).is_err() {
        return Ok(None);
    }
    Ok(Some(text))
}

fn load_json_text_with_backup(primary_path: &Path, backup_path: &Path) -> Result<Option<String>, String> {
    if let Some(primary_text) = read_json_text_if_valid(primary_path)? {
        return Ok(Some(primary_text));
    }

    if let Some(backup_text) = read_json_text_if_valid(backup_path)? {
        fs::write(primary_path, &backup_text)
            .map_err(|error| format!("restore cache file from backup failed: {error}"))?;
        return Ok(Some(backup_text));
    }

    Ok(None)
}

fn normalize_mime_type(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

fn normalize_optional_file_name(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

fn write_decoded_base64_file(path: &Path, base64_data: &str, write_error_label: &str) -> Result<(), String> {
    let bytes = decode_base64(base64_data)?;
    fs::write(path, bytes).map_err(|error| format!("{write_error_label}: {error}"))
}

fn read_file_as_base64_if_exists(path: &Path, read_error_label: &str) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| format!("{read_error_label}: {error}"))?;
    Ok(Some(encode_base64(bytes)))
}

fn read_file_as_data_url_if_exists(
    path: &Path,
    mime_type: Option<&str>,
    default_mime_type: &str,
    read_error_label: &str,
) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| format!("{read_error_label}: {error}"))?;
    let mime = mime_type
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_mime_type);
    Ok(Some(format!("data:{};base64,{}", mime, encode_base64(bytes))))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedBestdoriPackage {
    package_files: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrepareBestdoriPackageParams {
    namespace: String,
    package_key: String,
    asset_base_url: String,
    manifest_url: Option<String>,
    fallback_filenames: Option<Vec<String>>,
    task_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadBestdoriFileParams {
    namespace: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BestdoriPostMultipartFileParams {
    url: String,
    field_name: String,
    file_name: String,
    file_base64: String,
    mime_type: Option<String>,
    fields: Option<HashMap<String, String>>,
    host_scope: Option<String>,
}

fn build_package_file_map(
    package_dir: &Path,
    filenames: &[String],
    rip_name: &str,
) -> Result<HashMap<String, String>, String> {
    let mut output = HashMap::new();
    for filename in filenames {
        let relative = normalize_asset_relative_path(filename)?;
        let path = package_dir.join(relative);
        if !path.exists() {
            return Err(format!(
                "manifest file `{filename}` missing in package `{rip_name}` after download"
            ));
        }
        output.insert(filename.to_lowercase(), path.to_string_lossy().to_string());
    }
    Ok(output)
}

fn normalize_manifest_filenames(
    raw: Vec<String>,
    source_label: &str,
) -> Result<Vec<String>, String> {
    let mut output: Vec<String> = Vec::new();
    for value in raw {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let relative = normalize_asset_relative_path(trimmed)?;
        output.push(relative.to_string_lossy().to_string());
    }
    if output.is_empty() {
        return Err(format!("{source_label} resolved empty filename list"));
    }
    Ok(output)
}

fn normalize_optional_fallback_filenames(
    raw: Option<Vec<String>>,
) -> Result<Option<Vec<String>>, String> {
    match raw {
        Some(list) => Ok(Some(normalize_manifest_filenames(
            list,
            "fallback filenames",
        )?)),
        None => Ok(None),
    }
}

fn normalize_url(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err(format!("{label} must start with http:// or https://"));
    }
    Ok(trimmed.trim_end_matches('/').to_string())
}

#[derive(Copy, Clone)]
enum RemoteHostScope {
    Bestdori,
    Sonolus,
}

impl RemoteHostScope {
    fn from_optional(value: Option<&str>) -> Result<Self, String> {
        let normalized = value.unwrap_or("bestdori").trim().to_ascii_lowercase();
        match normalized.as_str() {
            "" | "bestdori" => Ok(Self::Bestdori),
            "sonolus" => Ok(Self::Sonolus),
            _ => Err(format!("unsupported host scope: {normalized}")),
        }
    }

    fn allows_host(self, host: &str) -> bool {
        match self {
            Self::Bestdori => host == "bestdori.com" || host == "www.bestdori.com",
            Self::Sonolus => host == "sonolus.ayachan.fun" || host == "chengdu.sov8.cn",
        }
    }

    fn expected_host(self) -> &'static str {
        match self {
            Self::Bestdori => "bestdori.com",
            Self::Sonolus => "sonolus.ayachan.fun",
        }
    }
}

fn normalize_scoped_remote_url(
    value: &str,
    label: &str,
    host_scope: Option<&str>,
) -> Result<String, String> {
    let normalized = normalize_url(value, label)?;
    let scope = RemoteHostScope::from_optional(host_scope)?;
    let parsed = reqwest::Url::parse(&normalized)
        .map_err(|error| format!("{label} parse failed: {error}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| format!("{label} host is missing"))?
        .to_ascii_lowercase();
    if !scope.allows_host(&host) {
        return Err(format!(
            "{label} host must be {} for selected host scope",
            scope.expected_host()
        ));
    }
    Ok(normalized)
}

async fn load_manifest_filenames_for_package(
    package_key: &str,
    package_dir: &Path,
    client: &reqwest::Client,
    cookie_header: Option<&str>,
    manifest_url: Option<&str>,
    fallback_filenames: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let manifest_path = package_dir.join(".manifest.json");
    let builtin_fallback = resolve_builtin_noteskin_manifest_filenames(package_key);
    let fallback = match fallback_filenames {
        Some(list) => Some(list),
        None => builtin_fallback,
    };

    if manifest_path.exists() {
        let local_manifest_bytes = fs::read(&manifest_path)
            .map_err(|error| format!("read local manifest failed: {error}"))?;
        if let Ok(parsed) = serde_json::from_slice::<Vec<String>>(&local_manifest_bytes) {
            return normalize_manifest_filenames(parsed, "local manifest");
        }
    }

    if let Some(url) = manifest_url {
        match download_url_bytes(client, url, cookie_header).await {
            Ok(downloaded_manifest_bytes) => {
                let parsed: Vec<String> = serde_json::from_slice(&downloaded_manifest_bytes)
                    .map_err(|error| format!("parse explorer manifest failed ({url}): {error}"))?;
                let normalized = normalize_manifest_filenames(parsed, "remote manifest")?;
                let serialized = serde_json::to_vec(&normalized)
                    .map_err(|error| format!("serialize normalized manifest failed: {error}"))?;
                fs::write(&manifest_path, serialized)
                    .map_err(|error| format!("write local manifest failed: {error}"))?;
                return Ok(normalized);
            }
            Err(error) => {
                if let Some(fallback_list) = fallback {
                    let serialized =
                        serde_json::to_vec(&fallback_list).map_err(|serialize_error| {
                            format!("serialize fallback manifest failed: {serialize_error}")
                        })?;
                    fs::write(&manifest_path, serialized).map_err(|write_error| {
                        format!("write local manifest failed: {write_error}")
                    })?;
                    return Ok(fallback_list);
                }
                return Err(error);
            }
        }
    }

    if let Some(fallback_list) = fallback {
        let serialized = serde_json::to_vec(&fallback_list)
            .map_err(|error| format!("serialize fallback manifest failed: {error}"))?;
        fs::write(&manifest_path, serialized)
            .map_err(|error| format!("write local manifest failed: {error}"))?;
        return Ok(fallback_list);
    }

    Err(format!(
        "manifest is unavailable for package `{package_key}` and no fallback filenames provided"
    ))
}

struct EnsureBestdoriPackageDownloadParams<'a> {
    app: &'a tauri::AppHandle,
    root: &'a Path,
    package_key: &'a str,
    asset_base_url: &'a str,
    manifest_url: Option<&'a str>,
    fallback_filenames: Option<Vec<String>>,
    client: &'a reqwest::Client,
    cookie_header: Option<&'a str>,
    operation_id: Option<&'a str>,
    scope_id: &'a str,
    scope_label: &'a str,
}

async fn ensure_bestdori_package_downloaded(
    params: EnsureBestdoriPackageDownloadParams<'_>,
) -> Result<(PathBuf, Vec<String>), String> {
    let package_dir = params.root.join(params.package_key);
    fs::create_dir_all(&package_dir)
        .map_err(|error| format!("create package dir failed: {error}"))?;

    let filenames = load_manifest_filenames_for_package(
        params.package_key,
        &package_dir,
        params.client,
        params.cookie_header,
        params.manifest_url,
        params.fallback_filenames,
    )
    .await?;

    let mut progress = params.operation_id.map(|id| {
        DownloadScopeProgress::new(
            params.app.clone(),
            id.to_string(),
            params.scope_id.to_string(),
            params.scope_label.to_string(),
            filenames.len(),
        )
    });
    if let Some(progress) = progress.as_ref() {
        progress.report_scope_message(format!("已获取资源清单，共 {} 项。", filenames.len()));
    }

    for (index, filename) in filenames.iter().enumerate() {
        let relative = normalize_asset_relative_path(filename)?;
        let target_path = package_dir.join(&relative);
        let file_url = format!("{}/{}", params.asset_base_url.trim_end_matches('/'), filename);
        if let Some(progress_scope) = progress.as_mut() {
            if let Err(error) = ensure_file_from_url(
                &target_path,
                &file_url,
                params.client,
                params.cookie_header,
                Some(progress_scope),
                filename,
                index + 1,
            )
            .await
            {
                progress_scope.report_scope_error(error.clone());
                return Err(error);
            }
        } else {
            ensure_file_from_url(
                &target_path,
                &file_url,
                params.client,
                params.cookie_header,
                None,
                filename,
                index + 1,
            )
            .await?;
        }
    }

    if let Some(progress) = progress.as_ref() {
        progress.report_scope_complete();
    }

    Ok((package_dir, filenames))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionResourceInput {
    base64_data: String,
    mime_type: Option<String>,
    file_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveEditorChartCachePayload {
    chart_json: String,
    cover: Option<SessionResourceInput>,
    audio: Option<SessionResourceInput>,
    mv: Option<SessionResourceInput>,
    cover_cleared: bool,
    audio_cleared: bool,
    mv_cleared: bool,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SessionResourcesMeta {
    cover_mime_type: Option<String>,
    audio_mime_type: Option<String>,
    audio_file_name: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ChartResourcesMeta {
    cover_mime_type: Option<String>,
    audio_mime_type: Option<String>,
    audio_file_name: Option<String>,
    mv_mime_type: Option<String>,
    mv_file_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedEditorChartCache {
    chart_json: String,
    cover_data_url: Option<String>,
    audio_base64: Option<String>,
    audio_mime_type: Option<String>,
    audio_file_name: Option<String>,
    mv_data_url: Option<String>,
    mv_file_name: Option<String>,
}

fn read_session_resources_meta(path: &Path) -> Result<SessionResourcesMeta, String> {
    read_json_file_or_default(path, "read session resources meta failed")
}

fn read_chart_resources_meta(path: &Path) -> Result<ChartResourcesMeta, String> {
    read_json_file_or_default(path, "read chart resources meta failed")
}

fn read_json_file_or_default<T>(path: &Path, read_error_prefix: &str) -> Result<T, String>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("{read_error_prefix}: {error}"))?;
    match serde_json::from_str::<T>(&raw) {
        Ok(parsed) => Ok(parsed),
        Err(_) => Ok(T::default()),
    }
}

fn write_chart_resources_meta(path: &Path, meta: &ChartResourcesMeta) -> Result<(), String> {
    let serialized = serde_json::to_string(meta)
        .map_err(|error| format!("serialize chart resources meta failed: {error}"))?;
    fs::write(path, serialized)
        .map_err(|error| format!("write chart resources meta failed: {error}"))
}

fn build_bestdori_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
        .http1_only()
        .timeout(Duration::from_secs(45))
        .user_agent("chart-editor/1.0")
        .build()
        .map_err(|error| format!("build http client failed: {error}"))
}

fn with_optional_cookie_header(
    mut request: reqwest::RequestBuilder,
    cookie_header: Option<&str>,
) -> reqwest::RequestBuilder {
    if let Some(cookie_value) = cookie_header {
        if !cookie_value.trim().is_empty() {
            request = request.header(reqwest::header::COOKIE, cookie_value);
        }
    }
    request
}

fn build_http_status_error(status: reqwest::StatusCode, url: &str, body_bytes: &[u8]) -> String {
    let body = String::from_utf8_lossy(body_bytes);
    format!("http status {} for {} body: {}", status, url, body)
}

fn parse_json_value_for_url(bytes: &[u8], url: &str) -> Result<serde_json::Value, String> {
    serde_json::from_slice::<serde_json::Value>(bytes)
        .map_err(|error| format!("parse json failed for {}: {error}", url))
}

async fn send_request_expect_json(
    request: reqwest::RequestBuilder,
    url: &str,
) -> Result<serde_json::Value, String> {
    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("read body failed: {error}"))?;
    if !status.is_success() {
        return Err(build_http_status_error(status, url, &bytes));
    }
    parse_json_value_for_url(&bytes, url)
}

fn build_scoped_request_context(
    auth_state: &tauri::State<'_, BestdoriAuthState>,
    url: &str,
    label: &str,
    host_scope: Option<&str>,
) -> Result<(String, reqwest::Client, Option<String>), String> {
    let normalized_url = normalize_scoped_remote_url(url, label, host_scope)?;
    let client = build_bestdori_http_client()?;
    let cookie_header = get_bestdori_cookie_header(auth_state)?;
    Ok((normalized_url, client, cookie_header))
}

async fn download_url_bytes(
    client: &reqwest::Client,
    url: &str,
    cookie_header: Option<&str>,
) -> Result<Vec<u8>, String> {
    let response = with_optional_cookie_header(client.get(url), cookie_header)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("http status {} for {}", response.status(), url));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("read body failed: {error}"))?;

    Ok(bytes.to_vec())
}

#[tauri::command]
async fn prepare_bestdori_package(
    app: tauri::AppHandle,
    auth_state: tauri::State<'_, BestdoriAuthState>,
    params: PrepareBestdoriPackageParams,
) -> Result<PreparedBestdoriPackage, String> {
    let namespace = normalize_namespace(&params.namespace, "namespace")?;
    let package_key = normalize_rip_name(&params.package_key, "package_key")?;
    let asset_base_url = normalize_url(&params.asset_base_url, "asset_base_url")?;
    let manifest_url = params
        .manifest_url
        .as_deref()
        .map(|value| normalize_url(value, "manifest_url"))
        .transpose()?;
    let fallback_filenames = normalize_optional_fallback_filenames(params.fallback_filenames)?;

    let root = resolve_bestdori_namespace_root(&app, &namespace)?;
    let client = build_bestdori_http_client()?;
    let cookie_header = get_bestdori_cookie_header(&auth_state)?;
    let scope_id = format!("{namespace}:{package_key}");
    let scope_label = format!("{namespace}:{package_key}");
    let (package_dir, manifest_filenames) = ensure_bestdori_package_downloaded(
        EnsureBestdoriPackageDownloadParams {
            app: &app,
            root: &root,
            package_key: &package_key,
            asset_base_url: &asset_base_url,
            manifest_url: manifest_url.as_deref(),
            fallback_filenames,
            client: &client,
            cookie_header: cookie_header.as_deref(),
            operation_id: params.task_id.as_deref(),
            scope_id: &scope_id,
            scope_label: &scope_label,
        },
    )
    .await?;

    let package_files = build_package_file_map(&package_dir, &manifest_filenames, &package_key)?;
    Ok(PreparedBestdoriPackage { package_files })
}

#[tauri::command]
fn read_bestdori_text_file(
    app: tauri::AppHandle,
    params: ReadBestdoriFileParams,
) -> Result<String, String> {
    let namespace = normalize_namespace(&params.namespace, "namespace")?;
    let root = resolve_bestdori_namespace_root(&app, &namespace)?;
    let target = PathBuf::from(&params.path);
    let canonical_root = canonicalize_existing_path(&root)?;
    let canonical_target = canonicalize_existing_path(&target)?;
    if !is_path_within(&canonical_root, &canonical_target) {
        return Err(format!(
            "path is outside bestdori namespace directory: {namespace}"
        ));
    }
    fs::read_to_string(canonical_target).map_err(|error| format!("read text file failed: {error}"))
}

#[tauri::command]
fn read_bestdori_binary_file(
    app: tauri::AppHandle,
    params: ReadBestdoriFileParams,
) -> Result<String, String> {
    let namespace = normalize_namespace(&params.namespace, "namespace")?;
    let root = resolve_bestdori_namespace_root(&app, &namespace)?;
    let target = PathBuf::from(&params.path);
    let canonical_root = canonicalize_existing_path(&root)?;
    let canonical_target = canonicalize_existing_path(&target)?;
    if !is_path_within(&canonical_root, &canonical_target) {
        return Err(format!(
            "path is outside bestdori namespace directory: {namespace}"
        ));
    }
    let bytes =
        fs::read(canonical_target).map_err(|error| format!("read binary file failed: {error}"))?;
    Ok(encode_base64(bytes))
}

#[tauri::command]
async fn bestdori_fetch_json(
    auth_state: tauri::State<'_, BestdoriAuthState>,
    url: String,
    host_scope: Option<String>,
) -> Result<serde_json::Value, String> {
    let (normalized_url, client, cookie_header) =
        build_scoped_request_context(&auth_state, &url, "url", host_scope.as_deref())?;
    let bytes = download_url_bytes(&client, &normalized_url, cookie_header.as_deref()).await?;
    parse_json_value_for_url(&bytes, &normalized_url)
}

#[tauri::command]
async fn bestdori_post_json(
    auth_state: tauri::State<'_, BestdoriAuthState>,
    url: String,
    payload: serde_json::Value,
    host_scope: Option<String>,
) -> Result<serde_json::Value, String> {
    let (normalized_url, client, cookie_header) =
        build_scoped_request_context(&auth_state, &url, "url", host_scope.as_deref())?;
    let payload_bytes =
        serde_json::to_vec(&payload).map_err(|error| format!("serialize payload failed: {error}"))?;
    let request = client
        .post(&normalized_url)
        .header(reqwest::header::CONTENT_TYPE, "application/json;charset=UTF-8")
        .body(payload_bytes);
    let request = with_optional_cookie_header(request, cookie_header.as_deref());
    send_request_expect_json(request, &normalized_url).await
}

#[tauri::command]
async fn bestdori_post_multipart_file(
    auth_state: tauri::State<'_, BestdoriAuthState>,
    params: BestdoriPostMultipartFileParams,
) -> Result<serde_json::Value, String> {
    let (normalized_url, client, cookie_header) = build_scoped_request_context(
        &auth_state,
        &params.url,
        "url",
        params.host_scope.as_deref(),
    )?;
    let field_name = normalize_login_value(&params.field_name, "field_name")?;
    let file_name = normalize_login_value(&params.file_name, "file_name")?;
    let file_bytes = decode_base64(&params.file_base64)?;
    if file_bytes.is_empty() {
        return Err("multipart file content cannot be empty".to_string());
    }

    let mut file_part = reqwest::multipart::Part::bytes(file_bytes).file_name(file_name);
    if let Some(mime_type) = normalize_mime_type(params.mime_type) {
        file_part = file_part
            .mime_str(&mime_type)
            .map_err(|error| format!("invalid multipart mime type: {error}"))?;
    }
    let mut form = reqwest::multipart::Form::new();
    if let Some(fields) = params.fields {
        for (key, value) in fields {
            let normalized_key = normalize_login_value(&key, "multipart field key")?;
            form = form.text(normalized_key, value);
        }
    }
    form = form.part(field_name, file_part);

    let request = with_optional_cookie_header(client.post(&normalized_url).multipart(form), cookie_header.as_deref());
    send_request_expect_json(request, &normalized_url).await
}

#[tauri::command]
async fn bestdori_fetch_binary(
    auth_state: tauri::State<'_, BestdoriAuthState>,
    url: String,
    host_scope: Option<String>,
) -> Result<String, String> {
    let (normalized_url, client, cookie_header) =
        build_scoped_request_context(&auth_state, &url, "url", host_scope.as_deref())?;
    let bytes = download_url_bytes(&client, &normalized_url, cookie_header.as_deref()).await?;
    Ok(encode_base64(bytes))
}

#[tauri::command]
async fn bestdori_probe_url(
    auth_state: tauri::State<'_, BestdoriAuthState>,
    url: String,
    host_scope: Option<String>,
) -> Result<bool, String> {
    let (normalized_url, client, cookie_header) =
        build_scoped_request_context(&auth_state, &url, "url", host_scope.as_deref())?;
    let response = with_optional_cookie_header(client.get(&normalized_url), cookie_header.as_deref())
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    Ok(response.status().is_success())
}

async fn request_bestdori_me(
    client: &reqwest::Client,
    cookie_header: &str,
) -> Result<BestdoriUserMeResponse, String> {
    let response = with_optional_cookie_header(client.get(BESTDORI_ME_API), Some(cookie_header))
        .send()
        .await
        .map_err(|error| format!("request bestdori me failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "bestdori me http status {} for {}",
            response.status(),
            BESTDORI_ME_API
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("read bestdori me response failed: {error}"))?;
    let payload = serde_json::from_slice::<BestdoriUserMeResponse>(&bytes)
        .map_err(|error| format!("parse bestdori me response failed: {error}"))?;
    Ok(payload)
}

#[tauri::command]
async fn bestdori_login(
    app: tauri::AppHandle,
    auth_state: tauri::State<'_, BestdoriAuthState>,
    username: String,
    password: String,
) -> Result<BestdoriUserMeResponse, String> {
    let username = normalize_login_value(&username, "username")?;
    let password = normalize_login_value(&password, "password")?;
    let client = build_bestdori_http_client()?;
    let login_body = serde_json::json!({
        "username": username,
        "password": password,
    })
    .to_string();

    let login_response = client
        .post(BESTDORI_LOGIN_API)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(login_body)
        .send()
        .await
        .map_err(|error| format!("request bestdori login failed: {error}"))?;

    if !login_response.status().is_success() {
        return Err(format!(
            "bestdori login http status {} for {}",
            login_response.status(),
            BESTDORI_LOGIN_API
        ));
    }

    let cookie_header = extract_cookie_header_from_response(&login_response)?;
    let login_bytes = login_response
        .bytes()
        .await
        .map_err(|error| format!("read bestdori login response failed: {error}"))?;
    let login_payload = serde_json::from_slice::<BestdoriLoginResponse>(&login_bytes)
        .map_err(|error| format!("parse bestdori login response failed: {error}"))?;
    if !login_payload.result {
        return Err(format!(
            "bestdori login failed: code={}",
            format_login_error_code(&login_payload.code)
        ));
    }

    set_bestdori_cookie_header(&auth_state, Some(cookie_header.clone()))?;
    let me_payload = request_bestdori_me(&client, &cookie_header).await?;
    if !me_payload.result {
        clear_bestdori_auth_state_and_persist(&app, &auth_state)?;
        return Err("bestdori login failed: /api/user/me returned result=false".to_string());
    }
    persist_bestdori_user_me_state(&app, &auth_state, &me_payload)?;
    Ok(me_payload)
}

#[tauri::command]
async fn bestdori_get_me(
    app: tauri::AppHandle,
    auth_state: tauri::State<'_, BestdoriAuthState>,
) -> Result<BestdoriUserMeResponse, String> {
    if let Some(cached_me) = get_bestdori_user_me(&auth_state)? {
        if cached_me.result {
            return Ok(cached_me);
        }
    }
    let cookie_header = get_bestdori_cookie_header(&auth_state)?
        .ok_or_else(|| "bestdori is not logged in".to_string())?;
    let client = build_bestdori_http_client()?;
    let me_payload = request_bestdori_me(&client, &cookie_header).await?;
    if !me_payload.result {
        clear_bestdori_auth_state_and_persist(&app, &auth_state)?;
        return Err("bestdori /api/user/me returned result=false".to_string());
    }
    persist_bestdori_user_me_state(&app, &auth_state, &me_payload)?;
    Ok(me_payload)
}

#[tauri::command]
fn bestdori_logout(
    app: tauri::AppHandle,
    auth_state: tauri::State<'_, BestdoriAuthState>,
) -> Result<(), String> {
    clear_bestdori_auth_state_and_persist(&app, &auth_state)
}

#[tauri::command]
fn save_editor_chart_cache(
    app: tauri::AppHandle,
    payload: SaveEditorChartCachePayload,
) -> Result<(), String> {
    let SaveEditorChartCachePayload {
        chart_json,
        cover,
        audio,
        mv,
        cover_cleared,
        audio_cleared,
        mv_cleared,
    } = payload;

    serde_json::from_str::<serde_json::Value>(&chart_json)
        .map_err(|error| format!("chart json invalid: {error}"))?;

    let root = resolve_session_cache_root(&app)?;
    let resources_root = resolve_chart_resources_root(&root)?;

    let chart_path = root.join(CHART_CACHE_FILE_NAME);
    let chart_backup_path = root.join(CHART_CACHE_BACKUP_FILE_NAME);
    let chart_temp_path = root.join(CHART_CACHE_TEMP_FILE_NAME);
    write_text_with_backup(
        &chart_path,
        &chart_backup_path,
        &chart_temp_path,
        &chart_json,
    )?;

    let meta_path = resources_root.join(CHART_RESOURCES_META_NAME);
    let mut meta = read_chart_resources_meta(&meta_path)?;

    let cover_path = resources_root.join(CHART_COVER_FILE_NAME);
    if cover_cleared {
        remove_file_if_exists(&cover_path)?;
        meta.cover_mime_type = None;
    } else if let Some(cover_payload) = cover {
        write_decoded_base64_file(
            &cover_path,
            &cover_payload.base64_data,
            "write chart cover cache failed",
        )?;
        meta.cover_mime_type = normalize_mime_type(cover_payload.mime_type);
    }

    let audio_path = resources_root.join(CHART_AUDIO_FILE_NAME);
    if audio_cleared {
        remove_file_if_exists(&audio_path)?;
        meta.audio_mime_type = None;
        meta.audio_file_name = None;
    } else if let Some(audio_payload) = audio {
        write_decoded_base64_file(
            &audio_path,
            &audio_payload.base64_data,
            "write chart audio cache failed",
        )?;
        meta.audio_mime_type = normalize_mime_type(audio_payload.mime_type);
        meta.audio_file_name = normalize_optional_file_name(audio_payload.file_name);
    }

    let mv_path = resources_root.join(CHART_MV_FILE_NAME);
    if mv_cleared {
        remove_file_if_exists(&mv_path)?;
        meta.mv_mime_type = None;
        meta.mv_file_name = None;
    } else if let Some(mv_payload) = mv {
        write_decoded_base64_file(
            &mv_path,
            &mv_payload.base64_data,
            "write chart mv cache failed",
        )?;
        meta.mv_mime_type = normalize_mime_type(mv_payload.mime_type);
        meta.mv_file_name = normalize_optional_file_name(mv_payload.file_name);
    }

    write_chart_resources_meta(&meta_path, &meta)?;
    Ok(())
}

#[tauri::command]
fn load_editor_chart_cache(app: tauri::AppHandle) -> Result<Option<LoadedEditorChartCache>, String> {
    let root = resolve_session_cache_root(&app)?;
    let chart_path = root.join(CHART_CACHE_FILE_NAME);
    let chart_backup_path = root.join(CHART_CACHE_BACKUP_FILE_NAME);

    let chart_json = match load_json_text_with_backup(&chart_path, &chart_backup_path)? {
        Some(text) => text,
        None => {
            let legacy_primary_path = root.join(SESSION_FILE_NAME);
            let legacy_backup_path = root.join(SESSION_BACKUP_FILE_NAME);
            let Some(legacy_json) = load_json_text_with_backup(&legacy_primary_path, &legacy_backup_path)? else {
                return Ok(None);
            };
            let legacy_resources_root = resolve_session_resources_root(&root)?;
            let legacy_meta_path = legacy_resources_root.join(SESSION_RESOURCES_META_NAME);
            let legacy_meta = read_session_resources_meta(&legacy_meta_path)?;

            let legacy_cover_path = legacy_resources_root.join(SESSION_COVER_FILE_NAME);
            let cover_data_url = read_file_as_data_url_if_exists(
                &legacy_cover_path,
                legacy_meta.cover_mime_type.as_deref(),
                "image/png",
                "read legacy cover cache failed",
            )?;

            let legacy_audio_path = legacy_resources_root.join(SESSION_AUDIO_FILE_NAME);
            let audio_base64 =
                read_file_as_base64_if_exists(&legacy_audio_path, "read legacy audio cache failed")?;

            return Ok(Some(LoadedEditorChartCache {
                chart_json: legacy_json,
                cover_data_url,
                audio_base64,
                audio_mime_type: legacy_meta.audio_mime_type,
                audio_file_name: legacy_meta.audio_file_name,
                mv_data_url: None,
                mv_file_name: None,
            }));
        }
    };

    let resources_root = resolve_chart_resources_root(&root)?;
    let meta_path = resources_root.join(CHART_RESOURCES_META_NAME);
    let meta = read_chart_resources_meta(&meta_path)?;

    let cover_path = resources_root.join(CHART_COVER_FILE_NAME);
    let cover_data_url = read_file_as_data_url_if_exists(
        &cover_path,
        meta.cover_mime_type.as_deref(),
        "image/png",
        "read chart cover cache failed",
    )?;

    let audio_path = resources_root.join(CHART_AUDIO_FILE_NAME);
    let audio_base64 = read_file_as_base64_if_exists(&audio_path, "read chart audio cache failed")?;

    let mv_path = resources_root.join(CHART_MV_FILE_NAME);
    let mv_data_url = read_file_as_data_url_if_exists(
        &mv_path,
        meta.mv_mime_type.as_deref(),
        "video/mp4",
        "read chart mv cache failed",
    )?;

    Ok(Some(LoadedEditorChartCache {
        chart_json,
        cover_data_url,
        audio_base64,
        audio_mime_type: meta.audio_mime_type,
        audio_file_name: meta.audio_file_name,
        mv_data_url,
        mv_file_name: meta.mv_file_name,
    }))
}

#[tauri::command]
fn save_editor_settings_cache(app: tauri::AppHandle, settings_json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&settings_json)
        .map_err(|error| format!("settings json invalid: {error}"))?;

    let root = resolve_session_cache_root(&app)?;
    let settings_path = root.join(SETTINGS_CACHE_FILE_NAME);
    let settings_backup_path = root.join(SETTINGS_CACHE_BACKUP_FILE_NAME);
    let settings_temp_path = root.join(SETTINGS_CACHE_TEMP_FILE_NAME);
    write_text_with_backup(
        &settings_path,
        &settings_backup_path,
        &settings_temp_path,
        &settings_json,
    )?;
    Ok(())
}

#[tauri::command]
fn load_editor_settings_cache(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let root = resolve_session_cache_root(&app)?;
    let settings_path = root.join(SETTINGS_CACHE_FILE_NAME);
    let settings_backup_path = root.join(SETTINGS_CACHE_BACKUP_FILE_NAME);
    load_json_text_with_backup(&settings_path, &settings_backup_path)
}

#[tauri::command]
fn save_chart_json_via_dialog(
    default_file_name: String,
    json_text: String,
) -> Result<Option<String>, String> {
    let suggested = if default_file_name.trim().is_empty() {
        "chart.json".to_string()
    } else {
        default_file_name
    };

    let selected_path = rfd::FileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name(&suggested)
        .save_file();

    let Some(path) = selected_path else {
        return Ok(None);
    };

    let final_path = ensure_json_extension(path);
    ensure_parent_directory(&final_path)?;
    fs::write(&final_path, json_text)
        .map_err(|error| format!("save chart json failed: {error}"))?;

    Ok(Some(final_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn save_chart_png_via_dialog(
    default_file_name: String,
    png_base64: String,
) -> Result<Option<String>, String> {
    let suggested = if default_file_name.trim().is_empty() {
        "chart.png".to_string()
    } else {
        default_file_name
    };

    let selected_path = rfd::FileDialog::new()
        .add_filter("PNG", &["png"])
        .set_file_name(&suggested)
        .save_file();

    let Some(path) = selected_path else {
        return Ok(None);
    };

    let png_bytes = decode_base64(&png_base64)?;
    if png_bytes.is_empty() {
        return Err("png data is empty".to_string());
    }

    let final_path = ensure_png_extension(path);
    ensure_parent_directory(&final_path)?;
    fs::write(&final_path, png_bytes).map_err(|error| format!("save chart png failed: {error}"))?;
    Ok(Some(final_path.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BestdoriAuthState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = app_handle.state::<BestdoriAuthState>();
            if let Err(error) = restore_bestdori_auth_state(&app_handle, state.inner()) {
                eprintln!("restore bestdori auth cache failed: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bestdori_login,
            bestdori_get_me,
            bestdori_logout,
            bestdori_fetch_json,
            bestdori_post_json,
            bestdori_post_multipart_file,
            bestdori_fetch_binary,
            bestdori_probe_url,
            prepare_bestdori_package,
            read_bestdori_text_file,
            read_bestdori_binary_file,
            save_editor_chart_cache,
            load_editor_chart_cache,
            save_editor_settings_cache,
            load_editor_settings_cache,
            save_chart_json_via_dialog,
            save_chart_png_via_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr};
use std::path::{Component, Path, PathBuf};
use tauri::{Emitter, Manager};

const BESTDORI_ASSET_ROOT: &str = "https://bestdori.com/assets/jp/ingameskin/noteskin";
const BESTDORI_EXPLORER_ROOT: &str = "https://bestdori.com/api/explorer/jp/assets/ingameskin/noteskin";
const BESTDORI_TAPSE_ASSET_ROOT: &str = "https://bestdori.com/assets/jp/sound/tapseskin";
const BESTDORI_TAPSE_EXPLORER_ROOT: &str = "https://bestdori.com/api/explorer/jp/assets/sound/tapseskin";
const BESTDORI_COMMON_SOUND_ROOT: &str = "https://bestdori.com/assets/jp/sound/common_rip";
const SE_RHYTHM_TAP_SKILL_FILE_NAME: &str = "SE_RHYTHM_TAP_SKILL.mp3";
const DOWNLOAD_PROGRESS_EVENT: &str = "download-progress";
const SESSION_DIR_NAME: &str = "session";
const SESSION_FILE_NAME: &str = "session.v1.json";
const SESSION_BACKUP_FILE_NAME: &str = "session.v1.bak.json";
const SESSION_TEMP_FILE_NAME: &str = "session.v1.tmp.json";
const SESSION_RESOURCES_DIR_NAME: &str = "resources";
const SESSION_RESOURCES_META_NAME: &str = "resources.v1.json";
const SESSION_COVER_FILE_NAME: &str = "cover.bin";
const SESSION_AUDIO_FILE_NAME: &str = "audio.bin";
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
        self.emit("scope_error", message, None, 0.0, None, Some(self.file_total));
    }

    fn report_scope_message(&self, message: String) {
        self.emit("scope_message", message, None, 0.0, None, Some(self.file_total));
    }
}

fn encode_base64(bytes: impl AsRef<[u8]>) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|error| format!("decode base64 failed: {error}"))
}

fn resolve_skin_assets_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve app local data dir failed: {error}"))?;
    directory.push("assets");
    directory.push("game");
    directory.push("noteskin");
    fs::create_dir_all(&directory).map_err(|error| format!("create skin assets dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_sound_assets_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve app local data dir failed: {error}"))?;
    directory.push("assets");
    directory.push("sound");
    fs::create_dir_all(&directory).map_err(|error| format!("create sound assets dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_tapseskin_assets_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = resolve_sound_assets_root(app)?;
    directory.push("tapseskin");
    fs::create_dir_all(&directory).map_err(|error| format!("create tapseskin assets dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_session_cache_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve app local data dir failed: {error}"))?;
    directory.push("cache");
    directory.push(SESSION_DIR_NAME);
    fs::create_dir_all(&directory).map_err(|error| format!("create session cache dir failed: {error}"))?;
    Ok(directory)
}

fn resolve_session_resources_root(root: &Path) -> Result<PathBuf, String> {
    let directory = root.join(SESSION_RESOURCES_DIR_NAME);
    fs::create_dir_all(&directory).map_err(|error| format!("create session resources dir failed: {error}"))?;
    Ok(directory)
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

    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("http status {} for {}", response.status(), url));
    }

    ensure_parent_directory(path)?;
    let mut file = fs::File::create(path).map_err(|error| format!("create file failed: {error}"))?;

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

async fn ensure_noteskin_package_downloaded(
    app: &tauri::AppHandle,
    root: &Path,
    rip_name: &str,
    client: &reqwest::Client,
    operation_id: Option<&str>,
    scope_id: &str,
    scope_label: &str,
) -> Result<DownloadedNoteskinPackage, String> {
    let package_dir = root.join(rip_name);
    fs::create_dir_all(&package_dir)
        .map_err(|error| format!("create noteskin package dir failed: {error}"))?;

    let manifest_file_name = format!("{rip_name}.json");
    let manifest_path = package_dir.join(&manifest_file_name);
    let builtin_manifest = resolve_builtin_noteskin_manifest_filenames(rip_name);
    let filenames: Vec<String> = if let Some(predefined) = builtin_manifest {
        let serialized = serde_json::to_vec(&predefined)
            .map_err(|error| format!("serialize built-in noteskin manifest failed: {error}"))?;
        fs::write(&manifest_path, serialized)
            .map_err(|error| format!("write local manifest failed: {error}"))?;
        predefined
    } else if manifest_path.exists() {
        let local_manifest_bytes =
            fs::read(&manifest_path).map_err(|error| format!("read local manifest failed: {error}"))?;
        match serde_json::from_slice::<Vec<String>>(&local_manifest_bytes) {
            Ok(parsed) => parsed,
            Err(_) => {
                let manifest_url = format!("{BESTDORI_EXPLORER_ROOT}/{rip_name}.json");
                let downloaded_manifest_bytes = download_url_bytes(client, &manifest_url).await?;
                let parsed: Vec<String> = serde_json::from_slice(&downloaded_manifest_bytes).map_err(|error| {
                    format!("parse explorer manifest failed ({manifest_url}): {error}")
                })?;
                fs::write(&manifest_path, &downloaded_manifest_bytes)
                    .map_err(|error| format!("write local manifest failed: {error}"))?;
                parsed
            }
        }
    } else {
        let manifest_url = format!("{BESTDORI_EXPLORER_ROOT}/{rip_name}.json");
        let downloaded_manifest_bytes = download_url_bytes(client, &manifest_url).await?;
        let parsed: Vec<String> = serde_json::from_slice(&downloaded_manifest_bytes)
            .map_err(|error| format!("parse explorer manifest failed ({manifest_url}): {error}"))?;
        fs::write(&manifest_path, &downloaded_manifest_bytes)
            .map_err(|error| format!("write local manifest failed: {error}"))?;
        parsed
    };

    let mut progress = operation_id.map(|id| {
        DownloadScopeProgress::new(
            app.clone(),
            id.to_string(),
            scope_id.to_string(),
            scope_label.to_string(),
            filenames.len(),
        )
    });
    if let Some(progress) = progress.as_ref() {
        progress.report_scope_message(format!("已获取资源清单，共 {} 项。", filenames.len()));
    }

    for (index, filename) in filenames.iter().enumerate() {
        let relative = normalize_asset_relative_path(&filename)?;
        let target_path = package_dir.join(&relative);
        let file_url = format!("{BESTDORI_ASSET_ROOT}/{}_rip/{}", rip_name, filename);
        if let Some(progress_scope) = progress.as_mut() {
            if let Err(error) = ensure_file_from_url(
                &target_path,
                &file_url,
                client,
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
            ensure_file_from_url(&target_path, &file_url, client, None, filename, index + 1).await?;
        }
    }
    if let Some(progress) = progress.as_ref() {
        progress.report_scope_complete();
    }

    Ok(DownloadedNoteskinPackage {
        directory: package_dir,
        manifest_filenames: filenames,
    })
}

async fn ensure_tapseskin_package_downloaded(
    app: &tauri::AppHandle,
    root: &Path,
    rip_name: &str,
    client: &reqwest::Client,
    operation_id: Option<&str>,
    scope_id: &str,
    scope_label: &str,
) -> Result<DownloadedTapseskinPackage, String> {
    let package_dir = root.join(rip_name);
    fs::create_dir_all(&package_dir)
        .map_err(|error| format!("create tapseskin package dir failed: {error}"))?;

    let manifest_file_name = format!("{rip_name}.json");
    let manifest_path = package_dir.join(&manifest_file_name);
    let filenames: Vec<String> = if manifest_path.exists() {
        let local_manifest_bytes =
            fs::read(&manifest_path).map_err(|error| format!("read local manifest failed: {error}"))?;
        match serde_json::from_slice::<Vec<String>>(&local_manifest_bytes) {
            Ok(parsed) => parsed,
            Err(_) => {
                let manifest_url = format!("{BESTDORI_TAPSE_EXPLORER_ROOT}/{rip_name}.json");
                let downloaded_manifest_bytes = download_url_bytes(client, &manifest_url).await?;
                let parsed: Vec<String> = serde_json::from_slice(&downloaded_manifest_bytes).map_err(|error| {
                    format!("parse explorer manifest failed ({manifest_url}): {error}")
                })?;
                fs::write(&manifest_path, &downloaded_manifest_bytes)
                    .map_err(|error| format!("write local manifest failed: {error}"))?;
                parsed
            }
        }
    } else {
        let manifest_url = format!("{BESTDORI_TAPSE_EXPLORER_ROOT}/{rip_name}.json");
        let downloaded_manifest_bytes = download_url_bytes(client, &manifest_url).await?;
        let parsed: Vec<String> = serde_json::from_slice(&downloaded_manifest_bytes)
            .map_err(|error| format!("parse explorer manifest failed ({manifest_url}): {error}"))?;
        fs::write(&manifest_path, &downloaded_manifest_bytes)
            .map_err(|error| format!("write local manifest failed: {error}"))?;
        parsed
    };

    let mut progress = operation_id.map(|id| {
        DownloadScopeProgress::new(
            app.clone(),
            id.to_string(),
            scope_id.to_string(),
            scope_label.to_string(),
            filenames.len(),
        )
    });
    if let Some(progress) = progress.as_ref() {
        progress.report_scope_message(format!("已获取资源清单，共 {} 项。", filenames.len()));
    }

    for (index, filename) in filenames.iter().enumerate() {
        let relative = normalize_asset_relative_path(&filename)?;
        let target_path = package_dir.join(&relative);
        let file_url = format!("{BESTDORI_TAPSE_ASSET_ROOT}/{}_rip/{}", rip_name, filename);
        if let Some(progress_scope) = progress.as_mut() {
            if let Err(error) = ensure_file_from_url(
                &target_path,
                &file_url,
                client,
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
            ensure_file_from_url(&target_path, &file_url, client, None, filename, index + 1).await?;
        }
    }
    if let Some(progress) = progress.as_ref() {
        progress.report_scope_complete();
    }

    Ok(DownloadedTapseskinPackage {
        directory: package_dir,
        manifest_filenames: filenames,
    })
}

fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|error| format!("canonicalize path failed: {error}"))
}

fn is_path_within(root: &Path, target: &Path) -> bool {
    target.starts_with(root)
}

fn ensure_json_extension(path: PathBuf) -> PathBuf {
    match path.extension().and_then(|value| value.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("json") => path,
        _ => {
            let mut with_extension = path;
            with_extension.set_extension("json");
            with_extension
        }
    }
}

fn write_text_with_backup(path: &Path, backup_path: &Path, temp_path: &Path, text: &str) -> Result<(), String> {
    ensure_parent_directory(path)?;

    if path.exists() {
        fs::copy(path, backup_path).map_err(|error| format!("backup session file failed: {error}"))?;
    }

    fs::write(temp_path, text).map_err(|error| format!("write session temp file failed: {error}"))?;

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

    let text = fs::read_to_string(path).map_err(|error| format!("read session file failed: {error}"))?;
    if serde_json::from_str::<serde_json::Value>(&text).is_err() {
        return Ok(None);
    }
    Ok(Some(text))
}

fn load_session_text(root: &Path) -> Result<Option<String>, String> {
    let primary_path = root.join(SESSION_FILE_NAME);
    let backup_path = root.join(SESSION_BACKUP_FILE_NAME);

    if let Some(primary_text) = read_json_text_if_valid(&primary_path)? {
        return Ok(Some(primary_text));
    }

    if let Some(backup_text) = read_json_text_if_valid(&backup_path)? {
        fs::write(&primary_path, &backup_text)
            .map_err(|error| format!("restore session file from backup failed: {error}"))?;
        return Ok(Some(backup_text));
    }

    Ok(None)
}

fn normalize_mime_type(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedBestdoriSkinAssets {
    package_files: HashMap<String, String>,
    sample_package_files: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedBestdoriTapseskinAssets {
    package_files: HashMap<String, String>,
}

struct DownloadedNoteskinPackage {
    directory: PathBuf,
    manifest_filenames: Vec<String>,
}

struct DownloadedTapseskinPackage {
    directory: PathBuf,
    manifest_filenames: Vec<String>,
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
        output.insert(
            filename.to_lowercase(),
            path.to_string_lossy().to_string(),
        );
    }
    Ok(output)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionResourceInput {
    base64_data: String,
    mime_type: Option<String>,
    file_name: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SessionResourcesMeta {
    cover_mime_type: Option<String>,
    audio_mime_type: Option<String>,
    audio_file_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedEditorSessionCache {
    session_json: String,
    cover_data_url: Option<String>,
    audio_base64: Option<String>,
    audio_mime_type: Option<String>,
    audio_file_name: Option<String>,
}

fn read_session_resources_meta(path: &Path) -> Result<SessionResourcesMeta, String> {
    if !path.exists() {
        return Ok(SessionResourcesMeta::default());
    }

    let raw = fs::read_to_string(path).map_err(|error| format!("read session resources meta failed: {error}"))?;
    match serde_json::from_str::<SessionResourcesMeta>(&raw) {
        Ok(parsed) => Ok(parsed),
        Err(_) => Ok(SessionResourcesMeta::default()),
    }
}

fn write_session_resources_meta(path: &Path, meta: &SessionResourcesMeta) -> Result<(), String> {
    let serialized = serde_json::to_string(meta).map_err(|error| format!("serialize session resources meta failed: {error}"))?;
    fs::write(path, serialized).map_err(|error| format!("write session resources meta failed: {error}"))
}

fn build_bestdori_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
        .http1_only()
        .user_agent("chart-editor/1.0")
        .build()
        .map_err(|error| format!("build http client failed: {error}"))
}

async fn download_url_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
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
async fn prepare_bestdori_skin_assets(
    app: tauri::AppHandle,
    rip_name: String,
    task_id: Option<String>,
) -> Result<PreparedBestdoriSkinAssets, String> {
    let rip_name = normalize_rip_name(&rip_name, "rip_name")?;
    let sample_rip_name = if rip_name == HABAHIRO_RIP_NAME {
        HABAHIRO_SAMPLE_RIP_NAME.to_string()
    } else {
        format!("{rip_name}sample")
    };

    let root = resolve_skin_assets_root(&app)?;
    let client = build_bestdori_http_client()?;
    let package = ensure_noteskin_package_downloaded(
        &app,
        &root,
        &rip_name,
        &client,
        task_id.as_deref(),
        &format!("noteskin:{rip_name}"),
        &format!("图示资源：{rip_name}"),
    )
    .await?;
    let sample_package = ensure_noteskin_package_downloaded(
        &app,
        &root,
        &sample_rip_name,
        &client,
        task_id.as_deref(),
        &format!("noteskin:{sample_rip_name}"),
        &format!("图示资源：{sample_rip_name}"),
    )
    .await?;

    Ok(PreparedBestdoriSkinAssets {
        package_files: build_package_file_map(&package.directory, &package.manifest_filenames, &rip_name)?,
        sample_package_files: build_package_file_map(
            &sample_package.directory,
            &sample_package.manifest_filenames,
            &sample_rip_name,
        )?,
    })
}

#[tauri::command]
async fn prepare_bestdori_tapseskin_assets(
    app: tauri::AppHandle,
    rip_name: String,
    task_id: Option<String>,
) -> Result<PreparedBestdoriTapseskinAssets, String> {
    let rip_name = normalize_rip_name(&rip_name, "rip_name")?;
    let root = resolve_tapseskin_assets_root(&app)?;
    let client = build_bestdori_http_client()?;
    let package = ensure_tapseskin_package_downloaded(
        &app,
        &root,
        &rip_name,
        &client,
        task_id.as_deref(),
        &format!("tapseskin:{rip_name}"),
        &format!("音效资源：{rip_name}"),
    )
    .await?;
    Ok(PreparedBestdoriTapseskinAssets {
        package_files: build_package_file_map(&package.directory, &package.manifest_filenames, &rip_name)?,
    })
}

#[tauri::command]
async fn ensure_common_sound_asset(app: tauri::AppHandle, task_id: Option<String>) -> Result<String, String> {
    let root = resolve_sound_assets_root(&app)?;
    let common_dir = root.join("common");
    fs::create_dir_all(&common_dir).map_err(|error| format!("create common sound dir failed: {error}"))?;
    let path = common_dir.join(SE_RHYTHM_TAP_SKILL_FILE_NAME);
    let url = format!("{BESTDORI_COMMON_SOUND_ROOT}/{SE_RHYTHM_TAP_SKILL_FILE_NAME}");
    let client = build_bestdori_http_client()?;
    let mut progress = task_id.map(|id| {
        DownloadScopeProgress::new(
            app.clone(),
            id,
            "common:se_rhythm_tap_skill".to_string(),
            "通用音效".to_string(),
            1,
        )
    });
    if let Some(progress_scope) = progress.as_mut() {
        if let Err(error) = ensure_file_from_url(
            &path,
            &url,
            &client,
            Some(progress_scope),
            SE_RHYTHM_TAP_SKILL_FILE_NAME,
            1,
        )
        .await
        {
            progress_scope.report_scope_error(error.clone());
            return Err(error);
        }
        progress_scope.report_scope_complete();
    } else {
        ensure_file_from_url(
            &path,
            &url,
            &client,
            None,
            SE_RHYTHM_TAP_SKILL_FILE_NAME,
            1,
        )
        .await?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_skin_text_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let root = resolve_skin_assets_root(&app)?;
    let target = PathBuf::from(path);
    let canonical_root = canonicalize_existing_path(&root)?;
    let canonical_target = canonicalize_existing_path(&target)?;
    if !is_path_within(&canonical_root, &canonical_target) {
        return Err("path is outside noteskin assets directory".to_string());
    }
    fs::read_to_string(&canonical_target).map_err(|error| format!("read text file failed: {error}"))
}

#[tauri::command]
fn read_skin_binary_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let root = resolve_skin_assets_root(&app)?;
    let target = PathBuf::from(path);
    let canonical_root = canonicalize_existing_path(&root)?;
    let canonical_target = canonicalize_existing_path(&target)?;
    if !is_path_within(&canonical_root, &canonical_target) {
        return Err("path is outside noteskin assets directory".to_string());
    }
    let bytes = fs::read(&canonical_target).map_err(|error| format!("read binary file failed: {error}"))?;
    Ok(encode_base64(bytes))
}

#[tauri::command]
fn read_sound_binary_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let root = resolve_sound_assets_root(&app)?;
    let target = PathBuf::from(path);
    let canonical_root = canonicalize_existing_path(&root)?;
    let canonical_target = canonicalize_existing_path(&target)?;
    if !is_path_within(&canonical_root, &canonical_target) {
        return Err("path is outside sound assets directory".to_string());
    }
    let bytes = fs::read(&canonical_target).map_err(|error| format!("read binary file failed: {error}"))?;
    Ok(encode_base64(bytes))
}

#[tauri::command]
fn save_editor_session_cache(
    app: tauri::AppHandle,
    session_json: String,
    cover: Option<SessionResourceInput>,
    audio: Option<SessionResourceInput>,
    cover_cleared: bool,
    audio_cleared: bool,
) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&session_json)
        .map_err(|error| format!("session json invalid: {error}"))?;

    let root = resolve_session_cache_root(&app)?;
    let resources_root = resolve_session_resources_root(&root)?;

    let session_path = root.join(SESSION_FILE_NAME);
    let session_backup_path = root.join(SESSION_BACKUP_FILE_NAME);
    let session_temp_path = root.join(SESSION_TEMP_FILE_NAME);

    write_text_with_backup(&session_path, &session_backup_path, &session_temp_path, &session_json)?;

    let meta_path = resources_root.join(SESSION_RESOURCES_META_NAME);
    let mut meta = read_session_resources_meta(&meta_path)?;

    let cover_path = resources_root.join(SESSION_COVER_FILE_NAME);
    if cover_cleared {
        remove_file_if_exists(&cover_path)?;
        meta.cover_mime_type = None;
    } else if let Some(cover_payload) = cover {
        let bytes = decode_base64(&cover_payload.base64_data)?;
        fs::write(&cover_path, bytes).map_err(|error| format!("write cover cache failed: {error}"))?;
        meta.cover_mime_type = normalize_mime_type(cover_payload.mime_type);
    }

    let audio_path = resources_root.join(SESSION_AUDIO_FILE_NAME);
    if audio_cleared {
        remove_file_if_exists(&audio_path)?;
        meta.audio_mime_type = None;
        meta.audio_file_name = None;
    } else if let Some(audio_payload) = audio {
        let bytes = decode_base64(&audio_payload.base64_data)?;
        fs::write(&audio_path, bytes).map_err(|error| format!("write audio cache failed: {error}"))?;
        meta.audio_mime_type = normalize_mime_type(audio_payload.mime_type);
        meta.audio_file_name = audio_payload
            .file_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
    }

    write_session_resources_meta(&meta_path, &meta)?;
    Ok(())
}

#[tauri::command]
fn load_editor_session_cache(app: tauri::AppHandle) -> Result<Option<LoadedEditorSessionCache>, String> {
    let root = resolve_session_cache_root(&app)?;
    let Some(session_json) = load_session_text(&root)? else {
        return Ok(None);
    };

    let resources_root = resolve_session_resources_root(&root)?;
    let meta_path = resources_root.join(SESSION_RESOURCES_META_NAME);
    let meta = read_session_resources_meta(&meta_path)?;

    let cover_path = resources_root.join(SESSION_COVER_FILE_NAME);
    let cover_data_url = if cover_path.exists() {
        let bytes = fs::read(&cover_path).map_err(|error| format!("read cover cache failed: {error}"))?;
        let mime = meta
            .cover_mime_type
            .clone()
            .unwrap_or_else(|| "image/png".to_string());
        Some(format!("data:{};base64,{}", mime, encode_base64(bytes)))
    } else {
        None
    };

    let audio_path = resources_root.join(SESSION_AUDIO_FILE_NAME);
    let audio_base64 = if audio_path.exists() {
        let bytes = fs::read(&audio_path).map_err(|error| format!("read audio cache failed: {error}"))?;
        Some(encode_base64(bytes))
    } else {
        None
    };

    Ok(Some(LoadedEditorSessionCache {
        session_json,
        cover_data_url,
        audio_base64,
        audio_mime_type: meta.audio_mime_type,
        audio_file_name: meta.audio_file_name,
    }))
}

#[tauri::command]
fn save_chart_json_via_dialog(default_file_name: String, json_text: String) -> Result<Option<String>, String> {
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
    fs::write(&final_path, json_text).map_err(|error| format!("save chart json failed: {error}"))?;

    Ok(Some(final_path.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            prepare_bestdori_skin_assets,
            prepare_bestdori_tapseskin_assets,
            ensure_common_sound_asset,
            read_skin_text_file,
            read_skin_binary_file,
            read_sound_binary_file,
            save_editor_session_cache,
            load_editor_session_cache,
            save_chart_json_via_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

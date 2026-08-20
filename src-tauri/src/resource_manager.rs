use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const STORAGE_SCHEMA: u32 = 1;
const RESOURCE_DIRECTORY: &str = "resources";
const INDEX_FILE: &str = "index.json";

#[derive(Default)]
struct ResourceRuntimeState {
    initialized: bool,
    open_snapshots: HashMap<String, usize>,
}

#[derive(Default)]
pub struct ApplicationResourceState {
    runtime: Mutex<ResourceRuntimeState>,
    sequence: AtomicU64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRefDto {
    pub id: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ObservedIntegrityDto {
    pub byte_length: u64,
    pub sha256: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceFileRecordDto {
    pub logical_path: String,
    pub media_type: String,
    pub integrity: ObservedIntegrityDto,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredResourceRecordDto {
    pub descriptor: Value,
    pub files: Vec<ResourceFileRecordDto>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredResourceFile {
    logical_path: String,
    media_type: String,
    integrity: ObservedIntegrityDto,
    blob: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredResourceRecord {
    storage_schema: u32,
    descriptor: Value,
    files: Vec<StoredResourceFile>,
}

impl StoredResourceRecord {
    fn dto(&self) -> StoredResourceRecordDto {
        StoredResourceRecordDto {
            descriptor: self.descriptor.clone(),
            files: self
                .files
                .iter()
                .map(|file| ResourceFileRecordDto {
                    logical_path: file.logical_path.clone(),
                    media_type: file.media_type.clone(),
                    integrity: file.integrity.clone(),
                })
                .collect(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceInstallFileInput {
    pub logical_path: String,
    pub media_type: String,
    pub base64_data: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceInstallNetworkInput {
    pub descriptor: Value,
    pub files: Vec<ResourceInstallFileInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceImportUserMediaInput {
    pub purpose: String,
    pub file_name: String,
    pub media_type: String,
    pub base64_data: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedResourceSnapshotDto {
    pub snapshot_id: String,
    pub slots: HashMap<String, ResourceRefDto>,
    pub files_by_slot: HashMap<String, Vec<ResourceFileRecordDto>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshot {
    storage_schema: u32,
    snapshot_id: String,
    slots: HashMap<String, ResourceRefDto>,
    files_by_slot: HashMap<String, Vec<StoredResourceFile>>,
}

impl StoredSnapshot {
    fn dto(&self) -> OpenedResourceSnapshotDto {
        OpenedResourceSnapshotDto {
            snapshot_id: self.snapshot_id.clone(),
            slots: self.slots.clone(),
            files_by_slot: self
                .files_by_slot
                .iter()
                .map(|(slot, files)| {
                    (
                        slot.clone(),
                        files
                            .iter()
                            .map(|file| ResourceFileRecordDto {
                                logical_path: file.logical_path.clone(),
                                media_type: file.media_type.clone(),
                                integrity: file.integrity.clone(),
                            })
                            .collect(),
                    )
                })
                .collect(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceIndex {
    storage_schema: u32,
    resource_ids: Vec<String>,
}

impl Default for ResourceIndex {
    fn default() -> Self {
        Self {
            storage_schema: STORAGE_SCHEMA,
            resource_ids: Vec::new(),
        }
    }
}

#[tauri::command]
pub fn resource_initialize(
    app: tauri::AppHandle,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<Vec<StoredResourceRecordDto>, String> {
    let root = resource_root(&app)?;
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    if !runtime.initialized {
        ensure_layout(&root)?;
        remove_directory_contents(&root.join("transactions"))?;
        remove_directory_contents(&root.join("snapshots"))?;
        migrate_legacy_bestdori_cache(&app, &root, state.inner())?;
        runtime.open_snapshots.clear();
        runtime.initialized = true;
    }
    let index = read_index(&root)?;
    let mut records = Vec::new();
    for resource_id in index.resource_ids {
        match read_record(&root, &resource_id) {
            Ok(record) => records.push(record.dto()),
            Err(error) => eprintln!("ignore invalid resource record {resource_id}: {error}"),
        }
    }
    Ok(records)
}

#[tauri::command]
pub fn resource_list_records(
    app: tauri::AppHandle,
) -> Result<Vec<StoredResourceRecordDto>, String> {
    let root = resource_root(&app)?;
    ensure_layout(&root)?;
    let index = read_index(&root)?;
    index
        .resource_ids
        .iter()
        .map(|id| read_record(&root, id).map(|record| record.dto()))
        .collect()
}

#[tauri::command]
pub fn resource_read_record(
    app: tauri::AppHandle,
    reference: ResourceRefDto,
) -> Result<StoredResourceRecordDto, String> {
    let root = resource_root(&app)?;
    let record = read_record(&root, &normalize_resource_id(&reference.id)?)?;
    verify_record(&root, &record)?;
    Ok(record.dto())
}

#[tauri::command]
pub fn resource_load_catalog_snapshot(
    app: tauri::AppHandle,
    provider: String,
) -> Result<Option<Value>, String> {
    let root = resource_root(&app)?;
    ensure_layout(&root)?;
    let provider = normalize_segment(&provider, "provider")?;
    let path = root.join("catalogs").join(format!("{provider}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| format!("read catalog snapshot failed: {error}"))?;
    let value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse catalog snapshot failed: {error}"))?;
    Ok(Some(value))
}

#[tauri::command]
pub fn resource_commit_catalog_snapshot(
    app: tauri::AppHandle,
    provider: String,
    snapshot: Value,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    let root = resource_root(&app)?;
    ensure_layout(&root)?;
    let provider = normalize_segment(&provider, "provider")?;
    if snapshot
        .get("provider")
        .and_then(Value::as_str)
        .map(str::trim)
        != Some(provider.as_str())
    {
        return Err(
            "catalog snapshot provider identity does not match command provider".to_string(),
        );
    }
    let bytes = serde_json::to_vec(&snapshot)
        .map_err(|error| format!("serialize catalog snapshot failed: {error}"))?;
    atomic_write(
        &root,
        &root.join("catalogs").join(format!("{provider}.json")),
        &bytes,
        &next_identity(state.inner(), "catalog"),
    )
}

#[tauri::command]
pub fn resource_install_network_package(
    app: tauri::AppHandle,
    input: ResourceInstallNetworkInput,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<StoredResourceRecordDto, String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    if input.descriptor.get("origin").and_then(Value::as_str) != Some("network") {
        return Err("network install descriptor origin must be network".to_string());
    }
    let root = resource_root(&app)?;
    let record = commit_resource(
        &root,
        input.descriptor,
        input.files,
        &next_identity(state.inner(), "network"),
    )?;
    Ok(record.dto())
}

#[tauri::command]
pub fn resource_import_user_media(
    app: tauri::AppHandle,
    input: ResourceImportUserMediaInput,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<StoredResourceRecordDto, String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    let purpose = match input.purpose.as_str() {
        "bgm" | "cover" | "mv" | "stage-backdrop" => input.purpose,
        _ => return Err("user media purpose is not allowed".to_string()),
    };
    let file_name = normalize_file_name(&input.file_name)?;
    let media_type = normalize_media_type(&input.media_type)?;
    let identity = next_identity(state.inner(), "user");
    let resource_id = format!("user/media/{identity}");
    let kind = match purpose.as_str() {
        "bgm" => "audio",
        "mv" => "video",
        _ => "image",
    };
    let descriptor = serde_json::json!({
        "ref": { "id": resource_id },
        "origin": "user",
        "kind": kind,
        "title": file_name,
        "availability": "installed",
        "files": null,
        "catalogObservedAt": null,
        "purpose": purpose,
        "fileName": file_name,
    });
    let root = resource_root(&app)?;
    let record = commit_resource(
        &root,
        descriptor,
        vec![ResourceInstallFileInput {
            logical_path: file_name,
            media_type,
            base64_data: input.base64_data,
        }],
        &identity,
    )?;
    Ok(record.dto())
}

#[tauri::command]
pub fn resource_create_snapshot(
    app: tauri::AppHandle,
    slots: HashMap<String, ResourceRefDto>,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<OpenedResourceSnapshotDto, String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    if slots.is_empty() {
        return Err("resource snapshot requires at least one selected slot".to_string());
    }
    let root = resource_root(&app)?;
    ensure_layout(&root)?;
    let mut normalized_slots = HashMap::new();
    let mut files_by_slot = HashMap::new();
    for (slot, reference) in slots {
        let slot = normalize_slot(&slot)?;
        let resource_id = normalize_resource_id(&reference.id)?;
        normalized_slots.insert(
            slot.clone(),
            ResourceRefDto {
                id: resource_id.clone(),
            },
        );
        if resource_id.starts_with("builtin/") {
            files_by_slot.insert(slot, Vec::new());
            continue;
        }
        let record = read_record(&root, &resource_id)?;
        verify_record(&root, &record)?;
        files_by_slot.insert(slot, record.files);
    }
    let snapshot_id = format!("snapshot/{}", next_identity(state.inner(), "snapshot"));
    let snapshot = StoredSnapshot {
        storage_schema: STORAGE_SCHEMA,
        snapshot_id: snapshot_id.clone(),
        slots: normalized_slots,
        files_by_slot,
    };
    let bytes = serde_json::to_vec(&snapshot)
        .map_err(|error| format!("serialize resource snapshot failed: {error}"))?;
    atomic_write(
        &root,
        &snapshot_path(&root, &snapshot_id),
        &bytes,
        &next_identity(state.inner(), "snapshot-write"),
    )?;
    Ok(snapshot.dto())
}

#[tauri::command]
pub fn resource_open_snapshot(
    app: tauri::AppHandle,
    snapshot_id: String,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<OpenedResourceSnapshotDto, String> {
    let snapshot_id = normalize_snapshot_id(&snapshot_id)?;
    let root = resource_root(&app)?;
    let snapshot = read_snapshot(&root, &snapshot_id)?;
    for files in snapshot.files_by_slot.values() {
        for file in files {
            verify_stored_file(&root, file)?;
        }
    }
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    *runtime.open_snapshots.entry(snapshot_id).or_insert(0) += 1;
    Ok(snapshot.dto())
}

#[tauri::command]
pub fn resource_read_snapshot_file(
    app: tauri::AppHandle,
    snapshot_id: String,
    slot: String,
    logical_path: String,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<String, String> {
    let snapshot_id = normalize_snapshot_id(&snapshot_id)?;
    {
        let runtime = state
            .runtime
            .lock()
            .map_err(|error| format!("lock resource state failed: {error}"))?;
        if runtime
            .open_snapshots
            .get(&snapshot_id)
            .copied()
            .unwrap_or(0)
            == 0
        {
            return Err("resource snapshot is not open".to_string());
        }
    }
    let root = resource_root(&app)?;
    let snapshot = read_snapshot(&root, &snapshot_id)?;
    let slot = normalize_slot(&slot)?;
    let logical_path = normalize_logical_path(&logical_path)?;
    let file = snapshot
        .files_by_slot
        .get(&slot)
        .and_then(|files| files.iter().find(|file| file.logical_path == logical_path))
        .ok_or_else(|| "resource snapshot file is unavailable".to_string())?;
    let bytes = read_and_verify_blob(&root, file)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn resource_release_snapshot(
    app: tauri::AppHandle,
    snapshot_id: String,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let snapshot_id = normalize_snapshot_id(&snapshot_id)?;
    let remove = {
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|error| format!("lock resource state failed: {error}"))?;
        let count = runtime
            .open_snapshots
            .get_mut(&snapshot_id)
            .ok_or_else(|| "resource snapshot was not opened".to_string())?;
        if *count == 0 {
            return Err("resource snapshot was already released".to_string());
        }
        *count -= 1;
        if *count == 0 {
            runtime.open_snapshots.remove(&snapshot_id);
            true
        } else {
            false
        }
    };
    if remove {
        let root = resource_root(&app)?;
        let path = snapshot_path(&root, &snapshot_id);
        if path.exists() {
            fs::remove_file(path)
                .map_err(|error| format!("remove resource snapshot failed: {error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn resource_verify(app: tauri::AppHandle, reference: ResourceRefDto) -> Result<Value, String> {
    let root = resource_root(&app)?;
    let record = read_record(&root, &normalize_resource_id(&reference.id)?)?;
    verify_record(&root, &record)?;
    Ok(record.descriptor)
}

#[tauri::command]
pub fn resource_remove(
    app: tauri::AppHandle,
    reference: ResourceRefDto,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    let resource_id = normalize_resource_id(&reference.id)?;
    if resource_id.starts_with("builtin/") {
        return Err("builtin resources cannot be removed".to_string());
    }
    let root = resource_root(&app)?;
    let path = record_path(&root, &resource_id);
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("remove resource record failed: {error}"))?;
    }
    let mut index = read_index(&root)?;
    index.resource_ids.retain(|id| id != &resource_id);
    write_index(&root, &index, &next_identity(state.inner(), "remove"))
}

#[tauri::command]
pub fn resource_collect_garbage(
    app: tauri::AppHandle,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    let root = resource_root(&app)?;
    let mut retained = HashSet::new();
    for resource_id in read_index(&root)?.resource_ids {
        if let Ok(record) = read_record(&root, &resource_id) {
            retained.extend(record.files.into_iter().map(|file| file.blob));
        }
    }
    for entry in fs::read_dir(root.join("snapshots"))
        .map_err(|error| format!("read snapshots directory failed: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("read snapshot directory entry failed: {error}"))?
            .path();
        if !path.is_file() {
            continue;
        }
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(snapshot) = serde_json::from_slice::<StoredSnapshot>(&bytes) {
                for files in snapshot.files_by_slot.into_values() {
                    retained.extend(files.into_iter().map(|file| file.blob));
                }
            }
        }
    }
    for entry in fs::read_dir(root.join("blobs"))
        .map_err(|error| format!("read blobs directory failed: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("read blob directory entry failed: {error}"))?
            .path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if path.is_file() && !retained.contains(name) {
            fs::remove_file(path)
                .map_err(|error| format!("remove orphan resource blob failed: {error}"))?;
        }
    }
    Ok(())
}

fn commit_resource(
    root: &Path,
    mut descriptor: Value,
    files: Vec<ResourceInstallFileInput>,
    transaction_id: &str,
) -> Result<StoredResourceRecord, String> {
    ensure_layout(root)?;
    let resource_id = descriptor_resource_id(&descriptor)?;
    if files.is_empty() {
        return Err("resource transaction requires at least one file".to_string());
    }
    let transaction = root.join("transactions").join(transaction_id);
    fs::create_dir_all(&transaction)
        .map_err(|error| format!("create resource transaction failed: {error}"))?;
    let result = (|| {
        let mut seen = HashSet::new();
        let mut stored_files = Vec::new();
        for (index, file) in files.into_iter().enumerate() {
            let logical_path = normalize_logical_path(&file.logical_path)?;
            if !seen.insert(logical_path.clone()) {
                return Err(format!("duplicate resource package path: {logical_path}"));
            }
            let media_type = normalize_media_type(&file.media_type)?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(file.base64_data)
                .map_err(|error| format!("decode resource file failed: {error}"))?;
            if bytes.is_empty() {
                return Err(format!("resource file is empty: {logical_path}"));
            }
            let integrity = observe_bytes(&bytes);
            let temp_path = transaction.join(format!("file-{index}"));
            write_synced(&temp_path, &bytes)?;
            let blob_path = root.join("blobs").join(&integrity.sha256);
            if blob_path.exists() {
                verify_blob_path(&blob_path, &integrity)?;
                fs::remove_file(&temp_path).map_err(|error| {
                    format!("remove duplicate transaction blob failed: {error}")
                })?;
            } else {
                fs::rename(&temp_path, &blob_path)
                    .map_err(|error| format!("publish resource blob failed: {error}"))?;
            }
            stored_files.push(StoredResourceFile {
                logical_path,
                media_type,
                blob: integrity.sha256.clone(),
                integrity,
            });
        }
        let public_files: Vec<ResourceFileRecordDto> = stored_files
            .iter()
            .map(|file| ResourceFileRecordDto {
                logical_path: file.logical_path.clone(),
                media_type: file.media_type.clone(),
                integrity: file.integrity.clone(),
            })
            .collect();
        let descriptor_object = descriptor
            .as_object_mut()
            .ok_or_else(|| "resource descriptor must be an object".to_string())?;
        descriptor_object.insert(
            "availability".to_string(),
            Value::String("installed".to_string()),
        );
        descriptor_object.insert(
            "files".to_string(),
            serde_json::to_value(&public_files)
                .map_err(|error| format!("serialize resource file records failed: {error}"))?,
        );
        let record = StoredResourceRecord {
            storage_schema: STORAGE_SCHEMA,
            descriptor,
            files: stored_files,
        };
        let bytes = serde_json::to_vec(&record)
            .map_err(|error| format!("serialize resource record failed: {error}"))?;
        atomic_write(
            root,
            &record_path(root, &resource_id),
            &bytes,
            transaction_id,
        )?;
        let mut index = read_index(root)?;
        if !index.resource_ids.iter().any(|id| id == &resource_id) {
            index.resource_ids.push(resource_id);
            index.resource_ids.sort();
        }
        write_index(root, &index, transaction_id)?;
        Ok(record)
    })();
    let _ = fs::remove_dir_all(&transaction);
    result
}

fn read_record(root: &Path, resource_id: &str) -> Result<StoredResourceRecord, String> {
    let path = record_path(root, resource_id);
    let bytes = fs::read(path).map_err(|error| format!("read resource record failed: {error}"))?;
    let record: StoredResourceRecord = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse resource record failed: {error}"))?;
    if record.storage_schema != STORAGE_SCHEMA
        || descriptor_resource_id(&record.descriptor)? != resource_id
    {
        return Err("resource record identity or storage schema is invalid".to_string());
    }
    Ok(record)
}

fn verify_record(root: &Path, record: &StoredResourceRecord) -> Result<(), String> {
    if record.files.is_empty() {
        return Err("stored resource record has no files".to_string());
    }
    let mut seen = HashSet::new();
    for file in &record.files {
        normalize_logical_path(&file.logical_path)?;
        if !seen.insert(&file.logical_path) {
            return Err(format!(
                "stored resource record duplicates {}",
                file.logical_path
            ));
        }
        verify_stored_file(root, file)?;
    }
    Ok(())
}

fn verify_stored_file(root: &Path, file: &StoredResourceFile) -> Result<(), String> {
    if file.blob != file.integrity.sha256 {
        return Err("stored resource blob identity does not match observed SHA-256".to_string());
    }
    verify_blob_path(&root.join("blobs").join(&file.blob), &file.integrity)
}

fn read_and_verify_blob(root: &Path, file: &StoredResourceFile) -> Result<Vec<u8>, String> {
    let path = root.join("blobs").join(&file.blob);
    verify_blob_path(&path, &file.integrity)?;
    fs::read(path).map_err(|error| format!("read resource blob failed: {error}"))
}

fn verify_blob_path(path: &Path, expected: &ObservedIntegrityDto) -> Result<(), String> {
    let mut file =
        fs::File::open(path).map_err(|error| format!("open resource blob failed: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("read resource blob metadata failed: {error}"))?;
    if metadata.len() != expected.byte_length {
        return Err("resource blob byte length no longer matches observed integrity".to_string());
    }
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("hash resource blob failed: {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let actual = format!("{:X}", hasher.finalize());
    if actual != expected.sha256 {
        return Err("resource blob SHA-256 no longer matches observed integrity".to_string());
    }
    Ok(())
}

fn observe_bytes(bytes: &[u8]) -> ObservedIntegrityDto {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    ObservedIntegrityDto {
        byte_length: bytes.len() as u64,
        sha256: format!("{:X}", hasher.finalize()),
    }
}

fn resource_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory failed: {error}"))?;
    root.push(RESOURCE_DIRECTORY);
    Ok(root)
}

fn ensure_layout(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| format!("create resource root failed: {error}"))?;
    for name in ["catalogs", "records", "blobs", "snapshots", "transactions"] {
        fs::create_dir_all(root.join(name))
            .map_err(|error| format!("create resource {name} directory failed: {error}"))?;
    }
    if !root.join(INDEX_FILE).exists() {
        write_index(root, &ResourceIndex::default(), "initialize")?;
    }
    Ok(())
}

fn read_index(root: &Path) -> Result<ResourceIndex, String> {
    ensure_layout_without_index(root)?;
    let path = root.join(INDEX_FILE);
    if !path.exists() {
        return Ok(ResourceIndex::default());
    }
    let bytes = fs::read(path).map_err(|error| format!("read resource index failed: {error}"))?;
    let index: ResourceIndex = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse resource index failed: {error}"))?;
    if index.storage_schema != STORAGE_SCHEMA {
        return Err("unsupported resource storage schema".to_string());
    }
    Ok(index)
}

fn write_index(root: &Path, index: &ResourceIndex, identity: &str) -> Result<(), String> {
    let bytes = serde_json::to_vec(index)
        .map_err(|error| format!("serialize resource index failed: {error}"))?;
    atomic_write(root, &root.join(INDEX_FILE), &bytes, identity)
}

fn ensure_layout_without_index(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| format!("create resource root failed: {error}"))?;
    for name in ["catalogs", "records", "blobs", "snapshots", "transactions"] {
        fs::create_dir_all(root.join(name))
            .map_err(|error| format!("create resource {name} directory failed: {error}"))?;
    }
    Ok(())
}

fn atomic_write(root: &Path, target: &Path, bytes: &[u8], identity: &str) -> Result<(), String> {
    let transaction = root.join("transactions").join(format!("write-{identity}"));
    fs::create_dir_all(&transaction)
        .map_err(|error| format!("create atomic write transaction failed: {error}"))?;
    let temp = transaction.join("payload.tmp");
    write_synced(&temp, bytes)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create atomic write target directory failed: {error}"))?;
    }
    let backup = transaction.join("previous.bak");
    if target.exists() {
        fs::rename(target, &backup)
            .map_err(|error| format!("stage previous resource record failed: {error}"))?;
    }
    if let Err(error) = fs::rename(&temp, target) {
        if backup.exists() {
            let _ = fs::rename(&backup, target);
        }
        return Err(format!("publish atomic resource record failed: {error}"));
    }
    let _ = fs::remove_dir_all(transaction);
    Ok(())
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create resource file parent failed: {error}"))?;
    }
    let mut file =
        fs::File::create(path).map_err(|error| format!("create resource file failed: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("write resource file failed: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("sync resource file failed: {error}"))
}

fn record_path(root: &Path, resource_id: &str) -> PathBuf {
    root.join("records")
        .join(format!("{}.json", digest_text(resource_id)))
}

fn snapshot_path(root: &Path, snapshot_id: &str) -> PathBuf {
    root.join("snapshots")
        .join(format!("{}.json", digest_text(snapshot_id)))
}

fn read_snapshot(root: &Path, snapshot_id: &str) -> Result<StoredSnapshot, String> {
    let bytes = fs::read(snapshot_path(root, snapshot_id))
        .map_err(|error| format!("read resource snapshot failed: {error}"))?;
    let snapshot: StoredSnapshot = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse resource snapshot failed: {error}"))?;
    if snapshot.storage_schema != STORAGE_SCHEMA || snapshot.snapshot_id != snapshot_id {
        return Err("resource snapshot identity or storage schema is invalid".to_string());
    }
    Ok(snapshot)
}

fn descriptor_resource_id(descriptor: &Value) -> Result<String, String> {
    let id = descriptor
        .get("ref")
        .and_then(Value::as_object)
        .and_then(|reference| reference.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| "resource descriptor is missing ref.id".to_string())?;
    normalize_resource_id(id)
}

fn normalize_resource_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let valid_prefix = trimmed.starts_with("builtin/")
        || trimmed.starts_with("bestdori/")
        || trimmed.starts_with("user/");
    if !valid_prefix || trimmed.contains("//") || trimmed.len() > 1024 {
        return Err("resource id is invalid".to_string());
    }
    if !trimmed.chars().all(|ch| {
        ch.is_ascii_alphanumeric()
            || matches!(
                ch,
                '.' | '_'
                    | '~'
                    | '!'
                    | '$'
                    | '&'
                    | '\''
                    | '('
                    | ')'
                    | '*'
                    | '+'
                    | ','
                    | ';'
                    | '='
                    | ':'
                    | '@'
                    | '%'
                    | '/'
                    | '-'
            )
    }) {
        return Err("resource id contains unsupported characters".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_snapshot_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if !trimmed.starts_with("snapshot/")
        || trimmed.contains("//")
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '_' | '-'))
    {
        return Err("resource snapshot id is invalid".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_segment(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
    {
        return Err(format!("{label} contains unsupported characters"));
    }
    Ok(trimmed.to_string())
}

fn normalize_slot(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 256
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err("resource slot is invalid".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_logical_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('\\') {
        return Err("resource logical path is invalid".to_string());
    }
    let path = Path::new(trimmed);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(
            "resource logical path must contain only normal relative components".to_string(),
        );
    }
    Ok(trimmed.replace('\\', "/"))
}

fn normalize_file_name(value: &str) -> Result<String, String> {
    let normalized = normalize_logical_path(value)?;
    if normalized.contains('/') {
        return Err("user media filename cannot contain directories".to_string());
    }
    Ok(normalized)
}

fn normalize_media_type(value: &str) -> Result<String, String> {
    let trimmed = value.trim().to_ascii_lowercase();
    if trimmed.is_empty()
        || trimmed.len() > 255
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '.' | '+' | '-' | '_'))
    {
        return Err("resource media type is invalid".to_string());
    }
    Ok(trimmed)
}

fn digest_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:X}", hasher.finalize())
}

fn next_identity(state: &ApplicationResourceState, label: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = state.sequence.fetch_add(1, Ordering::Relaxed);
    format!("{label}-{now:x}-{sequence:x}")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyMigrationReport {
    storage_schema: u32,
    completed_at_unix_milliseconds: u128,
    imported: Vec<String>,
    skipped: Vec<String>,
}

fn migrate_legacy_bestdori_cache(
    app: &tauri::AppHandle,
    resource_root: &Path,
    state: &ApplicationResourceState,
) -> Result<(), String> {
    let marker = resource_root.join("migration.json");
    if marker.exists() {
        return Ok(());
    }
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory for migration failed: {error}"))?;
    let candidates = [
        (app_data.join("assets/game/noteskin"), "noteskin"),
        (app_data.join("assets/game/fieldskin"), "fieldskin"),
        (app_data.join("assets/game/bgskin"), "bgskin"),
        (app_data.join("assets/game/judgeskin"), "judgeskin"),
        (app_data.join("assets/sound/tapseskin"), "tapseskin"),
        (app_data.join("assets/sound/common_rip"), "sound-common"),
    ];
    let mut report = LegacyMigrationReport {
        storage_schema: STORAGE_SCHEMA,
        completed_at_unix_milliseconds: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        imported: Vec::new(),
        skipped: Vec::new(),
    };
    for (directory, family) in candidates {
        if !directory.exists() {
            continue;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                report
                    .skipped
                    .push(format!("{}: {error}", directory.to_string_lossy()));
                continue;
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    report.skipped.push(format!("{family}: {error}"));
                    continue;
                }
            };
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let Some((server, native_id)) = parse_legacy_package_name(&name, family) else {
                report.skipped.push(format!(
                    "{family}/{name}: ambiguous legacy package identity"
                ));
                continue;
            };
            let resource_id = format!("bestdori/{server}/{family}/{native_id}");
            if record_path(resource_root, &resource_id).exists() {
                continue;
            }
            match import_legacy_package(
                resource_root,
                &path,
                &resource_id,
                &server,
                family,
                &native_id,
                &next_identity(state, "legacy"),
            ) {
                Ok(()) => report.imported.push(resource_id),
                Err(error) => report.skipped.push(format!("{family}/{name}: {error}")),
            }
        }
    }
    let bytes = serde_json::to_vec(&report)
        .map_err(|error| format!("serialize resource migration report failed: {error}"))?;
    atomic_write(
        resource_root,
        &marker,
        &bytes,
        &next_identity(state, "migration-report"),
    )
}

fn parse_legacy_package_name(name: &str, family: &str) -> Option<(String, String)> {
    for server in ["jp", "en", "tw", "cn", "kr"] {
        let prefix = format!("{server}-{family}-");
        if let Some(native_id) = name.strip_prefix(&prefix) {
            if !native_id.is_empty()
                && native_id
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
            {
                return Some((server.to_string(), native_id.to_string()));
            }
        }
    }
    None
}

fn import_legacy_package(
    resource_root: &Path,
    package_root: &Path,
    resource_id: &str,
    server: &str,
    family: &str,
    native_id: &str,
    transaction_id: &str,
) -> Result<(), String> {
    let canonical_root = package_root
        .canonicalize()
        .map_err(|error| format!("canonicalize legacy package failed: {error}"))?;
    let mut files = Vec::new();
    collect_legacy_files(&canonical_root, &canonical_root, &mut files)?;
    if files.is_empty() {
        return Err("legacy package has no importable files".to_string());
    }
    let (section, manifest_section) = if family == "tapseskin" || family == "sound-common" {
        ("sound", "sound")
    } else {
        ("ingameskin", "ingameskin")
    };
    let remote_family = if family == "sound-common" {
        "common"
    } else {
        family
    };
    let asset_suffix = if family == "sound-common" {
        "common_rip".to_string()
    } else {
        format!("{native_id}_rip")
    };
    let manifest_name = if family == "sound-common" {
        "common".to_string()
    } else {
        native_id.to_string()
    };
    let descriptor = serde_json::json!({
        "ref": { "id": resource_id },
        "origin": "network",
        "kind": "package",
        "title": native_id,
        "availability": "installed",
        "files": null,
        "catalogObservedAt": null,
        "source": {
            "provider": "bestdori",
            "server": server,
            "family": family,
            "nativeId": native_id,
            "manifestUrl": format!("https://bestdori.com/api/explorer/{server}/assets/{manifest_section}/{remote_family}/{manifest_name}.json"),
            "assetBaseUrl": format!("https://bestdori.com/assets/{server}/{section}/{remote_family}/{asset_suffix}"),
        }
    });
    commit_resource(resource_root, descriptor, files, transaction_id)?;
    Ok(())
}

fn collect_legacy_files(
    package_root: &Path,
    directory: &Path,
    output: &mut Vec<ResourceInstallFileInput>,
) -> Result<(), String> {
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("read legacy package directory failed: {error}"))?
    {
        let entry = entry.map_err(|error| format!("read legacy package entry failed: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("read legacy package file type failed: {error}"))?;
        if file_type.is_symlink() {
            return Err("legacy package contains a symbolic link".to_string());
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_legacy_files(package_root, &path, output)?;
            continue;
        }
        if !file_type.is_file() || entry.file_name() == ".manifest.json" {
            continue;
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("canonicalize legacy package file failed: {error}"))?;
        if !canonical.starts_with(package_root) {
            return Err("legacy package file escapes its package root".to_string());
        }
        let logical_path = canonical
            .strip_prefix(package_root)
            .map_err(|error| format!("derive legacy package path failed: {error}"))?
            .to_string_lossy()
            .replace('\\', "/");
        let logical_path = normalize_logical_path(&logical_path)?;
        let bytes = fs::read(&canonical)
            .map_err(|error| format!("read legacy package file failed: {error}"))?;
        if bytes.is_empty() {
            return Err(format!("legacy package file is empty: {logical_path}"));
        }
        output.push(ResourceInstallFileInput {
            media_type: media_type_for_legacy_path(&logical_path).to_string(),
            logical_path,
            base64_data: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }
    Ok(())
}

fn media_type_for_legacy_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".mp4") {
        "video/mp4"
    } else if lower.ends_with(".webm") {
        "video/webm"
    } else if lower.ends_with(".json")
        || lower.ends_with(".bundle")
        || lower.ends_with(".asset")
        || lower.ends_with(".sprites")
    {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

fn remove_directory_contents(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory)
        .map_err(|error| format!("create cleanup directory failed: {error}"))?;
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("read cleanup directory failed: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("read cleanup entry failed: {error}"))?
            .path();
        if path.is_dir() {
            fs::remove_dir_all(path)
                .map_err(|error| format!("remove stale resource directory failed: {error}"))?;
        } else {
            fs::remove_file(path)
                .map_err(|error| format!("remove stale resource file failed: {error}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logical_paths_reject_escape_and_accept_nested_files() {
        assert!(normalize_logical_path("atlas/image.png").is_ok());
        assert!(normalize_logical_path("../image.png").is_err());
        assert!(normalize_logical_path("atlas\\image.png").is_err());
        assert!(normalize_logical_path("/absolute.png").is_err());
    }

    #[test]
    fn observed_integrity_tracks_new_content_without_allowlist() {
        let first = observe_bytes(b"first");
        let second = observe_bytes(b"second");
        assert_ne!(first.sha256, second.sha256);
        assert_eq!(first.byte_length, 5);
        assert_eq!(second.byte_length, 6);
    }

    #[test]
    fn blob_verification_detects_tamper() {
        let root = std::env::temp_dir().join(format!(
            "garupa-resource-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let bytes = b"verified";
        let integrity = observe_bytes(bytes);
        let path = root.join(&integrity.sha256);
        fs::write(&path, bytes).unwrap();
        assert!(verify_blob_path(&path, &integrity).is_ok());
        fs::write(&path, b"tampered").unwrap();
        assert!(verify_blob_path(&path, &integrity).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resource_ids_are_dynamic_and_not_game_versioned() {
        assert!(normalize_resource_id("bestdori/jp/noteskin/skin999").is_ok());
        assert!(normalize_resource_id("bestdori/jp/noteskin/future_collaboration").is_ok());
        assert!(normalize_resource_id("simulator-static/current-10.1.4/x").is_err());
    }

    #[test]
    fn legacy_package_identity_requires_explicit_server_family_prefix() {
        assert_eq!(
            parse_legacy_package_name("jp-noteskin-skin00", "noteskin"),
            Some(("jp".to_string(), "skin00".to_string()))
        );
        assert!(parse_legacy_package_name("skin00", "noteskin").is_none());
        assert!(parse_legacy_package_name("jp-fieldskin-skin00", "noteskin").is_none());
    }
}

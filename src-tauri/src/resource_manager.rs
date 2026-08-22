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
use unicode_normalization::UnicodeNormalization;

const STORAGE_SCHEMA: u32 = 2;
const WORKSPACE_STORAGE_SCHEMA: u32 = 1;
const RESOURCE_DIRECTORY: &str = "resources";
const INDEX_FILE: &str = "index.json";
const WORKSPACE_MEDIA_DIRECTORY: &str = "project-media";

#[derive(Default)]
struct ResourceRuntimeState {
    initialized: bool,
    open_snapshots: HashMap<String, usize>,
    pending_workspace_imports: HashMap<String, PendingWorkspaceMediaImport>,
}

struct PendingWorkspaceMediaImport {
    purpose: String,
    file_name: String,
    media_type: String,
    path: PathBuf,
    workspace_provenance: Option<Value>,
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
    pub revision: String,
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
    revision: String,
    descriptor: Value,
    files: Vec<StoredResourceFile>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyStoredResourceRecordV1 {
    storage_schema: u32,
    descriptor: Value,
    files: Vec<StoredResourceFile>,
}

impl StoredResourceRecord {
    fn dto(&self) -> StoredResourceRecordDto {
        StoredResourceRecordDto {
            revision: self.revision.clone(),
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
pub struct ResourceBeginWorkspaceMediaImportInput {
    pub purpose: String,
    pub file_name: String,
    pub media_type: String,
    pub provenance: Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyMediaRecoveryStatusDto {
    pub completed: bool,
    pub migrated_active_count: usize,
    pub archived_user_count: usize,
    pub removed_provider_media_count: usize,
    pub blocked_count: usize,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedResourceSnapshotDto {
    pub snapshot_id: String,
    pub slots: HashMap<String, ResourceRefDto>,
    pub revisions: HashMap<String, String>,
    pub files_by_slot: HashMap<String, Vec<ResourceFileRecordDto>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSnapshot {
    storage_schema: u32,
    snapshot_id: String,
    slots: HashMap<String, ResourceRefDto>,
    revisions: HashMap<String, String>,
    files_by_slot: HashMap<String, Vec<StoredResourceFile>>,
}

impl StoredSnapshot {
    fn dto(&self) -> OpenedResourceSnapshotDto {
        OpenedResourceSnapshotDto {
            snapshot_id: self.snapshot_id.clone(),
            slots: self.slots.clone(),
            revisions: self.revisions.clone(),
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMediaIndex {
    storage_schema: u32,
    resource_ids: Vec<String>,
}

impl Default for WorkspaceMediaIndex {
    fn default() -> Self {
        Self {
            storage_schema: WORKSPACE_STORAGE_SCHEMA,
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
        ensure_layout_without_index(&root)?;
        remove_directory_contents(&root.join("transactions"))?;
        remove_directory_contents(&root.join("snapshots"))?;
        migrate_storage_schema_v1(&root, state.inner())?;
        migrate_resource_ids_to_logical(&root, state.inner())?;
        ensure_layout(&root)?;
        ensure_workspace_layout(&workspace_media_root(&app)?)?;
        migrate_legacy_bestdori_cache(&app, &root, state.inner())?;
        recover_projections(&root, state.inner())?;
        runtime.open_snapshots.clear();
        runtime.pending_workspace_imports.clear();
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

pub fn resource_shutdown(
    app: &tauri::AppHandle,
    state: &ApplicationResourceState,
) -> Result<(), String> {
    let root = resource_root(app)?;
    let workspace = workspace_media_root(app)?;
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state for shutdown failed: {error}"))?;
    if !runtime.initialized {
        return Ok(());
    }
    runtime.open_snapshots.clear();
    runtime.pending_workspace_imports.clear();
    runtime.initialized = false;
    remove_directory_contents(&root.join("snapshots"))?;
    remove_directory_contents(&root.join("transactions"))?;
    drop(runtime);
    collect_garbage_paths(&root, &workspace)
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
    let workspace = workspace_media_root(&app)?;
    let resource_id = normalize_resource_id(&reference.id)?;
    let record = read_any_record(&root, &workspace, &resource_id)?;
    verify_any_record(&root, &record)?;
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
pub fn resource_install_builtin_package(
    app: tauri::AppHandle,
    input: ResourceInstallNetworkInput,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<StoredResourceRecordDto, String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    if input.descriptor.get("origin").and_then(Value::as_str) != Some("builtin") {
        return Err("builtin install descriptor origin must be builtin".to_string());
    }
    let root = resource_root(&app)?;
    let record = commit_resource(
        &root,
        input.descriptor,
        input.files,
        &next_identity(state.inner(), "builtin"),
    )?;
    Ok(record.dto())
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
    if input
        .descriptor
        .get("source")
        .and_then(Value::as_object)
        .and_then(|source| source.get("family"))
        .and_then(Value::as_str)
        .is_some_and(|family| family.starts_with("media-"))
    {
        return Err("chart media cannot be installed as a global network record".to_string());
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
pub fn resource_begin_workspace_media_import(
    app: tauri::AppHandle,
    input: ResourceBeginWorkspaceMediaImportInput,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<String, String> {
    let purpose = normalize_user_media_purpose(&input.purpose)?;
    let file_name = normalize_file_name(&input.file_name)?;
    let media_type = normalize_media_type(&input.media_type)?;
    let provenance = normalize_workspace_provenance(&input.provenance)?;
    let transaction_id = next_identity(state.inner(), "workspace-stream");
    let root = resource_root(&app)?;
    ensure_layout(&root)?;
    let path = root
        .join("transactions")
        .join(&transaction_id)
        .join("workspace-media.bin");
    write_synced(&path, &[])?;
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    runtime.pending_workspace_imports.insert(
        transaction_id.clone(),
        PendingWorkspaceMediaImport {
            purpose,
            file_name,
            media_type,
            path,
            workspace_provenance: Some(provenance),
        },
    );
    Ok(transaction_id)
}

#[tauri::command]
pub fn resource_append_workspace_media_chunk(
    transaction_id: String,
    chunk_base64: String,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let chunk = base64::engine::general_purpose::STANDARD
        .decode(chunk_base64)
        .map_err(|error| format!("decode workspace media chunk failed: {error}"))?;
    if chunk.is_empty() || chunk.len() > 512 * 1024 {
        return Err("workspace media chunks must contain 1..524288 bytes".to_string());
    }
    let path = {
        let runtime = state
            .runtime
            .lock()
            .map_err(|error| format!("lock resource state failed: {error}"))?;
        runtime
            .pending_workspace_imports
            .get(&transaction_id)
            .map(|pending| pending.path.clone())
            .ok_or_else(|| "workspace media import transaction is unavailable".to_string())?
    };
    let mut file = fs::OpenOptions::new()
        .append(true)
        .open(path)
        .map_err(|error| format!("open workspace media transaction failed: {error}"))?;
    file.write_all(&chunk)
        .map_err(|error| format!("append workspace media chunk failed: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn resource_commit_workspace_media_import(
    app: tauri::AppHandle,
    transaction_id: String,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<StoredResourceRecordDto, String> {
    let pending = {
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|error| format!("lock resource state failed: {error}"))?;
        runtime
            .pending_workspace_imports
            .remove(&transaction_id)
            .ok_or_else(|| "workspace media import transaction is unavailable".to_string())?
    };
    let provenance = pending
        .workspace_provenance
        .ok_or_else(|| "workspace media transaction has no provenance".to_string())?;
    let bytes = fs::read(&pending.path)
        .map_err(|error| format!("read workspace media transaction failed: {error}"))?;
    if bytes.is_empty() {
        return Err("workspace media transaction is empty".to_string());
    }
    let integrity = observe_bytes(&bytes);
    let resource_id = format!(
        "workspace/current/chart-media/{}/{}",
        pending.purpose,
        integrity.sha256.to_ascii_lowercase()
    );
    let descriptor = workspace_media_descriptor(
        &resource_id,
        &pending.purpose,
        &pending.file_name,
        provenance,
    )?;
    let root = resource_root(&app)?;
    let workspace = workspace_media_root(&app)?;
    let record = commit_workspace_resource(
        &root,
        &workspace,
        descriptor,
        vec![ResourceInstallFileInput {
            logical_path: "workspace-media.bin".to_string(),
            media_type: pending.media_type,
            base64_data: base64::engine::general_purpose::STANDARD.encode(bytes),
        }],
        &transaction_id,
    )?;
    if let Some(directory) = pending.path.parent() {
        let _ = fs::remove_dir_all(directory);
    }
    Ok(record.dto())
}

#[tauri::command]
pub fn resource_abort_workspace_media_import(
    transaction_id: String,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let pending = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?
        .pending_workspace_imports
        .remove(&transaction_id);
    if let Some(pending) = pending {
        if let Some(directory) = pending.path.parent() {
            let _ = fs::remove_dir_all(directory);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn resource_reconcile_workspace_media(
    app: tauri::AppHandle,
    refs: Vec<ResourceRefDto>,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<(), String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    let root = resource_root(&app)?;
    let workspace = workspace_media_root(&app)?;
    ensure_layout(&root)?;
    ensure_workspace_layout(&workspace)?;
    let mut retained = HashSet::new();
    for reference in refs {
        let resource_id = normalize_resource_id(&reference.id)?;
        if !resource_id.starts_with("workspace/current/chart-media/")
            || !retained.insert(resource_id.clone())
        {
            return Err(
                "workspace reconciliation requires unique current chart-media refs".to_string(),
            );
        }
        let record = read_workspace_record(&workspace, &resource_id)?;
        verify_workspace_record(&root, &record)?;
    }
    let previous = read_workspace_index(&workspace)?;
    let mut resource_ids: Vec<String> = retained.into_iter().collect();
    resource_ids.sort();
    write_workspace_index(
        &root,
        &workspace,
        &WorkspaceMediaIndex {
            storage_schema: WORKSPACE_STORAGE_SCHEMA,
            resource_ids: resource_ids.clone(),
        },
        &next_identity(state.inner(), "workspace-reconcile"),
    )?;
    for resource_id in previous.resource_ids {
        if !resource_ids.contains(&resource_id) {
            let path = workspace_record_path(&workspace, &resource_id);
            if path.exists() {
                fs::remove_file(path).map_err(|error| {
                    format!("remove unreachable workspace record failed: {error}")
                })?;
            }
        }
    }
    collect_garbage_paths(&root, &workspace)
}

#[tauri::command]
pub fn resource_finalize_legacy_media_migration(
    app: tauri::AppHandle,
    migrated_active_refs: Vec<ResourceRefDto>,
    state: tauri::State<'_, ApplicationResourceState>,
) -> Result<LegacyMediaRecoveryStatusDto, String> {
    let _guard = state
        .runtime
        .lock()
        .map_err(|error| format!("lock resource state failed: {error}"))?;
    let root = resource_root(&app)?;
    let workspace = workspace_media_root(&app)?;
    let recovery = legacy_user_media_recovery_root(&app)?;
    ensure_layout(&root)?;
    ensure_workspace_layout(&workspace)?;
    fs::create_dir_all(recovery.join("files"))
        .map_err(|error| format!("create legacy media recovery failed: {error}"))?;
    let manifest_path = recovery.join("manifest.json");
    if manifest_path.exists() {
        let bytes = fs::read(&manifest_path)
            .map_err(|error| format!("read legacy media recovery manifest failed: {error}"))?;
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|error| format!("parse legacy media recovery manifest failed: {error}"))?;
        return serde_json::from_value(
            value
                .get("status")
                .cloned()
                .ok_or_else(|| "legacy media recovery status is missing".to_string())?,
        )
        .map_err(|error| format!("parse legacy media recovery status failed: {error}"));
    }
    let active: HashSet<String> = migrated_active_refs
        .into_iter()
        .map(|reference| normalize_resource_id(&reference.id))
        .collect::<Result<_, _>>()?;
    let mut index = read_index(&root)?;
    let mut retained_ids = Vec::new();
    let mut removable_ids = Vec::new();
    let mut archived = Vec::new();
    let mut blocked = Vec::new();
    let mut migrated_active_count = 0;
    let mut removed_provider_media_count = 0;
    for resource_id in &index.resource_ids {
        let record = read_record(&root, resource_id)?;
        let origin = record.descriptor.get("origin").and_then(Value::as_str);
        let provider_media = origin == Some("network")
            && record
                .descriptor
                .get("source")
                .and_then(Value::as_object)
                .and_then(|source| source.get("family"))
                .and_then(Value::as_str)
                .is_some_and(|family| family.starts_with("media-"));
        if origin == Some("user") {
            if active.contains(resource_id) {
                migrated_active_count += 1;
                removable_ids.push(resource_id.clone());
                continue;
            }
            match archive_legacy_user_record(&root, &recovery, resource_id, &record) {
                Ok(entry) => {
                    archived.push(entry);
                    removable_ids.push(resource_id.clone());
                }
                Err(error) => {
                    blocked.push(serde_json::json!({ "resourceId": resource_id, "error": error }));
                    retained_ids.push(resource_id.clone());
                }
            }
        } else if provider_media {
            removed_provider_media_count += 1;
            removable_ids.push(resource_id.clone());
        } else {
            retained_ids.push(resource_id.clone());
        }
    }
    index.resource_ids = retained_ids;
    write_index(
        &root,
        &index,
        &next_identity(state.inner(), "legacy-media-index"),
    )?;
    for resource_id in removable_ids {
        if let Ok(record) = read_record(&root, &resource_id) {
            if let Ok(projection) = projection_resource_path(&root, &record.descriptor) {
                let current = projection.join("current.json");
                if current.exists() {
                    let _ = fs::remove_file(current);
                }
            }
        }
        let path = record_path(&root, &resource_id);
        if path.exists() {
            fs::remove_file(path)
                .map_err(|error| format!("remove migrated legacy media record failed: {error}"))?;
        }
    }
    if blocked.is_empty() {
        let user_library = root.join("library/user");
        if user_library.exists() {
            fs::remove_dir_all(user_library).map_err(|error| {
                format!("remove legacy user library projection failed: {error}")
            })?;
        }
    }
    let status = LegacyMediaRecoveryStatusDto {
        completed: blocked.is_empty(),
        migrated_active_count,
        archived_user_count: archived.len(),
        removed_provider_media_count,
        blocked_count: blocked.len(),
    };
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "status": status,
        "archived": archived,
        "blocked": blocked,
    }))
    .map_err(|error| format!("serialize legacy media recovery manifest failed: {error}"))?;
    atomic_write(
        &root,
        &manifest_path,
        &manifest,
        &next_identity(state.inner(), "legacy-media-recovery"),
    )?;
    collect_garbage_paths(&root, &workspace)?;
    Ok(status)
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
    let mut revisions = HashMap::new();
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
        let workspace = workspace_media_root(&app)?;
        let record = read_any_record(&root, &workspace, &resource_id)?;
        verify_any_record(&root, &record)?;
        revisions.insert(slot.clone(), record.revision);
        files_by_slot.insert(slot, record.files);
    }
    let snapshot_id = format!("snapshot/{}", next_identity(state.inner(), "snapshot"));
    let snapshot = StoredSnapshot {
        storage_schema: STORAGE_SCHEMA,
        snapshot_id: snapshot_id.clone(),
        slots: normalized_slots,
        revisions,
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
    let remove_snapshot = {
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
    if remove_snapshot {
        let root = resource_root(&app)?;
        let path = snapshot_path(&root, &snapshot_id);
        if path.exists() {
            fs::remove_file(path)
                .map_err(|error| format!("remove released resource snapshot failed: {error}"))?;
        }
        collect_garbage_paths(&root, &workspace_media_root(&app)?)?;
    }
    Ok(())
}

#[tauri::command]
pub fn resource_verify(app: tauri::AppHandle, reference: ResourceRefDto) -> Result<Value, String> {
    let root = resource_root(&app)?;
    let workspace = workspace_media_root(&app)?;
    let resource_id = normalize_resource_id(&reference.id)?;
    let record = read_any_record(&root, &workspace, &resource_id)?;
    verify_any_record(&root, &record)?;
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
    if resource_id.starts_with("workspace/current/chart-media/") {
        let workspace = workspace_media_root(&app)?;
        let path = workspace_record_path(&workspace, &resource_id);
        if path.exists() {
            fs::remove_file(path)
                .map_err(|error| format!("remove workspace media record failed: {error}"))?;
        }
        let mut index = read_workspace_index(&workspace)?;
        index.resource_ids.retain(|id| id != &resource_id);
        write_workspace_index(
            &root,
            &workspace,
            &index,
            &next_identity(state.inner(), "workspace-remove"),
        )?;
        return collect_garbage_paths(&root, &workspace);
    }
    let record = read_record(&root, &resource_id).ok();
    let path = record_path(&root, &resource_id);
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("remove resource record failed: {error}"))?;
    }
    if let Some(record) = record {
        let current = projection_resource_path(&root, &record.descriptor)?.join("current.json");
        if current.exists() {
            fs::remove_file(current)
                .map_err(|error| format!("remove projection current pointer failed: {error}"))?;
        }
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
    let workspace = workspace_media_root(&app)?;
    collect_garbage_paths(&root, &workspace)
}

fn archive_legacy_user_record(
    root: &Path,
    recovery: &Path,
    resource_id: &str,
    record: &StoredResourceRecord,
) -> Result<Value, String> {
    verify_record(root, record)?;
    let target_root = recovery.join("files").join(digest_text(resource_id));
    for file in &record.files {
        let target = target_root.join(&file.logical_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("create legacy recovery parent failed: {error}"))?;
        }
        if target.exists() {
            verify_blob_path(&target, &file.integrity)?;
            continue;
        }
        let blob = root.join("blobs").join(&file.blob);
        if fs::hard_link(&blob, &target).is_err() {
            fs::copy(&blob, &target)
                .map_err(|error| format!("copy legacy recovery media failed: {error}"))?;
        }
        verify_blob_path(&target, &file.integrity)?;
    }
    Ok(serde_json::json!({
        "resourceId": resource_id,
        "purpose": record.descriptor.get("purpose").cloned().unwrap_or(Value::Null),
        "fileName": record.descriptor.get("fileName").cloned().unwrap_or(Value::Null),
        "files": record.files.iter().map(|file| serde_json::json!({
            "logicalPath": file.logical_path,
            "byteLength": file.integrity.byte_length,
            "sha256": file.integrity.sha256,
        })).collect::<Vec<_>>(),
    }))
}

fn collect_garbage_paths(root: &Path, workspace: &Path) -> Result<(), String> {
    ensure_layout(root)?;
    ensure_workspace_layout(workspace)?;
    let mut retained = HashSet::new();
    let mut retained_revisions = HashSet::new();
    for resource_id in read_index(root)?.resource_ids {
        if let Ok(record) = read_record(root, &resource_id) {
            if let Some(digest) = record.revision.strip_prefix("record/") {
                retained_revisions.insert(digest.to_string());
            }
            retained.extend(record.files.into_iter().map(|file| file.blob));
        }
    }
    for resource_id in read_workspace_index(workspace)?.resource_ids {
        if let Ok(record) = read_workspace_record(workspace, &resource_id) {
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
                for revision in snapshot.revisions.into_values() {
                    if let Some(digest) = revision.strip_prefix("record/") {
                        retained_revisions.insert(digest.to_string());
                    }
                }
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
    collect_projection_garbage(&root.join("library"), &retained_revisions)
}

fn collect_projection_garbage(
    directory: &Path,
    retained_revisions: &HashSet<String>,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("read projection directory failed: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("read projection entry failed: {error}"))?
            .path();
        if !path.is_dir() {
            continue;
        }
        if path.file_name().and_then(|value| value.to_str()) == Some("revisions") {
            for revision in fs::read_dir(&path)
                .map_err(|error| format!("read projection revisions failed: {error}"))?
            {
                let revision_path = revision
                    .map_err(|error| format!("read projection revision failed: {error}"))?
                    .path();
                let name = revision_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default();
                if revision_path.is_dir() && !retained_revisions.contains(name) {
                    fs::remove_dir_all(&revision_path).map_err(|error| {
                        format!("remove obsolete projection revision failed: {error}")
                    })?;
                }
            }
        } else {
            collect_projection_garbage(&path, retained_revisions)?;
        }
    }
    Ok(())
}

fn commit_workspace_resource(
    root: &Path,
    workspace: &Path,
    mut descriptor: Value,
    files: Vec<ResourceInstallFileInput>,
    transaction_id: &str,
) -> Result<StoredResourceRecord, String> {
    ensure_layout(root)?;
    ensure_workspace_layout(workspace)?;
    let resource_id = descriptor_resource_id(&descriptor)?;
    if !resource_id.starts_with("workspace/current/chart-media/") || files.is_empty() {
        return Err(
            "workspace media transaction requires one current chart-media identity and file"
                .to_string(),
        );
    }
    let transaction = root.join("transactions").join(transaction_id);
    fs::create_dir_all(&transaction)
        .map_err(|error| format!("create workspace transaction failed: {error}"))?;
    let result = (|| {
        let mut seen = HashSet::new();
        let mut stored_files = Vec::new();
        for (index, file) in files.into_iter().enumerate() {
            let logical_path = normalize_logical_path(&file.logical_path)?;
            if !seen.insert(logical_path.to_lowercase()) {
                return Err("duplicate workspace media path".to_string());
            }
            let media_type = normalize_media_type(&file.media_type)?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(file.base64_data)
                .map_err(|error| format!("decode workspace media failed: {error}"))?;
            if bytes.is_empty() {
                return Err("workspace media file is empty".to_string());
            }
            let integrity = observe_bytes(&bytes);
            let temp_path = transaction.join(format!("file-{index}"));
            write_synced(&temp_path, &bytes)?;
            let blob_path = root.join("blobs").join(&integrity.sha256);
            if blob_path.exists() {
                verify_blob_path(&blob_path, &integrity)?;
                fs::remove_file(&temp_path)
                    .map_err(|error| format!("remove duplicate workspace blob failed: {error}"))?;
            } else {
                fs::rename(&temp_path, &blob_path)
                    .map_err(|error| format!("publish workspace blob failed: {error}"))?;
            }
            stored_files.push(StoredResourceFile {
                logical_path,
                media_type,
                blob: integrity.sha256.clone(),
                integrity,
            });
        }
        stored_files.sort_by(|left, right| left.logical_path.cmp(&right.logical_path));
        let revision = record_revision(&resource_id, &stored_files);
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
            .ok_or_else(|| "workspace descriptor must be an object".to_string())?;
        descriptor_object.insert(
            "availability".to_string(),
            Value::String("installed".to_string()),
        );
        descriptor_object.insert(
            "files".to_string(),
            serde_json::to_value(&public_files)
                .map_err(|error| format!("serialize workspace file records failed: {error}"))?,
        );
        let record = StoredResourceRecord {
            storage_schema: WORKSPACE_STORAGE_SCHEMA,
            revision,
            descriptor,
            files: stored_files,
        };
        verify_workspace_record(root, &record)?;
        let encoded = serde_json::to_vec(&record)
            .map_err(|error| format!("serialize workspace record failed: {error}"))?;
        atomic_write(
            root,
            &workspace_record_path(workspace, &resource_id),
            &encoded,
            transaction_id,
        )?;
        let mut index = read_workspace_index(workspace)?;
        if !index.resource_ids.iter().any(|id| id == &resource_id) {
            index.resource_ids.push(resource_id);
            index.resource_ids.sort();
        }
        write_workspace_index(root, workspace, &index, transaction_id)?;
        Ok(record)
    })();
    let _ = fs::remove_dir_all(&transaction);
    result
}

fn commit_resource(
    root: &Path,
    mut descriptor: Value,
    files: Vec<ResourceInstallFileInput>,
    transaction_id: &str,
) -> Result<StoredResourceRecord, String> {
    ensure_layout(root)?;
    let resource_id = descriptor_resource_id(&descriptor)?;
    let projection_root = projection_resource_path(root, &descriptor)?;
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
            let collision_key = logical_path.to_lowercase();
            if !seen.insert(collision_key) {
                return Err(format!(
                    "duplicate or case-colliding resource package path: {logical_path}"
                ));
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
        stored_files.sort_by(|left, right| left.logical_path.cmp(&right.logical_path));
        let revision = record_revision(&resource_id, &stored_files);
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
        let availability =
            if descriptor_object.get("origin").and_then(Value::as_str) == Some("builtin") {
                "builtin-ready"
            } else {
                "installed"
            };
        descriptor_object.insert(
            "availability".to_string(),
            Value::String(availability.to_string()),
        );
        descriptor_object.insert(
            "files".to_string(),
            serde_json::to_value(&public_files)
                .map_err(|error| format!("serialize resource file records failed: {error}"))?,
        );
        let record = StoredResourceRecord {
            storage_schema: STORAGE_SCHEMA,
            revision: revision.clone(),
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
        publish_projection(
            root,
            &projection_root,
            &resource_id,
            &revision,
            &record.files,
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
        || record.revision != record_revision(resource_id, &record.files)
    {
        return Err("resource record identity or storage schema is invalid".to_string());
    }
    Ok(record)
}

fn read_workspace_record(
    workspace: &Path,
    resource_id: &str,
) -> Result<StoredResourceRecord, String> {
    let bytes = fs::read(workspace_record_path(workspace, resource_id))
        .map_err(|error| format!("read workspace media record failed: {error}"))?;
    let record: StoredResourceRecord = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse workspace media record failed: {error}"))?;
    if record.storage_schema != WORKSPACE_STORAGE_SCHEMA
        || descriptor_resource_id(&record.descriptor)? != resource_id
        || record.revision != record_revision(resource_id, &record.files)
    {
        return Err("workspace media record identity or schema is invalid".to_string());
    }
    Ok(record)
}

fn read_any_record(
    root: &Path,
    workspace: &Path,
    resource_id: &str,
) -> Result<StoredResourceRecord, String> {
    if resource_id.starts_with("workspace/current/chart-media/") {
        read_workspace_record(workspace, resource_id)
    } else {
        read_record(root, resource_id)
    }
}

fn verify_any_record(root: &Path, record: &StoredResourceRecord) -> Result<(), String> {
    if record.descriptor.get("origin").and_then(Value::as_str) == Some("workspace") {
        verify_workspace_record(root, record)
    } else {
        verify_record(root, record)
    }
}

fn verify_workspace_record(root: &Path, record: &StoredResourceRecord) -> Result<(), String> {
    if record.storage_schema != WORKSPACE_STORAGE_SCHEMA
        || record.descriptor.get("origin").and_then(Value::as_str) != Some("workspace")
        || record.descriptor.get("logicalPlacement").is_some()
        || record.files.len() != 1
    {
        return Err("workspace media record shape is invalid".to_string());
    }
    let resource_id = descriptor_resource_id(&record.descriptor)?;
    let purpose = record
        .descriptor
        .get("purpose")
        .and_then(Value::as_str)
        .ok_or_else(|| "workspace media purpose is missing".to_string())?;
    normalize_user_media_purpose(purpose)?;
    normalize_workspace_provenance(
        record
            .descriptor
            .get("provenance")
            .ok_or_else(|| "workspace media provenance is missing".to_string())?,
    )?;
    let expected_prefix = format!("workspace/current/chart-media/{purpose}/");
    let digest = resource_id
        .strip_prefix(&expected_prefix)
        .ok_or_else(|| "workspace media record identity is invalid".to_string())?;
    if digest != record.files[0].integrity.sha256.to_ascii_lowercase() {
        return Err("workspace media identity does not match content digest".to_string());
    }
    verify_record_files(root, record)
}

fn verify_record(root: &Path, record: &StoredResourceRecord) -> Result<(), String> {
    if record.files.is_empty() {
        return Err("stored resource record has no files".to_string());
    }
    projection_resource_path(root, &record.descriptor)?;
    verify_record_files(root, record)
}

fn verify_record_files(root: &Path, record: &StoredResourceRecord) -> Result<(), String> {
    let mut seen = HashSet::new();
    for file in &record.files {
        normalize_logical_path(&file.logical_path)?;
        if !seen.insert(file.logical_path.to_lowercase()) {
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

fn record_revision(resource_id: &str, files: &[StoredResourceFile]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(resource_id.as_bytes());
    hasher.update([0]);
    for file in files {
        hasher.update(file.logical_path.as_bytes());
        hasher.update([0]);
        hasher.update(file.media_type.as_bytes());
        hasher.update([0]);
        hasher.update(file.integrity.byte_length.to_le_bytes());
        hasher.update(file.integrity.sha256.as_bytes());
        hasher.update([0]);
    }
    format!("record/{:X}", hasher.finalize())
}

fn projection_resource_path(root: &Path, descriptor: &Value) -> Result<PathBuf, String> {
    let origin = descriptor
        .get("origin")
        .and_then(Value::as_str)
        .ok_or_else(|| "resource descriptor is missing origin".to_string())?;
    let placement = descriptor
        .get("logicalPlacement")
        .and_then(Value::as_object)
        .ok_or_else(|| "resource descriptor is missing logicalPlacement".to_string())?;
    let provider = normalize_segment(
        placement
            .get("provider")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "logical placement provider",
    )?;
    let server = match placement.get("server") {
        Some(Value::String(value)) => Some(normalize_segment(value, "logical placement server")?),
        Some(Value::Null) => None,
        _ => return Err("logical placement server must be string or null".to_string()),
    };
    let canonical_path = normalize_logical_path(
        placement
            .get("canonicalPath")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )?;
    let identity_class = placement
        .get("identityClass")
        .and_then(Value::as_str)
        .ok_or_else(|| "logical placement identityClass is missing".to_string())?;
    let mut path = root.join("library");
    match origin {
        "builtin"
            if provider == "application"
                && server.is_none()
                && identity_class == "application-builtin" =>
        {
            path.push("builtin");
        }
        "network" if identity_class == "provider-package" || identity_class == "provider-media" => {
            let source = descriptor
                .get("source")
                .and_then(Value::as_object)
                .ok_or_else(|| "network descriptor source is missing".to_string())?;
            if source.get("provider").and_then(Value::as_str) != Some(provider.as_str())
                || source.get("server").and_then(Value::as_str) != server.as_deref()
            {
                return Err("network source and logical placement disagree".to_string());
            }
            path.push(&provider);
            path.push(
                server.ok_or_else(|| "network logical placement requires server".to_string())?,
            );
        }
        "user" if provider == "user" && server.is_none() && identity_class == "user-media" => {
            path.push("user");
        }
        _ => return Err("resource origin and logical placement are incompatible".to_string()),
    }
    for part in canonical_path.split('/') {
        path.push(part);
    }
    Ok(path)
}

fn publish_projection(
    root: &Path,
    projection_root: &Path,
    resource_id: &str,
    revision: &str,
    files: &[StoredResourceFile],
    transaction_id: &str,
) -> Result<(), String> {
    let digest = revision
        .strip_prefix("record/")
        .ok_or_else(|| "resource revision is invalid".to_string())?;
    let revision_directory = projection_root.join("revisions").join(digest);
    let revision_root = revision_directory.join("files");
    if revision_root.exists() {
        let valid = files.iter().all(|file| {
            verify_blob_path(&revision_root.join(&file.logical_path), &file.integrity).is_ok()
        });
        if !valid {
            fs::remove_dir_all(&revision_directory).map_err(|error| {
                format!("remove incomplete projection revision failed: {error}")
            })?;
        }
    }
    if !revision_root.exists() {
        for file in files {
            let target = revision_root.join(&file.logical_path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("create projection parent failed: {error}"))?;
            }
            let blob = root.join("blobs").join(&file.blob);
            if fs::hard_link(&blob, &target).is_err() {
                fs::copy(&blob, &target)
                    .map_err(|error| format!("copy projection file failed: {error}"))?;
            }
            verify_blob_path(&target, &file.integrity)?;
        }
    }
    let pointer = serde_json::to_vec(&serde_json::json!({
        "storageSchema": STORAGE_SCHEMA,
        "resourceId": resource_id,
        "revision": revision,
    }))
    .map_err(|error| format!("serialize projection current pointer failed: {error}"))?;
    atomic_write(
        root,
        &projection_root.join("current.json"),
        &pointer,
        &format!("projection-{transaction_id}"),
    )
}

fn resource_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory failed: {error}"))?;
    root.push(RESOURCE_DIRECTORY);
    Ok(root)
}

fn legacy_user_media_recovery_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve recovery app data directory failed: {error}"))?;
    root.push("recovery");
    root.push("legacy-user-media-v1");
    Ok(root)
}

fn workspace_media_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve workspace app data directory failed: {error}"))?;
    root.push("cache");
    root.push("session");
    root.push(WORKSPACE_MEDIA_DIRECTORY);
    Ok(root)
}

fn ensure_workspace_layout(workspace: &Path) -> Result<(), String> {
    fs::create_dir_all(workspace.join("records"))
        .map_err(|error| format!("create workspace media layout failed: {error}"))?;
    if !workspace.join(INDEX_FILE).exists() {
        let bytes = serde_json::to_vec(&WorkspaceMediaIndex::default())
            .map_err(|error| format!("serialize workspace index failed: {error}"))?;
        write_synced(&workspace.join(INDEX_FILE), &bytes)?;
    }
    Ok(())
}

fn ensure_layout(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| format!("create resource root failed: {error}"))?;
    for name in [
        "catalogs",
        "records",
        "blobs",
        "snapshots",
        "transactions",
        "library",
    ] {
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

fn read_workspace_index(workspace: &Path) -> Result<WorkspaceMediaIndex, String> {
    ensure_workspace_layout(workspace)?;
    let bytes = fs::read(workspace.join(INDEX_FILE))
        .map_err(|error| format!("read workspace media index failed: {error}"))?;
    let index: WorkspaceMediaIndex = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse workspace media index failed: {error}"))?;
    if index.storage_schema != WORKSPACE_STORAGE_SCHEMA {
        return Err("unsupported workspace media schema".to_string());
    }
    Ok(index)
}

fn write_workspace_index(
    root: &Path,
    workspace: &Path,
    index: &WorkspaceMediaIndex,
    identity: &str,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(index)
        .map_err(|error| format!("serialize workspace media index failed: {error}"))?;
    atomic_write(root, &workspace.join(INDEX_FILE), &bytes, identity)
}

fn write_index(root: &Path, index: &ResourceIndex, identity: &str) -> Result<(), String> {
    let bytes = serde_json::to_vec(index)
        .map_err(|error| format!("serialize resource index failed: {error}"))?;
    atomic_write(root, &root.join(INDEX_FILE), &bytes, identity)
}

fn ensure_layout_without_index(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| format!("create resource root failed: {error}"))?;
    for name in [
        "catalogs",
        "records",
        "blobs",
        "snapshots",
        "transactions",
        "library",
    ] {
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

fn workspace_record_path(workspace: &Path, resource_id: &str) -> PathBuf {
    workspace
        .join("records")
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
        || trimmed.starts_with("workspace/")
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
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':' | '/'))
    {
        return Err("resource slot is invalid".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_logical_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('\\') || trimmed.nfc().collect::<String>() != trimmed
    {
        return Err("resource logical path is invalid or not NFC-normalized".to_string());
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
    for part in trimmed.split('/') {
        let upper = part
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_uppercase();
        if part.is_empty()
            || part.ends_with('.')
            || part.ends_with(' ')
            || matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (upper.len() == 4
                && (upper.starts_with("COM") || upper.starts_with("LPT"))
                && upper[3..]
                    .parse::<u8>()
                    .is_ok_and(|number| (1..=9).contains(&number)))
        {
            return Err("resource logical path contains a reserved segment".to_string());
        }
    }
    Ok(trimmed.to_string())
}

fn normalize_user_media_purpose(value: &str) -> Result<String, String> {
    match value {
        "bgm" | "cover" | "mv" | "stage-backdrop" => Ok(value.to_string()),
        _ => Err("user media purpose is not allowed".to_string()),
    }
}

fn normalize_workspace_provenance(value: &Value) -> Result<Value, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "workspace provenance must be an object".to_string())?;
    match object.get("kind").and_then(Value::as_str) {
        Some("user-upload") if object.len() == 1 => {
            Ok(serde_json::json!({ "kind": "user-upload" }))
        }
        Some("network") if object.len() == 2 => {
            let source_id = object
                .get("sourceRef")
                .and_then(Value::as_object)
                .and_then(|reference| reference.get("id"))
                .and_then(Value::as_str)
                .ok_or_else(|| "workspace network provenance requires sourceRef.id".to_string())?;
            let source_id = normalize_resource_id(source_id)?;
            if !source_id.starts_with("bestdori/") {
                return Err("workspace network provenance must identify Bestdori".to_string());
            }
            Ok(serde_json::json!({ "kind": "network", "sourceRef": { "id": source_id } }))
        }
        _ => Err("workspace provenance shape is invalid".to_string()),
    }
}

fn workspace_media_descriptor(
    resource_id: &str,
    purpose: &str,
    file_name: &str,
    provenance: Value,
) -> Result<Value, String> {
    let kind = match purpose {
        "bgm" => "audio",
        "mv" => "video",
        "cover" | "stage-backdrop" => "image",
        _ => return Err("workspace media purpose is invalid".to_string()),
    };
    Ok(serde_json::json!({
        "ref": { "id": normalize_resource_id(resource_id)? },
        "origin": "workspace",
        "kind": kind,
        "title": file_name,
        "availability": "installed",
        "files": null,
        "catalogObservedAt": null,
        "purpose": purpose,
        "fileName": file_name,
        "provenance": normalize_workspace_provenance(&provenance)?,
    }))
}

#[cfg(test)]
fn user_media_descriptor(identity: &str, purpose: &str, file_name: &str) -> Value {
    let resource_id = format!("user/media/{identity}");
    let kind = match purpose {
        "bgm" => "audio",
        "mv" => "video",
        _ => "image",
    };
    serde_json::json!({
        "ref": { "id": resource_id },
        "origin": "user",
        "kind": kind,
        "title": file_name,
        "availability": "installed",
        "files": null,
        "catalogObservedAt": null,
        "purpose": purpose,
        "fileName": file_name,
        "logicalPlacement": {
            "provider": "user",
            "server": null,
            "canonicalPath": format!("{}/{}", user_purpose_directory(purpose), identity),
            "identityClass": "user-media"
        }
    })
}

fn user_purpose_directory(purpose: &str) -> &'static str {
    match purpose {
        "bgm" => "sound/custom",
        "cover" => "musicjacket/custom",
        "mv" => "movie/custom",
        _ => "stage/custom",
    }
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

fn migrate_storage_schema_v1(root: &Path, state: &ApplicationResourceState) -> Result<(), String> {
    let index_path = root.join(INDEX_FILE);
    if !index_path.exists() {
        write_index(
            root,
            &ResourceIndex::default(),
            &next_identity(state, "schema-initialize"),
        )?;
        return Ok(());
    }
    let index_bytes = fs::read(&index_path)
        .map_err(|error| format!("read legacy resource index failed: {error}"))?;
    let index_value: Value = serde_json::from_slice(&index_bytes)
        .map_err(|error| format!("parse legacy resource index failed: {error}"))?;
    let schema = index_value
        .get("storageSchema")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if schema == STORAGE_SCHEMA as u64 {
        return Ok(());
    }
    if schema != 1 {
        return Err("unsupported resource storage schema".to_string());
    }
    let resource_ids = index_value
        .get("resourceIds")
        .and_then(Value::as_array)
        .ok_or_else(|| "legacy resource index has no resourceIds".to_string())?
        .iter()
        .map(|value| {
            value
                .as_str()
                .ok_or_else(|| "legacy resource id is invalid".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    for resource_id in &resource_ids {
        let resource_id = normalize_resource_id(resource_id)?;
        let path = record_path(root, &resource_id);
        let bytes = fs::read(&path)
            .map_err(|error| format!("read legacy resource record failed: {error}"))?;
        let legacy: LegacyStoredResourceRecordV1 = serde_json::from_slice(&bytes)
            .map_err(|error| format!("parse legacy resource record failed: {error}"))?;
        if legacy.storage_schema != 1 || descriptor_resource_id(&legacy.descriptor)? != resource_id
        {
            return Err("legacy resource record identity is invalid".to_string());
        }
        let mut descriptor = legacy.descriptor;
        install_inferred_logical_placement(&mut descriptor, &resource_id)?;
        let mut files = legacy.files;
        files.sort_by(|left, right| left.logical_path.cmp(&right.logical_path));
        let revision = record_revision(&resource_id, &files);
        let record = StoredResourceRecord {
            storage_schema: STORAGE_SCHEMA,
            revision: revision.clone(),
            descriptor,
            files,
        };
        verify_record(root, &record)?;
        let encoded = serde_json::to_vec(&record)
            .map_err(|error| format!("serialize migrated resource record failed: {error}"))?;
        atomic_write(
            root,
            &path,
            &encoded,
            &next_identity(state, "schema-record"),
        )?;
        let projection = projection_resource_path(root, &record.descriptor)?;
        publish_projection(
            root,
            &projection,
            &resource_id,
            &revision,
            &record.files,
            &next_identity(state, "schema-projection"),
        )?;
    }
    let migrated = ResourceIndex {
        storage_schema: STORAGE_SCHEMA,
        resource_ids: resource_ids.into_iter().map(str::to_string).collect(),
    };
    write_index(root, &migrated, &next_identity(state, "schema-index"))?;
    let report = serde_json::to_vec(&serde_json::json!({
        "fromStorageSchema": 1,
        "toStorageSchema": STORAGE_SCHEMA,
        "resourceCount": migrated.resource_ids.len(),
    }))
    .map_err(|error| format!("serialize schema migration report failed: {error}"))?;
    atomic_write(
        root,
        &root.join("storage-migration.json"),
        &report,
        &next_identity(state, "schema-report"),
    )
}

fn install_inferred_logical_placement(
    descriptor: &mut Value,
    resource_id: &str,
) -> Result<(), String> {
    let object = descriptor
        .as_object_mut()
        .ok_or_else(|| "legacy descriptor is not an object".to_string())?;
    if object.contains_key("logicalPlacement") {
        return Ok(());
    }
    let origin = object
        .get("origin")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let placement = match origin {
        "builtin" => serde_json::json!({
            "provider": "application",
            "server": null,
            "canonicalPath": format!("application/{}", resource_id.trim_start_matches("builtin/")),
            "identityClass": "application-builtin",
        }),
        "network" => {
            let source = object
                .get("source")
                .and_then(Value::as_object)
                .ok_or_else(|| "legacy network source is unavailable".to_string())?;
            let provider = source
                .get("provider")
                .and_then(Value::as_str)
                .unwrap_or("bestdori");
            let server = source.get("server").and_then(Value::as_str).unwrap_or("jp");
            let family = source
                .get("family")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let native_id = source
                .get("nativeId")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let canonical = legacy_network_canonical_path(family, native_id, resource_id);
            serde_json::json!({
                "provider": provider,
                "server": server,
                "canonicalPath": canonical,
                "identityClass": if family.starts_with("media-") { "provider-media" } else { "provider-package" },
            })
        }
        "user" => {
            let purpose = object
                .get("purpose")
                .and_then(Value::as_str)
                .unwrap_or("stage-backdrop");
            serde_json::json!({
                "provider": "user",
                "server": null,
                "canonicalPath": format!("{}/{}", user_purpose_directory(purpose), resource_id.trim_start_matches("user/media/")),
                "identityClass": "user-media",
            })
        }
        _ => return Err("legacy descriptor origin is invalid".to_string()),
    };
    object.insert("logicalPlacement".to_string(), placement);
    Ok(())
}

fn legacy_network_canonical_path(family: &str, native_id: &str, resource_id: &str) -> String {
    match family {
        "noteskin" | "fieldskin" | "bgskin" | "judgeskin" | "tapeffect" | "stageskin" => {
            format!("ingameskin/{family}/{native_id}")
        }
        "tapseskin" => format!("sound/tapseskin/{native_id}"),
        "sound-common" => "sound/common".to_string(),
        "media-bgm" => format!("legacy-media/bgm/{}", digest_text(resource_id)),
        "media-cover" => format!("legacy-media/cover/{}", digest_text(resource_id)),
        "media-mv" => format!("legacy-media/mv/{}", digest_text(resource_id)),
        "media-stage-backdrop" => format!("legacy-media/stage/{}", digest_text(resource_id)),
        _ => format!("legacy-package/{}/{}", family, digest_text(resource_id)),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyMigrationReport {
    storage_schema: u32,
    completed_at_unix_milliseconds: u128,
    imported: Vec<String>,
    skipped: Vec<String>,
}

fn migrate_resource_ids_to_logical(
    root: &Path,
    state: &ApplicationResourceState,
) -> Result<(), String> {
    let mut index = read_index(root)?;
    let mut migrated = Vec::new();
    let mut skipped = Vec::new();
    let old_ids = index.resource_ids.clone();
    for old_id in old_ids {
        let record = read_record(root, &old_id)?;
        let Some(new_id) = canonical_record_resource_id(&record.descriptor, &old_id) else {
            if old_id.starts_with("bestdori/") {
                skipped.push(old_id);
            }
            continue;
        };
        if new_id == old_id {
            continue;
        }
        if record_path(root, &new_id).exists() {
            skipped.push(format!("{old_id}: target exists"));
            continue;
        }
        let old_projection = projection_resource_path(root, &record.descriptor).ok();
        let mut descriptor = record.descriptor;
        descriptor["ref"]["id"] = Value::String(new_id.clone());
        install_logical_placement_for_canonical_id(&mut descriptor, &new_id)?;
        let revision = record_revision(&new_id, &record.files);
        let migrated_record = StoredResourceRecord {
            storage_schema: STORAGE_SCHEMA,
            revision: revision.clone(),
            descriptor,
            files: record.files,
        };
        let encoded = serde_json::to_vec(&migrated_record)
            .map_err(|error| format!("serialize identity-migrated record failed: {error}"))?;
        atomic_write(
            root,
            &record_path(root, &new_id),
            &encoded,
            &next_identity(state, "identity-record"),
        )?;
        let projection = projection_resource_path(root, &migrated_record.descriptor)?;
        publish_projection(
            root,
            &projection,
            &new_id,
            &revision,
            &migrated_record.files,
            &next_identity(state, "identity-projection"),
        )?;
        let old_path = record_path(root, &old_id);
        if old_path.exists() {
            fs::remove_file(old_path)
                .map_err(|error| format!("remove old identity record failed: {error}"))?;
        }
        if let Some(old_projection) = old_projection {
            let current = old_projection.join("current.json");
            if current.exists() {
                let _ = fs::remove_file(current);
            }
        }
        index.resource_ids.retain(|id| id != &old_id);
        index.resource_ids.push(new_id.clone());
        migrated.push(format!("{old_id} -> {new_id}"));
    }
    index.resource_ids.sort();
    index.resource_ids.dedup();
    write_index(root, &index, &next_identity(state, "identity-index"))?;
    let report = serde_json::to_vec(&serde_json::json!({
        "storageSchema": STORAGE_SCHEMA,
        "migrated": migrated,
        "skipped": skipped,
    }))
    .map_err(|error| format!("serialize identity migration report failed: {error}"))?;
    atomic_write(
        root,
        &root.join("identity-migration.json"),
        &report,
        &next_identity(state, "identity-report"),
    )
}

fn canonical_record_resource_id(descriptor: &Value, old_id: &str) -> Option<String> {
    if !old_id.starts_with("bestdori/") {
        return Some(old_id.to_string());
    }
    let source = descriptor.get("source")?.as_object()?;
    let provider = source.get("provider")?.as_str()?;
    let server = source.get("server")?.as_str()?;
    if provider != "bestdori" {
        return None;
    }
    let family = source.get("family")?.as_str()?;
    let native = source.get("nativeId")?.as_str()?;
    let logical = match family {
        "noteskin" | "fieldskin" | "bgskin" | "judgeskin" | "tapeffect" | "stageskin" => {
            format!("ingameskin/{family}/{native}")
        }
        "tapseskin" => format!("sound/tapseskin/{native}"),
        "sound-common" => "sound/common".to_string(),
        value if value.starts_with("media-") => {
            logical_path_from_bestdori_asset_url(source.get("assetBaseUrl")?.as_str()?, server)?
        }
        _ => return None,
    };
    Some(format!("bestdori/{server}/{logical}"))
}

fn logical_path_from_bestdori_asset_url(value: &str, server: &str) -> Option<String> {
    let prefix = format!("https://bestdori.com/assets/{server}/");
    let path = value.strip_prefix(&prefix)?.split(['?', '#']).next()?;
    let mut parts: Vec<String> = path.split('/').map(str::to_string).collect();
    if parts.len() < 2
        || parts
            .iter()
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    let package = parts.len() - 2;
    if let Some(value) = parts[package].strip_suffix("_rip") {
        parts[package] = value.to_string();
    }
    Some(parts.join("/"))
}

fn install_logical_placement_for_canonical_id(
    descriptor: &mut Value,
    resource_id: &str,
) -> Result<(), String> {
    let object = descriptor
        .as_object_mut()
        .ok_or_else(|| "resource descriptor must be object".to_string())?;
    let source = object
        .get("source")
        .and_then(Value::as_object)
        .ok_or_else(|| "network source missing".to_string())?;
    let server = source
        .get("server")
        .and_then(Value::as_str)
        .ok_or_else(|| "network server missing".to_string())?;
    let prefix = format!("bestdori/{server}/");
    let canonical = resource_id
        .strip_prefix(&prefix)
        .ok_or_else(|| "canonical resource id/server mismatch".to_string())?;
    object.insert("logicalPlacement".to_string(), serde_json::json!({
        "provider": "bestdori",
        "server": server,
        "canonicalPath": canonical,
        "identityClass": if source.get("family").and_then(Value::as_str).is_some_and(|value| value.starts_with("media-")) { "provider-media" } else { "provider-package" },
    }));
    Ok(())
}

fn recover_projections(root: &Path, state: &ApplicationResourceState) -> Result<(), String> {
    for resource_id in read_index(root)?.resource_ids {
        let record = read_record(root, &resource_id)?;
        verify_record(root, &record)?;
        let projection = projection_resource_path(root, &record.descriptor)?;
        publish_projection(
            root,
            &projection,
            &resource_id,
            &record.revision,
            &record.files,
            &next_identity(state, "projection-recovery"),
        )?;
    }
    Ok(())
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
            let logical_path = legacy_network_canonical_path(family, &native_id, "legacy-import");
            let resource_id = format!("bestdori/{server}/{logical_path}");
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
    let logical_path = legacy_network_canonical_path(family, native_id, resource_id);
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
        },
        "logicalPlacement": {
            "provider": "bestdori",
            "server": server,
            "canonicalPath": logical_path,
            "identityClass": "provider-package"
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
        assert!(normalize_resource_id("bestdori/jp/ingameskin/noteskin/skin999").is_ok());
        assert!(
            normalize_resource_id("bestdori/jp/ingameskin/noteskin/future_collaboration").is_ok()
        );
        assert!(normalize_resource_id("simulator-static/current-10.1.4/x").is_err());
    }

    #[test]
    fn legacy_record_ids_map_to_original_logical_paths_without_url_identity() {
        let descriptor = serde_json::json!({
            "source": {
                "provider": "bestdori", "server": "jp", "family": "noteskin", "nativeId": "skin00",
                "assetBaseUrl": "https://bestdori.com/assets/jp/ingameskin/noteskin/skin00_rip"
            }
        });
        assert_eq!(
            canonical_record_resource_id(&descriptor, "bestdori/jp/noteskin/skin00").as_deref(),
            Some("bestdori/jp/ingameskin/noteskin/skin00"),
        );
        let media = serde_json::json!({
            "source": {
                "provider": "bestdori", "server": "jp", "family": "media-bgm", "nativeId": "old-url-id",
                "assetBaseUrl": "https://bestdori.com/assets/jp/sound/bgm003_rip/bgm003.mp3"
            }
        });
        assert_eq!(
            canonical_record_resource_id(&media, "bestdori/jp/media-bgm/old").as_deref(),
            Some("bestdori/jp/sound/bgm003/bgm003.mp3"),
        );
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

    #[test]
    fn logical_paths_reject_reserved_case_collisions_and_non_nfc() {
        assert!(normalize_logical_path("CON/file.bin").is_err());
        assert!(normalize_logical_path("folder/name. ").is_err());
        assert!(normalize_logical_path("e\u{301}.bin").is_err());
        let root = test_root("path-collision");
        let descriptor = network_test_descriptor();
        let result = commit_resource(
            &root,
            descriptor,
            vec![
                install_file("Atlas.bin", b"first"),
                install_file("atlas.bin", b"second"),
            ],
            "collision",
        );
        assert!(result.is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_media_uses_session_index_without_global_library_projection() {
        let root = test_root("workspace-media");
        let workspace = root.join("cache/session/project-media");
        ensure_layout(&root).unwrap();
        ensure_workspace_layout(&workspace).unwrap();
        let bytes = b"ID3-workspace";
        let digest = observe_bytes(bytes).sha256.to_ascii_lowercase();
        let resource_id = format!("workspace/current/chart-media/bgm/{digest}");
        let descriptor = workspace_media_descriptor(
            &resource_id,
            "bgm",
            "song.mp3",
            serde_json::json!({"kind":"user-upload"}),
        )
        .unwrap();
        let record = commit_workspace_resource(
            &root,
            &workspace,
            descriptor,
            vec![install_file("workspace-media.bin", bytes)],
            "workspace-test",
        )
        .unwrap();
        verify_workspace_record(&root, &record).unwrap();
        assert!(read_index(&root).unwrap().resource_ids.is_empty());
        assert_eq!(
            read_workspace_index(&workspace).unwrap().resource_ids,
            vec![resource_id]
        );
        assert!(!root.join("library/user").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_retirement_keeps_snapshot_blob_until_snapshot_is_removed() {
        let root = test_root("workspace-snapshot-gc");
        let workspace = root.join("cache/session/project-media");
        ensure_layout(&root).unwrap();
        ensure_workspace_layout(&workspace).unwrap();
        let first_bytes = b"ID3-first";
        let first_digest = observe_bytes(first_bytes).sha256;
        let first_id = format!(
            "workspace/current/chart-media/bgm/{}",
            first_digest.to_ascii_lowercase()
        );
        let first = commit_workspace_resource(
            &root,
            &workspace,
            workspace_media_descriptor(
                &first_id,
                "bgm",
                "first.mp3",
                serde_json::json!({"kind":"user-upload"}),
            )
            .unwrap(),
            vec![install_file("workspace-media.bin", first_bytes)],
            "first-workspace",
        )
        .unwrap();
        let snapshot_id = "snapshot/workspace-gc".to_string();
        let snapshot = StoredSnapshot {
            storage_schema: STORAGE_SCHEMA,
            snapshot_id: snapshot_id.clone(),
            slots: HashMap::from([(
                "chart-media.bgm".to_string(),
                ResourceRefDto {
                    id: first_id.clone(),
                },
            )]),
            revisions: HashMap::from([("chart-media.bgm".to_string(), first.revision.clone())]),
            files_by_slot: HashMap::from([("chart-media.bgm".to_string(), first.files.clone())]),
        };
        fs::write(
            snapshot_path(&root, &snapshot_id),
            serde_json::to_vec(&snapshot).unwrap(),
        )
        .unwrap();
        write_workspace_index(
            &root,
            &workspace,
            &WorkspaceMediaIndex::default(),
            "retire-workspace",
        )
        .unwrap();
        fs::remove_file(workspace_record_path(&workspace, &first_id)).unwrap();
        collect_garbage_paths(&root, &workspace).unwrap();
        assert!(root.join("blobs").join(&first_digest).exists());
        fs::remove_file(snapshot_path(&root, &snapshot_id)).unwrap();
        collect_garbage_paths(&root, &workspace).unwrap();
        assert!(!root.join("blobs").join(&first_digest).exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_user_recovery_copies_verified_bytes_outside_active_library() {
        let root = test_root("legacy-user-recovery");
        let recovery = root.join("recovery/legacy-user-media-v1");
        let identity = "legacy-user";
        let descriptor = user_media_descriptor(identity, "cover", "cover.png");
        let record = commit_resource(
            &root,
            descriptor,
            vec![install_file("cover.png", b"legacy-cover")],
            identity,
        )
        .unwrap();
        let resource_id = descriptor_resource_id(&record.descriptor).unwrap();
        let entry = archive_legacy_user_record(&root, &recovery, &resource_id, &record).unwrap();
        assert_eq!(
            entry.get("resourceId").and_then(Value::as_str),
            Some(resource_id.as_str())
        );
        assert!(recovery
            .join("files")
            .join(digest_text(&resource_id))
            .join("cover.png")
            .exists());
        assert!(read_record(&root, &resource_id).is_ok());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn record_revisions_publish_original_logical_projection_without_replacing_old_revision() {
        let root = test_root("projection");
        let descriptor = network_test_descriptor();
        let first = commit_resource(
            &root,
            descriptor.clone(),
            vec![install_file("atlas.bin", b"first")],
            "first",
        )
        .unwrap();
        let projection = projection_resource_path(&root, &descriptor).unwrap();
        let first_digest = first.revision.strip_prefix("record/").unwrap();
        assert!(projection
            .join("revisions")
            .join(first_digest)
            .join("files/atlas.bin")
            .exists());
        let second = commit_resource(
            &root,
            descriptor,
            vec![install_file("atlas.bin", b"second")],
            "second",
        )
        .unwrap();
        assert_ne!(first.revision, second.revision);
        assert!(projection
            .join("revisions")
            .join(first_digest)
            .join("files/atlas.bin")
            .exists());
        let pointer: Value =
            serde_json::from_slice(&fs::read(projection.join("current.json")).unwrap()).unwrap();
        assert_eq!(
            pointer.get("revision").and_then(Value::as_str),
            Some(second.revision.as_str())
        );
        assert_eq!(
            read_record(&root, "bestdori/jp/ingameskin/noteskin/skin00")
                .unwrap()
                .revision,
            second.revision
        );
        let _ = fs::remove_dir_all(root);
    }

    fn network_test_descriptor() -> Value {
        serde_json::json!({
            "ref": { "id": "bestdori/jp/ingameskin/noteskin/skin00" },
            "origin": "network",
            "kind": "package",
            "title": "skin00",
            "availability": "remote-only",
            "files": null,
            "catalogObservedAt": null,
            "source": {
                "provider": "bestdori",
                "server": "jp",
                "family": "noteskin",
                "nativeId": "skin00",
                "manifestUrl": "https://bestdori.com/example.json",
                "assetBaseUrl": "https://bestdori.com/example"
            },
            "logicalPlacement": {
                "provider": "bestdori",
                "server": "jp",
                "canonicalPath": "ingameskin/noteskin/skin00",
                "identityClass": "provider-package"
            }
        })
    }

    fn install_file(path: &str, bytes: &[u8]) -> ResourceInstallFileInput {
        ResourceInstallFileInput {
            logical_path: path.to_string(),
            media_type: "application/octet-stream".to_string(),
            base64_data: base64::engine::general_purpose::STANDARD.encode(bytes),
        }
    }

    fn test_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "garupa-resource-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ))
    }
}

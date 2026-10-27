//! Level uploads to the NotGarupa! server. The server only accepts uploads
//! signed with its upload key: an HMAC-SHA256 over the SHA-256 of every part,
//! sent in three headers. The key is injected when this backend is built
//! (`NOTGARUPA_UPLOAD_KEY`), so the frontend never sees it.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const UPLOAD_URL: &str = "https://notgarupa.sov8.cn/api/levels";
const UPLOAD_KEY: Option<&str> = option_env!("NOTGARUPA_UPLOAD_KEY");
/// The server reads an upload for at most a minute; leave room to connect.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(90);
/// The signed fields and files, in signing order.
const SIGNED_FIELDS: [&str; 9] = [
    "title", "rating", "artists", "author", "description", "tags", "hidden", "difficulty", "fullLength",
];
const SIGNED_FILES: [&str; 5] = ["chart", "bgm", "cover", "preview", "illustBackground"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotGarupaUploadParams {
    fields: HashMap<String, String>,
    files: Vec<NotGarupaUploadFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotGarupaUploadFile {
    field_name: String,
    file_name: String,
    file_base64: String,
    mime_type: Option<String>,
}

/// The server's answer: its status, its JSON body (`{"uid", "status"}` or
/// `{"error"}`) and, for 429, the seconds to wait.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotGarupaUploadResponse {
    status: u16,
    body: Option<serde_json::Value>,
    retry_after: Option<u64>,
}

#[tauri::command]
pub async fn notgarupa_upload_level(params: NotGarupaUploadParams) -> Result<NotGarupaUploadResponse, String> {
    let key = UPLOAD_KEY
        .filter(|key| !key.is_empty())
        .ok_or_else(|| "this GarupaEditor build has no NotGarupa upload key".to_string())?;
    for name in params.fields.keys() {
        if !SIGNED_FIELDS.contains(&name.as_str()) {
            return Err(format!("unknown NotGarupa upload field {name}"));
        }
    }
    let mut files = HashMap::new();
    for file in params.files {
        if !SIGNED_FILES.contains(&file.field_name.as_str()) {
            return Err(format!("unknown NotGarupa upload file {}", file.field_name));
        }
        let bytes = crate::decode_base64(&file.file_base64)?;
        if bytes.is_empty() {
            return Err(format!("NotGarupa upload file {} is empty", file.field_name));
        }
        if files.insert(file.field_name.clone(), (file, bytes)).is_some() {
            return Err("each NotGarupa upload file is sent once".to_string());
        }
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock is before 1970: {error}"))?
        .as_secs()
        .to_string();
    let nonce = new_nonce();
    let mut message = format!("NotGarupa-Upload-1\n{timestamp}\n{nonce}");
    for name in SIGNED_FIELDS {
        let value = params.fields.get(name).map(String::as_bytes).unwrap_or_default();
        message.push('\n');
        message.push_str(&hex(&Sha256::digest(value)));
    }
    for name in SIGNED_FILES {
        let bytes = files.get(name).map(|(_, bytes)| bytes.as_slice()).unwrap_or_default();
        message.push('\n');
        message.push_str(&hex(&Sha256::digest(bytes)));
    }
    let signature = hex(&hmac_sha256(key.as_bytes(), message.as_bytes()));

    let mut form = reqwest::multipart::Form::new();
    for name in SIGNED_FIELDS {
        if let Some(value) = params.fields.get(name) {
            form = form.text(name, value.clone());
        }
    }
    for name in SIGNED_FILES {
        let Some((file, bytes)) = files.remove(name) else { continue };
        let mut part = reqwest::multipart::Part::bytes(bytes).file_name(file.file_name);
        if let Some(mime_type) = crate::normalize_mime_type(file.mime_type) {
            part = part
                .mime_str(&mime_type)
                .map_err(|error| format!("invalid multipart mime type: {error}"))?;
        }
        form = form.part(name, part);
    }

    let response = crate::build_bestdori_http_client()?
        .post(UPLOAD_URL)
        .timeout(UPLOAD_TIMEOUT)
        .header("X-NotGarupa-Timestamp", timestamp)
        .header("X-NotGarupa-Nonce", nonce)
        .header("X-NotGarupa-Signature", signature)
        .multipart(form)
        .send()
        .await
        .map_err(crate::describe_request_error)?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok());
    let bytes = response.bytes().await.map_err(crate::describe_request_error)?;
    Ok(NotGarupaUploadResponse {
        status,
        body: serde_json::from_slice(&bytes).ok(),
        retry_after,
    })
}

/// A nonce unique to this upload (the server rejects a repeated one); it
/// needs to be unique, not secret.
fn new_nonce() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut hasher = Sha256::new();
    hasher.update(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(COUNTER.fetch_add(1, Ordering::Relaxed).to_le_bytes());
    hex(&hasher.finalize()[..16])
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut block = [0u8; BLOCK];
    if key.len() > BLOCK {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let pad = |byte: u8| block.map(|value| value ^ byte);
    let inner = Sha256::new().chain_update(pad(0x36)).chain_update(message).finalize();
    Sha256::new().chain_update(pad(0x5c)).chain_update(inner).finalize().into()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}


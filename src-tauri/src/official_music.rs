use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use serde_json::{Map, Value};
use std::io::Read;
use std::time::Duration;

// Only public application/master endpoints are exposed; no account session is read.
#[tauri::command]
pub async fn official_music_request(client_version: String, data_version: Option<String>, master_version: Option<String>, server: Option<String>) -> Result<Value, String> {
    fn version(value: &str) -> bool { !value.is_empty() && value.len() <= 64 && value.bytes().all(|b| b.is_ascii_digit() || b == b'.') }
    if !version(&client_version) || data_version.as_deref().is_some_and(|v| !version(v))
        || master_version.as_deref().is_some_and(|v| !version(v)) { return Err("官方主表版本格式无效".into()); }
    let server = server.as_deref().unwrap_or("jp");
    let profiles: Value = serde_json::from_str(include_str!("../../src/data/originalOfficialRegionalMasterProtocol.json")).map_err(|e| e.to_string())?;
    let profile = profiles.get(server).ok_or("不支持的官方主表服务器")?;
    let mut protocol: Value = serde_json::from_str(include_str!("../../src/data/originalOfficialMasterProtocol.json")).map_err(|e| e.to_string())?;
    protocol["codec"] = profile["codec"].clone();
    if let Some(omissions) = profile["omitSchemaFields"].as_object() {
        for (ty, fields) in omissions {
            for field in fields.as_array().ok_or("Invalid regional schema")? {
                protocol["schema"][ty].as_object_mut().ok_or("Invalid regional type")?
                    .remove(field.as_str().ok_or("Invalid regional field")?);
            }
        }
    }
    let mut headers = reqwest::header::HeaderMap::new();
    for (key, value) in [("content-type", "application/octet-stream"), ("accept", "application/octet-stream"),
        ("x-clientversion", client_version.as_str()), ("x-clientplatform", "Android")] {
        headers.insert(reqwest::header::HeaderName::from_static(key), value.parse().map_err(|_| "Invalid official header")?);
    }
    for (key, value) in [("x-dataversion", &data_version), ("x-masterdataversion", &master_version)] {
        if let Some(value) = value { headers.insert(reqwest::header::HeaderName::from_static(key), value.parse().map_err(|_| "Invalid official version header")?); }
    }
    if server == "cn" {
        for (header, field) in [("x-platformid", "platformId"), ("x-channelid", "channelId")] {
            headers.insert(reqwest::header::HeaderName::from_static(header), profile[field].as_str().ok_or("Invalid CN profile")?.parse().map_err(|_| "Invalid CN header")?);
        }
    }
    let master = data_version.is_some();
    let base = profile["apiBase"].as_str().ok_or("Invalid official endpoint")?;
    let mut url = reqwest::Url::parse(base).and_then(|base| base.join(if master { "suite/master" } else { "application" })).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("appVersion", &client_version);
    if let Some(value) = data_version { url.query_pairs_mut().append_pair("dataVersion", &value); }
    let client = reqwest::Client::builder().default_headers(headers)
        .connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(60))
        .build().map_err(|e| e.to_string())?;
    let bytes = super::download::get(&client, url.as_str(), None, || Ok(Vec::new()), |_, _| {})
        .await.map_err(|e| e.message)?;
    tauri::async_runtime::spawn_blocking(move || decode_response(bytes, master, &protocol)).await.map_err(|e| e.to_string())?
}

pub fn decode_response(mut bytes: Vec<u8>, master: bool, protocol: &Value) -> Result<Value, String> {
    let codec = &protocol["codec"];
    let key = codec["key"].as_str().ok_or("Missing official key")?.as_bytes();
    let iv = codec["iv"].as_str().ok_or("Missing official IV")?.as_bytes();
    cbc::Decryptor::<aes::Aes128>::new_from_slices(key, iv).map_err(|_| "Invalid official codec")?
        .decrypt_padded_mut::<NoPadding>(&mut bytes).map_err(|_| "官方主表响应加密格式无效")?;
    // ISO10126 padding has arbitrary preceding bytes; only the last byte is length.
    let padding = *bytes.last().ok_or("官方主表响应为空")? as usize;
    if !(1..=16).contains(&padding) || padding > bytes.len() { return Err("官方主表响应填充无效".into()); }
    bytes.truncate(bytes.len() - padding);
    if master {
        let mut plain = Vec::new();
        bzip2::read::BzDecoder::new(bytes.as_slice()).read_to_end(&mut plain).map_err(|e| format!("官方主表解压失败：{e}"))?;
        bytes = plain;
    }
    decode_message(&bytes, if master { "SuiteMasterGetResponse" } else { "AppGetResponse" }, &protocol["schema"], 0)
}

fn varint(bytes: &[u8], cursor: &mut usize) -> Result<u64, String> {
    let mut value = 0u64;
    for shift in (0..70).step_by(7) {
        let byte = *bytes.get(*cursor).ok_or("Truncated master varint")?; *cursor += 1;
        if shift == 63 && byte > 1 { return Err("Overflow master varint".into()); }
        value |= ((byte & 127) as u64) << shift;
        if byte < 128 { return Ok(value); }
    }
    Err("Invalid master varint".into())
}
enum Field<'a> { Integer(u64), Bytes(&'a [u8]), Fixed }
fn fields(bytes: &[u8]) -> Result<Vec<(u64, Field<'_>)>, String> {
    let mut cursor = 0; let mut result = Vec::new();
    while cursor < bytes.len() {
        let tag = varint(bytes, &mut cursor)?;
        if tag >> 3 == 0 { return Err("Invalid master field tag".into()); }
        let value = match tag & 7 {
            0 => Field::Integer(varint(bytes, &mut cursor)?),
            wire @ (1 | 2 | 5) => {
                let size = if wire == 2 { usize::try_from(varint(bytes, &mut cursor)?).map_err(|_| "Master field too large")? } else if wire == 1 { 8 } else { 4 };
                let end = cursor.checked_add(size).ok_or("Master field overflow")?;
                let data = bytes.get(cursor..end).ok_or("Truncated master field")?; cursor = end;
                if wire == 2 { Field::Bytes(data) } else { Field::Fixed }
            }
            _ => return Err("Unsupported master wire type".into()),
        };
        result.push((tag >> 3, value));
    }
    Ok(result)
}
fn scalar(field: &Field<'_>, ty: &str, schema: &Value, depth: usize) -> Result<Value, String> {
    if let Some(inner) = ty.strip_prefix("Nullable<").and_then(|v| v.strip_suffix('>')) { return scalar(field, inner, schema, depth); }
    match (ty, field) {
        ("string", Field::Bytes(bytes)) => Ok(Value::String(std::str::from_utf8(bytes).map_err(|_| "Invalid master text")?.into())),
        ("bool", Field::Integer(v)) => Ok(Value::Bool(*v != 0)),
        ("int", Field::Integer(v)) => Ok(Value::from(*v as i32)),
        ("uint" | "ulong", Field::Integer(v)) => Ok(Value::from(*v)),
        (_, Field::Bytes(bytes)) if schema.get(ty).is_some() => decode_message(bytes, ty, schema, depth + 1),
        _ => Err(format!("Master field type mismatch: {ty}")),
    }
}
fn decode_message(bytes: &[u8], ty: &str, schema: &Value, depth: usize) -> Result<Value, String> {
    if depth > 32 { return Err("Master schema nesting exceeded".into()); }
    let definition = schema[ty].as_object().ok_or_else(|| format!("Unknown master type: {ty}"))?;
    let mut output = Map::new();
    for (number, field) in fields(bytes)? {
        let Some(property) = definition.get(&number.to_string()) else { continue; };
        let name = property["name"].as_str().ok_or("Invalid master schema name")?;
        let field_type = property["type"].as_str().ok_or("Invalid master schema type")?;
        if let Some(pair_type) = field_type.strip_prefix("Dictionary<").and_then(|v| v.strip_suffix('>')) {
            let (key_type, value_type) = pair_type.split_once(", ").ok_or("Invalid map schema")?;
            let Field::Bytes(data) = field else { return Err("Invalid master map".into()); };
            let pair = fields(data)?;
            let key = scalar(&pair.iter().find(|(n,_)| *n == 1).ok_or("Missing map key")?.1, key_type, schema, depth)?;
            let value = scalar(&pair.iter().find(|(n,_)| *n == 2).ok_or("Missing map value")?.1, value_type, schema, depth)?;
            let map = output.entry(name.to_owned()).or_insert_with(|| Value::Object(Map::new())).as_object_mut().ok_or("Invalid map state")?;
            let key = key.as_str().map(str::to_owned).unwrap_or_else(|| key.to_string());
            if map.insert(key, value).is_some() { return Err("Duplicate master map key".into()); }
        } else if let Some(element) = field_type.strip_suffix("[]") {
            let array = output.entry(name.to_owned()).or_insert_with(|| Value::Array(Vec::new())).as_array_mut().ok_or("Invalid master list state")?;
            if let Field::Bytes(data) = &field {
                if matches!(element, "uint" | "ulong" | "int") {
                    let mut cursor = 0;
                    while cursor < data.len() { array.push(scalar(&Field::Integer(varint(data, &mut cursor)?), element, schema, depth)?); }
                    continue;
                }
            }
            array.push(scalar(&field, element, schema, depth)?);
        } else {
            if output.insert(name.to_owned(), scalar(&field, field_type, schema, depth)?).is_some() { return Err("Duplicate master scalar field".into()); }
        }
    }
    Ok(Value::Object(output))
}

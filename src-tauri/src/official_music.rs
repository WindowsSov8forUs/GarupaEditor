use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::io::Read;
use std::time::Duration;

fn regional_schema(server: &str) -> Result<&'static str, String> {
    match server {
        "jp" => Ok(include_str!("../../src/data/official/schema-jp.json")),
        "cn" => Ok(include_str!("../../src/data/official/schema-cn.json")),
        "tw" => Ok(include_str!("../../src/data/official/schema-tw.json")),
        "en" => Ok(include_str!("../../src/data/official/schema-en.json")),
        _ => Err("不支持的官方主表服务器".into()),
    }
}

// Only public application/master endpoints are exposed; no account session is read.
#[tauri::command]
pub async fn official_music_request(client_version: String, data_version: Option<String>, master_version: Option<String>, server: Option<String>) -> Result<Value, String> {
    fn version(value: &str) -> bool { !value.is_empty() && value.len() <= 64 && value.bytes().all(|b| b.is_ascii_digit() || b == b'.') }
    if !version(&client_version) || data_version.as_deref().is_some_and(|v| !version(v))
        || master_version.as_deref().is_some_and(|v| !version(v)) { return Err("官方主表版本格式无效".into()); }
    let server = server.as_deref().unwrap_or("jp");
    let profiles: Value = serde_json::from_str(include_str!("../../src/data/originalOfficialRegionalMasterProtocol.json")).map_err(|e| e.to_string())?;
    let profile = profiles.get(server).ok_or("不支持的官方主表服务器")?;
    // Each region decodes with its own complete ProtoMember closure; no shared subset or omission rules.
    let regional: Value = serde_json::from_str(regional_schema(server)?).map_err(|e| e.to_string())?;
    let protocol = serde_json::json!({ "codec": profile["codec"], "schema": regional["messages"] });
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
    let server = server.to_owned();
    tauri::async_runtime::spawn_blocking(move || decode_response(bytes, master, &protocol, &server)).await.map_err(|e| e.to_string())?
}

pub fn decode_response(bytes: Vec<u8>, master: bool, protocol: &Value, server: &str) -> Result<Value, String> {
    let bytes = open_response(bytes, master, &protocol["codec"])?;
    let root = if master { "SuiteMasterGetResponse" } else { "AppGetResponse" };
    let mut undeclared = BTreeSet::new();
    // Every declared field of the master is decoded and checked; only the tables the editor reads are kept.
    let keep = if master { Some(SUITE_RETAINED) } else { None };
    let value = decode_fields(&bytes, root, &protocol["schema"], 0, &mut undeclared, keep)?;
    // Tags the regional client model does not declare are skipped, as the client does for fields it has no
    // property for; the situation is recorded in the log, not raised as a warning.
    if !undeclared.is_empty() {
        let fields: Vec<String> = undeclared.iter().map(|(ty, number)| format!("{ty}.{number}")).collect();
        crate::application_log::record("info", "official.master-undeclared-fields", serde_json::json!({"server": server, "message": root, "count": fields.len(), "fields": fields}));
    }
    Ok(value)
}

/// Decrypts the response and, for the master, unpacks its bzip2 body into the protobuf bytes.
pub fn open_response(mut bytes: Vec<u8>, master: bool, codec: &Value) -> Result<Vec<u8>, String> {
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
    Ok(bytes)
}

/// One occurrence of a field on the wire; the wire type decides how it is read.
#[derive(Clone, Copy)]
enum Wire<'a> { Varint(u64), Fixed32(u32), Fixed64, Bytes(&'a [u8]) }

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
fn take<'a>(bytes: &'a [u8], cursor: &mut usize, size: usize) -> Result<&'a [u8], String> {
    let end = cursor.checked_add(size).ok_or("Master field overflow")?;
    let data = bytes.get(*cursor..end).ok_or("Truncated master field")?;
    *cursor = end;
    Ok(data)
}
fn fields(bytes: &[u8]) -> Result<Vec<(u64, Wire<'_>)>, String> {
    let mut cursor = 0; let mut result = Vec::new();
    while cursor < bytes.len() {
        let tag = varint(bytes, &mut cursor)?;
        let number = tag >> 3;
        if number == 0 || number > u32::MAX as u64 { return Err("Invalid master field tag".into()); }
        let wire = match tag & 7 {
            0 => Wire::Varint(varint(bytes, &mut cursor)?),
            // A 64-bit field has no declared type in the regional models; it is read past, never decoded.
            1 => { take(bytes, &mut cursor, 8)?; Wire::Fixed64 }
            2 => {
                let size = usize::try_from(varint(bytes, &mut cursor)?).map_err(|_| "Master field too large")?;
                Wire::Bytes(take(bytes, &mut cursor, size)?)
            }
            5 => Wire::Fixed32(u32::from_le_bytes(take(bytes, &mut cursor, 4)?.try_into().map_err(|_| "Truncated master field")?)),
            _ => return Err("Unsupported master wire type".into()),
        };
        result.push((number, wire));
    }
    Ok(result)
}

type Undeclared = BTreeSet<(String, u64)>;

/// Element types a repeated field may pack into one length-delimited run.
fn packable(ty: &str) -> bool { matches!(ty, "uint" | "ulong" | "int" | "long" | "bool" | "float") }

fn default_value(ty: &str) -> Value {
    match ty {
        "string" => Value::String(String::new()),
        "bool" => Value::Bool(false),
        "float" => Value::from(0.0f64),
        "uint" | "ulong" | "int" | "long" => Value::from(0),
        t if t.starts_with("Nullable<") => Value::Null,
        t if t.starts_with("Dictionary<") => Value::Object(Map::new()),
        t if t.ends_with("[]") => Value::Array(Vec::new()),
        _ => Value::Object(Map::new()),
    }
}

/// Reads one wire occurrence as the declared scalar, message, or nullable type; a wire type that does
/// not match the declared type is an error rather than a guess.
fn value_of(wire: Wire<'_>, ty: &str, schema: &Value, depth: usize, undeclared: &mut Undeclared) -> Result<Value, String> {
    if let Some(inner) = ty.strip_prefix("Nullable<").and_then(|v| v.strip_suffix('>')) { return value_of(wire, inner, schema, depth, undeclared); }
    let mismatch = || format!("Master field wire type mismatch: {ty}");
    match (ty, wire) {
        ("string", Wire::Bytes(bytes)) => Ok(Value::String(std::str::from_utf8(bytes).map_err(|_| "Invalid master text")?.into())),
        ("bool", Wire::Varint(v)) => Ok(Value::Bool(v != 0)),
        // int32 and uint32 are the low 32 bits of the varint (protobuf decoders truncate; a negative int32 may
        // be written sign-extended to 64 bits or as its 32-bit pattern).
        ("int", Wire::Varint(v)) => Ok(Value::from(v as u32 as i32)),
        ("long", Wire::Varint(v)) => Ok(Value::from(v as i64)),
        ("uint", Wire::Varint(v)) => Ok(Value::from(v as u32)),
        ("ulong", Wire::Varint(v)) => Ok(Value::from(v)),
        ("float", Wire::Fixed32(bits)) => {
            let value = f32::from_bits(bits);
            if !value.is_finite() { return Err("Master float is not finite".into()); }
            Ok(Value::from(f64::from(value)))
        }
        (_, Wire::Bytes(bytes)) if schema.get(ty).is_some() => decode_message(bytes, ty, schema, depth + 1, undeclared),
        _ => Err(mismatch()),
    }
}

/// Decodes the entries of a packed run of one element type, or a single occurrence of it.
fn append_repeated(list: &mut Vec<Value>, wire: Wire<'_>, element: &str, schema: &Value, depth: usize, undeclared: &mut Undeclared) -> Result<(), String> {
    match wire {
        Wire::Bytes(data) if packable(element) => {
            let mut cursor = 0;
            while cursor < data.len() {
                let item = if element == "float" {
                    Wire::Fixed32(u32::from_le_bytes(take(data, &mut cursor, 4)?.try_into().map_err(|_| "Truncated master field")?))
                } else {
                    Wire::Varint(varint(data, &mut cursor)?)
                };
                list.push(value_of(item, element, schema, depth, undeclared)?);
            }
            Ok(())
        }
        other => { list.push(value_of(other, element, schema, depth, undeclared)?); Ok(()) }
    }
}

/// The master tables the editor reads; the other declared tables are decoded and checked, then dropped.
const SUITE_RETAINED: &[&str] = &["masterMusicList", "masterMusicDifficultyList", "masterBandMap",
    "masterMusicLargeCategoryDataMap", "masterMusicMediumCategoryDataMap", "masterMusicCategoryInfoMap",
    "masterMusicCategoryInfoTargets", "masterMusicCategorySetMap", "masterMusicVideoListMap", "masterMusicJacketMap",
    "masterMusicVideo3dMap", "masterMusicVideo3dIdListMap", "masterCollaboOriginalMusicPageList", "masterLimitedSkinMap"];

fn decode_message(bytes: &[u8], ty: &str, schema: &Value, depth: usize, undeclared: &mut Undeclared) -> Result<Value, String> {
    decode_fields(bytes, ty, schema, depth, undeclared, None)
}

/// Decodes a message; `keep` names the root fields to retain, the rest are decoded and then released.
fn decode_fields(bytes: &[u8], ty: &str, schema: &Value, depth: usize, undeclared: &mut Undeclared, keep: Option<&[&str]>) -> Result<Value, String> {
    if depth > 32 { return Err("Master schema nesting exceeded".into()); }
    let definition = schema[ty].as_object().ok_or_else(|| format!("Unknown master type: {ty}"))?;
    let mut output = Map::new();
    for (number, wire) in fields(bytes)? {
        let Some(property) = definition.get(&number.to_string()) else {
            undeclared.insert((ty.to_owned(), number));
            continue;
        };
        let name = property[0].as_str().ok_or("Invalid master schema name")?;
        let field_type = property[1].as_str().ok_or("Invalid master schema type")?;
        if let Some(element) = field_type.strip_suffix("[]") {
            let list = output.entry(name.to_owned()).or_insert_with(|| Value::Array(Vec::new()));
            let list = list.as_array_mut().ok_or("Invalid master list state")?;
            append_repeated(list, wire, element, schema, depth, undeclared).map_err(|e| format!("{ty}.{name}: {e}"))?;
        } else if let Some(pair) = field_type.strip_prefix("Dictionary<").and_then(|v| v.strip_suffix('>')) {
            let (key_type, value_type) = pair.split_once(", ").ok_or("Invalid map schema")?;
            let Wire::Bytes(data) = wire else { return Err(format!("Master map wire type mismatch: {ty}.{name}")); };
            // A map entry is a message with key = 1 and value = 2; an absent key or value is its default.
            let mut key = default_value(key_type);
            let mut value = default_value(value_type);
            for (entry_number, entry_wire) in fields(data)? {
                match entry_number {
                    1 => key = value_of(entry_wire, key_type, schema, depth, undeclared)?,
                    2 => value = value_of(entry_wire, value_type, schema, depth, undeclared)?,
                    other => { undeclared.insert((format!("{ty}.{name}[entry]"), other)); }
                }
            }
            let map = output.entry(name.to_owned()).or_insert_with(|| Value::Object(Map::new()));
            let map = map.as_object_mut().ok_or("Invalid map state")?;
            let key = key.as_str().map(str::to_owned).unwrap_or_else(|| key.to_string());
            map.insert(key, value);
        } else {
            // A repeated scalar occurrence is the last one, as protobuf reads a non-repeated field.
            let value = value_of(wire, field_type, schema, depth, undeclared).map_err(|e| format!("{ty}.{name}: {e}"))?;
            output.insert(name.to_owned(), value);
        }
        if let Some(keep) = keep {
            if !keep.contains(&name) { output.remove(name); }
        }
    }
    Ok(Value::Object(output))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn varint_bytes(mut value: u64) -> Vec<u8> {
        let mut out = Vec::new();
        loop {
            let byte = (value & 127) as u8; value >>= 7;
            if value == 0 { out.push(byte); return out; }
            out.push(byte | 128);
        }
    }
    fn tag(number: u64, wire: u64) -> Vec<u8> { varint_bytes(number << 3 | wire) }
    fn bytes_field(number: u64, data: &[u8]) -> Vec<u8> {
        let mut out = tag(number, 2); out.extend(varint_bytes(data.len() as u64)); out.extend_from_slice(data); out
    }
    fn schema() -> Value {
        json!({
            "Root": {
                "1": ["count", "uint"], "2": ["label", "string"], "3": ["ratio", "float"], "4": ["delta", "int"],
                "5": ["ids", "uint[]"], "6": ["weights", "float[]"], "7": ["child", "Child"], "8": ["children", "Child[]"],
                "9": ["table", "Dictionary<uint, Child>"], "10": ["stamp", "Nullable<ulong>"], "11": ["big", "long"]
            },
            "Child": { "1": ["name", "string"], "2": ["flag", "bool"] }
        })
    }

    #[test]
    fn decodes_every_declared_wire_form() {
        let mut data = Vec::new();
        data.extend(tag(1, 0)); data.extend(varint_bytes(7));
        data.extend(bytes_field(2, "hi".as_bytes()));
        data.extend(tag(3, 5)); data.extend(1.5f32.to_le_bytes());
        data.extend(tag(4, 0)); data.extend(varint_bytes((-3i64) as u64));
        let packed: Vec<u8> = [1u64, 300].iter().flat_map(|v| varint_bytes(*v)).collect();
        data.extend(bytes_field(5, &packed));
        data.extend(bytes_field(5, &varint_bytes(9)));
        let floats: Vec<u8> = [0.5f32, -2.0f32].iter().flat_map(|v| v.to_le_bytes()).collect();
        data.extend(bytes_field(6, &floats));
        data.extend(bytes_field(7, &bytes_field(1, b"lead")));
        data.extend(bytes_field(8, &bytes_field(1, b"a")));
        data.extend(bytes_field(8, &[tag(2, 0), varint_bytes(1)].concat()));
        let entry: Vec<u8> = [tag(1, 0), varint_bytes(42), bytes_field(2, &bytes_field(1, b"m"))].concat();
        data.extend(bytes_field(9, &entry));
        data.extend(tag(10, 0)); data.extend(varint_bytes(u64::MAX));
        data.extend(tag(11, 0)); data.extend(varint_bytes((-5i64) as u64));
        let mut undeclared = BTreeSet::new();
        let value = decode_message(&data, "Root", &schema(), 0, &mut undeclared).unwrap();
        assert!(undeclared.is_empty());
        assert_eq!(value["count"], json!(7));
        assert_eq!(value["label"], json!("hi"));
        assert_eq!(value["ratio"], json!(1.5));
        assert_eq!(value["delta"], json!(-3));
        assert_eq!(value["ids"], json!([1, 300, 9]));
        assert_eq!(value["weights"], json!([0.5, -2.0]));
        assert_eq!(value["child"], json!({"name": "lead"}));
        assert_eq!(value["children"], json!([{"name": "a"}, {"flag": true}]));
        assert_eq!(value["table"], json!({"42": {"name": "m"}}));
        assert_eq!(value["stamp"], json!(u64::MAX));
        assert_eq!(value["big"], json!(-5));
    }

    #[test]
    fn reports_unknown_tags_without_failing_and_rejects_wire_mismatch() {
        let mut data = tag(99, 0); data.extend(varint_bytes(1));
        data.extend(tag(1, 2)); data.extend(varint_bytes(0));
        let mut undeclared = BTreeSet::new();
        assert!(decode_message(&data, "Root", &schema(), 0, &mut undeclared).is_err());
        let mut known = tag(99, 0); known.extend(varint_bytes(1));
        known.extend(tag(1, 0)); known.extend(varint_bytes(2));
        let mut undeclared = BTreeSet::new();
        let value = decode_message(&known, "Root", &schema(), 0, &mut undeclared).unwrap();
        assert_eq!(value["count"], json!(2));
        assert_eq!(undeclared.iter().next(), Some(&("Root".to_owned(), 99)));
    }

    /// Offline check against a saved encrypted master response (GARUPA_MASTER_SAMPLE, GARUPA_MASTER_SERVER).
    /// Prints the undeclared tags per message so a schema gap is counted, not hidden.
    #[test]
    #[ignore = "needs a saved master response; set GARUPA_MASTER_SAMPLE and GARUPA_MASTER_SERVER"]
    fn decodes_saved_master_sample_with_its_regional_schema() {
        let path = std::env::var("GARUPA_MASTER_SAMPLE").expect("GARUPA_MASTER_SAMPLE");
        let server = std::env::var("GARUPA_MASTER_SERVER").expect("GARUPA_MASTER_SERVER");
        let profiles: Value = serde_json::from_str(include_str!("../../src/data/originalOfficialRegionalMasterProtocol.json")).unwrap();
        let regional: Value = serde_json::from_str(regional_schema(&server).unwrap()).unwrap();
        let bytes = std::fs::read(path).unwrap();
        let plain = open_response(bytes, true, &profiles[server.as_str()]["codec"]).unwrap();
        let mut undeclared = BTreeSet::new();
        let value = decode_fields(&plain, "SuiteMasterGetResponse", &regional["messages"], 0, &mut undeclared, Some(SUITE_RETAINED)).unwrap();
        let mut per_message = std::collections::BTreeMap::<String, usize>::new();
        for (ty, _) in &undeclared { *per_message.entry(ty.clone()).or_default() += 1; }
        println!("{server}: {} undeclared (message, tag) pairs over {} messages", undeclared.len(), per_message.len());
        for (ty, number) in undeclared.iter().take(50) { println!("  undeclared {ty}.{number}"); }
        assert!(value.is_object());
    }
}

use std::collections::BTreeMap;
use std::io::Write;
use std::time::Duration;
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
pub struct Transfer { received: u64, total: Option<u64>, background: bool }
#[derive(Clone, Default, serde::Serialize)]
pub struct DownloadSnapshot { revision: u64, transfers: BTreeMap<u64, Transfer> }
static ACTIVITY: Mutex<DownloadSnapshot> = Mutex::new(DownloadSnapshot { revision: 0, transfers: BTreeMap::new() });
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
pub fn initialize(app: tauri::AppHandle) { let _ = APP.set(app); }
#[tauri::command]
pub fn download_snapshot() -> DownloadSnapshot { ACTIVITY.lock().unwrap_or_else(|e| e.into_inner()).clone() }
fn activity_change(change: impl FnOnce(&mut DownloadSnapshot)) {
    let value = { let mut state = ACTIVITY.lock().unwrap_or_else(|e| e.into_inner());
        change(&mut state); state.revision += 1; state.clone() };
    if let Some(app) = APP.get() { let _ = app.emit("application-downloads", value); }
}
pub(super) struct ActiveTransfer { id: u64, last: std::time::Instant, background: bool }
impl ActiveTransfer {
    pub(super) fn begin() -> Self { Self::start(false) }
    /// Reports progress for indicators the caller holds; never opens the download screen.
    pub(super) fn begin_background() -> Self { Self::start(true) }
    fn start(background: bool) -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        activity_change(|s| { s.transfers.insert(id, Transfer { received: 0, total: None, background }); });
        Self { id, last: std::time::Instant::now(), background }
    }
    pub(super) fn progress(&mut self, received: u64, total: Option<u64>) {
        if received != 0 && Some(received) != total && self.last.elapsed() < Duration::from_millis(50) { return; }
        self.last = std::time::Instant::now();
        let background = self.background;
        activity_change(|s| { s.transfers.insert(self.id, Transfer { received, total, background }); });
    }
}
impl Drop for ActiveTransfer { fn drop(&mut self) { activity_change(|s| { s.transfers.remove(&self.id); }); } }

const ATTEMPTS: usize = 3;

pub struct DownloadError {
    pub message: String,
    summary: String,
    pub status: Option<reqwest::StatusCode>,
    retryable: bool,
    retry_after: Option<Duration>,
}

impl DownloadError {
    fn network(error: reqwest::Error) -> Self {
        let retryable = error.is_timeout() || error.is_connect() || error.is_body() || error.is_decode() || error.is_request();
        let summary = if error.is_timeout() { "网络连接或读取超时" }
            else if error.is_connect() { "无法连接资源服务器" }
            else if error.is_body() || error.is_decode() { "资源传输中断" }
            else { "资源请求失败" }.to_owned();
        Self { message: super::describe_request_error(error), summary, status: None, retryable, retry_after: None }
    }

    fn local(error: std::io::Error) -> Self {
        Self { message: format!("download destination failed: {error}"), summary: "无法写入下载文件，请检查存储空间和目录权限".to_owned(), status: None,
            retryable: false, retry_after: None }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    message: String,
    user_message: Option<String>,
}

impl From<String> for CommandError {
    fn from(message: String) -> Self { Self { message, user_message: None } }
}

impl From<DownloadError> for CommandError {
    fn from(error: DownloadError) -> Self {
        Self { message: error.message, user_message: Some(error.summary) }
    }
}

fn endpoint(url: &str) -> String {
    reqwest::Url::parse(url).map(|mut url| {
        url.set_query(None);
        url.set_fragment(None);
        let _ = url.set_username("");
        let _ = url.set_password(None);
        url.to_string()
    }).unwrap_or_else(|_| "invalid endpoint".to_owned())
}

// Each attempt gets a fresh destination, so interrupted bodies never append to
// earlier bytes. Only idempotent GET consumers call this function.
pub async fn get<W: Write>(
    client: &reqwest::Client,
    url: &str,
    cookie: Option<&str>,
    destination: impl FnMut() -> std::io::Result<W>,
    progress: impl FnMut(u64, Option<u64>),
) -> Result<W, DownloadError> {
    receive(client, url, cookie, destination, progress, false, true, false).await
}

/// A background transfer: it reports progress but does not open the application's download screen.
pub async fn get_untracked<W: Write>(
    client: &reqwest::Client,
    url: &str,
    cookie: Option<&str>,
    destination: impl FnMut() -> std::io::Result<W>,
) -> Result<W, DownloadError> {
    receive(client, url, cookie, destination, |_, _| {}, false, true, true).await
}

pub async fn probe(client: &reqwest::Client, url: &str, cookie: Option<&str>) -> Result<bool, String> {
    match receive(client, url, cookie, || Ok(std::io::sink()), |_, _| {}, true, true, false).await {
        Ok(_) => Ok(true),
        Err(error) if error.status.is_some() => Ok(false),
        Err(error) => Err(error.message),
    }
}

async fn receive<W: Write>(
    client: &reqwest::Client,
    url: &str,
    cookie: Option<&str>,
    mut destination: impl FnMut() -> std::io::Result<W>,
    mut progress: impl FnMut(u64, Option<u64>),
    headers_only: bool,
    track: bool,
    background: bool,
) -> Result<W, DownloadError> {
    let mut activity = track.then(|| if background { ActiveTransfer::begin_background() } else { ActiveTransfer::begin() });
    for attempt in 1..=ATTEMPTS {
        if let Some(activity) = activity.as_mut() { activity.progress(0, None); }
        let result = async {
            let mut response = super::with_optional_cookie_header(client.get(url), cookie)
                .send().await.map_err(DownloadError::network)?;
            let status = response.status();
            if !status.is_success() {
                let retry_after = response.headers().get(reqwest::header::RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok().map(Duration::from_secs)
                        .or_else(|| httpdate::parse_http_date(value).ok()
                            .map(|time| time.duration_since(std::time::SystemTime::now()).unwrap_or_default())));
                return Err(DownloadError { message: format!("http status {status} at {}", endpoint(url)),
                    summary: format!("资源服务器返回 HTTP {}", status.as_u16()),
                    status: Some(status), retryable: matches!(status.as_u16(), 408 | 429 | 500 | 502 | 503 | 504), retry_after });
            }
            let mut output = destination().map_err(DownloadError::local)?;
            if headers_only { return Ok(output); }
            let total = response.content_length();
            let mut received = 0;
            progress(0, total);
            if let Some(activity) = activity.as_mut() { activity.progress(0, total); }
            while let Some(chunk) = response.chunk().await.map_err(DownloadError::network)? {
                output.write_all(&chunk).map_err(DownloadError::local)?;
                received += chunk.len() as u64;
                progress(received, total);
                if let Some(activity) = activity.as_mut() { activity.progress(received, total); }
            }
            output.flush().map_err(DownloadError::local)?;
            Ok(output)
        }.await;
        match result {
            Ok(output) => {
                if attempt > 1 { log::info!(target: "download", "recovered attempt={attempt}/{ATTEMPTS} endpoint={}", endpoint(url)); }
                return Ok(output);
            }
            Err(mut error) => {
                let delay = error.retry_after.unwrap_or(Duration::from_secs(1 << (attempt - 1)));
                // Do not retry before Retry-After, or keep an action waiting indefinitely.
                if !error.retryable || attempt == ATTEMPTS || delay > Duration::from_secs(30) {
                    error.message = format!("{}; attempts={attempt}/{ATTEMPTS}", error.message);
                    error.summary = format!("{}（已尝试 {attempt} 次）", error.summary);
                    if delay > Duration::from_secs(30) && error.retryable && attempt < ATTEMPTS {
                        error.summary.push_str("，服务器要求稍后重试");
                    }
                    log::error!(target: "download", "failed endpoint={} {}", endpoint(url), error.message);
                    return Err(error);
                }
                log::warn!(target: "download", "retry attempt={attempt}/{ATTEMPTS} delay_ms={} endpoint={} reason={}", delay.as_millis(), endpoint(url), error.message);
                tokio::time::sleep(delay).await;
            }
        }
    }
    unreachable!()
}

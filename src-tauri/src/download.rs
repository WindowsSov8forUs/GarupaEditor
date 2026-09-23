use std::io::Write;
use std::time::Duration;

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
    receive(client, url, cookie, destination, progress, false).await
}

pub async fn probe(client: &reqwest::Client, url: &str, cookie: Option<&str>) -> Result<bool, String> {
    match receive(client, url, cookie, || Ok(std::io::sink()), |_, _| {}, true).await {
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
) -> Result<W, DownloadError> {
    for attempt in 1..=ATTEMPTS {
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
            while let Some(chunk) = response.chunk().await.map_err(DownloadError::network)? {
                output.write_all(&chunk).map_err(DownloadError::local)?;
                received += chunk.len() as u64;
                progress(received, total);
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

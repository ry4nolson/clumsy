use std::time::Duration;

pub const TIMESTAMP_TIMEOUT: Duration = Duration::from_secs(10);
pub const REVOCATION_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_RESPONSE: usize = 32 * 1024 * 1024;

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent("Clumsy")
        .build()
        .map_err(|err| err.to_string())
}

pub fn is_web_url(url: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
}

async fn send(request: reqwest::RequestBuilder) -> Result<Vec<u8>, String> {
    let mut response = request.send().await.map_err(|err| if err.is_timeout() { "timed out".to_string() } else { err.to_string() })?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|err| err.to_string())? {
        if body.len() + chunk.len() > MAX_RESPONSE {
            return Err("response too large".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

pub fn post(url: &str, content_type: &str, body: Vec<u8>, timeout: Duration) -> Result<Vec<u8>, String> {
    if !is_web_url(url) {
        return Err("not an http or https address".into());
    }
    let client = client(timeout)?;
    let request = client.post(url).header("content-type", content_type).body(body);
    tauri::async_runtime::block_on(send(request))
}

pub fn get(url: &str, timeout: Duration) -> Result<Vec<u8>, String> {
    if !is_web_url(url) {
        return Err("not an http or https address".into());
    }
    let client = client(timeout)?;
    tauri::async_runtime::block_on(send(client.get(url)))
}

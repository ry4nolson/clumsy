use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Mutex;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use crate::{header, lock};

const MAX_HELD: usize = 2 << 30;

#[derive(Default)]
pub struct Uploads(Mutex<HashMap<String, Vec<u8>>>);

impl Uploads {
    fn append(&self, id: &str, chunk: &[u8]) -> Result<(), String> {
        let mut held = lock(&self.0);
        let total: usize = held.values().map(Vec::len).sum();
        if total + chunk.len() > MAX_HELD {
            held.remove(id);
            return Err("The document is too large to send".into());
        }
        held.entry(id.to_string()).or_default().extend_from_slice(chunk);
        Ok(())
    }

    fn take(&self, id: &str) -> Option<Vec<u8>> {
        lock(&self.0).remove(id)
    }
}

#[tauri::command]
pub fn upload_chunk(uploads: tauri::State<'_, Uploads>, id: String, chunk: String) -> Result<(), String> {
    let bytes = STANDARD.decode(chunk).map_err(|err| err.to_string())?;
    uploads.append(&id, &bytes)
}

#[tauri::command]
pub fn discard_upload(uploads: tauri::State<'_, Uploads>, id: String) {
    uploads.take(&id);
}

pub fn body<'a>(app: &AppHandle, request: &'a Request<'_>) -> Result<Cow<'a, [u8]>, String> {
    if let InvokeBody::Raw(bytes) = request.body() {
        return Ok(Cow::Borrowed(bytes));
    }
    header(request, "x-upload")
        .and_then(|id| app.state::<Uploads>().take(id))
        .map(Cow::Owned)
        .ok_or_else(|| "Expected raw document bytes".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_join_in_order_and_are_taken_once() {
        let uploads = Uploads::default();
        uploads.append("a", b"%PDF").unwrap();
        uploads.append("b", b"other").unwrap();
        uploads.append("a", b"-1.7").unwrap();
        assert_eq!(uploads.take("a").as_deref(), Some(&b"%PDF-1.7"[..]));
        assert_eq!(uploads.take("a"), None);
        assert_eq!(uploads.take("b").as_deref(), Some(&b"other"[..]));
    }
}

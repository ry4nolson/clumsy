use tauri::ipc::{Request, Response};

const UNSUPPORTED: &str = "Digital signatures are only available on macOS for now";

#[tauri::command]
pub async fn verify_signatures(_request: Request<'_>) -> Result<Vec<serde_json::Value>, String> {
    Err(UNSUPPORTED.into())
}

#[tauri::command]
pub async fn list_signing_identities() -> Result<Vec<serde_json::Value>, String> {
    Err(UNSUPPORTED.into())
}

#[tauri::command]
pub async fn sign_pdf(_request: Request<'_>) -> Result<Response, String> {
    Err(UNSUPPORTED.into())
}

#[tauri::command]
pub async fn fetch_validation_data(_request: Request<'_>) -> Result<Response, String> {
    Err(UNSUPPORTED.into())
}

#[tauri::command]
pub async fn timestamp_pdf(_request: Request<'_>) -> Result<Response, String> {
    Err(UNSUPPORTED.into())
}

#[tauri::command]
pub async fn show_certificate(_request: Request<'_>) -> Result<(), String> {
    Err(UNSUPPORTED.into())
}

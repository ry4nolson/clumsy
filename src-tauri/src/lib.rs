mod default_app;
mod recent;
mod windows;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager};

use recent::RecentFiles;
use windows::{FocusTracker, Transfers};

#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
}

fn queue_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let paths: Vec<String> = paths
        .into_iter()
        .filter(|path| is_pdf(path) && path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if paths.is_empty() {
        return;
    }
    app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
    if let Some(window) = app.state::<FocusTracker>().target(app) {
        let _ = window.emit_to(window.label(), "files-opened", ());
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn stash_transfer(request: Request<'_>, transfers: tauri::State<'_, Transfers>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw PDF bytes".into());
    };
    Ok(transfers.stash(bytes.clone()))
}

#[tauri::command]
fn take_transfer(id: String, transfers: tauri::State<'_, Transfers>) -> Result<Response, String> {
    transfers.take(&id).map(Response::new).ok_or_else(|| "That document is no longer available to move".into())
}

#[tauri::command]
fn default_pdf_app(app: AppHandle) -> default_app::DefaultAppStatus {
    default_app::status(&app.config().identifier)
}

#[tauri::command]
fn make_default_pdf_app(app: AppHandle) -> Result<default_app::DefaultAppStatus, String> {
    default_app::make_default(&app.config().identifier)
}

#[tauri::command]
fn recent_files(app: AppHandle) -> Vec<recent::RecentEntry> {
    app.state::<RecentFiles>().entries(&app)
}

#[tauri::command]
fn record_recent_file(app: AppHandle, path: String) {
    app.state::<RecentFiles>().add(&app, &path);
}

#[tauri::command]
fn remove_recent_file(app: AppHandle, path: String) {
    app.state::<RecentFiles>().remove(&app, &path);
}

#[tauri::command]
fn clear_recent_files(app: AppHandle) {
    app.state::<RecentFiles>().clear(&app);
}

#[tauri::command]
fn take_pending_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn read_pdf(path: String) -> Result<Response, String> {
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {path}: {err}"))
}

#[tauri::command]
fn write_pdf(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw PDF bytes".into());
    };
    let encoded = request
        .headers()
        .get("x-path")
        .and_then(|value| value.to_str().ok())
        .ok_or("Missing destination path")?;
    let path = PathBuf::from(
        percent_decode_str(encoded)
            .decode_utf8()
            .map_err(|err| err.to_string())?
            .into_owned(),
    );
    if !is_pdf(&path) {
        return Err("Destination must be a .pdf file".into());
    }

    let tmp = path.with_extension("pdf.saving");
    fs::write(&tmp, bytes)
        .and_then(|_| fs::rename(&tmp, &path))
        .map_err(|err| {
            let _ = fs::remove_file(&tmp);
            format!("Could not save {}: {err}", path.display())
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingFiles::default())
        .manage(RecentFiles::default())
        .manage(FocusTracker::default())
        .manage(Transfers::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                window.state::<FocusTracker>().focused(window.label());
            }
        })
        .setup(|app| {
            app.state::<RecentFiles>().load(app.handle());
            let args = std::env::args().skip(1).map(PathBuf::from).collect();
            queue_files(app.handle(), args);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            read_pdf,
            write_pdf,
            default_pdf_app,
            make_default_pdf_app,
            recent_files,
            record_recent_file,
            remove_recent_file,
            clear_recent_files,
            stash_transfer,
            take_transfer
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls.into_iter().filter_map(|url| url.to_file_path().ok()).collect();
            queue_files(_app, paths);
        }
    });
}

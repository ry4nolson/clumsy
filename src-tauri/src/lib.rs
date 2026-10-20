mod default_app;
mod files;
mod recent;
mod windows;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, Runtime, Window, WindowEvent};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, MessageDialogButtons, MessageDialogKind};

use files::{AllowedPaths, is_image, is_pdf};
use recent::RecentFiles;
use windows::{Documents, FocusTracker, Transfers, WindowDocuments};

#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

#[derive(Default)]
struct QuitPrompt(AtomicBool);

fn allow_paths(app: &AppHandle, paths: &[PathBuf]) {
    let allowed = app.state::<AllowedPaths>();
    for path in paths.iter().filter(|path| path.is_file()) {
        allowed.allow(path);
    }
}

fn queue_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let paths: Vec<PathBuf> = paths.into_iter().filter(|path| is_pdf(path) && path.is_file()).collect();
    if paths.is_empty() {
        return;
    }
    allow_paths(app, &paths);
    app.state::<PendingFiles>()
        .0
        .lock()
        .unwrap()
        .extend(paths.iter().map(|path| path.to_string_lossy().into_owned()));
    if let Some(window) = app.state::<FocusTracker>().target(app) {
        let _ = window.emit_to(window.label(), "files-opened", ());
        let _ = window.set_focus();
    }
}

fn allowed_path(app: &AppHandle, path: &str, kind: fn(&std::path::Path) -> bool) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if kind(&path) && app.state::<AllowedPaths>().is_allowed(&path) {
        Ok(path)
    } else {
        Err(format!("Clumsy wasn't given access to {}", path.display()))
    }
}

fn file_dialog<R: Runtime>(window: &Window<R>) -> FileDialogBuilder<R> {
    let dialog = window.dialog().file();
    #[cfg(any(windows, target_os = "macos"))]
    let dialog = dialog.set_parent(window);
    dialog
}

fn chosen(app: &AppHandle, picked: Option<tauri_plugin_dialog::FilePath>, finish: fn(PathBuf) -> PathBuf) -> Option<String> {
    let path = finish(picked?.into_path().ok()?);
    app.state::<AllowedPaths>().allow(&path);
    Some(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_pdf(app: AppHandle, window: Window) -> Option<String> {
    let picked = file_dialog(&window).add_filter("PDF", &["pdf"]).blocking_pick_file();
    chosen(&app, picked, |path| path)
}

#[tauri::command]
async fn pick_image(app: AppHandle, window: Window) -> Option<String> {
    let picked = file_dialog(&window)
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "svg"])
        .blocking_pick_file();
    chosen(&app, picked, |path| path)
}

#[tauri::command]
async fn pick_save_path(app: AppHandle, window: Window, suggested_name: String) -> Option<String> {
    let picked = file_dialog(&window)
        .add_filter("PDF", &["pdf"])
        .set_file_name(suggested_name)
        .blocking_save_file();
    chosen(&app, picked, files::with_pdf_extension)
}

#[tauri::command]
async fn read_pdf(app: AppHandle, path: String) -> Result<Response, String> {
    let path = allowed_path(&app, &path, is_pdf)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
async fn read_image(app: AppHandle, path: String) -> Result<Response, String> {
    let path = allowed_path(&app, &path, is_image)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
async fn file_stamp(app: AppHandle, path: String) -> Result<Option<String>, String> {
    Ok(files::stamp(&allowed_path(&app, &path, is_pdf)?))
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|value| value.to_str().ok())
}

#[tauri::command]
async fn write_pdf(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw PDF bytes".into());
    };
    let encoded = header(&request, "x-path").ok_or("Missing destination path")?;
    let decoded = percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?;
    let path = allowed_path(&app, &decoded, is_pdf)?;
    files::write_atomically(&path, bytes, header(&request, "x-expected-stamp"))
}

#[tauri::command]
async fn stash_transfer(request: Request<'_>, transfers: tauri::State<'_, Transfers>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw PDF bytes".into());
    };
    Ok(transfers.stash(bytes.clone()))
}

#[tauri::command]
async fn take_transfer(id: String, transfers: tauri::State<'_, Transfers>) -> Result<Response, String> {
    transfers.take(&id).map(Response::new).ok_or_else(|| "That document is no longer available to move".into())
}

#[tauri::command]
fn report_documents(window: Window, paths: Vec<String>, unsaved: Vec<String>, documents: tauri::State<'_, Documents>) {
    documents.report(window.label(), WindowDocuments { paths, unsaved });
}

#[tauri::command]
fn document_window(window: Window, path: String, documents: tauri::State<'_, Documents>) -> Option<String> {
    documents.window_with(&path, window.label())
}

fn discard_prompt(names: &[String]) -> String {
    match names {
        [name] => format!("“{name}” has unsaved changes. Discard them and quit?"),
        _ => format!("{} documents have unsaved changes ({}). Discard them and quit?", names.len(), names.join(", ")),
    }
}

#[tauri::command]
fn request_quit(app: AppHandle) {
    let unsaved = app.state::<Documents>().unsaved();
    if unsaved.is_empty() {
        app.exit(0);
        return;
    }
    if app.state::<QuitPrompt>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    app.dialog()
        .message(discard_prompt(&unsaved))
        .title("Unsaved changes")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Discard and Quit".into(), "Cancel".into()))
        .show(move |discard| {
            handle.state::<QuitPrompt>().0.store(false, Ordering::SeqCst);
            if discard {
                handle.exit(0);
            }
        });
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
    if allowed_path(&app, &path, is_pdf).is_ok() {
        app.state::<RecentFiles>().add(&app, &path);
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingFiles::default())
        .manage(RecentFiles::default())
        .manage(FocusTracker::default())
        .manage(Transfers::default())
        .manage(AllowedPaths::default())
        .manage(Documents::default())
        .manage(QuitPrompt::default())
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(true) => window.state::<FocusTracker>().focused(window.label()),
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => allow_paths(window.app_handle(), paths),
            WindowEvent::Destroyed => window.state::<Documents>().forget(window.label()),
            _ => {}
        })
        .on_webview_event(|webview, event| {
            if let tauri::WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                allow_paths(webview.app_handle(), paths);
            }
        })
        .setup(|app| {
            let recent = app.state::<RecentFiles>();
            recent.load(app.handle());
            allow_paths(app.handle(), &recent.paths());
            let args = std::env::args().skip(1).map(PathBuf::from).collect();
            queue_files(app.handle(), args);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            pick_pdf,
            pick_image,
            pick_save_path,
            read_pdf,
            read_image,
            file_stamp,
            write_pdf,
            report_documents,
            document_window,
            request_quit,
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

#[cfg(test)]
mod tests {
    use super::discard_prompt;

    #[test]
    fn names_the_documents_that_would_be_discarded() {
        assert_eq!(discard_prompt(&["a.pdf".into()]), "“a.pdf” has unsaved changes. Discard them and quit?");
        assert_eq!(
            discard_prompt(&["a.pdf".into(), "b.pdf".into()]),
            "2 documents have unsaved changes (a.pdf, b.pdf). Discard them and quit?"
        );
    }
}

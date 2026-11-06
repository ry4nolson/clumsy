mod default_app;
mod files;
mod navigation;
mod recent;
mod session;
mod updates;
mod windows;

use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::sync::atomic::{AtomicBool, Ordering};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, Runtime, Window, WindowEvent};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, MessageDialogButtons, MessageDialogKind};

use files::{
    AllowedFolders, AllowedPaths, IMAGE_EXTENSIONS, MARKDOWN_EXTENSIONS, ReadOnlyPaths, is_document, is_export_image, is_image, is_markdown, is_pdf,
};
use recent::RecentFiles;
use session::RestartSession;
use updates::Updates;
use windows::{Documents, FocusTracker, Transfers, WindowDocuments};

pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

#[derive(Default)]
struct QuitPrompt(AtomicBool);

fn allow_paths(app: &AppHandle, paths: &[PathBuf]) {
    let allowed = app.state::<AllowedPaths>();
    for path in paths.iter().filter(|path| is_document(path) && path.is_file()) {
        allowed.allow(path);
    }
}

fn allow_dropped(app: &AppHandle, paths: &[PathBuf]) {
    allow_paths(app, paths);
    let read_only = app.state::<ReadOnlyPaths>();
    for path in paths.iter().filter(|path| is_image(path) && path.is_file()) {
        read_only.0.allow(path);
    }
}

fn queue_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let paths: Vec<PathBuf> = paths.into_iter().filter(|path| is_document(path) && path.is_file()).collect();
    if paths.is_empty() {
        return;
    }
    allow_paths(app, &paths);
    lock(&app.state::<PendingFiles>().0).extend(paths.iter().map(|path| path.to_string_lossy().into_owned()));
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

fn readable_path(app: &AppHandle, path: &str, kind: fn(&std::path::Path) -> bool) -> Result<PathBuf, String> {
    allowed_path(app, path, kind).or_else(|err| {
        let path = PathBuf::from(path);
        (kind(&path) && app.state::<ReadOnlyPaths>().0.is_allowed(&path)).then_some(path).ok_or(err)
    })
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

fn chosen_to_read(app: &AppHandle, picked: tauri_plugin_dialog::FilePath) -> Option<String> {
    let path = picked.into_path().ok()?;
    app.state::<ReadOnlyPaths>().0.allow(&path);
    Some(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_pdf(app: AppHandle, window: Window) -> Option<String> {
    let picked = file_dialog(&window).add_filter("PDF", &["pdf"]).blocking_pick_file();
    chosen(&app, picked, |path| path)
}

#[tauri::command]
async fn pick_document(app: AppHandle, window: Window) -> Option<String> {
    let picked = file_dialog(&window)
        .add_filter("PDF and Markdown", &[&["pdf"], &MARKDOWN_EXTENSIONS[..]].concat())
        .blocking_pick_file();
    chosen(&app, picked, |path| path)
}

#[tauri::command]
async fn pick_pdfs(app: AppHandle, window: Window) -> Vec<String> {
    let picked = file_dialog(&window).add_filter("PDF", &["pdf"]).blocking_pick_files().unwrap_or_default();
    picked.into_iter().filter_map(|path| chosen(&app, Some(path), |path| path)).collect()
}

#[tauri::command]
async fn pick_image(app: AppHandle, window: Window) -> Option<String> {
    let picked = file_dialog(&window)
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "svg"])
        .blocking_pick_file();
    chosen_to_read(&app, picked?)
}

#[tauri::command]
async fn pick_images(app: AppHandle, window: Window, include_pdfs: bool) -> Vec<String> {
    let dialog = file_dialog(&window);
    let dialog = if include_pdfs {
        dialog.add_filter("PDFs and Images", &[&["pdf"], &IMAGE_EXTENSIONS[..]].concat())
    } else {
        dialog.add_filter("Images", &IMAGE_EXTENSIONS)
    };
    let picked = dialog.blocking_pick_files().unwrap_or_default();
    picked.into_iter().filter_map(|path| chosen_to_read(&app, path)).collect()
}

#[tauri::command]
async fn pick_folder(app: AppHandle, window: Window) -> Option<String> {
    let folder = file_dialog(&window).set_can_create_directories(true).blocking_pick_folder()?.into_path().ok()?;
    app.state::<AllowedFolders>().allow(&folder);
    Some(folder.to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_image_save_path(app: AppHandle, window: Window, suggested_name: String, format: String) -> Option<String> {
    let (label, extensions): (&str, &[&str]) = if format == "jpeg" { ("JPEG", &["jpg", "jpeg"]) } else { ("PNG", &["png"]) };
    let picked = file_dialog(&window)
        .add_filter(label, extensions)
        .set_file_name(suggested_name)
        .blocking_save_file();
    let path = files::with_extension_from(picked?.into_path().ok()?, extensions);
    app.state::<AllowedPaths>().allow(&path);
    Some(path.to_string_lossy().into_owned())
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
async fn pick_markdown_save_path(app: AppHandle, window: Window, suggested_name: String) -> Option<String> {
    let picked = file_dialog(&window)
        .add_filter("Markdown", &MARKDOWN_EXTENSIONS)
        .set_file_name(suggested_name)
        .blocking_save_file();
    chosen(&app, picked, files::with_markdown_extension)
}

#[tauri::command]
async fn read_pdf(app: AppHandle, path: String) -> Result<Response, String> {
    let path = readable_path(&app, &path, is_pdf)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
async fn read_markdown(app: AppHandle, path: String) -> Result<Response, String> {
    let path = readable_path(&app, &path, is_markdown)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

fn linked_target(app: &AppHandle, document: &str, href: &str, kind: fn(&std::path::Path) -> bool) -> Result<PathBuf, String> {
    let document = readable_path(app, document, is_markdown)?;
    files::resolve_linked(&document, href)
        .filter(|path| kind(path))
        .ok_or_else(|| format!("Could not find {href}"))
}

#[tauri::command]
async fn read_linked_image(app: AppHandle, document: String, src: String) -> Result<Response, String> {
    let path = linked_target(&app, &document, &src, is_image)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
async fn open_linked_file(app: AppHandle, document: String, href: String) -> Result<String, String> {
    let path = linked_target(&app, &document, &href, is_document)?;
    app.state::<ReadOnlyPaths>().0.allow(&path);
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn read_image(app: AppHandle, path: String) -> Result<Response, String> {
    let path = readable_path(&app, &path, is_image)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
async fn file_stamp(app: AppHandle, path: String) -> Result<Option<String>, String> {
    Ok(files::stamp(&readable_path(&app, &path, is_document)?))
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|value| value.to_str().ok())
}

#[tauri::command]
async fn write_pdf(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    write_document(&app, &request, is_pdf)
}

#[tauri::command]
async fn write_markdown(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    write_document(&app, &request, is_markdown)
}

fn write_document(app: &AppHandle, request: &Request<'_>, kind: fn(&std::path::Path) -> bool) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw document bytes".into());
    };
    let encoded = header(request, "x-path").ok_or("Missing destination path")?;
    let decoded = percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?;
    let path = allowed_path(app, &decoded, kind).map_err(|err| if readable_path(app, &decoded, kind).is_ok() { files::NOT_WRITABLE.into() } else { err })?;
    files::write_atomically(&path, bytes, header(request, "x-expected-stamp"))
}

fn image_target(app: &AppHandle, request: &Request<'_>) -> Result<(PathBuf, bool), String> {
    let decoded = |name: &str| -> Result<String, String> {
        let encoded = header(request, name).ok_or("Missing destination path")?;
        Ok(percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?.into_owned())
    };
    if header(request, "x-folder").is_none() {
        return Ok((allowed_path(app, &decoded("x-path")?, is_export_image)?, true));
    }
    let (folder, name) = (PathBuf::from(decoded("x-folder")?), decoded("x-name")?);
    let folders = app.state::<AllowedFolders>();
    let path = folders
        .file_in(&folder, &name)
        .ok_or_else(|| format!("Clumsy wasn't given access to {}", folder.join(&name).display()))?;
    let replace = folders.take_replacing(&path);
    Ok((path, replace))
}

#[tauri::command]
async fn write_image(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw image bytes".into());
    };
    let (path, overwrite) = image_target(&app, &request)?;
    files::write_file(&path, bytes, overwrite)?;
    Ok(path.to_string_lossy().into_owned())
}

fn replace_prompt(names: &[String], folder: &str) -> String {
    match names {
        [name] => format!("“{name}” already exists in “{folder}”. Replace it?"),
        _ => format!("{} of these images already exist in “{folder}”, including “{}”. Replace them?", names.len(), names[0]),
    }
}

#[tauri::command]
async fn confirm_replace(app: AppHandle, window: Window, folder: String, names: Vec<String>) -> Result<bool, String> {
    let folder = PathBuf::from(folder);
    let folders = app.state::<AllowedFolders>();
    if !folders.is_allowed(&folder) {
        return Err(format!("Clumsy wasn't given access to {}", folder.display()));
    }
    let existing = files::existing_files(&folders, &folder, &names);
    if existing.is_empty() {
        return Ok(true);
    }
    let existing_names: Vec<String> = existing.iter().filter_map(|path| path.file_name()).map(|name| name.to_string_lossy().into_owned()).collect();
    let folder_name = folder.file_name().map_or_else(|| folder.to_string_lossy(), |name| name.to_string_lossy());
    let replace = app
        .dialog()
        .message(replace_prompt(&existing_names, &folder_name))
        .title("Replace existing files?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Replace".into(), "Cancel".into()))
        .parent(&window)
        .blocking_show();
    if replace {
        folders.allow_replacing(&existing);
    }
    Ok(replace)
}

#[tauri::command]
async fn stash_transfer(request: Request<'_>, transfers: tauri::State<'_, Transfers>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw document bytes".into());
    };
    transfers.stash(bytes.clone())
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

fn discard_prompt(names: &[String], action: &str) -> String {
    match names {
        [name] => format!("“{name}” has unsaved changes. Discard them and {action}?"),
        _ => format!("{} documents have unsaved changes ({}). Discard them and {action}?", names.len(), names.join(", ")),
    }
}

fn quit(app: &AppHandle, restart: bool) {
    if restart {
        app.restart();
    }
    app.exit(0);
}

pub(crate) fn confirm_quit(app: &AppHandle, restart: bool) {
    let unsaved = app.state::<Documents>().unsaved();
    if unsaved.is_empty() {
        quit(app, restart);
        return;
    }
    if app.state::<QuitPrompt>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    let handle = app.clone();
    app.dialog()
        .message(discard_prompt(&unsaved, if restart { "restart" } else { "quit" }))
        .title("Unsaved changes")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(if restart { "Discard and Restart" } else { "Discard and Quit" }.into(), "Cancel".into()))
        .show(move |discard| {
            handle.state::<QuitPrompt>().0.store(false, Ordering::SeqCst);
            if discard {
                quit(&handle, restart);
            }
        });
}

#[tauri::command]
fn request_quit(app: AppHandle) {
    confirm_quit(&app, false);
}

#[tauri::command]
fn default_app_status(app: AppHandle, kind: String) -> Result<default_app::DefaultAppStatus, String> {
    Ok(default_app::status(&default_app::document_kind(&kind)?, &app.config().identifier))
}

#[tauri::command]
fn make_default_app(app: AppHandle, kind: String) -> Result<default_app::DefaultAppStatus, String> {
    default_app::make_default(&default_app::document_kind(&kind)?, &app.config().identifier)
}

#[tauri::command]
async fn recent_files(app: AppHandle) -> Vec<recent::RecentEntry> {
    app.state::<RecentFiles>().entries(&app)
}

#[tauri::command]
async fn record_recent_file(app: AppHandle, path: String) {
    if allowed_path(&app, &path, is_document).is_ok() {
        app.state::<RecentFiles>().add(&app, &path);
    }
}

#[tauri::command]
async fn remove_recent_file(app: AppHandle, path: String) {
    app.state::<RecentFiles>().remove(&app, &path);
}

#[tauri::command]
async fn clear_recent_files(app: AppHandle) {
    app.state::<RecentFiles>().clear(&app);
}

#[tauri::command]
fn take_pending_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *lock(&state.0))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingFiles::default())
        .manage(RecentFiles::default())
        .manage(FocusTracker::default())
        .manage(Transfers::default())
        .manage(AllowedPaths::default())
        .manage(AllowedFolders::default())
        .manage(ReadOnlyPaths::default())
        .plugin(navigation::guard())
        .manage(Documents::default())
        .manage(QuitPrompt::default())
        .manage(Updates::default())
        .manage(RestartSession::default())
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(true) => window.state::<FocusTracker>().focused(window.label()),
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => allow_dropped(window.app_handle(), paths),
            WindowEvent::Destroyed => window.state::<Documents>().forget(window.label()),
            _ => {}
        })
        .on_webview_event(|webview, event| {
            if let tauri::WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                allow_dropped(webview.app_handle(), paths);
            }
        })
        .setup(|app| {
            let recent = app.state::<RecentFiles>();
            recent.load(app.handle());
            allow_paths(app.handle(), &recent.paths());
            if !session::load(app.handle()) {
                let args = std::env::args().skip(1).map(PathBuf::from).collect();
                queue_files(app.handle(), args);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            pick_pdf,
            pick_document,
            pick_pdfs,
            pick_image,
            pick_images,
            pick_folder,
            pick_image_save_path,
            pick_save_path,
            pick_markdown_save_path,
            read_pdf,
            read_markdown,
            read_linked_image,
            open_linked_file,
            read_image,
            file_stamp,
            write_pdf,
            write_markdown,
            write_image,
            confirm_replace,
            report_documents,
            document_window,
            request_quit,
            session::request_restart,
            session::report_session,
            session::restored_windows,
            session::take_restored_window,
            updates::install_update,
            default_app_status,
            make_default_app,
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
    use super::{discard_prompt, replace_prompt};

    #[test]
    fn asks_before_replacing_exported_images() {
        assert_eq!(replace_prompt(&["a - page 1.png".into()], "Desktop"), "“a - page 1.png” already exists in “Desktop”. Replace it?");
        assert_eq!(
            replace_prompt(&["a - page 1.png".into(), "a - page 2.png".into()], "Desktop"),
            "2 of these images already exist in “Desktop”, including “a - page 1.png”. Replace them?"
        );
    }

    #[test]
    fn names_the_documents_that_would_be_discarded() {
        assert_eq!(discard_prompt(&["a.pdf".into()], "quit"), "“a.pdf” has unsaved changes. Discard them and quit?");
        assert_eq!(
            discard_prompt(&["a.pdf".into(), "b.pdf".into()], "restart"),
            "2 documents have unsaved changes (a.pdf, b.pdf). Discard them and restart?"
        );
    }
}

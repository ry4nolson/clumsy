mod default_app;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager};

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
    let _ = app.emit("files-opened", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn install_app_menu(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};

    let menu = Menu::default(app)?;
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        app_menu.remove_at(0)?;
        app_menu.insert_items(
            &[
                &MenuItem::with_id(app, "about", "About Clumsy", true, None::<&str>)?,
                &MenuItem::with_id(app, "check-updates", "Check for Updates…", true, None::<&str>)?,
                &MenuItem::with_id(app, "make-default", "Make Clumsy the Default PDF App…", true, None::<&str>)?,
            ],
            0,
        )?;
    }
    app.set_menu(menu)?;
    Ok(())
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
        .setup(|app| {
            #[cfg(target_os = "macos")]
            install_app_menu(app.handle())?;
            let args = std::env::args().skip(1).map(PathBuf::from).collect();
            queue_files(app.handle(), args);
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = match event.id().as_ref() {
                "about" => app.emit("menu-about", "about"),
                "check-updates" => app.emit("menu-about", "updates"),
                "make-default" => app.emit("menu-make-default", ()),
                _ => return,
            };
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            read_pdf,
            write_pdf,
            default_pdf_app,
            make_default_pdf_app
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

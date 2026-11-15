#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use std::path::Path;

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};

use crate::files;

const SCHEME: &str = "content://";

pub fn is_provided(path: &Path) -> bool {
    cfg!(target_os = "android") && path.to_str().is_some_and(|path| path.starts_with(SCHEME))
}

pub fn provided_path(uri: &str, name: &str) -> String {
    format!("{uri}/{}", name.replace(['/', '\\'], "_"))
}

pub fn uri_of(path: &str) -> Option<&str> {
    path.strip_prefix(SCHEME)?;
    path.rsplit_once('/').map(|(uri, _)| uri).filter(|uri| uri.len() > SCHEME.len())
}

pub fn mime_for(name: &str) -> &'static str {
    if files::is_markdown(Path::new(name)) { "text/markdown" } else { "application/pdf" }
}

pub fn exists(path: &Path) -> bool {
    is_provided(path) || path.is_file()
}

#[cfg(target_os = "android")]
mod provider {
    use std::fs::File;
    use std::io::{Read, Write};
    use std::os::fd::FromRawFd;
    use std::path::Path;
    use std::time::UNIX_EPOCH;

    use serde::Deserialize;
    use serde::de::DeserializeOwned;
    use serde_json::{Value, json};
    use tauri::plugin::PluginHandle;
    use tauri::{AppHandle, Manager, Url, Wry};

    use super::{provided_path, uri_of};
    use crate::files::{self, AllowedPaths, CHANGED_ON_DISK, ReadOnlyPaths};

    pub struct Provider(pub PluginHandle<Wry>);

    #[derive(Deserialize)]
    struct Described {
        uri: String,
        name: String,
        size: i64,
        modified: i64,
        writable: bool,
    }

    #[derive(Deserialize)]
    struct Chosen {
        documents: Vec<Described>,
    }

    #[derive(Deserialize)]
    struct Opened {
        fd: i32,
    }

    fn call<T: DeserializeOwned>(app: &AppHandle, command: &str, payload: Value) -> Result<T, String> {
        app.state::<Provider>().0.run_mobile_plugin(command, payload).map_err(|err| err.to_string())
    }

    fn uri(path: &Path) -> std::io::Result<&str> {
        path.to_str().and_then(uri_of).ok_or_else(|| std::io::Error::other("not a shared document"))
    }

    fn open(app: &AppHandle, path: &Path, mode: &str) -> std::io::Result<File> {
        let opened: Opened = call(app, "open", json!({ "uri": uri(path)?, "mode": mode })).map_err(std::io::Error::other)?;
        Ok(unsafe { File::from_raw_fd(opened.fd) })
    }

    pub fn read(app: &AppHandle, path: &Path) -> std::io::Result<Vec<u8>> {
        let mut bytes = Vec::new();
        open(app, path, "r")?.read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    pub fn stamp(app: &AppHandle, path: &Path) -> Option<String> {
        let metadata = open(app, path, "r").ok()?.metadata().ok()?;
        if metadata.is_file() {
            let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
            return Some(format!("{modified}:{}", metadata.len()));
        }
        let described: Described = call(app, "describe", json!({ "uri": uri(path).ok()? })).ok()?;
        (described.size >= 0).then(|| format!("{}:{}", described.modified, described.size))
    }

    pub fn write(app: &AppHandle, path: &Path, bytes: &[u8], expected_stamp: Option<&str>) -> Result<String, String> {
        if let Some(expected) = expected_stamp
            && stamp(app, path).is_some_and(|current| current != expected)
        {
            return Err(CHANGED_ON_DISK.into());
        }
        let failed = |err: std::io::Error| format!("Could not save {}: {err}", name_of(path));
        let mut file = open(app, path, "wt").map_err(failed)?;
        file.write_all(bytes).map_err(failed)?;
        let _ = file.sync_all();
        drop(file);
        stamp(app, path).ok_or_else(|| format!("Saved {}, but couldn't read it back", name_of(path)))
    }

    fn name_of(path: &Path) -> String {
        path.file_name().unwrap_or_default().to_string_lossy().into_owned()
    }

    fn admit(app: &AppHandle, document: Described, kind: fn(&Path) -> bool) -> Option<String> {
        let path = provided_path(&document.uri, &document.name);
        if !kind(Path::new(&path)) {
            return None;
        }
        if document.writable {
            app.state::<AllowedPaths>().allow(Path::new(&path));
        } else {
            app.state::<ReadOnlyPaths>().0.allow(Path::new(&path));
        }
        Some(path)
    }

    pub fn pick(app: &AppHandle, markdown: bool, multiple: bool) -> Vec<String> {
        let mimes: &[&str] = if markdown { &["application/pdf", "text/markdown"] } else { &["application/pdf"] };
        let kind: fn(&Path) -> bool = if markdown { files::is_document } else { files::is_pdf };
        let chosen: Result<Chosen, String> = call(app, "pick", json!({ "mimes": mimes, "multiple": multiple }));
        chosen.map(|chosen| chosen.documents).unwrap_or_default().into_iter().filter_map(|document| admit(app, document, kind)).collect()
    }

    pub fn create(app: &AppHandle, name: &str) -> Option<String> {
        let chosen: Chosen = call(app, "create", json!({ "name": name, "mime": super::mime_for(name) })).ok()?;
        chosen.documents.into_iter().find_map(|document| admit(app, document, files::is_document))
    }

    pub fn opened(app: &AppHandle, urls: Vec<Url>) {
        let app = app.clone();
        std::thread::spawn(move || {
            let paths: Vec<String> = urls
                .iter()
                .filter(|url| url.scheme() == "content")
                .filter_map(|url| call::<Described>(&app, "describe", json!({ "uri": url.as_str() })).ok())
                .filter_map(|document| admit(&app, document, files::is_document))
                .collect();
            crate::announce(&app, paths);
        });
    }
}

#[cfg(target_os = "android")]
pub use provider::opened;

#[cfg(target_os = "android")]
pub fn init() -> TauriPlugin<Wry> {
    use tauri::Manager;
    tauri::plugin::Builder::new("documents")
        .setup(|app, api| {
            app.manage(provider::Provider(api.register_android_plugin("com.ry4nolson.clumsy", "DocumentsPlugin")?));
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn init() -> TauriPlugin<Wry> {
    tauri::plugin::Builder::new("documents").build()
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
pub fn read(app: &AppHandle, path: &Path) -> std::io::Result<Vec<u8>> {
    #[cfg(target_os = "android")]
    if is_provided(path) {
        return provider::read(app, path);
    }
    std::fs::read(path)
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
pub fn stamp(app: &AppHandle, path: &Path) -> Option<String> {
    #[cfg(target_os = "android")]
    if is_provided(path) {
        return provider::stamp(app, path);
    }
    files::stamp(path)
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
pub fn write(app: &AppHandle, path: &Path, bytes: &[u8], expected_stamp: Option<&str>) -> Result<String, String> {
    #[cfg(target_os = "android")]
    if is_provided(path) {
        return provider::write(app, path, bytes, expected_stamp);
    }
    files::write_atomically(path, bytes, expected_stamp)
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
#[tauri::command]
pub async fn pick_documents(app: AppHandle, markdown: bool, multiple: bool) -> Vec<String> {
    #[cfg(target_os = "android")]
    return provider::pick(&app, markdown, multiple);
    #[cfg(not(target_os = "android"))]
    Vec::new()
}

#[cfg_attr(not(target_os = "android"), allow(unused_variables))]
#[tauri::command]
pub async fn create_document(app: AppHandle, suggested_name: String) -> Option<String> {
    #[cfg(target_os = "android")]
    return provider::create(&app, &suggested_name);
    #[cfg(not(target_os = "android"))]
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_provided_path_carries_the_document_name_after_its_uri() {
        let path = provided_path("content://docs/document/msf%3A33", "Order form.pdf");
        assert_eq!(path, "content://docs/document/msf%3A33/Order form.pdf");
        assert_eq!(uri_of(&path), Some("content://docs/document/msf%3A33"));
        assert!(files::is_pdf(Path::new(&path)));
    }

    #[test]
    fn a_name_cannot_add_path_segments() {
        let path = provided_path("content://docs/document/1", "a/b\\c.pdf");
        assert_eq!(uri_of(&path), Some("content://docs/document/1"));
    }

    #[test]
    fn ordinary_paths_have_no_uri() {
        assert_eq!(uri_of("/Users/me/file.pdf"), None);
        assert_eq!(uri_of("content://"), None);
        assert_eq!(uri_of("content://file.pdf"), None);
    }

    #[test]
    fn the_new_document_type_follows_the_name() {
        assert_eq!(mime_for("Notes.md"), "text/markdown");
        assert_eq!(mime_for("Report.pdf"), "application/pdf");
    }

    #[test]
    fn content_paths_only_count_on_android() {
        assert_eq!(is_provided(Path::new("content://docs/document/1/a.pdf")), cfg!(target_os = "android"));
    }
}

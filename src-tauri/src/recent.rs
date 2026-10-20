use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const STORE_LIMIT: usize = 20;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub opened_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub location: String,
    pub opened_at: u64,
    pub exists: bool,
}

pub fn record(list: &mut Vec<RecentFile>, path: &str, opened_at: u64) {
    list.retain(|entry| entry.path != path);
    list.insert(0, RecentFile { path: path.to_string(), opened_at });
    list.truncate(STORE_LIMIT);
}

pub fn display_location(path: &Path, home: Option<&Path>) -> String {
    let dir = path.parent().unwrap_or(path);
    match home.and_then(|home| dir.strip_prefix(home).ok()) {
        Some(relative) if relative.as_os_str().is_empty() => "~".into(),
        Some(relative) => format!("~/{}", relative.display()),
        None => dir.display().to_string(),
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

#[derive(Default)]
pub struct RecentFiles {
    list: Mutex<Vec<RecentFile>>,
    store: Mutex<Option<PathBuf>>,
}

impl RecentFiles {
    pub fn load(&self, app: &AppHandle) {
        let Ok(dir) = app.path().app_data_dir() else {
            return;
        };
        let store = dir.join("recent-files.json");
        let list = fs::read_to_string(&store)
            .ok()
            .and_then(|json| serde_json::from_str::<Vec<RecentFile>>(&json).ok())
            .unwrap_or_default();
        *self.list.lock().unwrap() = list;
        *self.store.lock().unwrap() = Some(store);
    }

    pub fn entries(&self, app: &AppHandle) -> Vec<RecentEntry> {
        let home = app.path().home_dir().ok();
        self.list
            .lock()
            .unwrap()
            .iter()
            .map(|entry| {
                let path = Path::new(&entry.path);
                RecentEntry {
                    path: entry.path.clone(),
                    name: path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
                    location: display_location(path, home.as_deref()),
                    opened_at: entry.opened_at,
                    exists: path.is_file(),
                }
            })
            .collect()
    }

    pub fn paths(&self) -> Vec<PathBuf> {
        self.list.lock().unwrap().iter().map(|entry| PathBuf::from(&entry.path)).collect()
    }

    pub fn add(&self, app: &AppHandle, path: &str) {
        record(&mut self.list.lock().unwrap(), path, now_millis());
        self.changed(app);
    }

    pub fn remove(&self, app: &AppHandle, path: &str) {
        self.list.lock().unwrap().retain(|entry| entry.path != path);
        self.changed(app);
    }

    pub fn clear(&self, app: &AppHandle) {
        self.list.lock().unwrap().clear();
        self.changed(app);
    }

    fn changed(&self, app: &AppHandle) {
        self.save();
        let _ = app.emit("recent-files-changed", ());
    }

    fn save(&self) {
        let Some(store) = self.store.lock().unwrap().clone() else {
            return;
        };
        let Ok(json) = serde_json::to_string_pretty(&*self.list.lock().unwrap()) else {
            return;
        };
        if let Some(dir) = store.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(store, json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(list: &[RecentFile]) -> Vec<&str> {
        list.iter().map(|entry| entry.path.as_str()).collect()
    }

    #[test]
    fn records_newest_first_without_duplicates() {
        let mut list = Vec::new();
        record(&mut list, "/a.pdf", 1);
        record(&mut list, "/b.pdf", 2);
        record(&mut list, "/a.pdf", 3);
        assert_eq!(paths(&list), ["/a.pdf", "/b.pdf"]);
        assert_eq!(list[0].opened_at, 3);
    }

    #[test]
    fn caps_the_stored_list() {
        let mut list = Vec::new();
        for index in 0..30 {
            record(&mut list, &format!("/{index}.pdf"), index);
        }
        assert_eq!(list.len(), STORE_LIMIT);
        assert_eq!(list[0].path, "/29.pdf");
    }

    #[test]
    fn shortens_locations_under_home() {
        let home = Path::new("/Users/me");
        assert_eq!(display_location(Path::new("/Users/me/Documents/x.pdf"), Some(home)), "~/Documents");
        assert_eq!(display_location(Path::new("/Users/me/x.pdf"), Some(home)), "~");
        assert_eq!(display_location(Path::new("/Volumes/NAS/x.pdf"), Some(home)), "/Volumes/NAS");
        assert_eq!(display_location(Path::new("/Users/meow/x.pdf"), Some(home)), "/Users/meow");
    }
}

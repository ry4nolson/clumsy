use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{IsMenuItem, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};

pub const MENU_LIMIT: usize = 10;
const STORE_LIMIT: usize = 20;
pub const MENU_PREFIX: &str = "recent:";
pub const CLEAR_MENU_ID: &str = "recent-clear";

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
    menu: Mutex<Option<Submenu<Wry>>>,
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

    pub fn attach_menu(&self, app: &AppHandle, submenu: Submenu<Wry>) {
        *self.menu.lock().unwrap() = Some(submenu);
        self.rebuild_menu(app);
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

    pub fn path_at(&self, index: usize) -> Option<String> {
        self.list.lock().unwrap().get(index).map(|entry| entry.path.clone())
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
        self.rebuild_menu(app);
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

    fn rebuild_menu(&self, app: &AppHandle) {
        let Some(submenu) = self.menu.lock().unwrap().clone() else {
            return;
        };
        if let Err(error) = self.fill_menu(app, &submenu) {
            eprintln!("could not rebuild Open Recent menu: {error}");
        }
    }

    fn fill_menu(&self, app: &AppHandle, submenu: &Submenu<Wry>) -> tauri::Result<()> {
        for item in submenu.items()? {
            submenu.remove(&item)?;
        }
        let entries = self.entries(app);
        if entries.is_empty() {
            submenu.append(&MenuItem::with_id(app, "recent-empty", "No Recent Files", false, None::<&str>)?)?;
            return Ok(());
        }
        for (index, entry) in entries.iter().take(MENU_LIMIT).enumerate() {
            let label = format!("{}  —  {}", entry.name, entry.location);
            let item = MenuItem::with_id(app, format!("{MENU_PREFIX}{index}"), label, true, None::<&str>)?;
            submenu.append(&item as &dyn IsMenuItem<Wry>)?;
        }
        submenu.append(&PredefinedMenuItem::separator(app)?)?;
        submenu.append(&MenuItem::with_id(app, CLEAR_MENU_ID, "Clear Recently Opened", true, None::<&str>)?)?;
        Ok(())
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

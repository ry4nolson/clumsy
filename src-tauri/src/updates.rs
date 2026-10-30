use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::default_app::is_installed_bundle;

const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct Updates {
    busy: AtomicBool,
    installed: Mutex<Option<String>>,
}

struct Busy<'a>(&'a AtomicBool);

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl Updates {
    fn begin(&self) -> Result<Busy<'_>, String> {
        if self.busy.swap(true, Ordering::SeqCst) {
            return Err("Another window is already installing the update".into());
        }
        Ok(Busy(&self.busy))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum UpdateProgress {
    Downloading { received: u64, total: Option<u64> },
    Installing,
}

pub fn is_translocated(exe: &Path) -> bool {
    exe.to_string_lossy().contains("/AppTranslocation/")
}

fn install_blocker() -> Option<&'static str> {
    if !is_installed_bundle() {
        return Some("Updates can only be installed into an installed copy of Clumsy");
    }
    if std::env::current_exe().is_ok_and(|exe| is_translocated(&exe)) {
        return Some("Move Clumsy to your Applications folder to install updates");
    }
    None
}

#[tauri::command]
pub async fn install_update(app: AppHandle, progress: Channel<UpdateProgress>) -> Result<Option<String>, String> {
    if let Some(reason) = install_blocker() {
        return Err(reason.into());
    }
    let updates = app.state::<Updates>();
    let _busy = updates.begin()?;
    let updater = app.updater_builder().timeout(DOWNLOAD_TIMEOUT).build().map_err(|err| err.to_string())?;
    let Some(update) = updater.check().await.map_err(|err| err.to_string())? else {
        return Ok(None);
    };
    if updates.installed.lock().unwrap().as_deref() == Some(update.version.as_str()) {
        return Ok(Some(update.version));
    }
    let mut received = 0;
    update
        .download_and_install(
            |chunk, total| {
                received += chunk as u64;
                let _ = progress.send(UpdateProgress::Downloading { received, total });
            },
            || {
                let _ = progress.send(UpdateProgress::Installing);
            },
        )
        .await
        .map_err(|err| err.to_string())?;
    *updates.installed.lock().unwrap() = Some(update.version.clone());
    Ok(Some(update.version))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{Updates, is_translocated};

    #[test]
    fn spots_translocated_apps() {
        assert!(is_translocated(Path::new("/private/var/folders/ab/T/AppTranslocation/1234/d/Clumsy.app/Contents/MacOS/clumsy")));
        assert!(!is_translocated(Path::new("/Applications/Clumsy.app/Contents/MacOS/clumsy")));
    }

    #[test]
    fn installs_one_update_at_a_time() {
        let updates = Updates::default();
        let first = updates.begin().unwrap();
        assert!(updates.begin().is_err());
        drop(first);
        assert!(updates.begin().is_ok());
    }
}

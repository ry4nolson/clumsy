use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Window};

use crate::files::{AllowedPaths, LinkedPaths, is_document};
use crate::windows::{FocusTracker, Transfers, is_document_window};

const CAPTURE_TIMEOUT: Duration = Duration::from_secs(30);
const SESSION_FILE: &str = "session.json";

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionTab {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stamp: Option<String>,
    modified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    transfer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    view: Option<Value>,
    #[serde(skip_serializing)]
    read_only: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionPane {
    size: f64,
    active: usize,
    tabs: Vec<SessionTab>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionWindow {
    panes: Vec<SessionPane>,
    focused_pane: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    bounds: Option<Bounds>,
    focused: bool,
}

#[derive(Serialize, Deserialize)]
struct StoredSession {
    windows: Vec<SessionWindow>,
    read_only: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Access {
    Writable,
    ReadOnly,
    Denied,
}

type Blobs = HashMap<String, Vec<u8>>;

struct Capture {
    id: u64,
    expected: HashSet<String>,
    windows: Vec<(String, SessionWindow)>,
    blobs: Blobs,
}

#[derive(Default)]
pub struct RestartSession {
    next: AtomicU64,
    capture: Mutex<Option<Capture>>,
    restored: Mutex<Vec<Option<SessionWindow>>>,
}

fn tabs_mut(window: &mut SessionWindow) -> impl Iterator<Item = &mut SessionTab> {
    window.panes.iter_mut().flat_map(|pane| pane.tabs.iter_mut())
}

pub fn accept_window(mut window: SessionWindow, access: impl Fn(&str) -> Access) -> SessionWindow {
    for pane in &mut window.panes {
        pane.tabs.retain_mut(|tab| {
            tab.read_only = false;
            let Some(path) = tab.path.as_deref() else {
                return tab.kind == "start" || tab.transfer_id.is_some();
            };
            match access(path) {
                Access::Writable => true,
                Access::ReadOnly => {
                    tab.read_only = true;
                    true
                }
                Access::Denied => false,
            }
        });
    }
    window
}

fn take_blobs(window: &mut SessionWindow, take: impl Fn(&str) -> Option<Vec<u8>>, blobs: &mut Blobs) -> bool {
    for tab in tabs_mut(window) {
        let Some(id) = tab.transfer_id.take() else {
            continue;
        };
        let Some(bytes) = take(&id) else {
            return false;
        };
        let key = format!("blob-{}", blobs.len());
        blobs.insert(key.clone(), bytes);
        tab.transfer_id = Some(key);
    }
    true
}

fn order_windows(mut windows: Vec<(String, SessionWindow)>, focused: Option<&str>) -> Vec<SessionWindow> {
    windows.sort_by_key(|(label, _)| label != "main");
    windows
        .into_iter()
        .map(|(label, mut window)| {
            window.focused = focused == Some(label.as_str());
            window
        })
        .collect()
}

#[cfg(unix)]
fn private_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn private_dir(_dir: &Path) -> std::io::Result<()> {
    Ok(())
}

pub fn write_session(dir: &Path, windows: &[SessionWindow], blobs: &Blobs) -> std::io::Result<()> {
    let _ = fs::remove_dir_all(dir);
    fs::create_dir_all(dir)?;
    private_dir(dir)?;
    for (key, bytes) in blobs {
        fs::write(dir.join(key), bytes)?;
    }
    let read_only = windows
        .iter()
        .flat_map(|window| window.panes.iter().flat_map(|pane| pane.tabs.iter()))
        .filter(|tab| tab.read_only)
        .filter_map(|tab| tab.path.clone())
        .collect();
    let stored = StoredSession { windows: windows.to_vec(), read_only };
    fs::write(dir.join(SESSION_FILE), serde_json::to_vec(&stored).map_err(std::io::Error::other)?)
}

pub fn read_session(dir: &Path) -> Option<(Vec<SessionWindow>, Blobs)> {
    let json = fs::read(dir.join(SESSION_FILE));
    let result = json.ok().and_then(|json| serde_json::from_slice::<StoredSession>(&json).ok()).map(|mut stored| {
        let read_only: HashSet<String> = stored.read_only.into_iter().collect();
        let mut blobs = HashMap::new();
        for window in &mut stored.windows {
            for tab in tabs_mut(window) {
                tab.read_only = tab.path.as_ref().is_some_and(|path| read_only.contains(path));
                if let Some(key) = tab.transfer_id.as_deref().filter(|key| key.starts_with("blob-") && !key.contains(['/', '\\', '.']))
                    && let Ok(bytes) = fs::read(dir.join(key))
                {
                    blobs.insert(key.to_string(), bytes);
                }
            }
        }
        (stored.windows, blobs)
    });
    let _ = fs::remove_dir_all(dir);
    result
}

fn session_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("restart-session"))
}

fn finish(app: &AppHandle, capture: Capture) {
    let focused = app.state::<FocusTracker>().last();
    let windows = order_windows(capture.windows, focused.as_deref());
    let written = session_dir(app).is_some_and(|dir| write_session(&dir, &windows, &capture.blobs).is_ok());
    if written {
        app.restart();
    }
    crate::confirm_quit(app, true);
}

fn abandon(app: &AppHandle) {
    *app.state::<RestartSession>().capture.lock().unwrap() = None;
    crate::confirm_quit(app, true);
}

#[tauri::command]
pub fn request_restart(app: AppHandle) {
    let state = app.state::<RestartSession>();
    let expected: HashSet<String> = app.webview_windows().into_keys().filter(|label| is_document_window(label)).collect();
    let id = state.next.fetch_add(1, Ordering::Relaxed);
    {
        let mut capture = state.capture.lock().unwrap();
        if capture.is_some() {
            return;
        }
        *capture = Some(Capture { id, expected: expected.clone(), windows: Vec::new(), blobs: HashMap::new() });
    }
    for label in &expected {
        let _ = app.emit_to(label.as_str(), "capture-session", ());
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(CAPTURE_TIMEOUT);
        let pending = handle.state::<RestartSession>().capture.lock().unwrap().as_ref().is_some_and(|capture| capture.id == id);
        if pending {
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || abandon(&app));
        }
    });
}

#[tauri::command]
pub fn report_session(app: AppHandle, window: Window, session: Option<SessionWindow>) {
    let state = app.state::<RestartSession>();
    let mut guard = state.capture.lock().unwrap();
    let Some(capture) = guard.as_mut() else {
        return;
    };
    if !capture.expected.remove(window.label()) {
        return;
    }
    let access = |path: &str| {
        let path = Path::new(path);
        if !is_document(path) {
            Access::Denied
        } else if app.state::<AllowedPaths>().is_allowed(path) {
            Access::Writable
        } else if app.state::<LinkedPaths>().0.is_allowed(path) {
            Access::ReadOnly
        } else {
            Access::Denied
        }
    };
    let transfers = app.state::<Transfers>();
    let accepted = session.map(|session| accept_window(session, access)).and_then(|mut session| {
        take_blobs(&mut session, |id| transfers.take(id), &mut capture.blobs).then_some(session)
    });
    let Some(session) = accepted else {
        drop(guard);
        abandon(&app);
        return;
    };
    capture.windows.push((window.label().to_string(), session));
    if capture.expected.is_empty() {
        let done = guard.take().unwrap();
        drop(guard);
        finish(&app, done);
    }
}

pub fn load(app: &AppHandle) -> bool {
    let Some((mut windows, mut blobs)) = session_dir(app).and_then(|dir| read_session(&dir)) else {
        return false;
    };
    let transfers = app.state::<Transfers>();
    for window in &mut windows {
        for pane in &mut window.panes {
            pane.tabs.retain_mut(|tab| {
                if let Some(key) = tab.transfer_id.take() {
                    let Some(bytes) = blobs.remove(&key) else {
                        return false;
                    };
                    tab.transfer_id = Some(transfers.stash(bytes));
                }
                let Some(path) = tab.path.as_deref().map(PathBuf::from) else {
                    return true;
                };
                if !is_document(&path) || (tab.transfer_id.is_none() && !path.is_file()) {
                    return false;
                }
                if tab.read_only {
                    app.state::<LinkedPaths>().0.allow(&path);
                } else {
                    app.state::<AllowedPaths>().allow(&path);
                }
                true
            });
        }
    }
    let restored = !windows.is_empty();
    *app.state::<RestartSession>().restored.lock().unwrap() = windows.into_iter().map(Some).collect();
    restored
}

#[tauri::command]
pub fn restored_windows(state: tauri::State<'_, RestartSession>) -> usize {
    state.restored.lock().unwrap().len()
}

#[tauri::command]
pub fn take_restored_window(index: usize, state: tauri::State<'_, RestartSession>) -> Option<SessionWindow> {
    state.restored.lock().unwrap().get_mut(index).and_then(Option::take)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tab(path: Option<&str>, transfer: Option<&str>) -> SessionTab {
        SessionTab {
            kind: "document".into(),
            path: path.map(str::to_string),
            transfer_id: transfer.map(str::to_string),
            ..Default::default()
        }
    }

    fn window(tabs: Vec<SessionTab>) -> SessionWindow {
        SessionWindow { panes: vec![SessionPane { size: 1.0, active: 0, tabs }], ..Default::default() }
    }

    #[test]
    fn keeps_only_paths_clumsy_was_given() {
        let start = SessionTab { kind: "start".into(), ..Default::default() };
        let mut claimed = tab(Some("/ok.pdf"), None);
        claimed.read_only = true;
        let accepted = accept_window(
            window(vec![claimed, tab(Some("/secret.pdf"), None), tab(Some("/linked.pdf"), None), tab(None, Some("t-1")), tab(None, None), start.clone()]),
            |path| match path {
                "/ok.pdf" => Access::Writable,
                "/linked.pdf" => Access::ReadOnly,
                _ => Access::Denied,
            },
        );
        let tabs = &accepted.panes[0].tabs;
        assert_eq!(tabs.iter().map(|tab| tab.path.as_deref()).collect::<Vec<_>>(), [Some("/ok.pdf"), Some("/linked.pdf"), None, None]);
        assert!(!tabs[0].read_only && tabs[1].read_only);
        assert_eq!(tabs[3], start);
    }

    #[test]
    fn a_missing_transfer_fails_the_capture() {
        let mut blobs = HashMap::new();
        let mut session = window(vec![tab(Some("/a.pdf"), Some("t-1")), tab(None, Some("t-2"))]);
        assert!(!take_blobs(&mut session, |id| (id == "t-1").then(|| vec![1]), &mut blobs));
        let mut session = window(vec![tab(Some("/a.pdf"), Some("t-1"))]);
        assert!(take_blobs(&mut session, |_| Some(vec![7]), &mut HashMap::new()));
        assert_eq!(session.panes[0].tabs[0].transfer_id.as_deref(), Some("blob-0"));
    }

    #[test]
    fn main_comes_first_and_the_focused_window_is_marked() {
        let windows = order_windows(vec![("doc-1".into(), window(vec![])), ("main".into(), window(vec![]))], Some("doc-1"));
        assert!(!windows[0].focused && windows[1].focused);
        let windows = order_windows(vec![("doc-1".into(), window(vec![tab(Some("/b.pdf"), None)])), ("main".into(), window(vec![]))], None);
        assert!(windows[0].panes[0].tabs.is_empty());
    }

    #[test]
    fn a_written_session_reads_back_once() {
        let dir = std::env::temp_dir().join(format!("clumsy-session-test-{}", std::process::id()));
        let mut linked = tab(Some("/l.md"), None);
        linked.read_only = true;
        let windows = vec![window(vec![tab(Some("/a.pdf"), Some("blob-0")), linked, tab(None, Some("../escape"))])];
        let blobs = HashMap::from([("blob-0".to_string(), vec![1, 2, 3])]);
        write_session(&dir, &windows, &blobs).unwrap();
        let (read, read_blobs) = read_session(&dir).unwrap();
        assert_eq!(read, windows);
        assert_eq!(read_blobs, blobs);
        assert!(!dir.exists());
        assert!(read_session(&dir).is_none());
    }
}

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

pub fn is_document_window(label: &str) -> bool {
    label == "main" || label.starts_with("doc-")
}

pub fn choose_document_window(last_focused: Option<&str>, open: &[String]) -> Option<String> {
    let documents: Vec<&String> = open.iter().filter(|label| is_document_window(label)).collect();
    last_focused
        .filter(|label| documents.iter().any(|open| open.as_str() == *label))
        .map(str::to_string)
        .or_else(|| documents.iter().find(|label| label.as_str() == "main").map(|label| label.to_string()))
        .or_else(|| documents.first().map(|label| label.to_string()))
}

#[derive(Default)]
pub struct FocusTracker(Mutex<Option<String>>);

impl FocusTracker {
    pub fn focused(&self, label: &str) {
        if is_document_window(label) {
            *self.0.lock().unwrap() = Some(label.to_string());
        }
    }

    pub fn target(&self, app: &AppHandle) -> Option<WebviewWindow> {
        let open: Vec<String> = app.webview_windows().into_keys().collect();
        let last = self.0.lock().unwrap().clone();
        choose_document_window(last.as_deref(), &open).and_then(|label| app.get_webview_window(&label))
    }
}

const TRANSFER_LIFETIME: Duration = Duration::from_secs(300);

#[derive(Default)]
pub struct Transfers {
    next: AtomicU64,
    items: Mutex<HashMap<String, (Instant, Vec<u8>)>>,
}

impl Transfers {
    pub fn stash(&self, bytes: Vec<u8>) -> String {
        self.stash_at(bytes, Instant::now())
    }

    fn stash_at(&self, bytes: Vec<u8>, now: Instant) -> String {
        let id = format!("transfer-{}", self.next.fetch_add(1, Ordering::Relaxed));
        let mut items = self.items.lock().unwrap();
        items.retain(|_, (stashed, _)| now.duration_since(*stashed) < TRANSFER_LIFETIME);
        items.insert(id.clone(), (now, bytes));
        id
    }

    pub fn take(&self, id: &str) -> Option<Vec<u8>> {
        self.items.lock().unwrap().remove(id).map(|(_, bytes)| bytes)
    }
}

#[derive(Default, Clone)]
pub struct WindowDocuments {
    pub paths: Vec<String>,
    pub unsaved: Vec<String>,
}

#[derive(Default)]
pub struct Documents(Mutex<HashMap<String, WindowDocuments>>);

impl Documents {
    pub fn report(&self, label: &str, documents: WindowDocuments) {
        self.0.lock().unwrap().insert(label.to_string(), documents);
    }

    pub fn forget(&self, label: &str) {
        self.0.lock().unwrap().remove(label);
    }

    pub fn window_with(&self, path: &str, except: &str) -> Option<String> {
        let windows = self.0.lock().unwrap();
        let mut labels: Vec<&String> = windows
            .iter()
            .filter(|(label, documents)| label.as_str() != except && documents.paths.iter().any(|open| open == path))
            .map(|(label, _)| label)
            .collect();
        labels.sort();
        labels.first().map(|label| label.to_string())
    }

    pub fn unsaved(&self) -> Vec<String> {
        let windows = self.0.lock().unwrap();
        let mut labels: Vec<&String> = windows.keys().collect();
        labels.sort();
        labels.into_iter().flat_map(|label| windows[label].unsaved.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn prefers_the_last_focused_document_window() {
        assert_eq!(choose_document_window(Some("doc-2"), &labels(&["main", "doc-2", "about"])), Some("doc-2".into()));
    }

    #[test]
    fn falls_back_to_main_then_any_document_window() {
        assert_eq!(choose_document_window(Some("doc-9"), &labels(&["doc-2", "main"])), Some("main".into()));
        assert_eq!(choose_document_window(None, &labels(&["about", "doc-3"])), Some("doc-3".into()));
        assert_eq!(choose_document_window(Some("about"), &labels(&["about"])), None);
    }

    #[test]
    fn stale_transfers_are_dropped() {
        let transfers = Transfers::default();
        let start = Instant::now();
        let old = transfers.stash_at(vec![1], start);
        let fresh = transfers.stash_at(vec![2], start + TRANSFER_LIFETIME);
        assert_eq!(transfers.take(&old), None);
        assert_eq!(transfers.take(&fresh), Some(vec![2]));
    }

    fn documents(paths: &[&str], unsaved: &[&str]) -> WindowDocuments {
        WindowDocuments { paths: labels(paths), unsaved: labels(unsaved) }
    }

    #[test]
    fn finds_a_document_open_in_another_window() {
        let registry = Documents::default();
        registry.report("main", documents(&["/a.pdf"], &[]));
        registry.report("doc-2", documents(&["/b.pdf", "/a.pdf"], &[]));
        assert_eq!(registry.window_with("/b.pdf", "main"), Some("doc-2".into()));
        assert_eq!(registry.window_with("/b.pdf", "doc-2"), None);
        assert_eq!(registry.window_with("/a.pdf", "doc-2"), Some("main".into()));
        registry.forget("main");
        assert_eq!(registry.window_with("/a.pdf", "doc-2"), None);
    }

    #[test]
    fn collects_unsaved_documents_across_windows() {
        let registry = Documents::default();
        registry.report("main", documents(&["/a.pdf"], &["a.pdf"]));
        registry.report("doc-2", documents(&["/b.pdf"], &["b.pdf"]));
        assert_eq!(registry.unsaved(), ["b.pdf", "a.pdf"]);
        registry.report("doc-2", documents(&["/b.pdf"], &[]));
        assert_eq!(registry.unsaved(), ["a.pdf"]);
    }

    #[test]
    fn transfers_are_taken_once() {
        let transfers = Transfers::default();
        let id = transfers.stash(vec![1, 2, 3]);
        assert_eq!(transfers.take(&id), Some(vec![1, 2, 3]));
        assert_eq!(transfers.take(&id), None);
    }
}

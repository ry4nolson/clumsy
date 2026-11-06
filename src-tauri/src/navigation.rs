use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use tauri::plugin::{Builder, TauriPlugin};
use tauri::webview::PageLoadEvent;
use tauri::{RunEvent, Url, WindowEvent, Wry};

const DEV: bool = cfg!(debug_assertions);

fn is_app_url(url: &Url, dev: bool) -> bool {
    match (url.scheme(), url.host_str(), url.port()) {
        ("about", None, None) => url.path() == "blank",
        ("tauri", Some("localhost"), None) | ("http" | "https", Some("tauri.localhost"), None) => true,
        ("http", Some("localhost"), Some(1420)) => dev,
        _ => false,
    }
}

fn allows(url: &Url, loaded: bool, dev: bool) -> bool {
    is_app_url(url, dev) && (dev || !loaded)
}

pub fn guard() -> TauriPlugin<Wry> {
    let loaded: Arc<Mutex<HashSet<String>>> = Arc::default();
    let on_navigation = loaded.clone();
    let on_page_load = loaded.clone();
    Builder::new("navigation-guard")
        .on_navigation(move |webview, url| allows(url, on_navigation.lock().unwrap().contains(webview.label()), DEV))
        .on_page_load(move |webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                on_page_load.lock().unwrap().insert(webview.label().to_string());
            }
        })
        .on_event(move |_, event| {
            if let RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } = event {
                loaded.lock().unwrap().remove(label);
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::{allows, is_app_url};

    fn url(text: &str) -> tauri::Url {
        text.parse().unwrap()
    }

    #[test]
    fn keeps_windows_on_the_app() {
        for text in ["tauri://localhost/index.html?transfer=1", "http://tauri.localhost/", "about:blank"] {
            assert!(is_app_url(&url(text), false), "{text}");
        }
        for text in [
            "https://evil.example/",
            "file:///etc/passwd",
            "file://localhost/etc/passwd",
            "http://localhost.evil.example/",
            "http://localhost:3000/",
            "http://localhost/",
            "https://localhost:1420/",
            "http://127.0.0.1:1420/",
            "http://tauri.localhost:8080/",
            "tauri://evil/",
            "ftp://localhost/",
            "about:srcdoc",
            "about:config",
            "data:text/html,hi",
            "blob:tauri://localhost/x",
        ] {
            assert!(!is_app_url(&url(text), false), "{text}");
            assert!(!is_app_url(&url(text), true), "{text}");
        }
    }

    #[test]
    fn only_trusts_local_servers_in_dev_builds() {
        assert!(is_app_url(&url("http://localhost:1420/"), true));
        assert!(!is_app_url(&url("http://localhost:1420/"), false));
    }

    #[test]
    fn refuses_to_leave_a_loaded_window() {
        let app = url("tauri://localhost/");
        assert!(allows(&app, false, false));
        for text in ["tauri://localhost/", "tauri://localhost/other.md", "tauri://localhost/?restore=0"] {
            assert!(!allows(&url(text), true, false), "{text}");
        }
        assert!(allows(&url("http://localhost:1420/"), true, true));
        assert!(!allows(&url("https://evil.example/"), false, true));
    }
}

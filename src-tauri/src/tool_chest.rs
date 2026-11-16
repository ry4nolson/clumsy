use std::path::Path;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Window};

use crate::files::{self, has_extension};
use crate::images::save_dialog;
use crate::{allowed_path, chosen_to_read, documents, file_dialog, header, readable_path};

const EXTENSIONS: [&str; 1] = ["clumsytools"];
const LABEL: &str = "Clumsy Tool Chest";
const MAX_BYTES: usize = 4 * 1024 * 1024;

pub fn is_tool_chest(path: &Path) -> bool {
    has_extension(path, &EXTENSIONS)
}

fn checked_size(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_BYTES { Err("This tool chest file is too large.".into()) } else { Ok(()) }
}

#[tauri::command]
pub async fn pick_tool_chest_save_path(app: AppHandle, window: Window, suggested_name: String) -> Option<String> {
    save_dialog(&app, &window, LABEL, &EXTENSIONS, suggested_name)
}

#[tauri::command]
pub async fn write_tool_chest(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw text bytes".into());
    };
    checked_size(bytes)?;
    let encoded = header(&request, "x-path").ok_or("Missing destination path")?;
    let decoded = percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?;
    let path = allowed_path(&app, &decoded, is_tool_chest)?;
    files::write_file(&path, bytes, true)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn pick_tool_chest(app: AppHandle, window: Window) -> Option<String> {
    let picked = file_dialog(&window).add_filter(LABEL, &EXTENSIONS).blocking_pick_file();
    chosen_to_read(&app, picked?)
}

#[tauri::command]
pub async fn read_tool_chest(app: AppHandle, path: String) -> Result<String, String> {
    let path = readable_path(&app, &path, is_tool_chest)?;
    let bytes = documents::read(&app, &path).map_err(|err| format!("Could not read {}: {err}", path.display()))?;
    checked_size(&bytes)?;
    String::from_utf8(bytes).map_err(|_| format!("{} isn't a Clumsy tool chest.", path.display()))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{MAX_BYTES, checked_size, is_tool_chest};

    #[test]
    fn only_tool_chest_files_qualify() {
        assert!(is_tool_chest(Path::new("/x/Electrical.clumsytools")));
        assert!(is_tool_chest(Path::new("/x/Electrical.CLUMSYTOOLS")));
        assert!(!is_tool_chest(Path::new("/x/Electrical.pdf")));
        assert!(!is_tool_chest(Path::new("/x/Electrical.clumsytools.png")));
        assert!(!is_tool_chest(Path::new("/x/clumsytools")));
    }

    #[test]
    fn refuses_oversized_files() {
        assert!(checked_size(&[0; 16]).is_ok());
        assert!(checked_size(&vec![0; MAX_BYTES + 1]).is_err());
    }
}

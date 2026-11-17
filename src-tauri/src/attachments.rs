use percent_encoding::percent_decode_str;
use tauri::Window;
use tauri::ipc::{InvokeBody, Request};

use crate::{file_dialog, files, header};

const FALLBACK_NAME: &str = "attachment";

fn suggested_name(raw: &str) -> String {
    let last = raw.rsplit(['/', '\\']).next().unwrap_or_default();
    let cleaned: String = last.chars().filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*')).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." { FALLBACK_NAME.into() } else { trimmed.into() }
}

#[tauri::command]
pub async fn save_attachment(window: Window, request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw attachment bytes".into());
    };
    let encoded = header(&request, "x-name").unwrap_or(FALLBACK_NAME);
    let name = percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?;
    let Some(picked) = file_dialog(&window).set_file_name(suggested_name(&name)).blocking_save_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|err| err.to_string())?;
    files::write_atomically(&path, bytes, None)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::suggested_name;

    #[test]
    fn suggestions_are_only_a_file_name() {
        assert_eq!(suggested_name("report.xlsx"), "report.xlsx");
        assert_eq!(suggested_name("../../etc/passwd"), "passwd");
        assert_eq!(suggested_name("C:\\Users\\me\\notes.txt"), "notes.txt");
        assert_eq!(suggested_name("bad<name>?.csv"), "badname.csv");
        assert_eq!(suggested_name("folder/"), "attachment");
        assert_eq!(suggested_name(".."), "attachment");
        assert_eq!(suggested_name("  \u{0007} "), "attachment");
    }
}

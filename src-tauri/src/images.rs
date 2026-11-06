use std::path::PathBuf;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::files::{self, AllowedFolders, is_export_image};
use crate::{allowed_path, header};

fn image_target(app: &AppHandle, request: &Request<'_>) -> Result<(PathBuf, bool), String> {
    let decoded = |name: &str| -> Result<String, String> {
        let encoded = header(request, name).ok_or("Missing destination path")?;
        Ok(percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?.into_owned())
    };
    if header(request, "x-folder").is_none() {
        return Ok((allowed_path(app, &decoded("x-path")?, is_export_image)?, true));
    }
    let (folder, name) = (PathBuf::from(decoded("x-folder")?), decoded("x-name")?);
    let folders = app.state::<AllowedFolders>();
    let path = folders
        .file_in(&folder, &name)
        .ok_or_else(|| format!("Clumsy wasn't given access to {}", folder.join(&name).display()))?;
    let replace = folders.take_replacing(&path);
    Ok((path, replace))
}

#[tauri::command]
pub async fn write_image(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw image bytes".into());
    };
    let (path, overwrite) = image_target(&app, &request)?;
    files::write_file(&path, bytes, overwrite)?;
    Ok(path.to_string_lossy().into_owned())
}

fn replace_prompt(names: &[String], folder: &str) -> String {
    match names {
        [name] => format!("“{name}” already exists in “{folder}”. Replace it?"),
        _ => format!("{} of these images already exist in “{folder}”, including “{}”. Replace them?", names.len(), names[0]),
    }
}

#[tauri::command]
pub async fn confirm_replace(app: AppHandle, window: Window, folder: String, names: Vec<String>) -> Result<bool, String> {
    let folder = PathBuf::from(folder);
    let folders = app.state::<AllowedFolders>();
    if !folders.is_allowed(&folder) {
        return Err(format!("Clumsy wasn't given access to {}", folder.display()));
    }
    let existing = files::existing_files(&folders, &folder, &names);
    if existing.is_empty() {
        return Ok(true);
    }
    let existing_names: Vec<String> = existing.iter().filter_map(|path| path.file_name()).map(|name| name.to_string_lossy().into_owned()).collect();
    let folder_name = folder.file_name().map_or_else(|| folder.to_string_lossy(), |name| name.to_string_lossy());
    let replace = app
        .dialog()
        .message(replace_prompt(&existing_names, &folder_name))
        .title("Replace existing files?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Replace".into(), "Cancel".into()))
        .parent(&window)
        .blocking_show();
    if replace {
        folders.allow_replacing(&existing);
    }
    Ok(replace)
}

#[cfg(test)]
mod tests {
    use super::replace_prompt;

    #[test]
    fn asks_before_replacing_exported_images() {
        assert_eq!(replace_prompt(&["a - page 1.png".into()], "Desktop"), "“a - page 1.png” already exists in “Desktop”. Replace it?");
        assert_eq!(
            replace_prompt(&["a - page 1.png".into(), "a - page 2.png".into()], "Desktop"),
            "2 of these images already exist in “Desktop”, including “a - page 1.png”. Replace them?"
        );
    }
}

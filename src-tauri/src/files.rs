use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub const CHANGED_ON_DISK: &str = "changed-on-disk";

const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| allowed.iter().any(|candidate| ext.eq_ignore_ascii_case(candidate)))
}

pub fn is_pdf(path: &Path) -> bool {
    has_extension(path, &["pdf"])
}

pub fn is_image(path: &Path) -> bool {
    has_extension(path, &IMAGE_EXTENSIONS)
}

pub fn with_pdf_extension(path: PathBuf) -> PathBuf {
    if is_pdf(&path) {
        return path;
    }
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".pdf");
    path.with_file_name(name)
}

pub fn resolve(path: &Path) -> PathBuf {
    if let Ok(real) = fs::canonicalize(path) {
        return real;
    }
    match (path.parent().and_then(|parent| fs::canonicalize(parent).ok()), path.file_name()) {
        (Some(parent), Some(name)) => parent.join(name),
        _ => path.to_path_buf(),
    }
}

#[derive(Default)]
pub struct AllowedPaths(Mutex<HashSet<PathBuf>>);

impl AllowedPaths {
    pub fn allow(&self, path: &Path) {
        self.0.lock().unwrap().insert(resolve(path));
    }

    pub fn is_allowed(&self, path: &Path) -> bool {
        self.0.lock().unwrap().contains(&resolve(path))
    }
}

pub fn stamp(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{modified}:{}", metadata.len()))
}

pub fn write_atomically(path: &Path, bytes: &[u8], expected_stamp: Option<&str>) -> Result<String, String> {
    let target = resolve(path);
    if let Some(expected) = expected_stamp
        && stamp(&target).is_some_and(|current| current != expected)
    {
        return Err(CHANGED_ON_DISK.into());
    }
    let permissions = fs::metadata(&target).ok().map(|metadata| metadata.permissions());
    let tmp = target.with_extension("pdf.saving");
    let result = fs::write(&tmp, bytes)
        .and_then(|_| permissions.map_or(Ok(()), |permissions| fs::set_permissions(&tmp, permissions)))
        .and_then(|_| fs::rename(&tmp, &target));
    if let Err(err) = result {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Could not save {}: {err}", path.display()));
    }
    stamp(&target).ok_or_else(|| format!("Saved {}, but couldn't read it back", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clumsy-files-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn adds_a_pdf_extension_only_when_missing() {
        assert_eq!(with_pdf_extension(PathBuf::from("/a/b.PDF")), PathBuf::from("/a/b.PDF"));
        assert_eq!(with_pdf_extension(PathBuf::from("/a/b")), PathBuf::from("/a/b.pdf"));
        assert_eq!(with_pdf_extension(PathBuf::from("/a/b.txt")), PathBuf::from("/a/b.txt.pdf"));
    }

    #[test]
    fn recognizes_images() {
        assert!(is_image(Path::new("/x/sig.PNG")));
        assert!(!is_image(Path::new("/x/notes.pdf")));
        assert!(!is_image(Path::new("/x/.ssh/id_ed25519")));
    }

    #[test]
    fn allows_only_paths_it_was_given() {
        let dir = scratch("allow");
        let file = dir.join("a.pdf");
        fs::write(&file, b"x").unwrap();
        let allowed = AllowedPaths::default();
        assert!(!allowed.is_allowed(&file));
        allowed.allow(&file);
        assert!(allowed.is_allowed(&file));
        assert!(allowed.is_allowed(&dir.join(".").join("a.pdf")));
        assert!(!allowed.is_allowed(&dir.join("b.pdf")));
    }

    #[test]
    fn allows_a_new_file_before_it_exists() {
        let dir = scratch("new");
        let file = dir.join("new.pdf");
        let allowed = AllowedPaths::default();
        allowed.allow(&file);
        fs::write(&file, b"x").unwrap();
        assert!(allowed.is_allowed(&file));
    }

    #[test]
    fn refuses_to_overwrite_a_file_that_changed() {
        let dir = scratch("stamp");
        let file = dir.join("a.pdf");
        fs::write(&file, b"one").unwrap();
        let opened = stamp(&file).unwrap();
        fs::write(&file, b"changed elsewhere").unwrap();
        assert_eq!(write_atomically(&file, b"mine", Some(&opened)), Err(CHANGED_ON_DISK.into()));
        assert_eq!(fs::read(&file).unwrap(), b"changed elsewhere");
        let saved = write_atomically(&file, b"mine", None).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"mine");
        assert_eq!(write_atomically(&file, b"again", Some(&saved)).map(|_| ()), Ok(()));
    }

    #[cfg(unix)]
    #[test]
    fn saving_through_a_symlink_keeps_the_link_and_permissions() {
        use std::os::unix::fs::{PermissionsExt, symlink};
        let dir = scratch("link");
        let real = dir.join("real.pdf");
        let link = dir.join("link.pdf");
        fs::write(&real, b"old").unwrap();
        fs::set_permissions(&real, fs::Permissions::from_mode(0o600)).unwrap();
        symlink(&real, &link).unwrap();
        write_atomically(&link, b"new", None).unwrap();
        assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(fs::read(&real).unwrap(), b"new");
        assert_eq!(fs::metadata(&real).unwrap().permissions().mode() & 0o777, 0o600);
    }
}

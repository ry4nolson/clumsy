use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub const CHANGED_ON_DISK: &str = "changed-on-disk";
pub const ALREADY_EXISTS: &str = "already-exists";
pub const NOT_WRITABLE: &str = "not-writable";

pub const IMAGE_EXTENSIONS: [&str; 12] = ["png", "jpg", "jpeg", "webp", "gif", "svg", "heic", "heif", "tif", "tiff", "bmp", "avif"];
pub const EXPORT_IMAGE_EXTENSIONS: [&str; 3] = ["png", "jpg", "jpeg"];
pub const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];

fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| allowed.iter().any(|candidate| ext.eq_ignore_ascii_case(candidate)))
}

pub fn is_pdf(path: &Path) -> bool {
    has_extension(path, &["pdf"])
}

pub fn is_markdown(path: &Path) -> bool {
    has_extension(path, &MARKDOWN_EXTENSIONS)
}

pub fn is_document(path: &Path) -> bool {
    is_pdf(path) || is_markdown(path)
}

pub fn is_image(path: &Path) -> bool {
    has_extension(path, &IMAGE_EXTENSIONS)
}

pub fn is_export_image(path: &Path) -> bool {
    has_extension(path, &EXPORT_IMAGE_EXTENSIONS)
}

pub fn with_extension_from(path: PathBuf, allowed: &[&str]) -> PathBuf {
    if has_extension(&path, allowed) {
        return path;
    }
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".");
    name.push(allowed[0]);
    path.with_file_name(name)
}

pub fn with_pdf_extension(path: PathBuf) -> PathBuf {
    with_extension_from(path, &["pdf"])
}

pub fn with_markdown_extension(path: PathBuf) -> PathBuf {
    with_extension_from(path, &MARKDOWN_EXTENSIONS)
}

pub fn plain_file_name(name: &str) -> Option<&str> {
    let mut components = Path::new(name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(part)), None) if part == name && !name.contains(['/', '\\']) => Some(name),
        _ => None,
    }
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

pub fn resolve_linked(document: &Path, href: &str) -> Option<PathBuf> {
    if href.is_empty() || href.contains('\0') {
        return None;
    }
    let target = document.parent()?.join(href);
    fs::canonicalize(target).ok().filter(|path| path.is_file())
}

fn saving_path(path: &Path) -> PathBuf {
    let mut name = std::ffi::OsString::from(".");
    name.push(path.file_name().unwrap_or_default());
    name.push(".saving");
    path.with_file_name(name)
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

#[derive(Default)]
pub struct LinkedPaths(pub AllowedPaths);

#[derive(Default)]
pub struct AllowedFolders(AllowedPaths);

impl AllowedFolders {
    pub fn allow(&self, folder: &Path) {
        self.0.allow(folder);
    }

    pub fn is_allowed(&self, folder: &Path) -> bool {
        folder.is_dir() && self.0.is_allowed(folder)
    }

    pub fn file_in(&self, folder: &Path, name: &str) -> Option<PathBuf> {
        let name = plain_file_name(name)?;
        self.is_allowed(folder).then(|| resolve(folder).join(name))
    }
}

pub fn existing_names(folder: &Path, names: &[String]) -> Vec<String> {
    names
        .iter()
        .filter(|name| plain_file_name(name).is_some_and(|name| fs::symlink_metadata(folder.join(name)).is_ok()))
        .cloned()
        .collect()
}

pub fn write_file(path: &Path, bytes: &[u8], overwrite: bool) -> Result<(), String> {
    let failed = |err: std::io::Error| format!("Could not save {}: {err}", path.display());
    if !overwrite {
        let mut file = OpenOptions::new().write(true).create_new(true).open(path).map_err(|err| match err.kind() {
            ErrorKind::AlreadyExists => ALREADY_EXISTS.to_string(),
            _ => failed(err),
        })?;
        return file.write_all(bytes).map_err(|err| {
            let _ = fs::remove_file(path);
            failed(err)
        });
    }
    let tmp = saving_path(path);
    let result = fs::write(&tmp, bytes).and_then(|_| fs::rename(&tmp, path));
    result.map_err(|err| {
        let _ = fs::remove_file(&tmp);
        failed(err)
    })
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
    let tmp = saving_path(&target);
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
    fn adds_the_first_allowed_extension_when_missing() {
        assert_eq!(with_extension_from(PathBuf::from("/a/b.JPEG"), &["jpg", "jpeg"]), PathBuf::from("/a/b.JPEG"));
        assert_eq!(with_extension_from(PathBuf::from("/a/b"), &["png"]), PathBuf::from("/a/b.png"));
        assert_eq!(with_extension_from(PathBuf::from("/a/b.pdf"), &["jpg", "jpeg"]), PathBuf::from("/a/b.pdf.jpg"));
    }

    #[test]
    fn accepts_only_plain_file_names() {
        assert_eq!(plain_file_name("doc - page 01.png"), Some("doc - page 01.png"));
        for name in ["", ".", "..", "../x.png", "a/b.png", "/x.png", "a\\b.png", "./x.png"] {
            assert_eq!(plain_file_name(name), None, "{name}");
        }
    }

    #[test]
    fn writes_only_into_folders_it_was_given() {
        let dir = scratch("folders");
        let folders = AllowedFolders::default();
        assert_eq!(folders.file_in(&dir, "a.png"), None);
        folders.allow(&dir);
        assert_eq!(folders.file_in(&dir, "a.png"), Some(resolve(&dir).join("a.png")));
        assert_eq!(folders.file_in(&dir, "../a.png"), None);
        assert_eq!(folders.file_in(&dir.join("sub"), "a.png"), None);
    }

    #[test]
    fn refuses_to_replace_a_file_unless_told_to() {
        let dir = scratch("write");
        let file = dir.join("page 1.png");
        write_file(&file, b"one", false).unwrap();
        assert_eq!(write_file(&file, b"two", false), Err(ALREADY_EXISTS.into()));
        assert_eq!(fs::read(&file).unwrap(), b"one");
        assert_eq!(existing_names(&dir, &["page 1.png".into(), "page 2.png".into(), "../page 1.png".into()]), vec!["page 1.png".to_string()]);
        write_file(&file, b"two", true).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn never_writes_through_a_symlink_it_did_not_create() {
        use std::os::unix::fs::symlink;
        let dir = scratch("symlink");
        let outside = dir.join("outside.txt");
        fs::write(&outside, b"keep").unwrap();
        let link = dir.join("page 1.png");
        symlink(&outside, &link).unwrap();
        assert_eq!(write_file(&link, b"x", false), Err(ALREADY_EXISTS.into()));
        write_file(&link, b"x", true).unwrap();
        assert_eq!(fs::read(&outside).unwrap(), b"keep");
        assert!(!fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
    }

    #[test]
    fn recognizes_documents() {
        assert!(is_markdown(Path::new("/x/README.MD")));
        assert!(is_markdown(Path::new("/x/notes.markdown")));
        assert!(is_document(Path::new("/x/a.pdf")));
        assert!(is_document(Path::new("/x/a.md")));
        assert!(!is_document(Path::new("/x/a.mdx")));
        assert!(!is_markdown(Path::new("/x/a.pdf")));
        assert_eq!(with_markdown_extension(PathBuf::from("/a/b")), PathBuf::from("/a/b.md"));
        assert_eq!(with_markdown_extension(PathBuf::from("/a/b.markdown")), PathBuf::from("/a/b.markdown"));
    }

    #[test]
    fn resolves_links_next_to_a_document() {
        let dir = scratch("linked");
        fs::create_dir_all(dir.join("docs/img")).unwrap();
        fs::write(dir.join("docs/README.md"), b"x").unwrap();
        fs::write(dir.join("docs/img/a.png"), b"x").unwrap();
        fs::write(dir.join("logo.png"), b"x").unwrap();
        let document = dir.join("docs/README.md");
        let real = |path: &str| fs::canonicalize(dir.join(path)).unwrap();
        assert_eq!(resolve_linked(&document, "img/a.png"), Some(real("docs/img/a.png")));
        assert_eq!(resolve_linked(&document, "./img/a.png"), Some(real("docs/img/a.png")));
        assert_eq!(resolve_linked(&document, "../logo.png"), Some(real("logo.png")));
        let absolute = real("logo.png");
        assert_eq!(resolve_linked(&document, absolute.to_str().unwrap()), Some(absolute.clone()));
        assert_eq!(resolve_linked(&document, "missing.png"), None);
        assert_eq!(resolve_linked(&document, "img"), None);
        assert_eq!(resolve_linked(&document, ""), None);
    }

    #[test]
    fn saves_markdown_without_a_pdf_temp_name() {
        let dir = scratch("markdown");
        let file = dir.join("notes.md");
        fs::write(&file, b"# one").unwrap();
        write_atomically(&file, b"# two", None).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"# two");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }

    #[test]
    fn recognizes_images() {
        assert!(is_image(Path::new("/x/sig.PNG")));
        assert!(is_image(Path::new("/x/IMG_0001.HEIC")));
        assert!(is_export_image(Path::new("/x/page.jpg")));
        assert!(!is_export_image(Path::new("/x/page.heic")));
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

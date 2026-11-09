use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use crate::lock;
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

pub fn link_root(folder: &Path) -> &Path {
    folder.ancestors().find(|dir| dir.join(".git").exists()).unwrap_or(folder)
}

pub fn resolve_linked(document: &Path, href: &str) -> Option<PathBuf> {
    if href.is_empty() || href.contains('\0') {
        return None;
    }
    let folder = fs::canonicalize(document.parent()?).ok()?;
    let target = fs::canonicalize(folder.join(href)).ok().filter(|path| path.is_file())?;
    target.starts_with(link_root(&folder)).then_some(target)
}

fn saving_path(path: &Path) -> PathBuf {
    let mut name = std::ffi::OsString::from(".");
    name.push(path.file_name().unwrap_or_default());
    name.push(".saving");
    path.with_file_name(name)
}

fn write_new(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if fs::symlink_metadata(path).is_ok() {
        fs::remove_file(path)?;
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(target_os = "macos")]
fn copy_attributes(from: &Path, to: &Path) {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let (Ok(from), Ok(to)) = (CString::new(from.as_os_str().as_bytes()), CString::new(to.as_os_str().as_bytes())) else {
        return;
    };
    unsafe {
        libc::copyfile(from.as_ptr(), to.as_ptr(), std::ptr::null_mut(), libc::COPYFILE_XATTR | libc::COPYFILE_ACL);
    }
}

#[cfg(not(target_os = "macos"))]
fn copy_attributes(_from: &Path, _to: &Path) {}

#[derive(Default)]
pub struct AllowedPaths(Mutex<HashSet<PathBuf>>);

impl AllowedPaths {
    pub fn allow(&self, path: &Path) {
        lock(&self.0).insert(resolve(path));
    }

    pub fn is_allowed(&self, path: &Path) -> bool {
        lock(&self.0).contains(&resolve(path))
    }
}

#[derive(Default)]
pub struct ReadOnlyPaths(pub AllowedPaths);

#[derive(Default)]
pub struct AllowedFolders {
    folders: AllowedPaths,
    replaceable: AllowedPaths,
}

impl AllowedFolders {
    pub fn allow(&self, folder: &Path) {
        self.folders.allow(folder);
    }

    pub fn is_allowed(&self, folder: &Path) -> bool {
        folder.is_dir() && self.folders.is_allowed(folder)
    }

    pub fn file_in(&self, folder: &Path, name: &str) -> Option<PathBuf> {
        let name = plain_file_name(name).filter(|name| is_export_image(Path::new(name)))?;
        self.is_allowed(folder).then(|| resolve(folder).join(name))
    }

    pub fn allow_replacing(&self, files: &[PathBuf]) {
        for file in files {
            self.replaceable.allow(file);
        }
    }

    pub fn take_replacing(&self, file: &Path) -> bool {
        lock(&self.replaceable.0).remove(&resolve(file))
    }
}

pub fn existing_files(folders: &AllowedFolders, folder: &Path, names: &[String]) -> Vec<PathBuf> {
    names
        .iter()
        .filter_map(|name| folders.file_in(folder, name))
        .filter(|path| fs::symlink_metadata(path).is_ok())
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
    let result = write_new(&tmp, bytes).and_then(|_| fs::rename(&tmp, path));
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
    let result = write_new(&tmp, bytes)
        .map(|_| copy_attributes(&target, &tmp))
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
    fn writes_only_images_into_folders_it_was_given() {
        let dir = scratch("folders");
        let folders = AllowedFolders::default();
        assert_eq!(folders.file_in(&dir, "a.png"), None);
        folders.allow(&dir);
        assert_eq!(folders.file_in(&dir, "a.png"), Some(resolve(&dir).join("a.png")));
        assert_eq!(folders.file_in(&dir, "../a.png"), None);
        assert_eq!(folders.file_in(&dir.join("sub"), "a.png"), None);
        for name in ["notes.txt", "a.png.", "a.png ", ".png", "a.pdf"] {
            assert_eq!(folders.file_in(&dir, name), None, "{name}");
        }
    }

    #[test]
    fn refuses_to_replace_a_file_unless_told_to() {
        let dir = scratch("write");
        let file = dir.join("page 1.png");
        write_file(&file, b"one", false).unwrap();
        assert_eq!(write_file(&file, b"two", false), Err(ALREADY_EXISTS.into()));
        assert_eq!(fs::read(&file).unwrap(), b"one");
        write_file(&file, b"two", true).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }

    #[test]
    fn replaces_only_files_the_user_agreed_to_once() {
        let dir = scratch("replace");
        fs::write(dir.join("page 1.png"), b"x").unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        let folders = AllowedFolders::default();
        let names = ["page 1.png", "page 2.png", "../page 1.png", "notes.txt"].map(String::from);
        assert!(existing_files(&folders, &dir, &names).is_empty());
        folders.allow(&dir);
        let existing = existing_files(&folders, &dir, &names);
        assert_eq!(existing, [resolve(&dir).join("page 1.png")]);
        let file = dir.join("page 1.png");
        assert!(!folders.take_replacing(&file));
        folders.allow_replacing(&existing);
        assert!(!folders.take_replacing(&dir.join("page 2.png")));
        assert!(folders.take_replacing(&file));
        assert!(!folders.take_replacing(&file));
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
        let absolute = real("docs/img/a.png");
        assert_eq!(resolve_linked(&document, absolute.to_str().unwrap()), Some(absolute.clone()));
        assert_eq!(resolve_linked(&document, "../logo.png"), None);
        assert_eq!(resolve_linked(&document, real("logo.png").to_str().unwrap()), None);
        assert_eq!(resolve_linked(&document, "missing.png"), None);
        assert_eq!(resolve_linked(&document, "img"), None);
        assert_eq!(resolve_linked(&document, ""), None);
    }

    #[test]
    fn links_reach_the_rest_of_their_repository_only() {
        let dir = scratch("repo");
        let repo = dir.join("repo");
        fs::create_dir_all(repo.join("docs")).unwrap();
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::write(repo.join("docs/guide.md"), b"x").unwrap();
        fs::write(repo.join("logo.png"), b"x").unwrap();
        fs::write(dir.join("secret.png"), b"x").unwrap();
        let document = repo.join("docs/guide.md");
        let real = |path: &Path| fs::canonicalize(path).unwrap();
        assert_eq!(resolve_linked(&document, "../logo.png"), Some(real(&repo.join("logo.png"))));
        assert_eq!(resolve_linked(&document, "../../secret.png"), None);
        assert_eq!(resolve_linked(&document, real(&dir.join("secret.png")).to_str().unwrap()), None);
        assert_eq!(resolve_linked(&document, "/etc/hosts"), None);
    }

    #[cfg(unix)]
    #[test]
    fn links_cannot_leave_through_a_symlink() {
        use std::os::unix::fs::symlink;
        let dir = scratch("linkescape");
        fs::create_dir_all(dir.join("notes")).unwrap();
        fs::write(dir.join("notes/a.md"), b"x").unwrap();
        fs::write(dir.join("secret.png"), b"x").unwrap();
        symlink(dir.join("secret.png"), dir.join("notes/inside.png")).unwrap();
        assert_eq!(resolve_linked(&dir.join("notes/a.md"), "inside.png"), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_planted_temp_symlink_is_replaced_not_followed() {
        use std::os::unix::fs::symlink;
        let dir = scratch("tmplink");
        let outside = dir.join("outside.txt");
        fs::write(&outside, b"keep").unwrap();
        let file = dir.join("a.pdf");
        fs::write(&file, b"old").unwrap();
        symlink(&outside, saving_path(&resolve(&file))).unwrap();
        write_atomically(&file, b"new", None).unwrap();
        assert_eq!(fs::read(&outside).unwrap(), b"keep");
        assert_eq!(fs::read(&file).unwrap(), b"new");
        let image = dir.join("b.png");
        symlink(&outside, saving_path(&image)).unwrap();
        write_file(&image, b"png", true).unwrap();
        assert_eq!(fs::read(&outside).unwrap(), b"keep");
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

    #[cfg(target_os = "macos")]
    #[test]
    fn saving_keeps_extended_attributes() {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        let dir = scratch("xattr");
        let file = dir.join("tagged.pdf");
        fs::write(&file, b"old").unwrap();
        let path = CString::new(file.as_os_str().as_bytes()).unwrap();
        let name = CString::new("com.clumsy.test").unwrap();
        let value = b"kept";
        let set = unsafe { libc::setxattr(path.as_ptr(), name.as_ptr(), value.as_ptr().cast(), value.len(), 0, 0) };
        assert_eq!(set, 0);
        write_atomically(&file, b"new", None).unwrap();
        let mut read = [0u8; 16];
        let size = unsafe { libc::getxattr(path.as_ptr(), name.as_ptr(), read.as_mut_ptr().cast(), read.len(), 0, 0) };
        assert_eq!(fs::read(&file).unwrap(), b"new");
        assert_eq!(&read[..size.max(0) as usize], value);
    }
}

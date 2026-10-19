use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultAppStatus {
    pub supported: bool,
    pub is_default: bool,
    pub current_app: Option<String>,
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::Path;

    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::TCFType;
    use core_foundation::error::CFErrorRef;
    use core_foundation::string::{CFString, CFStringRef};
    use core_foundation::url::CFURL;

    const PDF_CONTENT_TYPE: &str = "com.adobe.pdf";
    const ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSCopyDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32, handler: CFStringRef) -> i32;
        fn LSCopyApplicationURLsForBundleIdentifier(bundle_id: CFStringRef, error: *mut CFErrorRef) -> CFArrayRef;
    }

    pub fn current_handler() -> Option<String> {
        let content_type = CFString::new(PDF_CONTENT_TYPE);
        let handler = unsafe { LSCopyDefaultRoleHandlerForContentType(content_type.as_concrete_TypeRef(), ROLES_ALL) };
        (!handler.is_null()).then(|| unsafe { CFString::wrap_under_create_rule(handler) }.to_string())
    }

    pub fn app_name(bundle_id: &str) -> Option<String> {
        let id = CFString::new(bundle_id);
        let urls = unsafe { LSCopyApplicationURLsForBundleIdentifier(id.as_concrete_TypeRef(), std::ptr::null_mut()) };
        if urls.is_null() {
            return None;
        }
        let urls: CFArray<CFURL> = unsafe { CFArray::wrap_under_create_rule(urls) };
        let path = urls.get(0)?.to_path()?;
        path.file_stem().map(|stem| stem.to_string_lossy().into_owned())
    }

    pub fn set_handler(bundle_id: &str) -> Result<(), String> {
        let content_type = CFString::new(PDF_CONTENT_TYPE);
        let handler = CFString::new(bundle_id);
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(content_type.as_concrete_TypeRef(), ROLES_ALL, handler.as_concrete_TypeRef())
        };
        if status == 0 {
            Ok(())
        } else {
            Err(format!("macOS refused the change (OSStatus {status})"))
        }
    }

    pub fn is_installed_bundle() -> bool {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf))
            .is_some_and(|dir| dir.ends_with("Contents/MacOS") && dir.to_string_lossy().contains(".app/"))
    }
}

#[cfg(target_os = "macos")]
pub fn status(bundle_id: &str) -> DefaultAppStatus {
    let current = platform::current_handler();
    DefaultAppStatus {
        supported: platform::is_installed_bundle(),
        is_default: current.as_deref().is_some_and(|id| id.eq_ignore_ascii_case(bundle_id)),
        current_app: current.as_deref().map(|id| platform::app_name(id).unwrap_or_else(|| id.to_string())),
    }
}

#[cfg(target_os = "macos")]
pub fn make_default(bundle_id: &str) -> Result<DefaultAppStatus, String> {
    if !platform::is_installed_bundle() {
        return Err("Clumsy has to run from its installed .app to become the default PDF app".into());
    }
    platform::set_handler(bundle_id)?;
    Ok(status(bundle_id))
}

#[cfg(not(target_os = "macos"))]
pub fn status(_bundle_id: &str) -> DefaultAppStatus {
    DefaultAppStatus { supported: false, is_default: false, current_app: None }
}

#[cfg(not(target_os = "macos"))]
pub fn make_default(_bundle_id: &str) -> Result<DefaultAppStatus, String> {
    Err("Setting the default PDF app is only supported on macOS".into())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::platform;

    #[test]
    fn reads_the_current_pdf_handler() {
        let handler = platform::current_handler().expect("macOS always has a PDF handler");
        assert!(handler.contains('.'), "expected a bundle identifier, got {handler}");
    }

    #[test]
    fn resolves_app_names_from_bundle_ids() {
        assert_eq!(platform::app_name("com.apple.Preview").as_deref(), Some("Preview"));
        assert_eq!(platform::app_name("com.example.does-not-exist"), None);
    }

    #[test]
    fn test_binaries_are_not_installed_bundles() {
        assert!(!platform::is_installed_bundle());
    }
}

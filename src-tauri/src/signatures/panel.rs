use std::ffi::c_void;

use core_foundation::array::CFArray;
use core_foundation::base::TCFType;
use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject, Bool, Sel};
use objc2_app_kit::NSWindow;
use security_framework::certificate::SecCertificate;
use tauri::Window;

#[link(name = "SecurityInterface", kind = "framework")]
unsafe extern "C" {}

pub enum Shown {
    Panel,
    Busy,
    Unavailable,
}

pub fn show(window: &Window, chain: &[Vec<u8>]) -> Result<Shown, String> {
    let Some(class) = AnyClass::get(c"SFCertificatePanel") else { return Ok(Shown::Unavailable) };
    let certificates: Vec<SecCertificate> = chain.iter().filter_map(|der| SecCertificate::from_der(der).ok()).collect();
    if certificates.is_empty() {
        return Err("That certificate couldn't be read".into());
    }
    let pointer = window.ns_window().map_err(|err| err.to_string())?;
    let ns_window: &NSWindow = unsafe { &*pointer.cast() };
    if ns_window.attachedSheet().is_some() {
        return Ok(Shown::Busy);
    }
    let array = CFArray::from_CFTypes(&certificates);
    let array_object = array.as_concrete_TypeRef() as *mut AnyObject;
    let window_object = pointer as *mut AnyObject;
    unsafe {
        let panel: *mut AnyObject = msg_send![class, sharedCertificatePanel];
        if panel.is_null() {
            return Ok(Shown::Unavailable);
        }
        let _: () = msg_send![
            panel,
            beginSheetForWindow: window_object,
            modalDelegate: std::ptr::null_mut::<AnyObject>(),
            didEndSelector: None::<Sel>,
            contextInfo: std::ptr::null_mut::<c_void>(),
            certificates: array_object,
            showGroup: Bool::NO
        ];
    }
    Ok(Shown::Panel)
}

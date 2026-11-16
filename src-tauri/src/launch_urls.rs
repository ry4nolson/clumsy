use std::sync::OnceLock;

use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{msg_send, sel};

type Connect = unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject, &AnyObject, &AnyObject);

static ORIGINAL: OnceLock<Connect> = OnceLock::new();

unsafe extern "C-unwind" fn connect(this: &AnyObject, cmd: Sel, scene: &AnyObject, session: &AnyObject, options: &AnyObject) {
    unsafe {
        if let Some(original) = ORIGINAL.get() {
            original(this, cmd, scene, session, options);
        }
        let contexts: *mut AnyObject = msg_send![options, URLContexts];
        let Some(contexts) = contexts.as_ref() else {
            return;
        };
        let count: usize = msg_send![contexts, count];
        if count > 0 {
            let () = msg_send![this, scene: scene, openURLContexts: contexts];
        }
    }
}

// tao drops the URLs iOS hands a scene as it connects, so a file that launches the app
// never arrives as an Opened event. Pass them to tao's own openURLContexts handler.
pub fn install() {
    let Some(method) = AnyClass::get(c"TaoSceneDelegate").and_then(|class| class.instance_method(sel!(scene:willConnectToSession:options:)))
    else {
        return;
    };
    unsafe {
        let replacement = std::mem::transmute::<Connect, Imp>(connect);
        let original = method.set_implementation(replacement);
        let _ = ORIGINAL.set(std::mem::transmute::<Imp, Connect>(original));
    }
}

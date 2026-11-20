const BUTTONS_X: f64 = 16.0;
const NEW_DESIGN_Y: f64 = 24.5;
const LEGACY_Y: f64 = 20.5;

#[tauri::command]
pub fn traffic_light_position() -> (f64, f64) {
    (BUTTONS_X, if new_design() { NEW_DESIGN_Y } else { LEGACY_Y })
}

#[cfg(target_os = "macos")]
pub fn create_main_window(app: &tauri::App) -> tauri::Result<()> {
    let Some(config) = app.config().app.windows.iter().find(|window| window.label == "main") else {
        return Ok(());
    };
    let (x, y) = traffic_light_position();
    tauri::WebviewWindowBuilder::from_config(app, config)?
        .traffic_light_position(tauri::LogicalPosition::new(x, y))
        .build()?;
    Ok(())
}

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("title-bar")
        .on_window_ready(|window| {
            #[cfg(target_os = "macos")]
            keep_buttons_placed(&window);
            #[cfg(not(target_os = "macos"))]
            let _ = window;
        })
        .build()
}

#[cfg(target_os = "macos")]
fn keep_buttons_placed<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    let pointer = pointer as usize;
    let (x, y) = traffic_light_position();
    let _ = window.run_on_main_thread(move || {
        let window = unsafe { &*(pointer as *const objc2_app_kit::NSWindow) };
        watch_buttons(window, x, y);
    });
}

#[cfg(target_os = "macos")]
fn watch_buttons(window: &objc2_app_kit::NSWindow, x: f64, y: f64) {
    use objc2_app_kit::{NSViewFrameDidChangeNotification, NSWindowButton};
    use objc2_foundation::{NSNotification, NSNotificationCenter};
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(bar) = title_bar_view(&close) else {
        return;
    };
    let button_y = close.frame().origin.y;
    place_buttons(window, x, y, button_y);
    let weak = objc2::rc::Weak::new(window);
    let waiting = std::rc::Rc::new(std::cell::Cell::new(false));
    let block = block2::RcBlock::new(move |_: std::ptr::NonNull<NSNotification>| {
        if waiting.replace(true) {
            return;
        }
        let Some(main) = objc2::MainThreadMarker::new() else {
            return;
        };
        let state = dispatch2::MainThreadBound::new((weak.clone(), waiting.clone()), main);
        dispatch2::DispatchQueue::main().exec_async(move || {
            let main = unsafe { objc2::MainThreadMarker::new_unchecked() };
            let (weak, waiting) = state.get(main);
            waiting.set(false);
            if let Some(window) = weak.load() {
                place_buttons(&window, x, y, button_y);
            }
        });
    });
    let center = NSNotificationCenter::defaultCenter();
    for view in [&**close, &*bar] {
        view.setPostsFrameChangedNotifications(true);
        let observer = unsafe { center.addObserverForName_object_queue_usingBlock(Some(NSViewFrameDidChangeNotification), Some(view), None, &block) };
        std::mem::forget(observer);
    }
}

#[cfg(target_os = "macos")]
fn place_buttons(window: &objc2_app_kit::NSWindow, x: f64, y: f64, button_y: f64) {
    use objc2_app_kit::{NSWindowButton, NSWindowStyleMask};
    const TOLERANCE: f64 = 0.01;
    if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
        return;
    }
    let buttons = [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton].map(|kind| window.standardWindowButton(kind));
    let [Some(close), Some(minimize), Some(zoom)] = buttons else {
        return;
    };
    let Some(bar) = title_bar_view(&close) else {
        return;
    };
    let close_frame = close.frame();
    let height = close_frame.size.height + y;
    let top = window.frame().size.height - height;
    let mut bar_frame = bar.frame();
    if (bar_frame.size.height - height).abs() > TOLERANCE || (bar_frame.origin.y - top).abs() > TOLERANCE {
        bar_frame.size.height = height;
        bar_frame.origin.y = top;
        bar.setFrame(bar_frame);
    }
    let spacing = minimize.frame().origin.x - close_frame.origin.x;
    for (index, button) in [close, minimize, zoom].iter().enumerate() {
        let mut origin = button.frame().origin;
        let wanted = x + index as f64 * spacing;
        if (origin.x - wanted).abs() > TOLERANCE || (origin.y - button_y).abs() > TOLERANCE {
            origin.x = wanted;
            origin.y = button_y;
            button.setFrameOrigin(origin);
        }
    }
}

#[cfg(target_os = "macos")]
fn title_bar_view(close: &objc2_app_kit::NSButton) -> Option<objc2::rc::Retained<objc2_app_kit::NSView>> {
    unsafe { close.superview()?.superview() }
}

#[cfg(target_os = "macos")]
fn new_design() -> bool {
    let os = objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersion().majorVersion;
    os >= 26 && linked_sdk_major() >= 26
}

#[cfg(not(target_os = "macos"))]
fn new_design() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn linked_sdk_major() -> u32 {
    const LC_BUILD_VERSION: u32 = 0x32;
    const HEADER_SIZE: usize = 32;
    unsafe extern "C" {
        fn _dyld_get_image_header(index: u32) -> *const u8;
    }
    unsafe {
        let header = _dyld_get_image_header(0);
        if header.is_null() {
            return 0;
        }
        let count = (header.add(16) as *const u32).read_unaligned();
        let mut command = header.add(HEADER_SIZE);
        for _ in 0..count {
            let kind = (command as *const u32).read_unaligned();
            let size = (command.add(4) as *const u32).read_unaligned();
            if kind == LC_BUILD_VERSION {
                return (command.add(16) as *const u32).read_unaligned() >> 16;
            }
            command = command.add(size as usize);
        }
    }
    0
}

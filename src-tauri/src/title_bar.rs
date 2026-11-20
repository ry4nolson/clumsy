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

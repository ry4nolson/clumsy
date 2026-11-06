use percent_encoding::percent_decode_str;
use tauri::Window;
use tauri::ipc::{InvokeBody, Request};

const NAME_LIMIT: usize = 200;
const FALLBACK_NAME: &str = "Document";

fn job_name(encoded: Option<&str>) -> String {
    let decoded = encoded.and_then(|value| percent_decode_str(value).decode_utf8().ok()).unwrap_or_default();
    let cleaned: String = decoded
        .chars()
        .filter(|character| !character.is_control())
        .map(|character| if matches!(character, '/' | '\\' | ':') { '-' } else { character })
        .take(NAME_LIMIT)
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() { FALLBACK_NAME.into() } else { trimmed.into() }
}

fn print_body(body: &InvokeBody) -> Result<&[u8], String> {
    match body {
        InvokeBody::Raw(bytes) if !bytes.is_empty() => Ok(bytes),
        _ => Err("Expected raw PDF bytes".into()),
    }
}

#[tauri::command]
pub async fn print_pdf(window: Window, request: Request<'_>) -> Result<String, String> {
    let bytes = print_body(request.body())?.to_vec();
    let name = job_name(crate::header(&request, "x-name"));
    show_print_panel(window, bytes, name).await
}

#[cfg(target_os = "macos")]
async fn show_print_panel(window: Window, bytes: Vec<u8>, name: String) -> Result<String, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = sender.send(macos::print(&target, bytes, &name));
        })
        .map_err(|err| err.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|_| "The print panel didn't open".to_string())?
}

#[cfg(not(target_os = "macos"))]
async fn show_print_panel(_window: Window, _bytes: Vec<u8>, _name: String) -> Result<String, String> {
    Err("Printing isn't available on this platform yet".into())
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::rc::Retained;
    use objc2::{AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
    use objc2_app_kit::{NSGraphicsContext, NSPrintInfo, NSPrintOperation, NSPrintPanelOptions, NSView, NSWindow};
    use objc2_core_graphics::CGContext;
    use objc2_foundation::{NSCopying, NSData, NSInteger, NSPoint, NSRange, NSRect, NSSize, NSString};
    use objc2_pdf_kit::{PDFDisplayBox, PDFDocument, PDFPage};
    use tauri::Window;

    use crate::print_layout::{Rect, pages_in, place, upright_size};

    const LETTER: NSSize = NSSize { width: 612.0, height: 792.0 };

    pub struct Pages {
        document: Retained<PDFDocument>,
    }

    define_class!(
        #[unsafe(super(NSView))]
        #[thread_kind = MainThreadOnly]
        #[name = "ClumsyPrintView"]
        #[ivars = Pages]
        pub struct PrintView;

        impl PrintView {
            #[unsafe(method(knowsPageRange:))]
            fn knows_page_range(&self, range: *mut NSRange) -> bool {
                let count = self.page_count();
                let paper = self.paper();
                self.setFrameSize(NSSize::new(paper.width, paper.height * count.max(1) as f64));
                if !range.is_null() {
                    unsafe { range.write(NSRange::new(1, count)) };
                }
                true
            }

            #[unsafe(method(rectForPage:))]
            fn rect_for_page(&self, number: NSInteger) -> NSRect {
                self.slot(number - 1)
            }

            #[unsafe(method(drawRect:))]
            fn draw_rect(&self, dirty: NSRect) {
                let Some(context) = NSGraphicsContext::currentContext() else {
                    return;
                };
                let context = context.CGContext();
                let paper = self.paper();
                let printable = self.printable(paper);
                for index in pages_in(dirty.min().y, dirty.max().y, paper.height, self.page_count()) {
                    if let Some(page) = unsafe { self.ivars().document.pageAtIndex(index) } {
                        let slot = NSRect::new(NSPoint::new(0.0, paper.height * index as f64), paper);
                        draw_page(&context, &page, slot, printable);
                    }
                }
            }
        }
    );

    impl PrintView {
        fn new(document: Retained<PDFDocument>, mtm: MainThreadMarker) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(Pages { document });
            unsafe { msg_send![super(this), initWithFrame: NSRect::ZERO] }
        }

        fn page_count(&self) -> usize {
            unsafe { self.ivars().document.pageCount() }
        }

        fn print_info(&self) -> Option<Retained<NSPrintInfo>> {
            NSPrintOperation::currentOperation(self.mtm()).map(|operation| operation.printInfo())
        }

        fn paper(&self) -> NSSize {
            self.print_info().map(|info| info.paperSize()).filter(|size| size.width > 0.0 && size.height > 0.0).unwrap_or(LETTER)
        }

        fn slot(&self, index: NSInteger) -> NSRect {
            let paper = self.paper();
            NSRect::new(NSPoint::new(0.0, paper.height * index.max(0) as f64), paper)
        }

        fn printable(&self, paper: NSSize) -> Rect {
            let area = self
                .print_info()
                .map(|info| info.imageablePageBounds())
                .filter(|area| area.size.width > 0.0 && area.size.height > 0.0)
                .unwrap_or(NSRect::new(NSPoint::ZERO, paper));
            Rect { x: area.origin.x, y: area.origin.y, width: area.size.width, height: area.size.height }
        }
    }

    fn draw_page(context: &CGContext, page: &PDFPage, slot: NSRect, printable: Rect) {
        let bounds = unsafe { page.boundsForBox(PDFDisplayBox::CropBox) }.size;
        let (width, height) = upright_size(bounds.width, bounds.height, unsafe { page.rotation() } as i64);
        if width <= 0.0 || height <= 0.0 {
            return;
        }
        let placement = place((width, height), (slot.size.width, slot.size.height), printable);
        CGContext::save_g_state(Some(context));
        CGContext::translate_ctm(Some(context), slot.origin.x + placement.x, slot.origin.y + placement.y);
        if placement.turned {
            CGContext::translate_ctm(Some(context), height * placement.scale, 0.0);
            CGContext::rotate_ctm(Some(context), std::f64::consts::FRAC_PI_2);
        }
        CGContext::scale_ctm(Some(context), placement.scale, placement.scale);
        unsafe { page.drawWithBox_toContext(PDFDisplayBox::CropBox, context) };
        CGContext::restore_g_state(Some(context));
    }

    pub fn print(window: &Window, bytes: Vec<u8>, name: &str) -> Result<String, String> {
        let mtm = MainThreadMarker::new().ok_or("Printing must start on the main thread")?;
        let pointer = window.ns_window().map_err(|err| err.to_string())?;
        if pointer.is_null() {
            return Err("This window can't print".into());
        }
        let ns_window: &NSWindow = unsafe { &*pointer.cast() };
        if ns_window.attachedSheet().is_some() {
            return Ok("busy".into());
        }
        let data = NSData::from_vec(bytes);
        let Some(document) = (unsafe { PDFDocument::initWithData(PDFDocument::alloc(), &data) }) else {
            return Ok("unreadable".into());
        };
        if unsafe { document.isLocked() } || unsafe { document.pageCount() } == 0 {
            return Ok("unreadable".into());
        }
        let info: Retained<NSPrintInfo> = NSPrintInfo::sharedPrintInfo().copy();
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setHorizontallyCentered(true);
        info.setVerticallyCentered(true);
        let view = PrintView::new(document, mtm);
        let operation = NSPrintOperation::printOperationWithView_printInfo(&view, &info);
        operation.setJobTitle(Some(&NSString::from_str(name)));
        operation.setShowsPrintPanel(true);
        operation.setShowsProgressPanel(true);
        let panel = operation.printPanel();
        panel.setOptions(panel.options() | NSPrintPanelOptions::ShowsPaperSize | NSPrintPanelOptions::ShowsOrientation | NSPrintPanelOptions::ShowsPreview);
        unsafe { operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(ns_window, None, None, std::ptr::null_mut()) };
        Ok("shown".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{job_name, print_body};
    use tauri::ipc::InvokeBody;

    #[test]
    fn takes_only_raw_pdf_bytes() {
        assert_eq!(print_body(&InvokeBody::Raw(b"%PDF-1.7".to_vec())), Ok(&b"%PDF-1.7"[..]));
        assert!(print_body(&InvokeBody::Raw(Vec::new())).is_err());
        assert!(print_body(&InvokeBody::Json(serde_json::json!({ "bytes": [37, 80] }))).is_err());
    }

    #[test]
    fn names_the_print_job_after_the_document() {
        assert_eq!(job_name(Some("Lease%20agreement.pdf")), "Lease agreement.pdf");
        assert_eq!(job_name(Some("caf%C3%A9.pdf")), "café.pdf");
    }

    #[test]
    fn keeps_separators_and_control_characters_out_of_the_job_name() {
        assert_eq!(job_name(Some("..%2F..%2Fetc%2Fpasswd")), "..-..-etc-passwd");
        assert_eq!(job_name(Some("a%0Ab%09c:d%5Ce")), "abc-d-e");
    }

    #[test]
    fn falls_back_when_the_job_name_is_missing_or_unreadable() {
        assert_eq!(job_name(None), "Document");
        assert_eq!(job_name(Some("%20%20")), "Document");
        assert_eq!(job_name(Some("%FF%FE")), "Document");
    }

    #[test]
    fn caps_the_job_name_length() {
        assert_eq!(job_name(Some(&"a".repeat(500))).chars().count(), 200);
    }
}

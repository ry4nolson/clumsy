use serde::Deserialize;
use tauri::Webview;

const MAX_ENTRIES: usize = 64;
const MAX_DEPTH: usize = 2;
const LABEL_LIMIT: usize = 80;
const TEXT_LIMIT: usize = 8192;

const SYMBOLS: &[&str] = &[
    "cursorarrow",
    "hand.raised",
    "highlighter",
    "character.textbox",
    "pencil.tip",
    "text.bubble",
    "photo.badge.plus",
    "signature",
    "checkmark.square",
];

#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Entry {
    Item {
        id: String,
        label: String,
        #[serde(default = "enabled_by_default")]
        enabled: bool,
        #[serde(default)]
        checked: Option<bool>,
    },
    Copy {
        label: String,
    },
    CopyText {
        label: String,
        text: String,
    },
    Separator,
    Submenu {
        label: String,
        items: Vec<Entry>,
    },
}

fn enabled_by_default() -> bool {
    true
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct Section {
    #[serde(default)]
    pub header: Option<String>,
    pub items: Vec<Entry>,
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct PaletteItem {
    pub id: String,
    pub label: String,
    pub symbol: String,
    pub checked: bool,
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct Palette {
    pub label: String,
    pub items: Vec<PaletteItem>,
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct MenuSpec {
    #[serde(default)]
    pub palette: Option<Palette>,
    pub sections: Vec<Section>,
}

pub fn symbol_name(name: &str) -> Option<&'static str> {
    SYMBOLS.iter().copied().find(|symbol| *symbol == name)
}

fn clean_label(label: &str) -> String {
    label.chars().filter(|character| !character.is_control()).take(LABEL_LIMIT).collect()
}

fn clean_entries(entries: Vec<Entry>, depth: usize) -> Vec<Entry> {
    let mut cleaned: Vec<Entry> = Vec::new();
    for entry in entries.into_iter().take(MAX_ENTRIES) {
        let entry = match entry {
            Entry::Item { id, label, enabled, checked } => Entry::Item { id, label: clean_label(&label), enabled, checked },
            Entry::Copy { label } => Entry::Copy { label: clean_label(&label) },
            Entry::CopyText { label, text } => Entry::CopyText { label: clean_label(&label), text: text.chars().take(TEXT_LIMIT).collect() },
            Entry::Separator if cleaned.last().is_none_or(|last| *last == Entry::Separator) => continue,
            Entry::Separator => Entry::Separator,
            Entry::Submenu { .. } if depth >= MAX_DEPTH => continue,
            Entry::Submenu { label, items } => {
                let items = clean_entries(items, depth + 1);
                if items.is_empty() {
                    continue;
                }
                Entry::Submenu { label: clean_label(&label), items }
            }
        };
        cleaned.push(entry);
    }
    if cleaned.last() == Some(&Entry::Separator) {
        cleaned.pop();
    }
    cleaned
}

impl MenuSpec {
    pub fn cleaned(self) -> MenuSpec {
        let palette = self.palette.and_then(|palette| {
            let items: Vec<PaletteItem> = palette
                .items
                .into_iter()
                .take(MAX_ENTRIES)
                .map(|item| PaletteItem { label: clean_label(&item.label), ..item })
                .collect();
            (!items.is_empty()).then(|| Palette { label: clean_label(&palette.label), items })
        });
        let sections = self
            .sections
            .into_iter()
            .take(MAX_ENTRIES)
            .filter_map(|section| {
                let items = clean_entries(section.items, 1);
                (!items.is_empty()).then(|| Section { header: section.header.map(|header| clean_label(&header)), items })
            })
            .collect();
        MenuSpec { palette, sections }
    }
}

#[tauri::command]
pub async fn show_document_menu(webview: Webview, spec: MenuSpec, x: f64, y: f64) -> Result<Option<String>, String> {
    show(webview, spec.cleaned(), x, y).await
}

#[cfg(target_os = "macos")]
async fn show(webview: Webview, spec: MenuSpec, x: f64, y: f64) -> Result<Option<String>, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    webview
        .with_webview(move |platform| {
            let _ = sender.send(macos::show(platform.inner(), &spec, x, y));
        })
        .map_err(|err| err.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|_| "The menu didn't open".to_string())?
}

#[cfg(not(target_os = "macos"))]
async fn show(_webview: Webview, _spec: MenuSpec, _x: f64, _y: f64) -> Result<Option<String>, String> {
    Err("The native document menu is only available on macOS".into())
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::Cell;
    use std::ffi::c_void;

    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, NSObject, Sel};
    use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
    use objc2_app_kit::{NSImage, NSMenu, NSMenuItem, NSMenuPresentationStyle, NSMenuSelectionMode, NSPasteboard, NSPasteboardTypeString, NSView};
    use objc2_foundation::{NSInteger, NSPoint, NSString};

    use super::{Entry, MenuSpec, symbol_name};

    const ON: NSInteger = 1;

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "ClumsyMenuTarget"]
        #[ivars = Cell<NSInteger>]
        struct MenuTarget;

        impl MenuTarget {
            #[unsafe(method(choose:))]
            fn choose(&self, sender: &NSMenuItem) {
                self.ivars().set(sender.tag());
            }
        }
    );

    impl MenuTarget {
        fn new(mtm: MainThreadMarker) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(Cell::new(-1));
            unsafe { msg_send![super(this), init] }
        }
    }

    enum Choice {
        Return(String),
        Copy(String),
    }

    struct Builder<'a> {
        mtm: MainThreadMarker,
        target: &'a MenuTarget,
        choices: Vec<Choice>,
    }

    impl Builder<'_> {
        fn menu(&self, title: &str) -> Retained<NSMenu> {
            let menu = NSMenu::initWithTitle(NSMenu::alloc(self.mtm), &NSString::from_str(title));
            menu.setAutoenablesItems(false);
            menu
        }

        fn item(&self, label: &str, action: Option<Sel>) -> Retained<NSMenuItem> {
            unsafe { NSMenuItem::initWithTitle_action_keyEquivalent(NSMenuItem::alloc(self.mtm), &NSString::from_str(label), action, &NSString::new()) }
        }

        fn choice(&mut self, choice: Choice, label: &str) -> Retained<NSMenuItem> {
            let item = self.item(label, Some(sel!(choose:)));
            let target: &AnyObject = self.target;
            unsafe { item.setTarget(Some(target)) };
            item.setTag(self.choices.len() as NSInteger);
            self.choices.push(choice);
            item
        }

        fn add_entries(&mut self, menu: &NSMenu, entries: &[Entry]) {
            for entry in entries {
                let item = match entry {
                    Entry::Item { id, label, enabled, checked } => {
                        let item = self.choice(Choice::Return(id.clone()), label);
                        item.setEnabled(*enabled);
                        if *checked == Some(true) {
                            item.setState(ON);
                        }
                        item
                    }
                    Entry::Copy { label } => self.item(label, Some(sel!(copy:))),
                    Entry::CopyText { label, text } => self.choice(Choice::Copy(text.clone()), label),
                    Entry::Separator => NSMenuItem::separatorItem(self.mtm),
                    Entry::Submenu { label, items } => {
                        let submenu = self.menu(label);
                        self.add_entries(&submenu, items);
                        let item = self.item(label, None);
                        item.setSubmenu(Some(&submenu));
                        item
                    }
                };
                menu.addItem(&item);
            }
        }

        fn build(&mut self, spec: &MenuSpec) -> Retained<NSMenu> {
            let menu = self.menu("");
            if let Some(palette) = &spec.palette {
                let row = self.menu(&palette.label);
                row.setPresentationStyle(NSMenuPresentationStyle::Palette);
                row.setSelectionMode(NSMenuSelectionMode::SelectOne);
                for tool in &palette.items {
                    let item = self.choice(Choice::Return(tool.id.clone()), &tool.label);
                    let description = NSString::from_str(&tool.label);
                    if let Some(image) = symbol_name(&tool.symbol).and_then(|name| NSImage::imageWithSystemSymbolName_accessibilityDescription(&NSString::from_str(name), Some(&description))) {
                        item.setImage(Some(&image));
                    }
                    item.setToolTip(Some(&description));
                    if tool.checked {
                        item.setState(ON);
                    }
                    row.addItem(&item);
                }
                let parent = self.item(&palette.label, None);
                parent.setSubmenu(Some(&row));
                menu.addItem(&parent);
            }
            for (index, section) in spec.sections.iter().enumerate() {
                if index > 0 || spec.palette.is_some() {
                    menu.addItem(&NSMenuItem::separatorItem(self.mtm));
                }
                if let Some(header) = &section.header {
                    menu.addItem(&NSMenuItem::sectionHeaderWithTitle(&NSString::from_str(header), self.mtm));
                }
                self.add_entries(&menu, &section.items);
            }
            menu
        }
    }

    pub fn show(pointer: *mut c_void, spec: &MenuSpec, x: f64, y: f64) -> Result<Option<String>, String> {
        let mtm = MainThreadMarker::new().ok_or("The menu must open on the main thread")?;
        if pointer.is_null() || spec.sections.is_empty() && spec.palette.is_none() {
            return Ok(None);
        }
        let view: &NSView = unsafe { &*pointer.cast() };
        let target = MenuTarget::new(mtm);
        let mut builder = Builder { mtm, target: &target, choices: Vec::new() };
        let menu = builder.build(spec);
        let height = view.bounds().size.height;
        let location = NSPoint::new(x, if view.isFlipped() { y } else { height - y });
        if !menu.popUpMenuPositioningItem_atLocation_inView(None, location, Some(view)) {
            return Ok(None);
        }
        let chosen = usize::try_from(target.ivars().get()).ok().and_then(|index| builder.choices.get(index));
        Ok(match chosen {
            Some(Choice::Return(id)) => Some(id.clone()),
            Some(Choice::Copy(text)) => {
                let pasteboard = NSPasteboard::generalPasteboard();
                pasteboard.clearContents();
                pasteboard.setString_forType(&NSString::from_str(text), unsafe { NSPasteboardTypeString });
                None
            }
            None => None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> Entry {
        Entry::Item { id: id.into(), label: id.into(), enabled: true, checked: None }
    }

    fn parse(json: &str) -> MenuSpec {
        serde_json::from_str::<MenuSpec>(json).unwrap().cleaned()
    }

    #[test]
    fn parses_the_spec_the_app_sends() {
        let spec = parse(
            r#"{"palette":{"label":"Tools","items":[{"id":"toolSelect","label":"Select","symbol":"cursorarrow","checked":true}]},
                "sections":[{"items":[{"kind":"copy","label":"Copy"},{"kind":"item","id":"goBack","label":"Go Back","enabled":false},
                {"kind":"submenu","label":"Zoom","items":[{"kind":"item","id":"fitWidth","label":"Fit Width","checked":true}]}]},
                {"header":"Page 3","items":[{"kind":"item","id":"rotatePagesLeft","label":"Rotate Page Left"}]}]}"#,
        );
        assert_eq!(spec.palette.as_ref().unwrap().items[0].id, "toolSelect");
        assert_eq!(spec.sections.len(), 2);
        assert_eq!(spec.sections[0].items[1], Entry::Item { id: "goBack".into(), label: "Go Back".into(), enabled: false, checked: None });
        assert_eq!(spec.sections[1].header.as_deref(), Some("Page 3"));
    }

    #[test]
    fn drops_empty_sections_palettes_and_submenus() {
        let spec = parse(
            r#"{"palette":{"label":"Tools","items":[]},"sections":[{"items":[]},{"items":[{"kind":"separator"}]},
                {"items":[{"kind":"submenu","label":"Zoom","items":[]},{"kind":"item","id":"zoomIn","label":"Zoom In"}]}]}"#,
        );
        assert!(spec.palette.is_none());
        assert_eq!(spec.sections, vec![Section { header: None, items: vec![Entry::Item { id: "zoomIn".into(), label: "Zoom In".into(), enabled: true, checked: None }] }]);
    }

    #[test]
    fn trims_stray_separators() {
        let items = clean_entries(vec![Entry::Separator, item("a"), Entry::Separator, Entry::Separator, item("b"), Entry::Separator], 1);
        assert_eq!(items, vec![item("a"), Entry::Separator, item("b")]);
    }

    #[test]
    fn limits_nesting_and_label_length() {
        let deep = Entry::Submenu { label: "1".into(), items: vec![Entry::Submenu { label: "2".into(), items: vec![item("a")] }, item("b")] };
        assert_eq!(clean_entries(vec![deep], 1), vec![Entry::Submenu { label: "1".into(), items: vec![item("b")] }]);
        let long = clean_entries(vec![Entry::Copy { label: format!("{}\u{7}", "x".repeat(200)) }], 1);
        assert_eq!(long, vec![Entry::Copy { label: "x".repeat(LABEL_LIMIT) }]);
        let text = clean_entries(vec![Entry::CopyText { label: "Copy Link".into(), text: "y".repeat(TEXT_LIMIT + 5) }], 1);
        assert_eq!(text, vec![Entry::CopyText { label: "Copy Link".into(), text: "y".repeat(TEXT_LIMIT) }]);
    }

    #[test]
    fn only_known_symbols_get_images() {
        assert_eq!(symbol_name("highlighter"), Some("highlighter"));
        assert_eq!(symbol_name("../../etc"), None);
        assert_eq!(symbol_name(""), None);
    }

    #[test]
    fn rejects_unknown_entry_kinds() {
        assert!(serde_json::from_str::<MenuSpec>(r#"{"sections":[{"items":[{"kind":"script"}]}]}"#).is_err());
    }
}

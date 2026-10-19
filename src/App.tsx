import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationEditorParamsType } from "pdfjs-dist";
import { AboutDialog, type AboutTab } from "./components/AboutDialog";
import { DefaultAppDialog, type DefaultAppRequest } from "./components/DefaultAppDialog";
import { DocumentTab, type DocumentHandle, type TabSnapshot } from "./components/DocumentTab";
import { PasswordDialog } from "./components/PasswordDialog";
import { SignatureDialog } from "./components/SignatureDialog";
import { TabStrip, type TabItem } from "./components/TabStrip";
import { Toolbar, inkColors } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
import { highlightColors, type EditorTool } from "./hooks/usePdfViewer";
import { SNOOZE_MS, shouldPromptForDefault, type DefaultAppPreference } from "./lib/defaultApp";
import type { RecentEntry } from "./lib/recent";
import {
  clearRecentFiles,
  closeWindow,
  confirmDiscard,
  downloadPdf,
  fileNameFromPath,
  getDefaultAppStatus,
  getRecentFiles,
  hasOverlayTitlebar,
  isDesktop,
  makeDefaultApp,
  onAboutRequested,
  onCloseRequested,
  onFileDrop,
  onFullscreenChange,
  onMakeDefaultRequested,
  onOpenedFiles,
  onRecentFileEvents,
  onTabMenuEvents,
  openExternal,
  pickPdf,
  pickSavePath,
  readPdfFromPath,
  recordRecentFile,
  removeRecentFile,
  setWindowTitle,
  showError,
  writePdf,
  type PdfSource,
} from "./lib/platform";
import { usePersistentState, useSystemDarkMode } from "./lib/preferences";
import { isTypingTarget, resolveShortcut, type ShortcutAction } from "./lib/shortcuts";
import { cycleTab, insertAfter, removeTab } from "./lib/tabs";

type StartTab = { id: string; kind: "start" };
type DocTab = {
  id: string;
  kind: "document";
  source: PdfSource;
  name: string;
  path: string | null;
  replaces: string | null;
  returnTo: string | null;
};
type Tab = StartTab | DocTab;

type PasswordPrompt = { fileName: string; incorrect: boolean; resolve: (password: string | null) => void };

const colorParams: Partial<Record<EditorTool, number>> = {
  highlight: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
  text: AnnotationEditorParamsType.FREETEXT_COLOR,
  draw: AnnotationEditorParamsType.INK_COLOR,
};

const tabShortcuts: Partial<Record<ShortcutAction, number>> = {
  tab1: 0,
  tab2: 1,
  tab3: 2,
  tab4: 3,
  tab5: 4,
  tab6: 5,
  tab7: 6,
  tab8: 7,
};

const isMac = navigator.userAgent.includes("Mac");

let tabCounter = 0;
const createStartTab = (): StartTab => ({ id: `tab-${++tabCounter}`, kind: "start" });

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>(() => [createStartTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [snapshots, setSnapshots] = useState<Record<string, TabSnapshot>>({});
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = usePersistentState("clumsy.sidebar", true);
  const [darkPagesPreference, setDarkPagesPreference] = usePersistentState<"auto" | "on" | "off">("clumsy.darkPages", "auto");
  const [darkPagesImages, setDarkPagesImages] = usePersistentState<"keep" | "invert">("clumsy.darkPagesImages", "keep");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [passwordPrompts, setPasswordPrompts] = useState<PasswordPrompt[]>([]);
  const [aboutRequest, setAboutRequest] = useState<{ tab: AboutTab; checkForUpdates: boolean; token: number } | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentEntry[] | null>(null);
  const [defaultAppRequest, setDefaultAppRequest] = useState<DefaultAppRequest | null>(null);
  const [defaultAppPreference, setDefaultAppPreference] = usePersistentState<DefaultAppPreference>("clumsy.defaultAppPrompt", null);
  const [toolColors, setToolColors] = useState<Record<string, string>>({
    highlight: Object.values(highlightColors)[0],
    text: inkColors[0],
    draw: inkColors[0],
  });
  const systemDark = useSystemDarkMode();
  const darkPages = darkPagesPreference === "on" || (darkPagesPreference === "auto" && systemDark);

  const handles = useRef(new Map<string, DocumentHandle>());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef(tabs);
  const activeIdRef = useRef(activeId);
  const snapshotsRef = useRef(snapshots);
  tabsRef.current = tabs;
  activeIdRef.current = activeId;
  snapshotsRef.current = snapshots;

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const activeSnapshot = activeTab.kind === "document" ? snapshots[activeTab.id] : undefined;
  const hasDocument = !!activeSnapshot?.loaded;
  const activeHandle = () => handles.current.get(activeIdRef.current);

  const commit = useCallback((nextTabs: Tab[], nextActiveId: string) => {
    tabsRef.current = nextTabs;
    activeIdRef.current = nextActiveId;
    setTabs(nextTabs);
    setActiveId(nextActiveId);
  }, []);

  const selectTab = useCallback(
    (id: string) => {
      if (tabsRef.current.some((tab) => tab.id === id)) {
        commit(tabsRef.current, id);
      }
    },
    [commit],
  );

  const newTab = useCallback(() => {
    const tab = createStartTab();
    commit(insertAfter(tabsRef.current, activeIdRef.current, tab), tab.id);
  }, [commit]);

  const dropTab = useCallback(
    (id: string, preferredActiveId?: string | null) => {
      const result = removeTab(tabsRef.current, id, activeIdRef.current);
      handles.current.delete(id);
      setSnapshots((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      if (!result.tabs.length) {
        const start = createStartTab();
        commit([start], start.id);
        return;
      }
      const preferred = preferredActiveId && result.tabs.some((tab) => tab.id === preferredActiveId) ? preferredActiveId : null;
      commit(result.tabs, preferred ?? result.activeId ?? result.tabs[0].id);
    },
    [commit],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = tabsRef.current.find((candidate) => candidate.id === id);
      if (!tab) {
        return;
      }
      if (tab.kind === "document" && snapshotsRef.current[id]?.modified && !(await confirmDiscard([tab.name]))) {
        return;
      }
      dropTab(id);
    },
    [dropTab],
  );

  const openSource = useCallback(
    async (source: PdfSource | Promise<PdfSource | null>) => {
      let resolved: PdfSource | null;
      try {
        resolved = await source;
      } catch (error) {
        await showError(`Could not open this PDF.\n\n${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (!resolved) {
        return;
      }
      const existing = resolved.path
        ? tabsRef.current.find((tab) => tab.kind === "document" && tab.path === resolved.path)
        : undefined;
      if (existing) {
        selectTab(existing.id);
        return;
      }
      const current = tabsRef.current.find((tab) => tab.id === activeIdRef.current);
      const tab: DocTab = {
        id: `tab-${++tabCounter}`,
        kind: "document",
        source: resolved,
        name: resolved.name,
        path: resolved.path,
        replaces: current?.kind === "start" ? current.id : null,
        returnTo: activeIdRef.current,
      };
      commit(insertAfter(tabsRef.current, activeIdRef.current, tab), tab.id);
    },
    [commit, selectTab],
  );

  const openSourceRef = useRef(openSource);
  openSourceRef.current = openSource;

  const handleLoaded = useCallback((id: string) => {
    const tab = tabsRef.current.find((candidate) => candidate.id === id);
    if (tab?.kind !== "document") {
      return;
    }
    if (tab.path) {
      recordRecentFile(tab.path);
    }
    const replaced = tab.replaces;
    if (replaced && replaced !== activeIdRef.current && tabsRef.current.some((candidate) => candidate.id === replaced)) {
      commit(
        tabsRef.current.filter((candidate) => candidate.id !== replaced),
        activeIdRef.current,
      );
    }
  }, [commit]);

  const handleFailed = useCallback(
    (id: string, error: unknown) => {
      const tab = tabsRef.current.find((candidate) => candidate.id === id);
      dropTab(id, tab?.kind === "document" ? tab.returnTo : null);
      if (error) {
        showError(`Could not open ${tab?.kind === "document" ? `“${tab.name}”` : "this PDF"}.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [dropTab],
  );

  const handleSnapshot = useCallback((id: string, snapshot: TabSnapshot) => {
    setSnapshots((current) => ({ ...current, [id]: snapshot }));
  }, []);

  const requestPassword = useCallback(
    (fileName: string, incorrect: boolean) =>
      new Promise<string | null>((resolve) => {
        setPasswordPrompts((queue) => [...queue, { fileName, incorrect, resolve }]);
      }),
    [],
  );

  const resolvePassword = (password: string | null) => {
    const [prompt, ...rest] = passwordPrompts;
    setPasswordPrompts(rest);
    prompt?.resolve(password);
  };

  const save = useCallback(async (saveAs: boolean) => {
    const tab = tabsRef.current.find((candidate) => candidate.id === activeIdRef.current);
    const handle = handles.current.get(activeIdRef.current);
    if (tab?.kind !== "document" || !handle) {
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      const bytes = await handle.viewer.save();
      if (!bytes) {
        return;
      }
      if (!isDesktop) {
        downloadPdf(tab.name, bytes);
        handle.viewer.markSaved();
        return;
      }
      const path = saveAs || !tab.path ? await pickSavePath(tab.name) : tab.path;
      if (!path) {
        return;
      }
      await writePdf(path, bytes);
      handle.viewer.markSaved();
      const renamed = { ...tab, name: fileNameFromPath(path), path };
      commit(
        tabsRef.current.map((candidate) => (candidate.id === tab.id ? renamed : candidate)),
        activeIdRef.current,
      );
      recordRecentFile(path);
    } catch (error) {
      await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  }, [commit]);

  const refreshRecentFiles = useCallback(() => {
    getRecentFiles().then(setRecentFiles);
  }, []);

  const reportMissingRecent = useCallback(async (path: string) => {
    await showError(`“${fileNameFromPath(path)}” couldn’t be found. It may have been moved or deleted, so it was removed from recent files.`);
  }, []);

  const openRecent = useCallback(
    async (entry: RecentEntry) => {
      if (!entry.exists) {
        await removeRecentFile(entry.path);
        await reportMissingRecent(entry.path);
        return;
      }
      openSource(readPdfFromPath(entry.path));
    },
    [openSource, reportMissingRecent],
  );

  const requestDefaultApp = useCallback(async () => {
    setDefaultAppRequest({ status: await getDefaultAppStatus(), source: "manual", token: Date.now() });
  }, []);

  const defaultAppPreferenceRef = useRef(defaultAppPreference);
  defaultAppPreferenceRef.current = defaultAppPreference;

  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    const timer = window.setTimeout(async () => {
      const status = await getDefaultAppStatus();
      if (shouldPromptForDefault(status, defaultAppPreferenceRef.current, Date.now())) {
        setDefaultAppRequest({ status, source: "launch", token: Date.now() });
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const changeTool = (tool: EditorTool) => activeHandle()?.viewer.setTool(tool);

  const changeToolColor = (color: string) => {
    const tool = activeSnapshot?.tool;
    const param = tool && colorParams[tool];
    if (!tool || param === undefined) {
      return;
    }
    setToolColors((colors) => ({ ...colors, [tool]: color }));
    activeHandle()?.viewer.setEditorParam(param, color);
  };

  const toggleFind = () => {
    const handle = activeHandle();
    if (!handle || !hasDocument) {
      return;
    }
    if (activeSnapshot?.findOpen) {
      handle.closeFind();
    } else {
      handle.openFind();
    }
  };

  const windowTitle = activeTab.kind === "document" ? `${activeTab.name}${activeSnapshot?.modified ? " — Edited" : ""}` : "Clumsy";

  useEffect(() => {
    setWindowTitle(windowTitle);
  }, [windowTitle]);

  useEffect(() => {
    refreshRecentFiles();
    const modifiedNames = () =>
      tabsRef.current.flatMap((tab) => (tab.kind === "document" && snapshotsRef.current[tab.id]?.modified ? [tab.name] : []));
    const cleanups: Array<Promise<() => void>> = [
      onOpenedFiles(async (paths) => {
        for (const path of paths) {
          await openSourceRef.current(readPdfFromPath(path));
        }
      }),
      onFileDrop((source) => openSourceRef.current(source), setDragging),
      onFullscreenChange(setFullscreen),
      onAboutRequested((checkForUpdates) => setAboutRequest({ tab: "about", checkForUpdates, token: Date.now() })),
      onMakeDefaultRequested(() => requestDefaultApp()),
      onRecentFileEvents({
        onChanged: refreshRecentFiles,
        onOpen: () => openSourceRef.current(pickPdf()),
        onOpenRecent: (path) => openSourceRef.current(readPdfFromPath(path)),
        onMissing: reportMissingRecent,
      }),
      onTabMenuEvents({
        onNewTab: () => newTab(),
        onCloseTab: () => closeTab(activeIdRef.current),
        onCloseWindow: () => closeWindow(),
      }),
      onCloseRequested(() => modifiedNames().length > 0, modifiedNames),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup.then((dispose) => dispose()));
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const action = resolveShortcut(event, isMac, typing);
      if (!action) {
        return;
      }
      const handle = activeHandle();
      if (action === "escape") {
        if (activeSnapshot?.findOpen) {
          handle?.closeFind();
        } else if (!typing && hasDocument && activeSnapshot?.tool !== "select") {
          handle?.viewer.setTool("select");
        }
        return;
      }

      const tabIndex = tabShortcuts[action];
      const appActions: Partial<Record<ShortcutAction, () => void>> = {
        open: () => openSource(pickPdf()),
        newTab,
        closeTab: () => closeTab(activeIdRef.current),
        nextTab: () => selectTab(cycleTab(tabsRef.current, activeIdRef.current, 1)),
        previousTab: () => selectTab(cycleTab(tabsRef.current, activeIdRef.current, -1)),
      };
      if (tabIndex !== undefined) {
        event.preventDefault();
        const target = tabsRef.current[tabIndex];
        if (target) {
          selectTab(target.id);
        }
        return;
      }
      if (appActions[action]) {
        event.preventDefault();
        appActions[action]!();
        return;
      }
      if (!handle || !hasDocument || !activeSnapshot) {
        return;
      }
      event.preventDefault();
      const { viewer } = handle;
      const documentActions: Partial<Record<ShortcutAction, () => void>> = {
        save: () => save(false),
        saveAs: () => save(true),
        find: () => handle.openFind(),
        findNext: () => handle.findAgain(false),
        findPrevious: () => handle.findAgain(true),
        zoomIn: () => viewer.zoom(1),
        zoomOut: () => viewer.zoom(-1),
        actualSize: () => viewer.setZoom(1),
        fitWidth: () => viewer.setZoom("page-width"),
        rotate: viewer.rotate,
        toggleSidebar: () => setSidebarOpen((open) => !open),
        firstPage: () => viewer.goToPage(1),
        lastPage: () => viewer.goToPage(activeSnapshot.pagesCount),
        nextPage: () => viewer.goToPage(activeSnapshot.pageNumber + 1),
        previousPage: () => viewer.goToPage(activeSnapshot.pageNumber - 1),
        toolSelect: () => viewer.setTool("select"),
        toolHighlight: () => viewer.setTool("highlight"),
        toolText: () => viewer.setTool("text"),
        toolDraw: () => viewer.setTool("draw"),
      };
      documentActions[action]?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSnapshot, hasDocument, newTab, closeTab, selectTab, openSource, save, setSidebarOpen]);

  const tabItems: TabItem[] = tabs.map((tab) =>
    tab.kind === "start"
      ? { id: tab.id, kind: "start", title: "Start", loading: false, modified: false }
      : {
          id: tab.id,
          kind: "document",
          title: tab.name,
          tooltip: tab.path ?? tab.name,
          loading: !snapshots[tab.id]?.loaded,
          modified: !!snapshots[tab.id]?.modified,
        },
  );

  const viewer = activeHandle()?.viewer;

  return (
    <div className={`app${dragging ? " dragging" : ""}`}>
      <Toolbar
        titlebarInset={hasOverlayTitlebar && !fullscreen}
        hasDocument={hasDocument}
        sidebarOpen={sidebarOpen}
        findOpen={!!activeSnapshot?.findOpen}
        darkPages={darkPages}
        darkPagesImages={darkPagesImages}
        onDarkPagesImages={setDarkPagesImages}
        pageNumber={activeSnapshot?.pageNumber ?? 1}
        pagesCount={activeSnapshot?.pagesCount ?? 0}
        scale={activeSnapshot?.scale ?? 1}
        scaleValue={activeSnapshot?.scaleValue ?? "page-width"}
        tool={activeSnapshot?.tool ?? "select"}
        toolColor={toolColors[activeSnapshot?.tool ?? "select"] ?? ""}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpen={() => openSource(pickPdf())}
        onSave={() => save(false)}
        onPage={(page) => viewer?.goToPage(page)}
        onZoom={(direction) => viewer?.zoom(direction)}
        onZoomValue={(value) => viewer?.setZoom(value)}
        onRotate={() => viewer?.rotate()}
        onTool={changeTool}
        onToolColor={changeToolColor}
        onImage={() => imageInputRef.current?.click()}
        onSign={() => setSignatureOpen(true)}
        onToggleFind={toggleFind}
        onToggleDarkPages={() => setDarkPagesPreference(darkPages ? "off" : "on")}
      />
      <TabStrip
        tabs={tabItems}
        activeId={activeTab.id}
        newTabShortcut={isMac ? "⌘T" : "Ctrl+T"}
        onSelect={selectTab}
        onClose={closeTab}
        onNewTab={newTab}
      />
      <div className="workspace">
        {tabs.map((tab) =>
          tab.kind === "start" ? (
            <div key={tab.id} className={`document-tab${tab.id === activeTab.id ? "" : " inactive"}`} inert={tab.id !== activeTab.id}>
              <div className="empty-state">
                <Welcome
                  loading={false}
                  shortcut={isMac ? "⌘O" : "Ctrl+O"}
                  recent={recentFiles}
                  onOpen={() => openSource(pickPdf())}
                  onOpenRecent={openRecent}
                  onRemoveRecent={(entry) => removeRecentFile(entry.path)}
                  onClearRecent={() => clearRecentFiles()}
                  onAbout={() => setAboutRequest({ tab: "about", checkForUpdates: false, token: Date.now() })}
                />
              </div>
            </div>
          ) : (
            <DocumentTab
              key={tab.id}
              ref={(handle) => {
                if (handle) {
                  handles.current.set(tab.id, handle);
                } else {
                  handles.current.delete(tab.id);
                }
              }}
              id={tab.id}
              source={tab.source}
              active={tab.id === activeTab.id}
              sidebarOpen={sidebarOpen}
              darkPages={darkPages}
              keepImages={darkPagesImages === "keep"}
              requestPassword={requestPassword}
              onSnapshot={handleSnapshot}
              onLoaded={handleLoaded}
              onFailed={handleFailed}
              onOpenUrl={openExternal}
            />
          ),
        )}
        {dragging && <div className="drop-overlay">Drop to open</div>}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            activeHandle()?.viewer.addImage(file);
          }
        }}
      />
      <SignatureDialog
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onPlace={(file) => {
          setSignatureOpen(false);
          activeHandle()?.viewer.addImage(file);
        }}
      />
      <PasswordDialog
        request={passwordPrompts[0] ? { fileName: passwordPrompts[0].fileName, incorrect: passwordPrompts[0].incorrect } : null}
        onSubmit={resolvePassword}
      />
      <AboutDialog
        request={aboutRequest}
        onClose={() => setAboutRequest(null)}
        onOpenUrl={openExternal}
        onMakeDefault={() => {
          setAboutRequest(null);
          requestDefaultApp();
        }}
      />
      <DefaultAppDialog
        request={defaultAppRequest}
        onMakeDefault={makeDefaultApp}
        onDismiss={({ neverAsk, source }) => {
          if (source === "launch") {
            setDefaultAppPreference(neverAsk ? { state: "never" } : { state: "snoozed", until: Date.now() + SNOOZE_MS });
          }
        }}
        onClose={() => setDefaultAppRequest(null)}
      />
    </div>
  );
}

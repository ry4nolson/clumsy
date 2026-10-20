import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationEditorParamsType } from "pdfjs-dist";
import type { AboutTab } from "./components/AboutWindow";
import { DocumentTab, type DocumentHandle, type TabSnapshot } from "./components/DocumentTab";
import { PaneGrid, type TabDropTarget } from "./components/PaneGrid";
import { PasswordDialog } from "./components/PasswordDialog";
import type { SidebarTab } from "./components/Sidebar";
import { SignatureDialog } from "./components/SignatureDialog";
import type { TabItem } from "./components/TabStrip";
import { Toolbar, inkColors } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
import { highlightColors, type EditorTool } from "./hooks/usePdfViewer";
import { commandById, isTypingTarget, resolveCommand, type CommandId } from "./lib/commands";
import { SNOOZE_MS, shouldPromptForDefault, type DefaultAppPreference } from "./lib/defaultApp";
import {
  documentWindowAt,
  initialTransfer,
  isMainWindow,
  onReceiveTab,
  onWindowFocused,
  openDocumentWindow,
  sendTabToWindow,
  stashTransferBytes,
  takeTransferBytes,
  type TabTransfer,
  type ViewState,
} from "./lib/documentWindows";
import { promptForDefaultApp } from "./lib/defaultAppPrompt";
import { installAppMenu, type AppMenu } from "./lib/menu";
import type { RecentEntry } from "./lib/recent";
import {
  clearRecentFiles,
  closeFocusedAuxWindow,
  closeWindow,
  confirmDiscard,
  downloadPdf,
  fileNameFromPath,
  getDefaultAppStatus,
  getRecentFiles,
  hasOverlayTitlebar,
  isDesktop,
  onCloseRequested,
  onFileDrop,
  onFullscreenChange,
  onOpenedFiles,
  onRecentFilesChanged,
  openAuxWindow,
  openExternal,
  pickImage,
  pickPdf,
  pickSavePath,
  readPdfFromPath,
  recordRecentFile,
  removeRecentFile,
  revealInFinder,
  setWindowTitle,
  showError,
  writePdf,
  type PdfSource,
} from "./lib/platform";
import { usePersistentState, useSystemDarkMode } from "./lib/preferences";
import * as ws from "./lib/workspace";
import { repoUrl } from "./lib/updates";

type StartTab = { id: string; kind: "start" };
type DocTab = {
  id: string;
  kind: "document";
  source: PdfSource;
  name: string;
  path: string | null;
  replaces: string | null;
  returnTo: string | null;
  view?: ViewState;
  carriedChanges: boolean;
};
type Tab = StartTab | DocTab;

type OpenOptions = { split?: boolean; view?: ViewState; carriedChanges?: boolean; allowDuplicate?: boolean };

const isModified = (tab: Tab | undefined, snapshots: Record<string, TabSnapshot>) =>
  tab?.kind === "document" && (!!snapshots[tab.id]?.modified || tab.carriedChanges);

type PasswordPrompt = { fileName: string; incorrect: boolean; resolve: (password: string | null) => void };

const colorParams: Partial<Record<EditorTool, number>> = {
  highlight: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
  text: AnnotationEditorParamsType.FREETEXT_COLOR,
  draw: AnnotationEditorParamsType.INK_COLOR,
};

const isMac = navigator.userAgent.includes("Mac");

let tabCounter = 0;
let paneCounter = 0;
const createStartTab = (): StartTab => ({ id: `tab-${++tabCounter}`, kind: "start" });
const createPaneId = () => `pane-${++paneCounter}`;

export default function App() {
  const [workspace, setWorkspace] = useState(() => ws.createWorkspace<Tab>(createStartTab(), createPaneId()));
  const [snapshots, setSnapshots] = useState<Record<string, TabSnapshot>>({});
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = usePersistentState("clumsy.sidebar", true);
  const [sidebarTab, setSidebarTab] = usePersistentState<SidebarTab>("clumsy.sidebarTab", "thumbnails");
  const [menuReady, setMenuReady] = useState(false);
  const [darkPagesPreference, setDarkPagesPreference] = usePersistentState<"auto" | "on" | "off">("clumsy.darkPages", "auto");
  const [darkPagesImages, setDarkPagesImages] = usePersistentState<"keep" | "invert">("clumsy.darkPagesImages", "keep");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [passwordPrompts, setPasswordPrompts] = useState<PasswordPrompt[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentEntry[] | null>(null);
  const [defaultAppPreference, setDefaultAppPreference] = usePersistentState<DefaultAppPreference>("clumsy.defaultAppPrompt", null);
  const [toolColors, setToolColors] = useState<Record<string, string>>({
    highlight: Object.values(highlightColors)[0],
    text: inkColors[0],
    draw: inkColors[0],
  });
  const systemDark = useSystemDarkMode();
  const darkPages = darkPagesPreference === "on" || (darkPagesPreference === "auto" && systemDark);

  const handles = useRef(new Map<string, DocumentHandle>());
  const menuRef = useRef<AppMenu | null>(null);
  const workspaceRef = useRef(workspace);
  const snapshotsRef = useRef(snapshots);
  workspaceRef.current = workspace;
  snapshotsRef.current = snapshots;

  const activeTab = ws.focusedTab(workspace);
  const activeSnapshot = activeTab.kind === "document" ? snapshots[activeTab.id] : undefined;
  const hasDocument = !!activeSnapshot?.loaded;
  const activeHandle = () => handles.current.get(ws.focusedTab(workspaceRef.current).id);
  const hasUnsavedChanges = useCallback(
    (tab: Tab | undefined) => tab?.kind === "document" && (tab.carriedChanges || !!handles.current.get(tab.id)?.viewer.commitEdits()),
    [],
  );

  const commit = useCallback((next: ws.Workspace<Tab>) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);

  const update = useCallback((change: (current: ws.Workspace<Tab>) => ws.Workspace<Tab>) => commit(change(workspaceRef.current)), [commit]);

  const selectTab = useCallback((id: string) => update((current) => ws.selectTab(current, id)), [update]);

  const newTab = useCallback(
    (paneId?: string) => update((current) => ws.addTab(current, createStartTab(), paneId)),
    [update],
  );

  const dropTab = useCallback(
    (id: string, preferredActiveId?: string | null) => {
      handles.current.delete(id);
      setSnapshots((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      update((current) => {
        const next = ws.closeTab(current, id, createStartTab);
        return preferredActiveId && next.tabs[preferredActiveId] ? ws.selectTab(next, preferredActiveId) : next;
      });
    },
    [update],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = workspaceRef.current.tabs[id];
      if (!tab) {
        return;
      }
      if (tab.kind === "document" && hasUnsavedChanges(tab) && !(await confirmDiscard([tab.name]))) {
        return;
      }
      dropTab(id);
    },
    [dropTab, hasUnsavedChanges],
  );

  const openSource = useCallback(
    async (source: PdfSource | Promise<PdfSource | null>, options: OpenOptions = {}) => {
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
      const current = workspaceRef.current;
      const split = options.split && current.panes.length < ws.MAX_PANES;
      const existing = resolved.path && !split && !options.allowDuplicate
        ? ws.orderedTabs(current).find((tab) => tab.kind === "document" && tab.path === resolved.path)
        : undefined;
      if (existing) {
        selectTab(existing.id);
        return;
      }
      const focused = ws.focusedTab(current);
      const tab: DocTab = {
        id: `tab-${++tabCounter}`,
        kind: "document",
        source: resolved,
        name: resolved.name,
        path: resolved.path,
        replaces: !split && focused.kind === "start" ? focused.id : null,
        returnTo: focused.id,
        view: options.view,
        carriedChanges: !!options.carriedChanges,
      };
      commit(split ? ws.splitWithTab(current, tab, createPaneId()) : ws.addTab(current, tab));
    },
    [commit, selectTab],
  );

  const openSourceRef = useRef(openSource);
  openSourceRef.current = openSource;

  const handleLoaded = useCallback(
    (id: string) => {
      const tab = workspaceRef.current.tabs[id];
      if (tab?.kind !== "document") {
        return;
      }
      if (tab.path) {
        recordRecentFile(tab.path);
      }
      const replaced = tab.replaces;
      const pane = replaced ? ws.paneOfTab(workspaceRef.current, replaced) : null;
      if (replaced && pane && pane.activeTabId !== replaced) {
        update((current) => ws.closeTab(current, replaced, createStartTab));
      }
    },
    [update],
  );

  const handleFailed = useCallback(
    (id: string, error: unknown) => {
      const tab = workspaceRef.current.tabs[id];
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
    const tab = ws.focusedTab(workspaceRef.current);
    const handle = handles.current.get(tab.id);
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
      update((current) => ws.replaceTab(current, { ...tab, name: fileNameFromPath(path), path, carriedChanges: false }));
      recordRecentFile(path);
    } catch (error) {
      await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  }, [update]);

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
    await promptForDefaultApp(await getDefaultAppStatus(), "manual");
  }, []);

  const defaultAppPreferenceRef = useRef(defaultAppPreference);
  defaultAppPreferenceRef.current = defaultAppPreference;

  useEffect(() => {
    if (!isDesktop || !isMainWindow()) {
      return;
    }
    const timer = window.setTimeout(async () => {
      const status = await getDefaultAppStatus();
      if (!shouldPromptForDefault(status, defaultAppPreferenceRef.current, Date.now())) {
        return;
      }
      const choice = await promptForDefaultApp(status, "launch");
      if (choice === "never") {
        setDefaultAppPreference({ state: "never" });
      } else if (choice === "declined") {
        setDefaultAppPreference({ state: "snoozed", until: Date.now() + SNOOZE_MS });
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

  const windowTitle = activeTab.kind === "document" ? `${activeTab.name}${isModified(activeTab, snapshots) ? " — Edited" : ""}` : "Clumsy";

  useEffect(() => {
    setWindowTitle(windowTitle);
  }, [windowTitle]);

  useEffect(() => {
    refreshRecentFiles();
    const modifiedNames = () =>
      ws.orderedTabs(workspaceRef.current).flatMap((tab) => (tab.kind === "document" && hasUnsavedChanges(tab) ? [tab.name] : []));
    const cleanups: Array<Promise<() => void>> = [
      onOpenedFiles(async (paths) => {
        for (const path of paths) {
          await openSourceRef.current(readPdfFromPath(path));
        }
      }),
      onFileDrop((source) => openSourceRef.current(source), setDragging),
      onFullscreenChange(setFullscreen),
      onRecentFilesChanged(refreshRecentFiles),
      onCloseRequested(() => modifiedNames().length > 0, modifiedNames),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup.then((dispose) => dispose()));
    };
  }, []);

  const receiveTab = useCallback(
    async (transfer: TabTransfer) => {
      if (transfer.kind === "start") {
        update((current) => ws.addTab(current, createStartTab()));
        return;
      }
      try {
        const data = await takeTransferBytes(transfer.transferId);
        await openSource(
          { name: transfer.name, path: transfer.path, data },
          { view: transfer.view, carriedChanges: transfer.modified, allowDuplicate: true },
        );
      } catch (error) {
        await showError(`Could not move “${transfer.name}” here.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [openSource, update],
  );

  const receiveTabRef = useRef(receiveTab);
  receiveTabRef.current = receiveTab;

  useEffect(() => {
    const transfer = initialTransfer();
    if (transfer) {
      receiveTabRef.current(transfer);
    }
    const listening = onReceiveTab((incoming) => receiveTabRef.current(incoming));
    return () => {
      listening.then((dispose) => dispose());
    };
  }, []);

  const prepareTransfer = async (tabId: string, allowLastTab: boolean): Promise<TabTransfer | null> => {
    const current = workspaceRef.current;
    const tab = current.tabs[tabId];
    if (!tab || (!allowLastTab && Object.keys(current.tabs).length < 2)) {
      return null;
    }
    if (tab.kind === "start") {
      return { kind: "start" };
    }
    const handle = handles.current.get(tabId);
    const snapshot = snapshotsRef.current[tabId];
    if (!handle || !snapshot?.loaded) {
      return null;
    }
    const modified = hasUnsavedChanges(tab);
    const bytes = await handle.viewer.save();
    if (!bytes) {
      return null;
    }
    return {
      kind: "document",
      transferId: await stashTransferBytes(bytes),
      name: tab.name,
      path: tab.path,
      modified,
      view: handle.viewer.viewState() ?? undefined,
    };
  };

  const moveTabToWindow = async (tabId: string, destination: { label: string } | { at?: { x: number; y: number } }) => {
    const merging = "label" in destination;
    const transfer = await prepareTransfer(tabId, merging);
    if (!transfer) {
      return;
    }
    const lastTab = Object.keys(workspaceRef.current.tabs).length === 1;
    if (merging) {
      await sendTabToWindow(destination.label, transfer);
    } else {
      await openDocumentWindow(transfer, destination.at);
    }
    dropTab(tabId);
    if (lastTab) {
      await closeWindow();
    }
  };

  const tearOffTab = async (tabId: string, screenX: number, screenY: number) => {
    const target = await documentWindowAt(screenX, screenY);
    await moveTabToWindow(tabId, target ? { label: target } : { at: { x: screenX - 120, y: screenY - 20 } });
  };

  const editingCommand = (name: "undo" | "redo") => {
    if (isTypingTarget(document.activeElement)) {
      document.execCommand(name);
    } else {
      activeHandle()?.viewer.editingAction(name);
    }
  };

  const openAbout = (tab: AboutTab, checkForUpdates = false) => openAuxWindow("about", checkForUpdates ? { tab, check: "1" } : { tab });

  const runCommand = (id: CommandId) => {
    const handle = activeHandle();
    if (commandById.get(id)?.needsDocument && (!handle || !hasDocument || !activeSnapshot)) {
      return;
    }
    const viewer = handle?.viewer;
    const page = activeSnapshot?.pageNumber ?? 1;
    const tabIndex = /^tab(\d)$/.exec(id)?.[1];
    if (tabIndex) {
      update((current) => ws.selectTabAt(current, Number(tabIndex) - 1));
      return;
    }
    const actions: Partial<Record<CommandId, () => void>> = {
      about: () => openAbout("about"),
      checkUpdates: () => openAbout("about", true),
      makeDefault: () => requestDefaultApp(),
      newTab: () => newTab(),
      newWindow: () => openDocumentWindow(null),
      moveTabToNewWindow: () => moveTabToWindow(ws.focusedTab(workspaceRef.current).id, {}),
      open: () => openSource(pickPdf()),
      closeTab: async () => {
        if (!(await closeFocusedAuxWindow())) {
          closeTab(ws.focusedTab(workspaceRef.current).id);
        }
      },
      closeWindow: async () => {
        if (!(await closeFocusedAuxWindow())) {
          closeWindow();
        }
      },
      save: () => save(false),
      saveAs: () => save(true),
      revealInFinder: () => activeTab.kind === "document" && activeTab.path && revealInFinder(activeTab.path),
      undo: () => editingCommand("undo"),
      redo: () => editingCommand("redo"),
      find: () => handle?.openFind(),
      findNext: () => handle?.findAgain(false),
      findPrevious: () => handle?.findAgain(true),
      useSelectionForFind: () => {
        const selection = window.getSelection()?.toString().trim();
        if (selection) {
          handle?.openFind(selection);
        }
      },
      toggleSidebar: () => setSidebarOpen((open) => !open),
      showPages: () => {
        setSidebarOpen(true);
        setSidebarTab("thumbnails");
      },
      showOutline: () => {
        setSidebarOpen(true);
        setSidebarTab("outline");
      },
      actualSize: () => viewer?.setZoom(1),
      zoomIn: () => viewer?.zoom(1),
      zoomOut: () => viewer?.zoom(-1),
      fitWidth: () => viewer?.setZoom("page-width"),
      fitPage: () => viewer?.setZoom("page-fit"),
      rotateLeft: () => viewer?.rotate(-1),
      rotateRight: () => viewer?.rotate(1),
      toggleDarkPages: () => setDarkPagesPreference(darkPages ? "off" : "on"),
      toggleInvertImages: () => setDarkPagesImages((current) => (current === "keep" ? "invert" : "keep")),
      previousPage: () => viewer?.goToPage(page - 1),
      nextPage: () => viewer?.goToPage(page + 1),
      firstPage: () => viewer?.goToPage(1),
      lastPage: () => viewer?.goToPage(activeSnapshot?.pagesCount ?? 1),
      goToPage: () => document.querySelector<HTMLInputElement>(".page-nav input")?.focus(),
      toolSelect: () => viewer?.setTool("select"),
      toolHighlight: () => viewer?.setTool("highlight"),
      toolText: () => viewer?.setTool("text"),
      toolDraw: () => viewer?.setTool("draw"),
      addImage: () => {
        pickImage().then((file) => file && activeHandle()?.viewer.addImage(file));
      },
      sign: () => setSignatureOpen(true),
      nextTab: () => update((current) => ws.cycleTabs(current, 1)),
      previousTab: () => update((current) => ws.cycleTabs(current, -1)),
      splitRight: () => {
        if (activeTab.kind === "document" && activeTab.path) {
          openSource(readPdfFromPath(activeTab.path), { split: true });
        } else {
          update((current) => ws.splitWithTab(current, createStartTab(), createPaneId()));
        }
      },
      closeSplit: () => update(ws.closeSplit),
      focusLeftPane: () => update((current) => ws.focusAdjacentPane(current, -1)),
      focusRightPane: () => update((current) => ws.focusAdjacentPane(current, 1)),
      moveTabLeft: () => update((current) => ws.moveTabToAdjacentPane(current, -1, createPaneId())),
      moveTabRight: () => update((current) => ws.moveTabToAdjacentPane(current, 1, createPaneId())),
      keyboardShortcuts: () => openAuxWindow("shortcuts"),
      whatsNew: () => openAbout("changelog"),
      openGitHub: () => openExternal(repoUrl),
      reportIssue: () => openExternal(`${repoUrl}/issues/new`),
    };
    actions[id]?.();
  };

  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;
  const openRecentRef = useRef(openRecent);
  openRecentRef.current = openRecent;

  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    let cancelled = false;
    installAppMenu({
      onCommand: (id) => runCommandRef.current(id),
      onOpenRecent: (entry) => openRecentRef.current(entry),
      onClearRecent: () => clearRecentFiles(),
    })
      .then((menu) => {
        if (!cancelled) {
          menuRef.current = menu;
          setMenuReady(true);
        }
        return onWindowFocused(() => menuRef.current?.activate());
      })
      .catch((error: unknown) => console.error("Could not build the app menu", error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    menuRef.current?.setState({ hasDocument, split: workspace.panes.length > 1, darkPages, invertImages: darkPagesImages === "invert" });
  }, [menuReady, hasDocument, workspace.panes.length, darkPages, darkPagesImages]);

  useEffect(() => {
    if (recentFiles) {
      menuRef.current?.setRecent(recentFiles);
    }
  }, [menuReady, recentFiles]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const id = resolveCommand(event, isMac, typing);
      if (!id || id === "undo" || id === "redo") {
        return;
      }
      if (id === "escape") {
        if (activeSnapshot?.findOpen) {
          activeHandle()?.closeFind();
        } else if (!typing && hasDocument && activeSnapshot?.tool !== "select") {
          activeHandle()?.viewer.setTool("select");
        }
        return;
      }
      event.preventDefault();
      runCommandRef.current(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSnapshot, hasDocument]);

  const tabItems: Record<string, TabItem> = Object.fromEntries(
    Object.values(workspace.tabs).map((tab) => [
      tab.id,
      tab.kind === "start"
        ? { id: tab.id, kind: "start", title: "Start", loading: false, modified: false }
        : {
            id: tab.id,
            kind: "document",
            title: tab.name,
            tooltip: tab.path ?? tab.name,
            loading: !snapshots[tab.id]?.loaded,
            modified: isModified(tab, snapshots),
          },
    ]),
  );

  const moveTab = (tabId: string, target: TabDropTarget) =>
    update((current) =>
      target.kind === "newPane"
        ? ws.moveTab(current, tabId, { newPaneAfter: target.afterPaneId, paneId: createPaneId() })
        : ws.moveTab(current, tabId, { paneId: target.paneId, index: target.index }),
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
        onRotate={() => viewer?.rotate(1)}
        onTool={changeTool}
        onToolColor={changeToolColor}
        onImage={() => runCommand("addImage")}
        onSign={() => setSignatureOpen(true)}
        onToggleFind={toggleFind}
        onToggleDarkPages={() => setDarkPagesPreference(darkPages ? "off" : "on")}
      />
      <PaneGrid
        panes={workspace.panes}
        focusedPaneId={workspace.focusedPaneId}
        tabItems={tabItems}
        newTabShortcut={isMac ? "⌘T" : "Ctrl+T"}
        overlay={dragging && <div className="drop-overlay">Drop to open</div>}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onNewTab={(paneId) => newTab(paneId)}
        onFocusPane={(paneId) => update((current) => ws.focusPane(current, paneId))}
        onMoveTab={moveTab}
        onResize={(sizes) => update((current) => ws.resizePanes(current, sizes))}
        onTearOff={tearOffTab}
      >
        {workspace.panes.flatMap((pane, index) =>
          pane.tabIds.map((tabId) => {
            const tab = workspace.tabs[tabId];
            const active = tabId === pane.activeTabId;
            const column = index * 2 + 1;
            return tab.kind === "start" ? (
              <div
                key={tab.id}
                className={`document-tab${active ? "" : " inactive"}`}
                inert={!active}
                data-pane-id={pane.id}
                style={{ gridColumn: column }}
              >
                <div className="empty-state">
                  <Welcome
                    loading={false}
                    shortcut={isMac ? "⌘O" : "Ctrl+O"}
                    recent={recentFiles}
                    onOpen={() => openSource(pickPdf())}
                    onOpenRecent={openRecent}
                    onRemoveRecent={(entry) => removeRecentFile(entry.path)}
                    onClearRecent={() => clearRecentFiles()}
                    onAbout={() => openAbout("about")}
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
                paneId={pane.id}
                column={column}
                source={tab.source}
                initialView={tab.view}
                active={active}
                sidebarOpen={sidebarOpen}
                sidebarTab={sidebarTab}
                onSidebarTab={setSidebarTab}
                darkPages={darkPages}
                keepImages={darkPagesImages === "keep"}
                requestPassword={requestPassword}
                onSnapshot={handleSnapshot}
                onLoaded={handleLoaded}
                onFailed={handleFailed}
                onOpenUrl={openExternal}
              />
            );
          }),
        )}
      </PaneGrid>
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
    </div>
  );
}

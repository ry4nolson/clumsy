import { useEffect, useRef, useState } from "react";
import { AboutDialog, type AboutRequest, type AboutTab } from "./components/AboutDialog";
import { ExportImagesDialog } from "./components/ExportImagesDialog";
import { PaneGrid } from "./components/PaneGrid";
import { PasswordDialog } from "./components/PasswordDialog";
import { QuickPick } from "./components/QuickPick";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import type { SidebarTab } from "./components/Sidebar";
import { SignatureDialog } from "./components/SignatureDialog";
import { TabContents } from "./components/TabContents";
import { UpdateDialog } from "./components/UpdateDialog";
import type { TabItem } from "./components/TabStrip";
import { Toolbar } from "./components/Toolbar";
import { useAppMenu } from "./hooks/useAppMenu";
import { useComparison } from "./hooks/useComparison";
import { colorParams, useEditorOptions } from "./hooks/useEditorOptions";
import { useExternalChanges } from "./hooks/useExternalChanges";
import { useImageExport } from "./hooks/useImageExport";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMarkdownCommands } from "./hooks/useMarkdownCommands";
import { usePageEdits } from "./hooks/usePageEdits";
import { useSaveAll, useSaveDocument } from "./hooks/useSaveDocument";
import { requestDefaultApp, useDefaultAppPrompt } from "./hooks/useDefaultAppPrompt";
import { usePasswordPrompts } from "./hooks/usePasswordPrompts";
import { useUpdatePrompt } from "./hooks/useUpdatePrompt";
import { useQuickPick } from "./hooks/useQuickPick";
import { useRecentFiles } from "./hooks/useRecentFiles";
import type { EditorTool } from "./hooks/usePdfViewer";
import { useTabTransfer } from "./hooks/useTabTransfer";
import { useViewControls } from "./hooks/useViewControls";
import { useWorkspace } from "./hooks/useWorkspace";
import { hasCaret, moveCaretToEdge } from "./lib/caret";
import { commandById, documentAvailable, isTypingTarget, shortcutFor, type CommandId } from "./lib/commands";
import { openDocumentWindow } from "./lib/documentWindows";
import { dropTargetAt, showDropTarget } from "./lib/dropTarget";
import { pickImage } from "./lib/imageFiles";
import {
  clearRecentFiles,
  closeWindow,
  hasOverlayTitlebar,
  isMac,
  onCloseRequested,
  onFileDrop,
  onFullscreenChange,
  onOpenedFiles,
  onShowDocument,
  openExternal,
  pickDocument,
  readDocumentFromPath,
  removeRecentFile,
  reportDocuments,
  requestQuit,
  revealInFinder,
  setWindowTitle,
} from "./lib/platform";
import { usePersistentState, useSystemDarkMode } from "./lib/preferences";
import { createPaneId, createStartTab, isFileTab, isModified } from "./lib/tabs";
import * as ws from "./lib/workspace";
import { repoUrl } from "./lib/updates";

export default function App() {
  const workspaceApi = useWorkspace();
  const {
    workspace,
    snapshots,
    markdownSnapshots,
    workspaceRef,
    activeHandle,
    activeMarkdown,
    setHandle,
    setMarkdownHandle,
    hasUnsavedChanges,
    update,
    selectTab,
    newTab,
    closeTab,
    openSource,
    takeClosedTab,
    showPath,
    handleLoaded,
    handleFailed,
    handleSnapshot,
    handleMarkdownSnapshot,
    moveTab,
  } = workspaceApi;
  const markdown = useMarkdownCommands(workspaceApi);
  const pageEdits = usePageEdits(workspaceApi);
  const { moveTabToWindow, tearOffTab } = useTabTransfer(workspaceApi, pageEdits.settled);
  useExternalChanges(workspaceApi);
  const save = useSaveDocument(workspaceApi, pageEdits.settled);
  const imageExport = useImageExport(workspaceApi, pageEdits.settled);
  const pageEditsRef = useRef(pageEdits);
  pageEditsRef.current = pageEdits;
  const passwords = usePasswordPrompts();
  useDefaultAppPrompt();
  const updatePrompt = useUpdatePrompt();

  const [dropHover, setDropHover] = useState<"open" | "insert" | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = usePersistentState("clumsy.sidebar", true);
  const [sidebarTab, setSidebarTab] = usePersistentState<SidebarTab>("clumsy.sidebarTab", "thumbnails");
  const showSidebar = (tab: SidebarTab) => {
    setSidebarOpen(true);
    setSidebarTab(tab);
  };
  const comparison = useComparison(workspaceApi, () => showSidebar("changes"));
  const [documentMap, setDocumentMap] = usePersistentState("clumsy.documentMap", true);
  const [darkPagesPreference, setDarkPagesPreference] = usePersistentState<"auto" | "on" | "off">("clumsy.darkPages", "auto");
  const [darkPagesImages, setDarkPagesImages] = usePersistentState<"keep" | "invert">("clumsy.darkPagesImages", "keep");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [infoSheet, setInfoSheet] = useState<({ kind: "about" } & AboutRequest) | { kind: "shortcuts" } | null>(null);
  const { recentFiles, openRecent } = useRecentFiles(openSource);
  const activeViewer = () => activeHandle()?.viewer;
  const viewControls = useViewControls(activeViewer);
  const systemDark = useSystemDarkMode();
  const darkPages = darkPagesPreference === "on" || (darkPagesPreference === "auto" && systemDark);

  const activeTab = ws.focusedTab(workspace);
  const activeSnapshot = activeTab.kind === "document" ? snapshots[activeTab.id] : undefined;
  const hasDocument = !!activeSnapshot?.loaded;
  const markdownSnapshot = activeTab.kind === "markdown" ? markdownSnapshots[activeTab.id] : undefined;
  const hasMarkdown = !!markdownSnapshot;
  const allSnapshots = { ...snapshots, ...markdownSnapshots };
  const findOpen = !!(activeSnapshot?.findOpen || markdownSnapshot?.findOpen);
  const viewMenuState = viewControls.menuState(hasDocument ? activeSnapshot : undefined);
  const editorOptions = useEditorOptions(activeViewer, activeSnapshot);

  const openSourceRef = useRef(openSource);
  openSourceRef.current = openSource;

  const changeTool = (tool: EditorTool) => activeHandle()?.viewer.setTool(tool);

  const toolColorParam = colorParams[activeSnapshot?.tool ?? "select"];

  const toggleFind = () => {
    const handle = hasMarkdown ? activeMarkdown() : hasDocument ? activeHandle() : undefined;
    if (findOpen) {
      handle?.closeFind();
    } else {
      handle?.openFind();
    }
  };

  const windowTitle = isFileTab(activeTab) ? `${activeTab.name}${isModified(activeTab, allSnapshots) ? " — Edited" : ""}` : "Clumsy";

  useEffect(() => {
    setWindowTitle(windowTitle);
  }, [windowTitle]);

  const documentTabs = ws.orderedTabs(workspace).filter(isFileTab);
  const openPaths = documentTabs.flatMap((tab) => (tab.path ? [tab.path] : []));
  const unsavedNames = documentTabs.filter((tab) => isModified(tab, allSnapshots)).map((tab) => tab.name);
  const documentReport = JSON.stringify([openPaths, unsavedNames]);

  useEffect(() => {
    const [paths, unsaved] = JSON.parse(documentReport) as [string[], string[]];
    reportDocuments(paths, unsaved);
  }, [documentReport]);

  useEffect(() => {
    const modifiedNames = () =>
      ws.orderedTabs(workspaceRef.current).flatMap((tab) => (isFileTab(tab) && hasUnsavedChanges(tab) ? [tab.name] : []));
    const cleanups: Array<Promise<() => void>> = [
      onOpenedFiles(async (paths) => {
        for (const path of paths) {
          await openSourceRef.current(readDocumentFromPath(path));
        }
      }),
      onFileDrop(
        (files, point) => pageEditsRef.current.dropFiles(files, point),
        (point) => {
          const target = point && dropTargetAt(point);
          showDropTarget(target);
          setDropHover(point ? (target ? "insert" : "open") : null);
        },
      ),
      onFullscreenChange(setFullscreen),
      onShowDocument(showPath),
      onCloseRequested(() => modifiedNames().length > 0, modifiedNames),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup.then((dispose) => dispose()));
    };
  }, []);

  const saveAll = useSaveAll(workspaceApi, save);

  const quickPick = useQuickPick({
    hasDocument,
    hasMarkdown,
    split: workspace.panes.length > 1,
    comparing: comparison.comparing,
    documentMapAvailable: viewMenuState.documentMapAvailable,
    isMac,
    tabs: documentTabs.map((tab) => ({ id: tab.id, name: tab.name, path: tab.path })),
    recent: recentFiles ?? [],
    pages: hasDocument && activeSnapshot ? { labels: activeSnapshot.pageLabels, count: activeSnapshot.pagesCount } : null,
    onCommand: (id) => runCommandRef.current(id),
    onGoToPage: (page) => activeViewer()?.goToPage(page, true),
    onShowTab: selectTab,
    onOpenRecent: openRecent,
  });

  const editingCommand = (name: "undo" | "redo") => {
    if (markdown.editingCommand(name)) {
      return;
    }
    if (isTypingTarget(document.activeElement)) {
      document.execCommand(name);
    } else if (!pageEdits.stepHistory(name)) {
      activeHandle()?.viewer.editingAction(name);
    }
  };

  const openAbout = (tab: AboutTab, check = false) => setInfoSheet({ kind: "about", tab, check, token: Date.now() });

  const runCommand = (id: CommandId, fromMenu = false) => {
    const handle = activeHandle();
    const command = commandById.get(id);
    if (command && !documentAvailable(command, { hasDocument: hasDocument && !!handle, hasMarkdown })) {
      return;
    }
    if (markdown.runMarkdownCommand(id, fromMenu)) {
      return;
    }
    if (pageEdits.runPageCommand(id) || comparison.runCompareCommand(id) || viewControls.runViewCommand(id) || imageExport.runExportCommand(id)) {
      return;
    }
    if (fromMenu && (id === "firstPage" || id === "lastPage") && hasCaret(document.activeElement)) {
      moveCaretToEdge(document.activeElement, id === "firstPage");
      return;
    }
    const viewer = handle?.viewer;
    const tabIndex = /^tab(\d)$/.exec(id)?.[1];
    if (tabIndex) {
      update((current) => ws.selectTabAt(current, Number(tabIndex) - 1));
      return;
    }
    const actions: Partial<Record<CommandId, () => void>> = {
      about: () => openAbout("about"),
      checkUpdates: () => openAbout("about", true),
      makeDefault: () => requestDefaultApp(),
      makeDefaultMarkdown: () => requestDefaultApp("markdown"),
      newTab: () => newTab(),
      reopenClosedTab: () => {
        const closed = takeClosedTab();
        if (closed) {
          openSource(readDocumentFromPath(closed.path), { view: closed.view });
        }
      },
      newWindow: () => openDocumentWindow(null),
      moveTabToNewWindow: () => moveTabToWindow(ws.focusedTab(workspaceRef.current).id, {}),
      open: () => openSource(pickDocument()),
      closeTab: () => (infoSheet ? setInfoSheet(null) : closeTab(ws.focusedTab(workspaceRef.current).id)),
      quit: async () => {
        const tabs = ws.orderedTabs(workspaceRef.current).filter(isFileTab);
        const unsaved = tabs.filter((tab) => hasUnsavedChanges(tab)).map((tab) => tab.name);
        await reportDocuments(tabs.flatMap((tab) => (tab.path ? [tab.path] : [])), unsaved);
        await requestQuit();
      },
      closeWindow: () => (infoSheet ? setInfoSheet(null) : closeWindow()),
      save: () => save(false),
      saveAs: () => save(true),
      saveAll: () => saveAll(),
      revealInFinder: () => isFileTab(activeTab) && activeTab.path && revealInFinder(activeTab.path),
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
      showPages: () => showSidebar("thumbnails"),
      showOutline: () => showSidebar("outline"),
      toggleDocumentMap: () => viewMenuState.documentMapAvailable && setDocumentMap((shown) => !shown),
      actualSize: () => viewer?.setZoom(1),
      zoomIn: () => viewer?.zoom(1),
      zoomOut: () => viewer?.zoom(-1),
      fitWidth: () => viewer?.setZoom("page-width"),
      fitPage: () => viewer?.setZoom("page-fit"),
      rotateLeft: () => viewer?.rotate(-1),
      rotateRight: () => viewer?.rotate(1),
      toggleDarkPages: () => setDarkPagesPreference(darkPages ? "off" : "on"),
      toggleInvertImages: () => setDarkPagesImages((current) => (current === "keep" ? "invert" : "keep")),
      previousPage: () => viewer?.stepPage(-1),
      nextPage: () => viewer?.stepPage(1),
      firstPage: () => viewer?.goToPage(1, true),
      lastPage: () => viewer?.goToPage(activeSnapshot?.pagesCount ?? 1, true),
      goToPage: () => document.querySelector<HTMLInputElement>(".page-nav input")?.focus(),
      quickOpen: () => quickPick.toggle("quickOpen"),
      commandPalette: () => quickPick.toggle("palette"),
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
        if (isFileTab(activeTab) && activeTab.path) {
          openSource(readDocumentFromPath(activeTab.path), { split: true, view: activeTab.kind === "markdown" ? workspaceApi.viewStateOf(activeTab) : undefined });
        } else {
          update((current) => ws.splitWithTab(current, createStartTab(), createPaneId()));
        }
      },
      closeSplit: () => update(ws.closeSplit),
      focusLeftPane: () => update((current) => ws.focusAdjacentPane(current, -1)),
      focusRightPane: () => update((current) => ws.focusAdjacentPane(current, 1)),
      moveTabLeft: () => update((current) => ws.moveTabToAdjacentPane(current, -1, createPaneId())),
      moveTabRight: () => update((current) => ws.moveTabToAdjacentPane(current, 1, createPaneId())),
      keyboardShortcuts: () => setInfoSheet(infoSheet?.kind === "shortcuts" ? null : { kind: "shortcuts" }),
      whatsNew: () => openAbout("changelog"),
      openGitHub: () => openExternal(repoUrl),
      reportIssue: () => openExternal(`${repoUrl}/issues/new`),
    };
    actions[id]?.();
  };

  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  useAppMenu(
    { onCommand: (id) => runCommand(id, true), onOpenRecent: openRecent },
    {
      hasDocument,
      hasMarkdown,
      markdownSource: markdownSnapshot?.mode === "source",
      split: workspace.panes.length > 1,
      comparing: comparison.comparing,
      documentMap,
      darkPages,
      invertImages: darkPagesImages === "invert",
      ...viewMenuState,
    },
    recentFiles,
  );

  useKeyboardShortcuts(isMac, (id) => runCommandRef.current(id), (typing) => {
    if (markdownSnapshot?.findOpen) {
      activeMarkdown()?.closeFind();
    } else if (activeSnapshot?.findOpen) {
      activeHandle()?.closeFind();
    } else if (!typing && hasDocument && activeSnapshot?.tool !== "select") {
      activeHandle()?.viewer.setTool("select");
    }
  });

  const tabItems: Record<string, TabItem> = Object.fromEntries(
    Object.values(workspace.tabs).map((tab) => [
      tab.id,
      tab.kind === "start"
        ? { id: tab.id, kind: "start", title: "Start", loading: false, modified: false }
        : {
            id: tab.id,
            kind: tab.kind,
            title: tab.name,
            tooltip: tab.path ?? tab.name,
            loading: !allSnapshots[tab.id]?.loaded,
            modified: isModified(tab, allSnapshots),
          },
    ]),
  );

  const viewer = activeHandle()?.viewer;

  return (
    <div className={`app${dropHover ? " dragging" : ""}`}>
      <Toolbar
        titlebarInset={hasOverlayTitlebar && !fullscreen}
        hasDocument={hasDocument}
        markdownMode={markdownSnapshot?.mode ?? null}
        sidebarOpen={sidebarOpen}
        findOpen={findOpen}
        darkPages={darkPages}
        darkPagesImages={darkPagesImages}
        onDarkPagesImages={setDarkPagesImages}
        pageNumber={activeSnapshot?.pageNumber ?? 1}
        pagesCount={activeSnapshot?.pagesCount ?? 0}
        pageLabels={activeSnapshot?.pageLabels ?? null}
        scale={activeSnapshot?.scale ?? 1}
        scaleValue={activeSnapshot?.scaleValue ?? "page-width"}
        tool={activeSnapshot?.tool ?? "select"}
        toolColor={toolColorParam === undefined ? "" : String(editorOptions.shown[toolColorParam] ?? "")}
        editorParams={editorOptions.shown}
        onEditorParam={editorOptions.change}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpen={() => openSource(pickDocument())}
        onSave={() => save(false)}
        onPage={(page) => viewer?.goToPage(page, true)}
        onZoom={(direction) => viewer?.zoom(direction)}
        onZoomValue={(value) => viewer?.setZoom(value)}
        onRotate={() => viewer?.rotate(1)}
        onTool={changeTool}
        onToolColor={(color) => toolColorParam !== undefined && editorOptions.change(toolColorParam, color)}
        onImage={() => runCommand("addImage")}
        onSign={() => setSignatureOpen(true)}
        onToggleFind={toggleFind}
        onToggleDarkPages={() => setDarkPagesPreference(darkPages ? "off" : "on")}
        onToggleSource={() => activeMarkdown()?.toggleSource()}
      />
      <PaneGrid
        panes={workspace.panes}
        focusedPaneId={workspace.focusedPaneId}
        tabItems={tabItems}
        newTabShortcut={shortcutFor("newTab", isMac) ?? ""}
        overlay={dropHover === "open" && <div className="drop-overlay">Drop to open</div>}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onNewTab={(paneId) => newTab(paneId)}
        onFocusPane={(paneId) => update((current) => ws.focusPane(current, paneId))}
        onMoveTab={moveTab}
        onResize={(sizes) => update((current) => ws.resizePanes(current, sizes))}
        onTearOff={tearOffTab}
      >
        <TabContents
          workspace={workspace}
          welcome={{
            shortcut: shortcutFor("open", isMac) ?? "",
            recent: recentFiles,
            onOpen: () => openSource(pickDocument()),
            onOpenRecent: openRecent,
            onRemoveRecent: (entry) => removeRecentFile(entry.path),
            onClearRecent: () => clearRecentFiles(),
            onAbout: () => openAbout("about"),
          }}
          documentProps={{
            sidebarOpen,
            sidebarTab,
            onSidebarTab: setSidebarTab,
            documentMap,
            darkPages,
            keepImages: darkPagesImages === "keep",
            defaultModes: viewControls.defaultModes,
            editorDefaults: editorOptions.remembered,
            onDocumentSidebar: showSidebar,
            requestPassword: passwords.requestPassword,
            onSnapshot: handleSnapshot,
            onLoaded: (id, source) => {
              handleLoaded(id);
              pageEdits.documentLoaded(id, source);
            },
            onFailed: (id, error, source) => !pageEdits.documentFailed(id, source) && handleFailed(id, error),
            onOpenUrl: openExternal,
            onPageAction: (id, action) => pageEdits.pageAction(id, action, (command) => runCommandRef.current(command)),
          }}
          markdownProps={{ sidebarOpen, documentMap, onSnapshot: handleMarkdownSnapshot, onLoaded: handleLoaded, onOpenUrl: openExternal, onOpenFile: markdown.openLinked }}
          caretBrowsing={viewControls.caretBrowsing}
          compareFor={comparison.viewFor}
          setHandle={setHandle}
          setMarkdownHandle={setMarkdownHandle}
        />
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
        request={passwords.current}
        onSubmit={passwords.resolvePassword}
      />
      <UpdateDialog
        offer={updatePrompt.offer}
        onLater={updatePrompt.later}
        onSkip={updatePrompt.skip}
        onDownload={updatePrompt.download}
      />
      <ExportImagesDialog {...imageExport.dialog} />
      <AboutDialog request={infoSheet?.kind === "about" ? infoSheet : null} onClose={() => setInfoSheet(null)} />
      <ShortcutsDialog open={infoSheet?.kind === "shortcuts"} isMac={isMac} onClose={() => setInfoSheet(null)} />
      <QuickPick mode={quickPick.mode} onPick={quickPick.pick} onClose={quickPick.close} />
    </div>
  );
}

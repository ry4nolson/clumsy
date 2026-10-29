import { useEffect, useRef, useState } from "react";
import { AnnotationEditorParamsType } from "pdfjs-dist";
import type { AboutTab } from "./components/AboutWindow";
import { DocumentTab } from "./components/DocumentTab";
import { PaneGrid } from "./components/PaneGrid";
import { PasswordDialog } from "./components/PasswordDialog";
import { QuickPick } from "./components/QuickPick";
import type { SidebarTab } from "./components/Sidebar";
import { SignatureDialog } from "./components/SignatureDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import type { TabItem } from "./components/TabStrip";
import { Toolbar, inkColors } from "./components/Toolbar";
import { Welcome } from "./components/Welcome";
import { useAppMenu } from "./hooks/useAppMenu";
import { useComparison } from "./hooks/useComparison";
import { useExternalChanges } from "./hooks/useExternalChanges";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePageEdits } from "./hooks/usePageEdits";
import { useSaveAll, useSaveDocument } from "./hooks/useSaveDocument";
import { requestDefaultApp, useDefaultAppPrompt } from "./hooks/useDefaultAppPrompt";
import { usePasswordPrompts } from "./hooks/usePasswordPrompts";
import { useUpdatePrompt } from "./hooks/useUpdatePrompt";
import { useQuickPick } from "./hooks/useQuickPick";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { highlightColors, type EditorTool } from "./hooks/usePdfViewer";
import { useTabTransfer } from "./hooks/useTabTransfer";
import { useWorkspace } from "./hooks/useWorkspace";
import { hasCaret, moveCaretToEdge } from "./lib/caret";
import { commandById, isTypingTarget, shortcutFor, type CommandId } from "./lib/commands";
import { openDocumentWindow } from "./lib/documentWindows";
import { dropTargetAt, showDropTarget } from "./lib/dropTarget";
import {
  clearRecentFiles,
  closeFocusedAuxWindow,
  closeWindow,
  hasOverlayTitlebar,
  isMac,
  onCloseRequested,
  onFileDrop,
  onFullscreenChange,
  onOpenedFiles,
  onShowDocument,
  openAuxWindow,
  openExternal,
  pickImage,
  pickPdf,
  readPdfFromPath,
  removeRecentFile,
  reportDocuments,
  requestQuit,
  revealInFinder,
  setWindowTitle,
} from "./lib/platform";
import { usePersistentState, useSystemDarkMode } from "./lib/preferences";
import { createPaneId, createStartTab, isModified } from "./lib/tabs";
import * as ws from "./lib/workspace";
import { repoUrl } from "./lib/updates";

const colorParams: Partial<Record<EditorTool, number>> = {
  highlight: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
  text: AnnotationEditorParamsType.FREETEXT_COLOR,
  draw: AnnotationEditorParamsType.INK_COLOR,
};

export default function App() {
  const workspaceApi = useWorkspace();
  const {
    workspace,
    snapshots,
    workspaceRef,
    activeHandle,
    setHandle,
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
    moveTab,
  } = workspaceApi;
  const pageEdits = usePageEdits(workspaceApi);
  const { moveTabToWindow, tearOffTab } = useTabTransfer(workspaceApi, pageEdits.settled);
  useExternalChanges(workspaceApi);
  const save = useSaveDocument(workspaceApi, pageEdits.settled);
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
  const { recentFiles, openRecent } = useRecentFiles(openSource);
  const [toolColors, setToolColors] = useState<Record<string, string>>({
    highlight: Object.values(highlightColors)[0],
    text: inkColors[0],
    draw: inkColors[0],
  });
  const systemDark = useSystemDarkMode();
  const darkPages = darkPagesPreference === "on" || (darkPagesPreference === "auto" && systemDark);

  const activeTab = ws.focusedTab(workspace);
  const activeSnapshot = activeTab.kind === "document" ? snapshots[activeTab.id] : undefined;
  const hasDocument = !!activeSnapshot?.loaded;

  const openSourceRef = useRef(openSource);
  openSourceRef.current = openSource;

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

  const documentTabs = ws.orderedTabs(workspace).flatMap((tab) => (tab.kind === "document" ? [tab] : []));
  const openPaths = documentTabs.flatMap((tab) => (tab.path ? [tab.path] : []));
  const unsavedNames = documentTabs.filter((tab) => isModified(tab, snapshots)).map((tab) => tab.name);
  const documentReport = JSON.stringify([openPaths, unsavedNames]);

  useEffect(() => {
    const [paths, unsaved] = JSON.parse(documentReport) as [string[], string[]];
    reportDocuments(paths, unsaved);
  }, [documentReport]);

  useEffect(() => {
    const modifiedNames = () =>
      ws.orderedTabs(workspaceRef.current).flatMap((tab) => (tab.kind === "document" && hasUnsavedChanges(tab) ? [tab.name] : []));
    const cleanups: Array<Promise<() => void>> = [
      onOpenedFiles(async (paths) => {
        for (const path of paths) {
          await openSourceRef.current(readPdfFromPath(path));
        }
      }),
      onFileDrop(
        (sources, point) => {
          if (!pageEditsRef.current.dropFiles(sources, point)) {
            sources.forEach((source) => openSourceRef.current(source));
          }
        },
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
    split: workspace.panes.length > 1,
    comparing: comparison.comparing,
    isMac,
    tabs: documentTabs.map((tab) => ({ id: tab.id, name: tab.name, path: tab.path })),
    recent: recentFiles ?? [],
    onCommand: (id) => runCommandRef.current(id),
    onShowTab: selectTab,
    onOpenRecent: openRecent,
  });

  const editingCommand = (name: "undo" | "redo") => {
    if (isTypingTarget(document.activeElement)) {
      document.execCommand(name);
    } else if (!pageEdits.stepHistory(name)) {
      activeHandle()?.viewer.editingAction(name);
    }
  };

  const openAbout = (tab: AboutTab, checkForUpdates = false) => openAuxWindow("about", checkForUpdates ? { tab, check: "1" } : { tab });

  const runCommand = (id: CommandId, fromMenu = false) => {
    const handle = activeHandle();
    if (commandById.get(id)?.needsDocument && (!handle || !hasDocument || !activeSnapshot)) {
      return;
    }
    if (pageEdits.runPageCommand(id) || comparison.runCompareCommand(id)) {
      return;
    }
    if (fromMenu && (id === "firstPage" || id === "lastPage") && hasCaret(document.activeElement)) {
      moveCaretToEdge(document.activeElement, id === "firstPage");
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
      reopenClosedTab: () => {
        const closed = takeClosedTab();
        if (closed) {
          openSource(readPdfFromPath(closed.path), { view: closed.view });
        }
      },
      newWindow: () => openDocumentWindow(null),
      moveTabToNewWindow: () => moveTabToWindow(ws.focusedTab(workspaceRef.current).id, {}),
      open: () => openSource(pickPdf()),
      closeTab: async () => {
        if (!(await closeFocusedAuxWindow())) {
          closeTab(ws.focusedTab(workspaceRef.current).id);
        }
      },
      quit: async () => {
        const tabs = ws.orderedTabs(workspaceRef.current).flatMap((tab) => (tab.kind === "document" ? [tab] : []));
        const unsaved = tabs.filter((tab) => hasUnsavedChanges(tab)).map((tab) => tab.name);
        await reportDocuments(tabs.flatMap((tab) => (tab.path ? [tab.path] : [])), unsaved);
        await requestQuit();
      },
      closeWindow: async () => {
        if (!(await closeFocusedAuxWindow())) {
          closeWindow();
        }
      },
      save: () => save(false),
      saveAs: () => save(true),
      saveAll: () => saveAll(),
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
      showPages: () => showSidebar("thumbnails"),
      showOutline: () => showSidebar("outline"),
      toggleDocumentMap: () => setDocumentMap((shown) => !shown),
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

  useAppMenu(
    { onCommand: (id) => runCommand(id, true), onOpenRecent: openRecent },
    { hasDocument, split: workspace.panes.length > 1, comparing: comparison.comparing, documentMap, darkPages, invertImages: darkPagesImages === "invert" },
    recentFiles,
  );

  useKeyboardShortcuts(isMac, (id) => runCommandRef.current(id), (typing) => {
    if (activeSnapshot?.findOpen) {
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
            kind: "document",
            title: tab.name,
            tooltip: tab.path ?? tab.name,
            loading: !snapshots[tab.id]?.loaded,
            modified: isModified(tab, snapshots),
          },
    ]),
  );

  const viewer = activeHandle()?.viewer;

  return (
    <div className={`app${dropHover ? " dragging" : ""}`}>
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
                    shortcut={shortcutFor("open", isMac) ?? ""}
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
                ref={(handle) => setHandle(tab.id, handle)}
                id={tab.id}
                paneId={pane.id}
                column={column}
                source={tab.source}
                initialView={tab.view}
                initialSelection={tab.selection}
                active={active}
                sidebarOpen={sidebarOpen}
                sidebarTab={sidebarTab}
                onSidebarTab={setSidebarTab}
                documentMap={documentMap}
                darkPages={darkPages}
                keepImages={darkPagesImages === "keep"}
                requestPassword={passwords.requestPassword}
                onSnapshot={handleSnapshot}
                onLoaded={(id, source) => {
                  handleLoaded(id);
                  pageEdits.documentLoaded(id, source);
                }}
                onFailed={(id, error, source) => {
                  if (!pageEdits.documentFailed(id, source)) {
                    handleFailed(id, error);
                  }
                }}
                onOpenUrl={openExternal}
                onPageAction={(id, action) => pageEdits.pageAction(id, action, (command) => runCommandRef.current(command))}
                compare={comparison.viewFor(tab.id)}
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
        request={passwords.current}
        onSubmit={passwords.resolvePassword}
      />
      <UpdateDialog
        offer={updatePrompt.offer}
        onLater={updatePrompt.later}
        onSkip={updatePrompt.skip}
        onDownload={updatePrompt.download}
      />
      <QuickPick mode={quickPick.mode} onPick={quickPick.pick} onClose={quickPick.close} />
    </div>
  );
}

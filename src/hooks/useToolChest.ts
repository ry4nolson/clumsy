import { useEffect, useState } from "react";
import { AnnotationEditorParamsType } from "pdfjs-dist";
import type { TabSnapshot } from "../components/DocumentTab";
import type { CommandId } from "../lib/commands";
import { loadLibrary } from "../lib/customStamps";
import { readContextTools, savedEntry, withContextTool, writeContextTools } from "../lib/contextTools";
import type { MarkupParams } from "../lib/markupParams";
import { showMessage } from "../lib/platform";
import { stampDesign } from "../lib/stampSymbols";
import { armSpec, newTool, readToolChest, starterChest, toolLabel, toolOfMarkup, type SavedTool, type ToolStyle, type ToolTarget } from "../lib/toolChest";
import { addedTool, chestFileText, duplicatedTool, groupOnly, movedTool, removedTool, restoredTool, updatedTool, withMissing, type Removal } from "../lib/toolChestEdit";
import { confirmClearChest, pickToolChestFile, saveToolChestFile, toolChestFileName } from "../lib/toolChestFiles";
import { importChestText, saveChest, watchChest } from "../lib/toolChestStore";
import type { EditorParams, PdfViewerApi } from "./usePdfViewer";

const Params = AnnotationEditorParamsType;

export function armSavedTool(viewer: PdfViewerApi | undefined, tool: SavedTool) {
  const spec = armSpec(tool);
  if (!viewer || !spec) {
    return;
  }
  if (spec.kind === "editor") {
    const params: EditorParams =
      spec.editor === "highlight"
        ? { [Params.HIGHLIGHT_COLOR]: spec.color, [Params.HIGHLIGHT_THICKNESS]: spec.width }
        : spec.editor === "draw"
          ? { [Params.INK_COLOR]: spec.color, [Params.INK_THICKNESS]: spec.width, [Params.INK_OPACITY]: spec.opacity }
          : { [Params.FREETEXT_COLOR]: spec.color, [Params.FREETEXT_SIZE]: spec.width };
    void viewer.armEditorPreset(spec.editor, params, tool.id);
    return;
  }
  const { target, preset } = spec;
  if (target.kind === "stamp" && !stampDesign(target.stamp)) {
    void showMessage(`“${tool.name}” uses a custom stamp that isn't in your Stamps picker anymore.`, "Tool Chest");
    return;
  }
  void viewer.setMarkupTool(
    target.kind === "shape"
      ? { kind: "shape", shape: target.shape, preset }
      : target.kind === "stamp"
        ? { kind: "stamp", stamp: target.stamp, preset }
        : target.kind === "text"
          ? { kind: "text", text: target.text, preset }
          : { kind: "measure", measure: target.measure, preset },
  );
}

export function currentTarget(snapshot: TabSnapshot | undefined, params: MarkupParams): ToolTarget {
  const tool = snapshot?.markupTool;
  if (tool?.kind === "shape") {
    return { kind: "shape", shape: tool.shape };
  }
  if (tool?.kind === "stamp") {
    return { kind: "stamp", stamp: tool.stamp };
  }
  if (tool?.kind === "text") {
    return { kind: "text", text: tool.text };
  }
  if (tool?.kind === "measure") {
    return { kind: "measure", measure: tool.measure };
  }
  const editor = snapshot?.tool;
  return editor === "highlight" || editor === "draw" || editor === "text" ? { kind: "editor", editor } : { kind: "shape", shape: params.shape };
}

export function currentStyle(target: ToolTarget, params: MarkupParams, editor: EditorParams): Partial<ToolStyle> {
  if (target.kind !== "editor") {
    return { color: params.color, fill: params.fill, width: params.width, opacity: params.opacity, dash: null };
  }
  const value = (type: number) => editor[type] as never;
  if (target.editor === "highlight") {
    return { color: value(Params.HIGHLIGHT_COLOR), width: value(Params.HIGHLIGHT_THICKNESS) };
  }
  if (target.editor === "draw") {
    return { color: value(Params.INK_COLOR), width: value(Params.INK_THICKNESS), opacity: value(Params.INK_OPACITY) };
  }
  return { color: value(Params.FREETEXT_COLOR), width: value(Params.FREETEXT_SIZE) };
}

export type ToolSheetRequest = { mode: "new" | "edit"; tool: SavedTool };

type ChestHost = {
  activeViewer: () => PdfViewerApi | undefined;
  snapshot: TabSnapshot | undefined;
  params: MarkupParams;
  editorParams: () => EditorParams;
  showToolChest: () => void;
};

const freshId = () => crypto.randomUUID();

export function useToolChest(host: ChestHost) {
  const [chest, setChest] = useState(() => {
    loadLibrary();
    return readToolChest();
  });
  const [sheet, setSheet] = useState<ToolSheetRequest | null>(null);
  const [removal, setRemoval] = useState<(Removal & { inContext: boolean }) | null>(null);

  useEffect(() => watchChest(() => setChest(readToolChest())), []);

  const update = (change: (current: ReturnType<typeof readToolChest>) => ReturnType<typeof readToolChest>) => {
    saveChest(change(readToolChest()));
  };

  const openNew = (target: ToolTarget, style: Partial<ToolStyle>, name?: string, measure?: SavedTool["measure"]) => {
    const tool = newTool(freshId(), target, { name: name || toolLabel(target), style, measure });
    if (tool) {
      setSheet({ mode: "new", tool });
    }
  };

  const saveAsTool = (target = currentTarget(host.snapshot, host.params)) => openNew(target, currentStyle(target, host.params, host.editorParams()));

  const addSelected = () => {
    const selection = host.snapshot?.markupSelection;
    const tool = selection && toolOfMarkup(selection, freshId());
    if (tool) {
      setSheet({ mode: "new", tool });
    } else {
      void showMessage("Select a markup on the page first, then add it to the tool chest.", "Add Markup to Tool Chest");
    }
  };

  const exportChest = async (group?: string | null) => {
    const current = readToolChest();
    const chosen = group === undefined ? current : groupOnly(current, group);
    await saveToolChestFile(toolChestFileName(group ?? "Tool Chest"), chestFileText(chosen)).catch((error) => showMessage(String(error), "Export Tool Chest"));
  };

  const importChest = async () => {
    const text = await pickToolChestFile().catch((error) => {
      void showMessage(String(error), "Import Tool Chest");
      return null;
    });
    if (text !== null && (await importChestText(text))) {
      host.showToolChest();
    }
  };

  const remove = (id: string) => {
    const result = removedTool(readToolChest(), id);
    if (result.removal) {
      const inContext = readContextTools().includes(savedEntry(id));
      update(() => result.chest);
      setRemoval({ ...result.removal, inContext });
    }
  };

  const panel = {
    tools: chest.tools,
    removal,
    arm: armSavedTool,
    onNew: () => saveAsTool(),
    onEdit: (tool: SavedTool) => setSheet({ mode: "edit", tool }),
    onDuplicate: (id: string) => update((current) => duplicatedTool(current, id, freshId())),
    onRemove: remove,
    onUndoRemove: () => {
      if (removal) {
        update((current) => restoredTool(current, removal));
        if (removal.inContext) {
          writeContextTools(withContextTool(readContextTools(), savedEntry(removal.tool.id), true));
        }
      }
      setRemoval(null);
    },
    onDismissRemoval: () => setRemoval(null),
    onMove: (id: string, beforeId: string | null, group: string | null) => update((current) => movedTool(current, id, beforeId, group)),
    onToggleContext: (id: string) => {
      const tools = readContextTools();
      writeContextTools(withContextTool(tools, savedEntry(id), !tools.includes(savedEntry(id))));
    },
    onExport: exportChest,
    onImport: importChest,
    onRestoreStarter: () => update((current) => withMissing(current, starterChest())),
    onClear: async () => {
      if (await confirmClearChest()) {
        update((current) => ({ ...current, tools: [] }));
      }
    },
  };

  const runChestCommand = (id: CommandId) => {
    if (id === "showToolChest") {
      host.showToolChest();
    } else if (id === "saveAsTool") {
      saveAsTool();
    } else if (id === "addToToolChest") {
      addSelected();
    } else if (id === "exportToolChest") {
      void exportChest();
    } else if (id === "importToolChest") {
      void importChest();
    } else {
      return false;
    }
    return true;
  };

  return {
    tools: chest.tools,
    panel,
    saveAsTool,
    runChestCommand,
    armById: (id: string) => {
      const tool = readToolChest().tools.find((candidate) => candidate.id === id);
      if (tool) {
        armSavedTool(host.activeViewer(), tool);
      }
    },
    sheet: {
      request: sheet,
      groups: [...new Set(chest.tools.flatMap((tool) => (tool.group ? [tool.group] : [])))],
      onSave: (tool: SavedTool) => {
        update((current) => (sheet?.mode === "edit" ? updatedTool(current, tool) : addedTool(current, tool)));
        setSheet(null);
        host.showToolChest();
      },
      onClose: () => setSheet(null),
    },
  };
}

export type ToolChestApi = ReturnType<typeof useToolChest>;
export type ToolChestPanel = ToolChestApi["panel"];
export type ToolSheetProps = ToolChestApi["sheet"];

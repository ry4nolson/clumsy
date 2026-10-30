import { message } from "@tauri-apps/plugin-dialog";
import { defaultAppWords, type DefaultAppKind, type DefaultAppStatus } from "./defaultApp";
import { makeDefaultApp } from "./platform";

export type DefaultAppChoice = "made" | "declined" | "never" | "already" | "failed";

const MAKE_DEFAULT = "Make Default";
const NOT_NOW = "Not Now";
const NEVER = "Don't Ask Again";

export async function promptForDefaultApp(status: DefaultAppStatus, source: "launch" | "manual", kind: DefaultAppKind = "pdf"): Promise<DefaultAppChoice> {
  const { label, files, file } = defaultAppWords[kind];
  if (status.isDefault) {
    if (source === "manual") {
      await message(`Double-clicking ${file} in Finder already opens it in Clumsy.`, { title: `Clumsy opens your ${files}`, kind: "info" });
    }
    return "already";
  }
  const current = status.currentApp ? `${files} currently open in ${status.currentApp}. ` : "";
  const answer = await message(`${current}Make Clumsy the app that opens ${files} when you double-click them in Finder?`, {
    title: `Make Clumsy your default ${label} app?`,
    kind: "info",
    buttons: source === "launch" ? { yes: MAKE_DEFAULT, no: NEVER, cancel: NOT_NOW } : { ok: MAKE_DEFAULT, cancel: NOT_NOW },
  });
  if (answer === NEVER || answer === "No") {
    return "never";
  }
  if (answer !== MAKE_DEFAULT && answer !== "Yes" && answer !== "Ok") {
    return "declined";
  }
  try {
    const result = await makeDefaultApp(kind);
    if (!result.isDefault) {
      throw new Error(`macOS still opens ${files} with ${result.currentApp ?? "another app"}.`);
    }
    await message(`Double-clicking ${file} in Finder now opens it here. You can change this anytime from Finder’s Get Info window.`, {
      title: `Clumsy opens your ${files}`,
      kind: "info",
    });
    return "made";
  } catch (error) {
    await message(error instanceof Error ? error.message : String(error), { title: `Couldn’t change the default ${label} app`, kind: "error" });
    return "failed";
  }
}

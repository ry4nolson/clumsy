import { ask } from "@tauri-apps/plugin-dialog";
import { isDesktop } from "./platform";
import { signatureWarning } from "./signatureBytes";

export async function confirmSignatureRemoval(count: number, action: string) {
  const prompt = signatureWarning(count, action);
  if (!prompt) {
    return true;
  }
  if (!isDesktop) {
    return window.confirm(prompt);
  }
  return ask(prompt, { title: count === 1 ? "Remove the digital signature?" : "Remove the digital signatures?", kind: "warning", okLabel: "Continue", cancelLabel: "Cancel" });
}

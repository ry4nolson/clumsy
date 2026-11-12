import { ask, message } from "@tauri-apps/plugin-dialog";
import { isDesktop } from "./platform";

export const NO_IDENTITY =
  "Digital signatures use a certificate from your organization or a certificate authority. Add one to Keychain Access or connect your security key.";

export const ENCRYPTED_REFUSAL = "Password-protected PDFs can't be signed digitally yet.";

export const ENCRYPTED_UPDATE_REFUSAL = "Clumsy can't add validation data or timestamps to password-protected PDFs yet.";

async function confirmChoice(text: string, title: string, okLabel: string) {
  if (!isDesktop) {
    return window.confirm(`${title}\n\n${text}`);
  }
  return ask(text, { title, kind: "warning", okLabel, cancelLabel: "Cancel" });
}

export async function tellUser(text: string, title = "Clumsy") {
  if (!isDesktop) {
    window.alert(text);
    return;
  }
  await message(text, { title, kind: "info" });
}

export function offerSaveWithoutValidationData(name: string, problems: string[]) {
  return confirmChoice(
    `“${name}” is signed, but Clumsy couldn't fetch revocation data for it:\n\n${problems.join("\n")}\n\nYou can save it now and add the data later with Tools > Add Validation Data.`,
    "Save without validation data?",
    "Save Without It",
  );
}

export function offerPartialValidationData(name: string, problems: string[]) {
  return confirmChoice(
    `Clumsy fetched some of the validation data for “${name}”, but not all of it:\n\n${problems.join("\n")}\n\nSave what it found? You can run Add Validation Data again later for the rest.`,
    "Save partial validation data?",
    "Save",
  );
}

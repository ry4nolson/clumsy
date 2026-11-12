import { useCallback, useRef, useState } from "react";
import { SignatureExtractor } from "pdfjs-dist";
import type { SignChoices, SignSheetRequest } from "../components/SignDigitallyDialog";
import type { CommandId } from "../lib/commands";
import { appendDssOffThread, prepareDocTimestampOffThread, prepareSignatureOffThread, scanSignaturesOffThread, signaturesRemovedBy } from "../lib/pageEditWorker";
import { passwordOf } from "../lib/pdfjs";
import { canSignDigitally, fetchValidationData, isTimestampFailure, listSigningIdentities, showError, signPdf, timestampPdf } from "../lib/platform";
import { hasEncryptEntry } from "../lib/protection";
import { ANNOTATIONS_REWRITE_ACTION, verifyItemsOf } from "../lib/signatureBytes";
import { ENCRYPTED_REFUSAL, ENCRYPTED_UPDATE_REFUSAL, NO_IDENTITY, offerPartialValidationData, offerSaveWithoutValidationData, tellUser } from "../lib/signaturePrompts";
import { readSignatures } from "../lib/signatures";
import { DEFAULT_TIMESTAMP_URL, SIGNING_IDENTITY_KEY, TIMESTAMP_SERVER_KEY, type SignatureAppearance, type ValidationMaterial } from "../lib/signatureTypes";
import { confirmSignatureRemoval } from "../lib/signatureWarning";
import { appearanceLines, cornerRect, isVisible, localIsoTime, outlineFrom, targetFor, type Rect } from "../lib/signingTarget";
import { placeSignatureBox } from "../lib/signaturePlacement";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

const signingCommands = new Set<CommandId>(["signDigitally", "certifyDocument", "addValidationData", "sealWithTimestamp"]);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const readSetting = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
};

export const timestampServer = () => readSetting(TIMESTAMP_SERVER_KEY) || DEFAULT_TIMESTAMP_URL;

const failure = (verb: string, name: string) => `Couldn't ${verb} “${name}”.`;

const timestampDetail = (error: unknown) => messageOf(error).replace(/^timestamp:\s*/, "");

const hasMaterial = (material: ValidationMaterial) => material.certs.length + material.ocsps.length + material.crls.length > 0;

async function savedThickness(uuid: string) {
  const saved = readSignatures().find((entry) => entry.uuid === uuid);
  const data = saved && (await SignatureExtractor.decompressSignature(saved.signatureData).catch(() => null));
  return data?.thickness ?? 1;
}

export function useSignDigitally(
  { workspaceRef, handles, snapshotsRef }: WorkspaceApi,
  settled: (tabId: string) => Promise<void>,
  writeAndReload: (tabId: string, bytes: Uint8Array) => Promise<boolean>,
) {
  const running = useRef(false);
  const [request, setRequest] = useState<SignSheetRequest | null>(null);
  const [placing, setPlacing] = useState(false);

  const documentOf = (tabId: string) => {
    const tab = workspaceRef.current.tabs[tabId];
    const viewer = handles.current.get(tabId)?.viewer;
    return tab?.kind === "document" && viewer?.pdfDocument ? { tab, viewer, doc: viewer.pdfDocument } : null;
  };

  const savedBytes = async (tabId: string, refusal = ENCRYPTED_REFUSAL) => {
    await settled(tabId);
    const current = documentOf(tabId);
    if (!current) {
      return null;
    }
    const saved = await current.viewer.save();
    if (!saved) {
      return null;
    }
    if (current.tab.protection || hasEncryptEntry(saved) === true) {
      await showError(refusal);
      return null;
    }
    const removed = signaturesRemovedBy(saved);
    if (removed && !(await confirmSignatureRemoval(removed, ANNOTATIONS_REWRITE_ACTION))) {
      return null;
    }
    return { ...current, saved, removed };
  };

  const openSheet = async (tabId: string, certify: boolean) => {
    await settled(tabId);
    const current = documentOf(tabId);
    if (!current) {
      return;
    }
    const { tab, viewer, doc } = current;
    if (tab.protection) {
      await showError(ENCRYPTED_REFUSAL);
      return;
    }
    const scan = await scanSignaturesOffThread(await doc.getData(), passwordOf(doc));
    if (scan.encrypted) {
      await showError(ENCRYPTED_REFUSAL);
      return;
    }
    if (certify && scan.signatures.length) {
      await showError(`“${tab.name}” is already signed, so it can't be certified. A certification has to be the document's first signature.`);
      return;
    }
    if (scan.certified === 1) {
      await showError(`“${tab.name}” is certified with no changes allowed, so it can't be signed.`);
      return;
    }
    const identities = await listSigningIdentities();
    if (!identities.length) {
      await tellUser(NO_IDENTITY, "No signing certificate");
      return;
    }
    const page = viewer.pageNumber;
    const pdfPage = await doc.getPage(page);
    setRequest({
      tabId,
      name: tab.name,
      certify,
      identities,
      emptyFields: scan.emptyFields,
      corner: { page, rect: cornerRect(pdfPage.view as Rect, pdfPage.rotate) },
      pageLabels: viewer.pageLabels,
      signatures: snapshotsRef.current[tabId]?.signatures ?? [],
      rememberedIdentity: readSetting(SIGNING_IDENTITY_KEY),
      timestampUrl: timestampServer(),
      box: null,
      token: Date.now(),
    });
  };

  const appearanceFor = async (sheet: SignSheetRequest, choices: SignChoices, signer: string, signingTime: string): Promise<SignatureAppearance | null> => {
    if (!isVisible(choices.target)) {
      return null;
    }
    const preview = choices.appearance ? sheet.signatures.find((entry) => entry.uuid === choices.appearance) : undefined;
    const outline = preview ? outlineFrom(preview, await savedThickness(preview.uuid)) : null;
    return { outline, lines: appearanceLines(signer, signingTime, choices.reason, choices.certify) };
  };

  const sign = async (sheet: SignSheetRequest, choices: SignChoices) => {
    const ready = await savedBytes(sheet.tabId);
    if (!ready) {
      return;
    }
    const { tab } = ready;
    const identity = sheet.identities.find((entry) => entry.fingerprint === choices.identity);
    if (!identity) {
      return;
    }
    writeSetting(SIGNING_IDENTITY_KEY, identity.fingerprint);
    writeSetting(TIMESTAMP_SERVER_KEY, choices.timestampUrl);
    const signingTime = localIsoTime(new Date());
    const visible = isVisible(choices.target);
    const prepared = await prepareSignatureOffThread(ready.saved, {
      target: targetFor(choices.target),
      appearance: await appearanceFor(sheet, choices, identity.certificate.commonName, signingTime),
      certify: choices.certify,
      lockField: visible,
      signingTime,
      reason: choices.reason,
      location: choices.location,
      name: identity.certificate.commonName,
    });
    const signed = await signPdf(prepared.bytes, { placeholder: prepared.placeholder, identity: identity.fingerprint, documentName: tab.name, timestampUrl: choices.timestampUrl });
    if (!signed) {
      return;
    }
    let final = signed;
    const scan = await scanSignaturesOffThread(signed.slice());
    const items = verifyItemsOf(scan).filter((item) => scan.signatures.some((entry) => entry.id === item.id && entry.fieldName === prepared.fieldName));
    const material = await fetchValidationData(signed, items);
    if (material.problems.length && !(await offerSaveWithoutValidationData(tab.name, material.problems))) {
      return;
    }
    if (hasMaterial(material)) {
      final = await appendDssOffThread(signed.slice(), material);
    }
    if (!(await writeAndReload(sheet.tabId, final))) {
      await tellUser(`“${tab.name}” was signed, but it wasn't saved, so the signature wasn't kept. Sign it again to save it.`);
    }
  };

  const addValidationData = async (tabId: string) => {
    const ready = await savedBytes(tabId, ENCRYPTED_UPDATE_REFUSAL);
    if (!ready) {
      return;
    }
    const { tab, saved, removed } = ready;
    const scan = await scanSignaturesOffThread(saved.slice());
    const items = verifyItemsOf(scan);
    if (removed || !items.length) {
      await tellUser(`“${tab.name}” has no digital signatures to add validation data for.`);
      return;
    }
    const material = await fetchValidationData(saved, items);
    if (!hasMaterial(material)) {
      await showError(`Clumsy couldn't fetch validation data for “${tab.name}”.${material.problems.length ? `\n\n${material.problems.join("\n")}` : ""}`);
      return;
    }
    if (material.problems.length && !(await offerPartialValidationData(tab.name, material.problems))) {
      return;
    }
    await writeAndReload(tabId, await appendDssOffThread(saved, material));
  };

  const sealWithTimestamp = async (tabId: string) => {
    const ready = await savedBytes(tabId, ENCRYPTED_UPDATE_REFUSAL);
    if (!ready) {
      return;
    }
    const prepared = await prepareDocTimestampOffThread(ready.saved);
    try {
      const sealed = await timestampPdf(prepared.bytes, prepared.placeholder, timestampServer());
      await writeAndReload(tabId, sealed);
    } catch (error) {
      if (!isTimestampFailure(error)) {
        throw error;
      }
      await showError(`Clumsy couldn't get a timestamp for “${ready.tab.name}”, so nothing was saved.\n\n${timestampDetail(error)}`);
    }
  };

  const run = async (failure: string, task: () => Promise<void>) => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      await task();
    } catch (error) {
      await showError(`${failure}\n\n${messageOf(error)}`);
    } finally {
      running.current = false;
    }
  };

  const runSigningCommand = useCallback((id: CommandId) => {
    if (!signingCommands.has(id)) {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    if (!canSignDigitally || tab.kind !== "document") {
      return true;
    }
    const tasks: Partial<Record<CommandId, [string, () => Promise<void>]>> = {
      signDigitally: [failure("sign", tab.name), () => openSheet(tab.id, false)],
      certifyDocument: [failure("certify", tab.name), () => openSheet(tab.id, true)],
      addValidationData: [`Couldn't add validation data to “${tab.name}”.`, () => addValidationData(tab.id)],
      sealWithTimestamp: [failure("seal", tab.name), () => sealWithTimestamp(tab.id)],
    };
    run(...tasks[id]!);
    return true;
  }, []);

  const place = async () => {
    const sheet = request;
    const viewer = sheet && handles.current.get(sheet.tabId)?.viewer;
    const container = viewer?.containerRef.current;
    if (!sheet || !viewer?.pdfDocument || !container) {
      return;
    }
    setPlacing(true);
    const box = await placeSignatureBox(container, viewer.pdfDocument, viewer.pagesRotation);
    setPlacing(false);
    setRequest((current) => (current && current.token === sheet.token ? { ...current, box: box ?? current.box } : current));
  };

  return {
    runSigningCommand,
    dialog: {
      request,
      hidden: placing,
      onPlace: place,
      onClose: () => setRequest(null),
      onSign: (choices: SignChoices) => {
        const sheet = request;
        setRequest(null);
        if (sheet) {
          run(failure(sheet.certify ? "certify" : "sign", sheet.name), () => sign(sheet, choices));
        }
      },
    },
  };
}

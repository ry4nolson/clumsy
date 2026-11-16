import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from "@cantoo/pdf-lib";
import { newMarkup } from "../src/lib/markup";
import { writeAnnotations } from "../src/lib/notesPdf";
import { isStateReply, latestStatuses, stateReplyNote } from "../src/lib/reviewState";

describe("review status", () => {
  it("only counts Review replies, newest first, and unsaved ones last", () => {
    expect(isStateReply({ inReplyTo: "8R", stateModel: "Review", state: "Accepted" })).toBe(true);
    expect(isStateReply({ inReplyTo: "8R", stateModel: "Marked", state: "Marked" })).toBe(false);
    expect(isStateReply({ inReplyTo: null, stateModel: "Review", state: "Accepted" })).toBe(false);
    expect(isStateReply({ inReplyTo: "8R", stateModel: { name: "Review" }, state: { name: "Accepted" } })).toBe(true);
    const file = [
      { parent: "8R", state: "Rejected", time: 2 },
      { parent: "8R", state: "Accepted", time: 1 },
      { parent: "9R", state: "completed", time: null },
      { parent: "9R", state: "Unknown", time: 5 },
    ];
    expect([...latestStatuses(file, [])]).toEqual([
      ["8R", "Rejected"],
      ["9R", "Completed"],
    ]);
    const fresh = stateReplyNote("state-1", { id: "8R", pageIndex: 0, rect: [10, 10, 50, 50] }, "Completed", "", "D:2");
    expect(latestStatuses(file, [fresh]).get("8R")).toBe("Completed");
    expect(latestStatuses(file, [{ ...fresh, deleted: true }]).get("8R")).toBe("Rejected");
  });

  it("writes a hidden Review reply that points at a saved or a just-written annotation", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const square = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [100, 100, 200, 200] }));
    doc.getPage(0).node.set(PDFName.of("Annots"), doc.context.obj([square]));
    const bytes = await doc.save({ useObjectStreams: false });
    const style = { color: [1, 0, 0], fill: false, width: 2, opacity: 1 };
    const fresh = newMarkup({ id: "markup-new", pageIndex: 0, kind: "rectangle", box: [300, 300, 400, 400], rotation: 0 }, style, "D:1");
    const saved = await writeAnnotations(
      bytes,
      [
        stateReplyNote("state-a", { id: `${square.objectNumber}R`, pageIndex: 0, rect: [100, 100, 200, 200] }, "Accepted", "Ryan", "D:20261116"),
        stateReplyNote("state-b", { id: "markup-new", pageIndex: 0, rect: fresh.box }, "Rejected", "", "D:20261116"),
      ],
      [fresh],
    );
    const reopened = await PDFDocument.load(saved);
    const annots = reopened.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray).asArray() as PDFRef[];
    const dicts = annots.map((ref) => reopened.context.lookup(ref, PDFDict));
    const replies = dicts.filter((dict) => dict.has(PDFName.of("IRT")));
    expect(replies).toHaveLength(2);
    const [accepted, rejected] = replies;
    expect((accepted.get(PDFName.of("IRT")) as PDFRef).objectNumber).toBe(square.objectNumber);
    expect(accepted.lookup(PDFName.of("StateModel"), PDFString).decodeText()).toBe("Review");
    expect(accepted.lookup(PDFName.of("State"), PDFString).decodeText()).toBe("Accepted");
    expect(accepted.lookup(PDFName.of("T"), PDFHexString).decodeText()).toBe("Ryan");
    expect(accepted.lookup(PDFName.of("Contents"), PDFHexString).decodeText()).toBe("Accepted set by Ryan");
    expect(accepted.lookup(PDFName.of("F"), PDFNumber).asNumber()).toBe(2);
    const target = reopened.context.lookup(rejected.get(PDFName.of("IRT")) as PDFRef, PDFDict);
    expect(target.lookup(PDFName.of("NM"), PDFString, PDFHexString).decodeText()).toBe("markup-new");
    expect(rejected.has(PDFName.of("T"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { emptyAsNull, isTimestampFailure, readValidationMaterial, signatureRequest, verifyEnvelope } from "../src/lib/signatureEnvelope";

const header = (body: Uint8Array) => {
  const length = new DataView(body.buffer).getUint32(0, true);
  return { json: JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + length))), payload: body.subarray(4 + length) };
};

describe("signature IPC envelopes", () => {
  it("lays out the PDF and DSS blobs after the JSON header", () => {
    const pdf = new Uint8Array([1, 2, 3]);
    const items = [{ id: "s1", byteRange: [0, 1, 2, 1] as [number, number, number, number], subFilter: "ETSI.CAdES.detached", claimedTime: null }];
    const body = verifyEnvelope(pdf, items, { certs: [new Uint8Array([4, 5])], ocsps: [], crls: [new Uint8Array([6])] });
    const { json, payload } = header(body);
    expect(json.items).toEqual(items);
    expect(json.pdf).toEqual([0, 3]);
    expect(json.dss).toEqual({ certs: [[3, 2]], ocsps: [], crls: [[5, 1]] });
    expect([...payload]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(header(verifyEnvelope(pdf, [], null)).json.dss).toBeNull();
  });

  it("reads validation material back into blobs", () => {
    const json = new TextEncoder().encode(JSON.stringify({ certs: [[0, 2]], ocsps: [[2, 1]], crls: [], vri: { AB: { certs: [0], ocsps: [0], crls: [] } }, problems: ["x"] }));
    const body = new Uint8Array(4 + json.length + 3);
    new DataView(body.buffer).setUint32(0, json.length, true);
    body.set(json, 4);
    body.set([7, 8, 9], 4 + json.length);
    const material = readValidationMaterial(body);
    expect(material.certs.map((blob) => [...blob])).toEqual([[7, 8]]);
    expect(material.ocsps.map((blob) => [...blob])).toEqual([[9]]);
    expect(material.vri.AB.ocsps).toEqual([0]);
    expect(material.problems).toEqual(["x"]);
  });

  it("recognizes timestamp failures and encodes request headers", () => {
    expect(isTimestampFailure("timestamp: couldn't reach http://timestamp.digicert.com (timed out)")).toBe(true);
    expect(isTimestampFailure(new Error("timestamp: bad token"))).toBe(true);
    expect(isTimestampFailure("This certificate has been revoked, so it can't sign.")).toBe(false);
    expect(decodeURIComponent(signatureRequest({ documentName: "Contrat “é”.pdf" }).headers["x-request"])).toBe('{"documentName":"Contrat “é”.pdf"}');
    expect(emptyAsNull(new Uint8Array())).toBeNull();
  });
});

import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { P7GeneratedEvidenceStore } from "./p7GeneratedEvidenceStore";
import {
  buildP7GeneratedEvidenceSidecar,
  materializeP7GeneratedEvidenceSidecar,
  parseP7GeneratedEvidenceSidecarIndex,
} from "./p7GeneratedEvidenceSidecar";

const sha256 = new WebCryptoSha256();

describe("P7 generated evidence sidecar", () => {
  it("builds one deterministic index+payload pair and verifies every logical slice", async () => {
    const store = new P7GeneratedEvidenceStore({ scopeId: "cclp1/001/test", sha256 });
    await store.referenceCanonical({ z: 2, path: "/layers/0/cells/17" });
    await store.referenceBinary(new Uint8Array([4, 3, 2, 1]));
    await store.referenceCanonical({ a: 1 });
    const bundle = store.bundle();
    const first = await buildP7GeneratedEvidenceSidecar({ bundle, sha256 });
    const second = await buildP7GeneratedEvidenceSidecar({ bundle, sha256 });

    expect(first.indexCanonicalJson).toBe(second.indexCanonicalJson);
    expect(first.payload).toEqual(second.payload);
    expect(first.index.entries.map(({ content }) => content.digest)).toEqual(
      [...first.index.entries]
        .map(({ content }) => content.digest)
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
    );
    expect(first.index.entries.map(({ byteOffset, byteLength }) => ({
      byteOffset,
      byteLength,
    }))).toEqual(first.index.entries.map((entry, ordinal, entries) => ({
      byteOffset: entries.slice(0, ordinal).reduce((sum, prior) => sum + prior.byteLength, 0),
      byteLength: entry.content.byteLength,
    })));
    await expect(materializeP7GeneratedEvidenceSidecar({
      ...first,
      limits: bundle.limits,
      sha256,
    })).resolves.toEqual(bundle);

    const tampered = new Uint8Array(first.payload);
    tampered[0] = tampered[0]! ^ 0xff;
    await expect(materializeP7GeneratedEvidenceSidecar({
      ...first,
      payload: tampered,
      limits: bundle.limits,
      sha256,
    })).rejects.toThrow("binding is invalid");
  });

  it("rejects unknown fields and a noncanonical entry order", async () => {
    const store = new P7GeneratedEvidenceStore({ scopeId: "cclp1/001/order", sha256 });
    await store.referenceCanonical({ one: 1 });
    await store.referenceCanonical({ two: 2 });
    const bundle = store.bundle();
    const sidecar = await buildP7GeneratedEvidenceSidecar({ bundle, sha256 });
    expect(() => parseP7GeneratedEvidenceSidecarIndex({
      ...sidecar.index,
      unsupported: true,
    })).toThrow("unsupported shape");

    const reversedEntries = [...sidecar.index.entries].reverse();
    const reversedPayload = new Uint8Array(sidecar.payload.byteLength);
    let nextOffset = 0;
    const coherentEntries = reversedEntries.map((entry) => {
      const bytes = sidecar.payload.slice(
        entry.byteOffset,
        entry.byteOffset + entry.byteLength,
      );
      reversedPayload.set(bytes, nextOffset);
      const result = { ...entry, byteOffset: nextOffset };
      nextOffset += entry.byteLength;
      return result;
    });
    const reversed = {
      ...sidecar.index,
      payloadContent: await referenceSourceBytes(reversedPayload, sha256),
      entries: coherentEntries,
    };
    const reversedJson = canonicalizeJson(reversed as unknown as CanonicalJsonValue);
    await expect(materializeP7GeneratedEvidenceSidecar({
      index: reversed,
      indexCanonicalJson: reversedJson,
      indexContent: await referenceCanonicalJson(reversedJson, sha256),
      payload: reversedPayload,
      limits: bundle.limits,
      sha256,
    })).rejects.toThrow("not canonical and contiguous");
  });
});

import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it } from "vitest";
import { P7GeneratedEvidenceStore } from "./p7GeneratedEvidenceStore";

describe("P7 generated evidence store", () => {
  it("retains and deduplicates exact canonical and binary bytes behind every reference", async () => {
    const store = new P7GeneratedEvidenceStore({
      scopeId: "test-pack",
      sha256: new WebCryptoSha256(),
      limits: { maximumBlobCount: 4, maximumBlobBytes: 64, maximumTotalBytes: 128 },
    });
    const first = await store.referenceCanonical({ z: 2, a: 1 });
    const duplicate = await store.referenceCanonical({ a: 1, z: 2 });
    const binary = await store.referenceBinary(new Uint8Array([1, 2, 3]));
    const bundle = store.bundle();

    expect(duplicate).toEqual(first);
    expect(bundle.totals).toEqual({ blobCount: 2, byteLength: first.byteLength + 3 });
    expect(bundle.blobs.map(({ content, mediaType, bytes }) => ({
      content,
      mediaType,
      bytes: [...bytes],
    }))).toEqual([
      {
        content: first,
        mediaType: "application/json",
        bytes: [...new TextEncoder().encode('{"a":1,"z":2}')],
      },
      {
        content: binary,
        mediaType: "application/octet-stream",
        bytes: [1, 2, 3],
      },
    ].sort((left, right) => left.content.digest.localeCompare(right.content.digest)));
    bundle.blobs[0]!.bytes[0] = 255;
    expect(store.bundle().blobs[0]!.bytes[0]).not.toBe(255);
  });

  it("imports only digest-valid bundles and enforces per-blob/count/total caps", async () => {
    const source = new P7GeneratedEvidenceStore({
      scopeId: "source",
      sha256: new WebCryptoSha256(),
      limits: { maximumBlobCount: 2, maximumBlobBytes: 16, maximumTotalBytes: 20 },
    });
    await source.referenceCanonical({ a: 1 });
    const target = new P7GeneratedEvidenceStore({
      scopeId: "target",
      sha256: new WebCryptoSha256(),
      limits: { maximumBlobCount: 2, maximumBlobBytes: 16, maximumTotalBytes: 20 },
    });
    await target.importBundle(source.bundle());
    expect(target.bundle().totals).toEqual(source.bundle().totals);
    await expect(target.referenceBinary(new Uint8Array(17)))
      .rejects.toThrow("per-blob byte cap");
    await target.referenceBinary(new Uint8Array([9]));
    await expect(target.referenceBinary(new Uint8Array([8])))
      .rejects.toThrow("blob-count cap");
  });

  it("binds a bounded canonical stream digest without retaining the heavy stream bytes", async () => {
    const store = new P7GeneratedEvidenceStore({
      scopeId: "stream-digest",
      sha256: new WebCryptoSha256(),
      limits: { maximumBlobCount: 2, maximumBlobBytes: 128, maximumTotalBytes: 128 },
    });
    const digest = await store.digestCanonical({
      eventsOrder: "sequence",
      events: [{ kind: "move", nativeTick: 0 }],
    });

    expect(digest).toMatchObject({
      algorithm: "sha256",
      canonicalization: "tworld-canonical-json-v1",
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      byteLength: expect.any(Number),
    });
    expect(await store.digestBinary(new Uint8Array([1, 2, 3]))).toMatchObject({
      algorithm: "sha256",
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      byteLength: 3,
    });
    expect(store.bundle().totals).toEqual({ blobCount: 0, byteLength: 0 });

    const largeDigest = await store.digestCanonical(
      { payload: "x".repeat(256) },
      512,
    );
    expect(largeDigest.byteLength).toBeGreaterThan(128);
    await expect(store.referenceCanonical({ payload: "x".repeat(256) }))
      .rejects.toThrow("per-blob byte cap");
    await expect(store.digestCanonical({ value: 1 }, 65 * 1024 * 1024))
      .rejects.toThrow("global maximum");
  });
});

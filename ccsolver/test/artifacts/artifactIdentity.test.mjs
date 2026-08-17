import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ArtifactProtocolError,
  identifyBytes,
  identifyCanonicalJson,
  parseArtifactId,
  verifyArtifactIdentity,
} from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";

const sha256 = new WebCryptoSha256();

test("matches frozen SHA-256 vectors", async () => {
  for (const [canonical, expected] of [
    ["{}", "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"],
    ['{"10":"ten","2":"two"}', "sha256:b71e124675fc80e7314688bffdb68e83515851fb51474125db9a0c4c8aca3808"],
    ['{"𐀀":1,"":2}', "sha256:4045c21a23c8ae8f8d9add81f54bd506bee65885099876fb4afb378b1f2c3516"],
    [
      '{"max":9007199254740991,"min":-9007199254740991,"zero":0}',
      "sha256:b7b2401ddca2165824e98c61890c0aaec470258d3119dd265d02be9438bf47e6",
    ],
    ['{"a":"é"}', "sha256:b3a092a6af48807fa9482b2ee140105575daa26d5b24b3c0e60a7e2dee6683b1"],
    ['{"a":"é"}', "sha256:30ab99c636f80168ea5dda59939352b6022c12941d2ffd3fd7d18fa7acd8565c"],
  ]) {
    assert.equal(await identifyCanonicalJson(canonical, sha256), expected);
  }
});

test("hashes exact source bytes without UTF-8 reinterpretation", async () => {
  const digest = await identifyBytes(Uint8Array.from([0x00, 0xff, 0x61, 0x80]), sha256);
  assert.equal(
    digest,
    "sha256:b04d8c327a36f532f52b6c9fa7600c8281f14b2fcd4ba2f522e183e8808cbc6a",
  );
});

test("parses, verifies, and rejects malformed artifact identities", async () => {
  const expected = parseArtifactId(
    "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  );
  await verifyArtifactIdentity("{}", expected, sha256);

  assert.throws(
    () => parseArtifactId("sha256:ABC"),
    (error) => error instanceof ArtifactProtocolError && error.code === "artifact.schema-invalid",
  );
  await assert.rejects(
    verifyArtifactIdentity(
      "{}",
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      sha256,
    ),
    (error) => error instanceof ArtifactProtocolError && error.code === "artifact.digest-mismatch",
  );
});

test("rejects a hashing port that does not return exactly 256 bits", async () => {
  await assert.rejects(
    identifyCanonicalJson("{}", {
      digestBytes: async () => new Uint8Array(31),
      digestUtf8: async () => new Uint8Array(31),
    }),
    (error) => error instanceof ArtifactProtocolError && error.code === "artifact.hash-failed",
  );
});

test("never assigns an artifact identity to noncanonical source bytes", async () => {
  await assert.rejects(
    identifyCanonicalJson(' {"a":1}', sha256),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.non-canonical-json"
    ),
  );
});

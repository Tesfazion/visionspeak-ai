import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptExternalAiKey, encryptExternalAiKey } from "../src/lib/external-ai-keys/crypto";

test("external AI keys are encrypted and can be decrypted with AUTH_SECRET", () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-auth-secret-for-ai-key-encryption";
  try {
    const rawKey = "provider-secret-key-value";
    const encrypted = encryptExternalAiKey(rawKey);
    assert.notEqual(encrypted, rawKey);
    assert.equal(encrypted.includes(rawKey), false);
    assert.deepEqual(decryptExternalAiKey(encrypted), { plaintext: rawKey, encrypted: true });
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});

test("external AI key decryption rejects tampered ciphertext", () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-auth-secret-for-ai-key-encryption";
  try {
    const encrypted = encryptExternalAiKey("provider-secret-key-value");
    const tampered = `${encrypted.slice(0, -2)}aa`;
    assert.throws(() => decryptExternalAiKey(tampered));
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});

test("legacy unencrypted keys can be read for one-time migration", () => {
  assert.deepEqual(decryptExternalAiKey("legacy-provider-key"), {
    plaintext: "legacy-provider-key",
    encrypted: false,
  });
});

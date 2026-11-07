import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET must be configured to protect AI provider keys.");
  return createHash("sha256").update("visionspeak-ai-key:v1\0").update(secret).digest();
}

export function encryptExternalAiKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptExternalAiKey(value: string): { plaintext: string; encrypted: boolean } {
  if (!value.startsWith(PREFIX)) return { plaintext: value, encrypted: false };
  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ciphertext) throw new Error("Stored AI provider key is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return { plaintext, encrypted: true };
}

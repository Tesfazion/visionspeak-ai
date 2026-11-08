import assert from "node:assert/strict";
import { after, test } from "node:test";
import { emailConfigured, sendEmail } from "@/lib/email";

const emailEnvKeys = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;
const originalEnv = new Map(emailEnvKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

after(() => {
  for (const key of emailEnvKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

function configureResend() {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "VisionSpeak <noreply@example.com>";
  process.env.SMTP_HOST = "";
  process.env.SMTP_FROM = "";
}

test("emailConfigured recognizes Resend credentials", () => {
  configureResend();
  assert.equal(emailConfigured(), true);
  delete process.env.RESEND_API_KEY;
  assert.equal(emailConfigured(), false);
});

test("sendEmail posts email content and attachments to Resend", async () => {
  configureResend();
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return Response.json({ id: "email_123" });
  };

  const result = await sendEmail({
    to: "person@example.com",
    subject: "Reset password",
    text: "Reset link",
    html: "<p>Reset link</p>",
    attachments: [{
      filename: "report.pdf",
      content: Buffer.from("pdf"),
      contentType: "application/pdf",
    }],
  });

  assert.deepEqual(result, { ok: true, messageId: "email_123" });
  assert.equal(requestUrl, "https://api.resend.com/emails");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer re_test_key");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    from: "VisionSpeak <noreply@example.com>",
    to: ["person@example.com"],
    subject: "Reset password",
    html: "<p>Reset link</p>",
    text: "Reset link",
    attachments: [{
      filename: "report.pdf",
      content: Buffer.from("pdf").toString("base64"),
      content_type: "application/pdf",
    }],
  });
});

test("sendEmail reports Resend API rejection", async () => {
  configureResend();
  globalThis.fetch = async () => Response.json({ message: "Invalid sender" }, { status: 422 });

  assert.deepEqual(await sendEmail({
    to: "person@example.com",
    subject: "Reset password",
    text: "Reset link",
    html: "<p>Reset link</p>",
  }), { ok: false, reason: "provider_rejected_422" });
});

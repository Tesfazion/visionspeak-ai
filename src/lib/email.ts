/**
 * Zero-dependency SMTP sender.
 *
 * Email is a configuration seam, not a built-in: set `SMTP_HOST`, `SMTP_PORT`,
 * `SMTP_SECURE` (implicit TLS on 465), `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`
 * to actually send. Without a host and sender the caller gets
 * `{ ok: false, reason: "not_configured" }` and a structured log line — the same
 * pattern as the billing checkout, so a deploy cannot accidentally pretend to
 * email nobody.
 *
 * No `nodemailer`: the platform already runs zero native dependencies, and SMTP
 * is a handful of commands. The transport is either implicit TLS (465) or a
 * plaintext connection **upgraded with STARTTLS before any credential is sent**
 * (587, the default). A server that offers neither gets no password — sending
 * one in the clear is worse than failing to send.
 */

import * as net from "node:net";
import * as tls from "node:tls";
import { logEvent } from "@/lib/log";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface EmailResult {
  ok: boolean;
  reason?: string;
  messageId?: string;
}

type SmtpSocket = net.Socket | tls.TLSSocket;

const TIMEOUT_MS = 15_000;
const readEnv = (key: string) => process.env[key]?.trim() || "";

export function emailConfigured() {
  return Boolean(readEnv("SMTP_HOST") && readEnv("SMTP_FROM"));
}

/**
 * Reads one complete SMTP reply. A reply can be multi-line (`250-…` followed by
 * `250 …`), and the final line is the one with a space after the code. Listeners
 * are detached on settle: leaving them attached leaked one per command and let a
 * stale listener swallow the next reply.
 */
function readReply(socket: SmtpSocket, ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      settle();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("SMTP timed out"))), ms);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      // The reply is complete when its last line is `NNN ` (space, not hyphen).
      const lines = buf.split("\r\n").filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      if (lines.length > 0 && /^\d{3} /.test(last)) finish(() => resolve(buf.trim()));
    };
    const onError = (err: Error) => finish(() => reject(err));
    const onClose = () => finish(() => resolve(buf.trim()));

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function expect(socket: SmtpSocket, code: number, ms = TIMEOUT_MS): Promise<string> {
  const reply = await readReply(socket, ms);
  const got = Number(reply.slice(0, 3));
  if (!Number.isFinite(got) || got !== code) {
    throw new Error(`SMTP expected ${code}, got "${reply.slice(0, 120)}"`);
  }
  return reply;
}

async function command(socket: SmtpSocket, line: string, code: number, ms = TIMEOUT_MS) {
  socket.write(`${line}\r\n`);
  return expect(socket, code, ms);
}

/** Base64 with the 76-character line breaks RFC 2045 asks for. */
function encoded(value: string | Buffer): string {
  const b64 = Buffer.from(value).toString("base64");
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

/** Header values must never carry a line break — that is header injection. */
function headerValue(value: string, field: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (!clean) throw new Error(`Email ${field} is empty`);
  return clean;
}

function buildMessage(
  options: EmailOptions,
  from: string,
  to: string,
  subject: string,
): string {
  const alt = `----=_Alt_${Date.now().toString(36)}`;
  const main = `----=_Main_${Date.now().toString(36)}`;

  // text + html belong in multipart/alternative; attachments wrap that in mixed.
  const alternative = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encoded(options.text),
    "",
    `--${alt}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encoded(options.html),
    "",
    `--${alt}--`,
  ];

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
  ];

  if (!options.attachments?.length) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      alternative.slice(2).join("\r\n"),
    ].join("\r\n");
  }

  const body = [
    `--${main}`,
    ...alternative,
    "",
    ...options.attachments.flatMap((att) => [
      `--${main}`,
      `Content-Type: ${att.contentType}; name="${headerValue(att.filename, "attachment name")}"`,
      `Content-Disposition: attachment; filename="${headerValue(att.filename, "attachment name")}"`,
      "Content-Transfer-Encoding: base64",
      "",
      encoded(att.content),
      "",
    ]),
    `--${main}--`,
  ];

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${main}"`,
    "",
    body.join("\r\n"),
  ].join("\r\n");
}

function openSocket(host: string, port: number, secure: boolean): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    if (secure) {
      const socket = tls.connect({ host, port, servername: host });
      const timer = setTimeout(() => reject(new Error("SMTP connection timed out")), TIMEOUT_MS);
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      return;
    }

    const socket = net.connect({ host, port });
    const timer = setTimeout(() => reject(new Error("SMTP connection timed out")), TIMEOUT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Starts TLS on the socket already connected to the server (STARTTLS). */
function upgrade(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host });
    const timer = setTimeout(() => reject(new Error("SMTP TLS handshake timed out")), TIMEOUT_MS);
    secure.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(secure);
    });
    secure.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const host = readEnv("SMTP_HOST");
  const port = Number(readEnv("SMTP_PORT") || "587");
  const secure = readEnv("SMTP_SECURE") === "1" || port === 465;
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const from = readEnv("SMTP_FROM");

  if (!host || !from) {
    logEvent("warn", "email.skipped", { reason: "not_configured", to: options.to });
    return { ok: false, reason: "not_configured" };
  }

  let socket: SmtpSocket | null = null;

  try {
    const to = headerValue(options.to, "recipient");
    if (!to.includes("@")) throw new Error("Email recipient is not an address");
    const subject = headerValue(options.subject, "subject");
    const sender = headerValue(from, "sender");

    socket = await openSocket(host, port, secure);
    await expect(socket, 220);

    let caps = await command(socket, "EHLO localhost", 250);
    if (!secure) {
      if (/\bSTARTTLS\b/i.test(caps)) {
        await command(socket, "STARTTLS", 220);
        socket = await upgrade(socket as net.Socket, host);
        caps = await command(socket, "EHLO localhost", 250);
      } else if (user && pass) {
        // The alternative is handing the password to anyone listening.
        throw new Error("Server does not offer STARTTLS; refusing to send credentials in the clear");
      }
    }

    if (user && pass) {
      await command(socket, "AUTH LOGIN", 334);
      socket.write(`${Buffer.from(user).toString("base64")}\r\n`);
      await expect(socket, 334);
      socket.write(`${Buffer.from(pass).toString("base64")}\r\n`);
      await expect(socket, 235);
    }

    await command(socket, `MAIL FROM:<${sender}>`, 250);
    await command(socket, `RCPT TO:<${to}>`, 250);
    await command(socket, "DATA", 354);

    const message = buildMessage(options, sender, to, subject);
    // Terminate the data block: CRLF "." CRLF. Base64 never produces a line
    // that starts with ".", so dot-stuffing is not needed.
    socket.write(`${message}\r\n.\r\n`);
    await expect(socket, 250);
    await command(socket, "QUIT", 221);

    return { ok: true };
  } catch (err) {
    logEvent("error", "email.send_failed", { to: options.to, error: String(err) });
    return { ok: false, reason: err instanceof Error ? err.message : "send failed" };
  } finally {
    socket?.destroy();
  }
}

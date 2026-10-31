// End-to-end check of the meeting room's HTTP signaling against a running server.
//
//   node scripts/qa/qa-meeting.mjs [origin]
//
// Uses one signed-up account and two signaling peers (two tabs) to prove:
// roster, chat fan-out, sender exclusion, targeted SDP and the 410 after the
// host ends the meeting. Output goes to docs/notes/meeting-qa.txt because this
// shell cannot capture a child process's stdout.
import { writeFileSync } from "node:fs";
import diagnostics from "../lib/diagnostics.cjs";

const origin = (process.argv[2] ?? "http://localhost:3131").replace(/\/$/, "");
const lines = [`origin=${origin}`, `at=${new Date().toISOString()}`];
let failures = 0;

function check(ok, label, detail = "") {
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* HTML page or 204 */
  }
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, json, text, cookies: setCookies, headers: res.headers };
}

function cookieHeader(cookies) {
  return cookies.map((value) => value.split(";")[0]).join("; ");
}

try {
  const email = `qa-meeting-${Date.now()}@example.com`;
  const password = "Meeting-QA-pass-2026";

  const signup = await req("/api/auth/signup", { method: "POST", body: { email, password } });
  check(signup.status === 201, "signup", `status=${signup.status}`);
  const cookie = cookieHeader(signup.cookies);
  check(Boolean(cookie), "session cookie captured");

  const unauth = await req("/api/meetings/signal/does-not-matter?since=0");
  check(unauth.status === 401, "signal requires a session", `status=${unauth.status}`);

  const created = await req("/api/meetings", {
    method: "POST",
    cookie,
    body: { title: "QA room", mode: "practice" },
  });
  const meetingId = created.json?.meeting?.id;
  check(created.status === 201 && Boolean(meetingId), "create meeting", `status=${created.status}`);

  const lobby = await req("/meeting", { cookie });
  check(lobby.status === 200, "lobby page renders", `status=${lobby.status}`);
  check(
    lobby.text.includes("Meeting room") || lobby.text.includes("New meeting"),
    "lobby shows the create/join panels",
  );

  const roomPage = await req(`/meeting/${encodeURIComponent(meetingId)}`, { cookie });
  check(roomPage.status === 200, "room page renders for the host", `status=${roomPage.status}`);
  check(roomPage.text.includes("QA room"), "room page shows the meeting title");

  const anonymous = await req("/meeting");
  check(anonymous.status === 307, "lobby redirects signed-out visitors", `status=${anonymous.status}`);
  check(
    (anonymous.headers.get("location") ?? "").includes("/login"),
    "signed-out redirect targets /login",
  );

  const signalPath = `/api/meetings/signal/${encodeURIComponent(meetingId)}`;

  const peerA = await req(`${signalPath}?since=0`, { cookie });
  const a = peerA.json;
  check(peerA.status === 200 && Boolean(a?.peerId), "peer A joins", `status=${peerA.status}`);
  check(a?.peers?.length === 1, "room starts with one peer", `peers=${a?.peers?.length}`);
  check(a?.peerId && a.peers[0]?.role === "host", "creator is the host");

  const peerB = await req(`${signalPath}?since=0`, { cookie });
  const b = peerB.json;
  check(peerB.status === 200 && b?.peerId !== a?.peerId, "peer B joins as a distinct peer");
  check(b?.peers?.length === 2, "roster shows both peers", `peers=${b?.peers?.length}`);

  const chatPost = await req(signalPath, {
    method: "POST",
    cookie,
    body: { peerId: a.peerId, type: "chat", text: "hello room", at: Date.now() },
  });
  check(chatPost.status === 200, "peer A posts chat", `status=${chatPost.status}`);

  const bNext = await req(`${signalPath}?peer=${encodeURIComponent(b.peerId)}&since=${b.seq}`, { cookie });
  const bEvents = bNext.json?.events ?? [];
  check(
    bEvents.some((event) => event.type === "chat" && event.text === "hello room"),
    "peer B receives the chat",
  );

  const aNext = await req(`${signalPath}?peer=${encodeURIComponent(a.peerId)}&since=${a.seq}`, { cookie });
  check(
    !(aNext.json?.events ?? []).some((event) => event.type === "chat"),
    "sender does not receive its own chat",
  );

  const offerPost = await req(signalPath, {
    method: "POST",
    cookie,
    body: { peerId: a.peerId, type: "offer", to: b.peerId, sdp: "v=0" },
  });
  check(offerPost.status === 200, "peer A posts an offer", `status=${offerPost.status}`);

  const bOffer = await req(
    `${signalPath}?peer=${encodeURIComponent(b.peerId)}&since=${bNext.json?.seq ?? b.seq}`,
    { cookie },
  );
  check(
    (bOffer.json?.events ?? []).some((event) => event.type === "offer" && event.sdp === "v=0"),
    "the offer is delivered to its target",
  );

  const leave = await req(`${signalPath}?peer=${encodeURIComponent(b.peerId)}`, {
    method: "DELETE",
    cookie,
  });
  check(leave.status === 200, "peer B leaves", `status=${leave.status}`);

  const ended = await req(`/api/meetings/${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
    cookie,
  });
  check(ended.status === 200, "host ends the meeting", `status=${ended.status}`);

  const afterEnd = await req(`${signalPath}?since=0`, { cookie });
  check(afterEnd.status === 410, "signaling refuses an ended meeting", `status=${afterEnd.status}`);
} catch (err) {
  failures++;
  lines.push(`ERROR ${String(err?.stack ?? err)}`);
}

lines.push(failures === 0 ? "RESULT all checks passed" : `RESULT ${failures} check(s) failed`);
writeFileSync(diagnostics.notePath("meeting-qa.txt"), lines.join("\n") + "\n", "utf8");
process.exit(failures === 0 ? 0 : 1);

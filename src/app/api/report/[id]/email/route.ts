import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/store";
import { renderReportPdf } from "@/lib/pdf";
import { sendEmail } from "@/lib/email";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Emails a report as a PDF attachment.
 *
 * Only the owner may email their own report — a share link is for public
 * viewing, not for forwarding the raw numbers. The PDF is regenerated on each
 * send so a redaction toggle (off by default) can strip the transcript before
 * it leaves the sender's account.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to email a report." }, { status: 401 });

  const { id } = await params;
  const session = await getSession(id, user.id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  let body: { to?: unknown; redact?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 422 });
  }

  const redact = body.redact === true;
  const pdf = await renderReportPdf(session, { redactTranscript: redact });

  const result = await sendEmail({
    to,
    subject: `${session.title} — VisionSpeak report`,
    html: `<p>Here is the report for <strong>${session.title}</strong>, scored ${session.report.grade} (${session.report.overall}/100).</p><p>The PDF is attached.</p>`,
    text: `${session.title} — scored ${session.report.grade} (${session.report.overall}/100). The PDF is attached.`,
    attachments: [
      {
        filename: `visionspeak-${session.id}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  logEvent(result.ok ? "info" : "warn", "report.emailed", {
    requestId,
    userId: user.id,
    sessionId: id,
    to,
    redact,
    ok: result.ok,
    reason: result.reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "not_configured" ? "Email is not configured for this deployment." : "Could not send the email." },
      { status: result.reason === "not_configured" ? 410 : 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
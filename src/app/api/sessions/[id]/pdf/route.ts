import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSession } from "@/lib/store";
import { planFor } from "@/lib/plans";
import { renderReportPdf } from "@/lib/pdf";
import { logEvent, newRequestId } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const session = await getSession(id, user.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const plan = planFor(user.plan);
  if (!plan.pdfExport) {
    return NextResponse.json({ error: "PDF export is not available on your plan." }, { status: 403 });
  }

  try {
    const buffer = await renderReportPdf(session);
    logEvent("info", "report.pdf_exported", { requestId, userId: user.id, sessionId: id });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="visionspeak-${session.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logEvent("error", "report.pdf_failed", { requestId, error: String(err) });
    return NextResponse.json({ error: "Could not generate the PDF." }, { status: 500 });
  }
}
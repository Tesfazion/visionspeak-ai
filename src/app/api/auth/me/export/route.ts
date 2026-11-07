import { getCurrentUser } from "@/lib/auth";
import { buildAccountExport } from "@/lib/account-export";
import { listExternalAiKeys } from "@/lib/external-ai-keys/store";
import { listMeetingsForUser } from "@/lib/meeting/store";
import { logEvent, newRequestId } from "@/lib/log";
import { listSessions } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [sessions, meetings, aiProviderKeys] = await Promise.all([
      listSessions(user.id, { includeSamples: false }),
      listMeetingsForUser(user.id),
      listExternalAiKeys(user.id),
    ]);
    const archive = buildAccountExport({ user, sessions, meetings, aiProviderKeys });
    const date = archive.exportedAt.slice(0, 10);

    logEvent("info", "auth.account_exported", { requestId, userId: user.id });
    return new Response(JSON.stringify(archive, null, 2), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="visionspeak-account-export-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    logEvent("error", "auth.account_export_failed", {
      requestId,
      userId: user.id,
      error: String(error),
    });
    return Response.json(
      { error: "Could not export account data." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

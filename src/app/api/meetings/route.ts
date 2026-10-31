import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createMeeting, listMeetingsForUser } from "@/lib/meeting/store";

export const dynamic = "force-dynamic";

/** List the meetings the caller has attended. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ meetings: listMeetingsForUser(user.id) });
}

/** Create a new live meeting. Body: { title?, mode? }. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { title?: string; mode?: string } = {};
  try {
    body = (await req.json()) as { title?: string; mode?: string };
  } catch {
    /* empty body is fine */
  }
  const mode = body.mode === "presentation" || body.mode === "interview" ? body.mode : "practice";
  const meeting = createMeeting({
    title: body.title ?? "",
    mode,
    hostId: user.id,
    hostName: user.name,
    hostEmail: user.email,
  });
  return NextResponse.json({ meeting }, { status: 201 });
}
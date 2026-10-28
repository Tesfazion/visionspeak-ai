import { NextResponse } from "next/server";
import { createUser, validateCredentials } from "@/lib/auth-core";
import { setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateCredentials(body as Record<string, unknown>);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  try {
    const result = await createUser(parsed);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await setSessionCookie(result.user.id);
    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch (err) {
    console.error("[auth] signup failed", err);
    return NextResponse.json({ error: "The account could not be created." }, { status: 500 });
  }
}

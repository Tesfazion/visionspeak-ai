import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteExternalAiKey, setExternalAiKeyModel } from "@/lib/external-ai-keys/store";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id: keyId } = await params;
    const success = await deleteExternalAiKey(keyId, user.id);

    if (!success) {
      return Response.json({ error: "Key not found or access denied." }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[ai] DELETE error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { model } = body;

    if (!model || typeof model !== "string") {
      return Response.json(
        { error: "model is required." },
        { status: 400 }
      );
    }

    const { id: keyId } = await params;
    const success = await setExternalAiKeyModel(keyId, user.id, model);

    if (!success) {
      return Response.json({ error: "Key not found or access denied." }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[ai] PATCH error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
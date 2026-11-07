import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDemoHistory } from "@/lib/analysis/demo";
import { buildAccountExport } from "@/lib/account-export";
import type { ExternalAiKeySummary } from "@/lib/external-ai-keys/types";
import type { Meeting } from "@/lib/meeting/store";
import type { PublicUser } from "@/lib/auth-core";

const user: PublicUser = {
  id: "user-1",
  email: "speaker@example.com",
  name: "Speaker",
  createdAt: "2026-11-01T10:00:00.000Z",
  plan: "pro",
};

test("account export excludes bearer tokens and third-party credentials", () => {
  const session = {
    ...buildDemoHistory()[0],
    ownerId: user.id,
    clientSessionId: "idempotency-value",
    share: {
      token: "secret-share-token",
      createdAt: "2026-11-02T10:00:00.000Z",
      expiresAt: "2026-11-09T10:00:00.000Z",
    },
  };
  const meeting: Meeting = {
    id: "meeting-1",
    title: "Practice",
    mode: "practice",
    createdAt: "2026-11-03T10:00:00.000Z",
    hostId: user.id,
    participants: [
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "host",
        joinedAt: "2026-11-03T10:00:00.000Z",
        muted: false,
        videoOff: false,
        screenSharing: false,
      },
      {
        id: "user-2",
        name: "Other speaker",
        email: "other@example.com",
        role: "participant",
        joinedAt: "2026-11-03T10:01:00.000Z",
        muted: false,
        videoOff: false,
        screenSharing: false,
      },
    ],
    status: "ended",
    transcript: "Practice transcript",
    notes: "Coaching notes",
    schemaVersion: 1,
  };
  const aiProviderKey: ExternalAiKeySummary = {
    id: "key-1",
    provider: "openai",
    label: "My key",
    prefix: "openai:sk-secret",
    model: "gpt-4o-mini",
    createdAt: "2026-11-01T10:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
  };

  const archive = buildAccountExport({
    user,
    sessions: [session],
    meetings: [meeting],
    aiProviderKeys: [aiProviderKey],
    exportedAt: "2026-11-07T10:00:00.000Z",
  });
  const serialized = JSON.stringify(archive);

  assert.equal(archive.exportVersion, 1);
  assert.equal(archive.exportedAt, "2026-11-07T10:00:00.000Z");
  assert.equal(archive.sessions[0].share?.expiresAt, session.share.expiresAt);
  assert.equal("token" in (archive.sessions[0].share ?? {}), false);
  assert.equal(archive.meetings[0].participants.length, 1);
  assert.equal(archive.aiProviderKeys[0].provider, "openai");
  assert.equal(serialized.includes("secret-share-token"), false);
  assert.equal(serialized.includes("sk-secret"), false);
  assert.equal(serialized.includes("other@example.com"), false);
});

import type { PublicUser } from "@/lib/auth-core";
import type { SessionRecord, ShareLink } from "@/lib/types";
import type { ExternalAiKeySummary } from "@/lib/external-ai-keys/types";
import type { Meeting, MeetingParticipant } from "@/lib/meeting/store";

type ExportedSession = Omit<SessionRecord, "share"> & {
  share?: Omit<ShareLink, "token">;
};

type ExportedMeeting = Omit<Meeting, "participants"> & {
  participants: Pick<MeetingParticipant, "id" | "name" | "email" | "role" | "joinedAt">[];
};

type ExportedAiKey = Pick<
  ExternalAiKeySummary,
  "id" | "provider" | "label" | "model" | "createdAt" | "lastUsedAt" | "useCount"
>;

export interface AccountExport {
  exportVersion: 1;
  exportedAt: string;
  account: Omit<PublicUser, "billing"> & {
    billing?: Omit<NonNullable<PublicUser["billing"]>, "customerPortalUrl">;
  };
  sessions: ExportedSession[];
  meetings: ExportedMeeting[];
  aiProviderKeys: ExportedAiKey[];
}

export function buildAccountExport(input: {
  user: PublicUser;
  sessions: SessionRecord[];
  meetings: Meeting[];
  aiProviderKeys: ExternalAiKeySummary[];
  exportedAt?: string;
}): AccountExport {
  const { user, sessions, meetings, aiProviderKeys } = input;

  return {
    exportVersion: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      plan: user.plan,
      emailVerifiedAt: user.emailVerifiedAt,
      teamId: user.teamId,
      teamRole: user.teamRole,
      ...(user.billing
        ? {
            billing: {
              provider: user.billing.provider,
              subscriptionId: user.billing.subscriptionId,
              customerId: user.billing.customerId,
              status: user.billing.status,
              endsAt: user.billing.endsAt,
              updatedAt: user.billing.updatedAt,
            },
          }
        : {}),
    },
    sessions: sessions.map((session) => ({
      ...session,
      share: session.share
        ? { createdAt: session.share.createdAt, expiresAt: session.share.expiresAt }
        : undefined,
    })),
    meetings: meetings.map((meeting) => ({
      ...meeting,
      participants: meeting.participants
        .filter((participant) => participant.id === user.id)
        .map(({ id, name, email, role, joinedAt }) => ({ id, name, email, role, joinedAt })),
    })),
    aiProviderKeys: aiProviderKeys.map(({ id, provider, label, model, createdAt, lastUsedAt, useCount }) => ({
      id,
      provider,
      label,
      model,
      createdAt,
      lastUsedAt,
      useCount,
    })),
  };
}

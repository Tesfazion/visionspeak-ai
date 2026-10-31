import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMeeting, joinMeeting } from "@/lib/meeting/store";
import { MeetingRoom } from "@/components/meeting/meeting-room";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/meeting/${id}`)}`);

  let meeting = getMeeting(id);
  if (!meeting || meeting.status !== "live") notFound();

  // Invite links are the sharing model: any signed-in account that has the id
  // may join a live room, and joining records them in the meeting store.
  if (!meeting.participants.some((p) => p.id === user.id)) {
    meeting = joinMeeting(id, { userId: user.id, name: user.name, email: user.email });
    if (!meeting) notFound();
  }

  return (
    <div className="pt-16">
      <Suspense fallback={<div className="panel m-4 h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <MeetingRoom
          meetingId={meeting.id}
          title={meeting.title}
          mode={meeting.mode}
          selfName={user.name}
          selfRole={meeting.hostId === user.id ? "host" : "participant"}
        />
      </Suspense>
    </div>
  );
}

import { redirect } from "next/navigation";
import { AiKeysPanel } from "@/components/ai/ai-keys-panel";
import { AiWorkspace } from "@/components/ai/ai-workspace";
import { getCurrentUser, loginHref } from "@/lib/auth";
import { listSessions } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI speaking coach",
  description: "Chat with your AI provider and get personalized feedback on saved speaking sessions.",
};

export default async function AiPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/ai"));
  const records = await listSessions(user.id, { includeSamples: false });
  const sessions = records
    .filter((record) => record.ownerId === user.id && record.source === "live")
    .map(({ id, title, createdAt, report, mode }) => ({
      id,
      title,
      createdAt,
      overall: report.overall,
      mode,
    }));

  return (
    <main className="container-page py-24">
      <div className="mx-auto max-w-6xl">
        <div className="eyebrow">AI workspace</div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-ink sm:text-[34px]">Your AI speaking coach</h1>
        <p className="pretty mt-3 max-w-2xl text-[14px] leading-relaxed text-fog">
          Chat with your selected provider or get tailored suggestions from a session you have saved.
          Connect a provider key below to get started.
        </p>
        <div className="mt-7">
          <AiWorkspace sessions={sessions} />
        </div>
        <section className="mt-7" aria-label="AI provider settings">
          <AiKeysPanel />
        </section>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Field, Label } from "@/components/ui";
import type { AiProvider, ExternalAiKeySummary, MentorResponse } from "@/lib/external-ai-keys/types";

type SessionOption = { id: string; title: string; createdAt: string; overall: number; mode: string };
type ChatMessage = { role: "user" | "assistant"; content: string; model?: string; provider?: AiProvider };

function boundedHistory(messages: ChatMessage[]) {
  let remaining = 12_000;
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const { role, content } of messages.slice(-20).reverse()) {
    if (remaining === 0) break;
    const clipped = content.slice(-Math.min(4000, remaining));
    history.unshift({ role, content: clipped });
    remaining -= clipped.length;
  }
  return history;
}

export function AiWorkspace({ sessions }: { sessions: SessionOption[] }) {
  const [keys, setKeys] = useState<ExternalAiKeySummary[]>([]);
  const [keyId, setKeyId] = useState("");
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [mentorBusy, setMentorBusy] = useState(false);
  const [mentor, setMentor] = useState<MentorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/keys", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load provider keys.");
        if (active) {
          setKeys(data as ExternalAiKeySummary[]);
          setKeyId((current) => current || (data[0]?.id ?? ""));
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load provider keys.");
      });
    return () => { active = false; };
  }, []);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || !keyId || chatBusy) return;
    setError(null);
    setMessage("");
    setChatBusy(true);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    try {
      const response = await fetch("/api/ai/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          keyId,
          history: boundedHistory(messages),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI chat request failed.");
      setMessages([...nextMessages, { role: "assistant", content: result.content, model: result.model, provider: result.provider }]);
    } catch (err) {
      setMessages(messages);
      setMessage(text);
      setError(err instanceof Error ? err.message : "AI chat request failed.");
    } finally {
      setChatBusy(false);
    }
  };

  const requestMentor = async () => {
    if (!sessionId || !keyId || mentorBusy) return;
    setError(null);
    setMentor(null);
    setMentorBusy(true);
    try {
      const response = await fetch("/api/ai/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, keyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not analyze this session.");
      setMentor(result as MentorResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze this session.");
    } finally {
      setMentorBusy(false);
    }
  };

  const selectedSession = sessions.find((session) => session.id === sessionId);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
      <Card className="flex min-h-[540px] flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">AI speaking assistant</h2>
            <p className="mt-1 text-[13px] text-fog">Ask for practice plans, presentation advice, or help with delivery.</p>
          </div>
          {keys.length > 0 && (
            <select
              aria-label="AI provider key"
              value={keyId}
              onChange={(event) => setKeyId(event.target.value)}
              className="min-h-11 max-w-full rounded-xl border border-line bg-base px-3 text-[13px] text-ink"
            >
              {keys.map((key) => <option key={key.id} value={key.id}>{key.label} · {key.provider}</option>)}
            </select>
          )}
        </div>

        {keys.length === 0 ? (
          <div className="my-auto rounded-xl border border-line bg-raised/40 p-5 text-center">
            <p className="text-[14px] text-ink">Connect your own AI provider to start a conversation.</p>
            <Link href="/account" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[14px] font-medium text-white">
              Set up BYOK in Account
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-5 flex-1 space-y-3 overflow-y-auto rounded-xl border border-line bg-base/50 p-3" aria-live="polite">
              {messages.length === 0 ? (
                <p className="p-3 text-[13px] text-fog">Start with a question like “How can I sound more confident in a job interview?”</p>
              ) : messages.map((entry, index) => (
                <div key={`${entry.role}-${index}`} className={`max-w-[90%] rounded-2xl px-4 py-3 ${entry.role === "user" ? "ml-auto bg-brand/15 text-ink" : "bg-raised text-ink"}`}>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{entry.content}</p>
                  {entry.model && <p className="mt-2 text-[11px] text-fog">{entry.provider} · {entry.model}</p>}
                </div>
              ))}
              {chatBusy && <p className="px-3 py-2 text-[13px] text-fog">Thinking…</p>}
            </div>
            <form onSubmit={sendMessage} className="mt-4">
              <Field>
                <Label htmlFor="ai-message">Your message</Label>
                <textarea
                  id="ai-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={4000}
                  rows={3}
                  placeholder="What would you like to improve?"
                  className="w-full resize-y rounded-xl border border-line bg-base px-3 py-3 text-[14px] text-ink outline-none placeholder:text-fog focus:border-brand"
                  disabled={chatBusy}
                />
              </Field>
              <button type="submit" disabled={!message.trim() || chatBusy} className="mt-3 min-h-11 rounded-xl bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand/90 disabled:opacity-50">
                {chatBusy ? "Sending…" : "Send message"}
              </button>
            </form>
          </>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-[18px] font-semibold text-ink">Session feedback</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-fog">
          Get AI insights based on your saved scores and coaching report. Your transcript is not sent.
        </p>
        {sessions.length === 0 ? (
          <div className="mt-5 rounded-xl border border-line bg-raised/40 p-4">
            <p className="text-[13px] text-fog">Save a live practice session first to request personalized feedback.</p>
            <Link href="/studio" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[14px] text-ink hover:bg-raised">
              Open studio
            </Link>
          </div>
        ) : (
          <>
            <Field className="mt-5">
              <Label htmlFor="mentor-session">Saved session</Label>
              <select id="mentor-session" value={sessionId} onChange={(event) => { setSessionId(event.target.value); setMentor(null); }} className="min-h-11 w-full rounded-xl border border-line bg-base px-3 text-[14px] text-ink">
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {session.overall}/100 · {session.createdAt.slice(0, 10)}
                  </option>
                ))}
              </select>
            </Field>
            {selectedSession && <p className="mt-3 text-[12px] text-fog">Mode: {selectedSession.mode} · score {selectedSession.overall}/100</p>}
            <button type="button" onClick={() => void requestMentor()} disabled={!keyId || mentorBusy} className="mt-4 min-h-11 rounded-xl border border-brand/40 bg-brand/10 px-4 text-[14px] font-medium text-brand-soft hover:bg-brand/15 disabled:opacity-50">
              {mentorBusy ? "Analyzing session…" : "Generate AI feedback"}
            </button>
          </>
        )}

        {mentor && (
          <div className="mt-5 space-y-4 border-t border-line pt-5">
            <p className="text-[14px] font-medium text-ink">Session grade: {mentor.grade}/10</p>
            <div>
              <h3 className="text-[13px] font-semibold text-ink">What went well</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-fog">
                {mentor.insights.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-ink">Try next</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-fog">
                {mentor.suggestions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            </div>
            <p className="text-[11px] text-fog">{mentor.provider} · {mentor.model}</p>
          </div>
        )}
      </Card>
      {error && <p role="alert" className="text-[13px] text-rose lg:col-span-2">{error}</p>}
    </div>
  );
}

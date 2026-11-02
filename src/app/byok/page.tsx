import { getCurrentUser } from "@/lib/auth";
import { normalisePlan } from "@/lib/plans";

export default async function BYOKSettingsPage() {
  const user = await getCurrentUser();
  const plan = normalisePlan(user?.plan);

  return (
    <div className="container-page py-24">
      <h1 className="text-2xl font-semibold text-ink mb-2">Bring Your Own Key (BYOK)</h1>
      <p className="text-mist mb-10">
        Configure an external AI provider to enrich your session analysis. Your API key stays
        server-side only — it is never sent to the browser.
      </p>

      {plan !== "pro" && (
        <div className="rounded-xl border border-line/70 bg-raised/40 p-4 mb-6">
          <p className="text-sm text-warn">Pro plan required</p>
          <p className="text-mist text-xs mt-1">Upgrade to Pro to use external AI providers.</p>
        </div>
      )}

      {!user && (
        <div className="rounded-xl border border-line/70 bg-raised/40 p-4 mb-6">
          <p className="text-sm text-warn">Sign in required</p>
          <p className="text-mist text-xs mt-1">Sign in to manage your BYOK key.</p>
        </div>
      )}

      {user && plan === "pro" && (
        <BYOKSettingsForm />
      )}
    </div>
  );
}

function BYOKSettingsForm() {
  return (
    <form className="space-y-4 max-w-2xl" action="/api/byok" method="POST">
      <div className="rounded-xl border border-line/70 bg-raised/40 p-5">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-[0.16em] mb-4">Configure provider</h2>
        <div className="space-y-3">
          <label className="text-sm text-ink">Provider</label>
          <select name="provider" className="w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-ink focus:border-brand">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-line/70 bg-raised/40 p-5">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-[0.16em] mb-4">API key</h2>
        <div className="space-y-3">
          <label className="text-sm text-ink">Your API key</label>
          <input
            name="apiKey"
            type="password"
            placeholder="sk-…"
            className="w-full rounded-lg border border-line bg-base px-3 py-2.5 text-sm text-ink focus:border-brand"
            required
          />
          <p className="text-xs text-mist">Stored server-side only. Never exposed to the browser.</p>
        </div>
      </div>

      <button
        type="submit"
        className="inline-flex items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
      >
        Save API key
      </button>
    </form>
  );
}

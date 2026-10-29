import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What VisionSpeak AI processes on your device, what it stores, for how long, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

// TODO(legal): set NEXT_PUBLIC_LEGAL_ENTITY and NEXT_PUBLIC_SUPPORT_EMAIL, and
// have counsel review this page and /terms before taking payment.
const entity = process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim() || "VisionSpeak AI";
const contact = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@visionspeak.ai";
const updated = "29 October 2026";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-7">
    <h2 className="text-[13.5px] font-medium text-ink">{title}</h2>
    <div className="pretty mt-2 space-y-2 text-[12px] leading-relaxed text-fog">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <div className="container-page pb-10 pt-24">
      <div className="mx-auto max-w-2xl">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
          Privacy policy
        </h1>
        <p className="mt-2 text-[11px] text-fog/80">Last updated {updated} · {entity}</p>

        <div className="panel mt-6 p-5">
          <Section title="The short version">
            <p>
              Your camera frames, microphone audio and body landmarks are processed in your browser and
              never uploaded. When you finish a session, the derived measurements — numbers, scores and
              the transcript text your browser produced — are saved to your account so the report exists
              after you close the tab.
            </p>
          </Section>

          <Section title="What is processed on your device">
            <p>
              Video frames, audio and body landmarks are used by the analysis engine in the browser
              tab. They are not transmitted, recorded to disk by us, or written to a server. Closing the
              studio ends the camera and microphone tracks immediately.
            </p>
          </Section>

          <Section title="What we store">
            <ul className="list-disc space-y-1 pl-5">
              <li>Account: your name, email address, a salted scrypt hash of your password, plan and sign-up date.</li>
              <li>Session: the derived metrics, the generated report, your chosen title, speaker name and mode.</li>
              <li>Transcript: the text your browser&apos;s speech recogniser produced, if that browser supports it.</li>
              <li>Session cookie: a signed, expiring token. It contains your user id and an expiry — no personal details.</li>
            </ul>
            <p>
              We do not store video, audio, landmarks or raw images. We do not run advertising or
              third-party tracking scripts.
            </p>
          </Section>

          <Section title="Where it is stored">
            <p>
              Accounts and sessions live in a JSON data store operated for this deployment. If the
              deployment runs on a serverless host without a durable volume, the platform reports
              storage as <span className="text-mist">temporary</span> in <code>/api/health</code> and on your
              dashboard, and data may be lost when the instance restarts.
            </p>
          </Section>

          <Section title="Who can read a report">
            <p>
              Only you, unless you create a share link. A share link is unguessable, expires (7 days on
              Free, 30 days on Pro) and can be revoked at any time from the report page. Sample reports
              are public marketing material. We do not sell data or share it with advertisers.
            </p>
          </Section>

          <Section title="Retention and deletion">
            <p>
              You can delete any session from its report page — that removes the stored metrics and
              transcript from the data store. The Free plan keeps 30 days of history visible; Pro keeps
              everything until you delete it. To delete your account and all of its data, email{" "}
              <a href={`mailto:${contact}`} className="text-brand-soft hover:text-brand">
                {contact}
              </a>
              .
            </p>
          </Section>

          <Section title="Cookies">
            <p>
              One essential cookie (<code>vs_session</code>) keeps you signed in. It is
              <span className="text-mist"> httpOnly</span>, SameSite=Lax, Secure in production, and expires
              after 30 days. There are no analytics or marketing cookies, so there is no consent banner.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Depending on where you live you may have the right to access, correct, export, restrict or
              delete your personal data, and to object to processing. You can export a single report as
              JSON (and, on Pro, CSV) from the report page; for a full export or erasure, contact us.
              Requests are answered within 30 days.
            </p>
          </Section>

          <Section title="Children">
            <p>
              The service is not directed at children under 16. If you believe a child has created an
              account, contact us and we will remove it.
            </p>
          </Section>

          <Section title="Changes and contact">
            <p>
              Material changes will be announced in the product before they take effect. Questions or
              requests: <a href={`mailto:${contact}`} className="text-brand-soft hover:text-brand">{contact}</a>.
            </p>
          </Section>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms that govern use of VisionSpeak AI, including plans, acceptable use and limits.",
  alternates: { canonical: "/terms" },
};

// TODO(legal): operator name, jurisdiction and support address are configured by
// environment. Have counsel review before billing goes live.
const entity = process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim() || "VisionSpeak AI";
const contact = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@visionspeak.ai";
const jurisdiction = process.env.NEXT_PUBLIC_LEGAL_JURISDICTION?.trim() || "the operator's jurisdiction";
const updated = "29 October 2026";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-7">
    <h2 className="text-[13.5px] font-medium text-ink">{title}</h2>
    <div className="pretty mt-2 space-y-2 text-[12px] leading-relaxed text-fog">{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <div className="container-page pb-10 pt-24">
      <div className="mx-auto max-w-2xl">
        <div className="eyebrow">Legal</div>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
          Terms of service
        </h1>
        <p className="mt-2 text-[11px] text-fog/80">
          Last updated {updated} · {entity}
        </p>

        <div className="panel mt-6 p-5">
          <Section title="1. Agreement">
            <p>
              By creating an account or using the studio you agree to these terms. If you use VisionSpeak
              AI for an employer or client, you confirm you are authorised to accept them on their behalf.
            </p>
          </Section>

          <Section title="2. Accounts">
            <p>
              You must give a working email address and keep your password confidential. One person per
              account: credentials may not be shared. You are responsible for activity under your account,
              and you must tell us promptly if you believe it has been compromised.
            </p>
          </Section>

          <Section title="3. Plans, quotas and billing">
            <p>
              Free and Pro plans differ in monthly analyses, maximum session length, history retention,
              share-link lifetime and export. The limits shown on the pricing page are the limits the API
              enforces; a session that fails to save does not consume quota.
            </p>
            <p>
              Paid plans renew automatically until cancelled. Cancelling stops the next renewal and keeps
              the plan active until the end of the paid period. Where a checkout is not enabled for a
              deployment, nothing is charged and Pro features remain unavailable.
            </p>
          </Section>

          <Section title="4. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>analyse people who have not consented to being recorded;</li>
              <li>upload content that is unlawful, or use the service to harass or discriminate;</li>
              <li>attempt to bypass quotas, rate limits or authentication, or probe other accounts&apos; data;</li>
              <li>scrape, resell or rebrand the service without a written agreement;</li>
              <li>interfere with the service&apos;s availability, including automated bulk submissions.</li>
            </ul>
            <p>We may suspend an account that breaches these rules, after notice where it is practical.</p>
          </Section>

          <Section title="5. Your content">
            <p>
              You keep all rights to your recordings, transcripts and reports. You grant us the limited
              licence needed to store, process and display them back to you and to anyone you share a link
              with. We do not use your sessions to train models, and we do not publish them. Sample
              reports shipped with the product are ours.
            </p>
          </Section>

          <Section title="6. Scores are coaching, not assessment">
            <p>
              VisionSpeak produces behavioural estimates from a camera and a microphone. They are useful
              for practice and are not a psychometric test, a hiring decision, a medical assessment or a
              professional certification. Do not use a score as the sole basis for an employment,
              academic or clinical decision.
            </p>
          </Section>

          <Section title="7. Availability and changes">
            <p>
              The service is provided as-is and may change, including limits and features. We aim for high
              availability but do not guarantee uninterrupted service. Where storage is reported as
              temporary, data may be lost on restart — export anything you need to keep.
            </p>
          </Section>

          <Section title="8. Liability">
            <p>
              To the maximum extent permitted by law, our aggregate liability for any claim relating to the
              service is limited to the amount you paid in the twelve months before the claim. We are not
              liable for indirect or consequential loss, including lost opportunities or lost data where
              you were warned that storage was temporary.
            </p>
          </Section>

          <Section title="9. Termination">
            <p>
              You may stop using the service at any time and ask us to delete your account. We may
              terminate an account for a material breach of these terms, or where required by law.
            </p>
          </Section>

          <Section title="10. Governing law and contact">
            <p>
              These terms are governed by the laws of {jurisdiction}, without regard to conflict-of-law
              rules. Questions:{" "}
              <a href={`mailto:${contact}`} className="text-brand-soft hover:text-brand">
                {contact}
              </a>
              .
            </p>
          </Section>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}

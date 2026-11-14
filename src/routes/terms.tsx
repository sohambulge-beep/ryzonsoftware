import { createFileRoute } from "@tanstack/react-router";
import LegalPage, { Section } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Terms of use • Prime Terminal" },
      { name: "description", content: "The terms for using Prime Terminal." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="November 2026">
      <Section title="1. What this app is">
        <p>
          Prime Terminal (also shown as TapTrack) helps a bar or restaurant keep billing, stock, customer credit,
          excise and bank records. It is a record-keeping tool.
        </p>
      </Section>
      <Section title="2. Your account">
        <p>
          You get a username and password from us. Keep them private. You are responsible for everything done under
          your login, including by your staff. Do not share one login between unrelated businesses.
        </p>
      </Section>
      <Section title="3. Your records and your responsibility">
        <p>
          The numbers in the app come from what you and your staff enter, so please check them. The app is not tax,
          excise or legal advice. You stay responsible for your registers, returns and payments (such as excise, VAT
          and GST) and for following the rules of your state. Ask your CA or the excise officer if you are not sure.
        </p>
      </Section>
      <Section title="4. Plan and payment">
        <p>
          You use the app on the plan and price we agreed with you. If the paid period ends and is not renewed, the
          app can lock after a grace period. Your data is not deleted when it locks, and you can download it from the
          Help tab.
        </p>
      </Section>
      <Section title="5. Your data">
        <p>
          Your business data is yours. You can download it from the Help tab at any time. Please keep your own copies
          too.
        </p>
      </Section>
      <Section title="6. Availability and changes">
        <p>
          We try to keep the app working, including without internet, but we cannot promise that it will always be
          available or free of mistakes. We may improve or change features.
        </p>
      </Section>
      <Section title="7. Acceptable use">
        <p>
          Use the app only for lawful business. Do not try to break into the app or to see the data of another
          business.
        </p>
      </Section>
      <Section title="8. Our responsibility">
        <p>
          To the extent the law allows, the app is provided as it is. We are not responsible for lost profit, fines, or
          loss caused by wrong entries, lost devices, or things outside our control. Where the law allows a limit, our
          total responsibility is limited to the fees you paid in the last 3 months.
        </p>
      </Section>
      <Section title="9. Ending">
        <p>
          You can stop using the app at any time. We may suspend an account that is misused. Ask us and we will delete
          your data within 30 days, after you have downloaded what you need.
        </p>
      </Section>
      <Section title="10. Changes to these terms">
        <p>We may update these terms. If you keep using the app after a change, you accept the new terms.</p>
      </Section>
    </LegalPage>
  );
}

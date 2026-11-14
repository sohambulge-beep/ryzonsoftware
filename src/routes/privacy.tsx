import { createFileRoute } from "@tanstack/react-router";
import LegalPage, { Section } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Privacy policy • Prime Terminal" },
      { name: "description", content: "How Prime Terminal handles your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2026">
      <Section title="1. What we keep">
        <p>
          The account details we enter for you (login name, business name, owner name, phone number, plan and payment
          dates). The business data you enter (bills, customers and their credit balance, stock, excise and bank
          records). Backups of that data. Simple usage information, such as when the app was last opened, the last
          backup, and the counts and status you choose to send in a Help message.
        </p>
      </Section>
      <Section title="2. Where it is kept">
        <p>
          On your phone (in the browser storage), and in our cloud database and file storage. The app is also served
          by a hosting service. Anything you send on WhatsApp goes through WhatsApp.
        </p>
      </Section>
      <Section title="3. Who can see it">
        <p>
          You, and the staff you allow, according to the roles you set. Our team can see your backups, bills, stock and
          account details so that we can give support and manage your plan. We do not look at them for any other
          reason.
        </p>
      </Section>
      <Section title="4. What we do not do">
        <p>
          We do not sell your data and we do not show ads. We do not share your data, except with the services needed
          to run the app (database and hosting), or when the law requires it.
        </p>
      </Section>
      <Section title="5. Your customers">
        <p>
          The names and phone numbers of your credit customers are your records. Please make sure you are allowed to
          keep them. We only store them on your behalf.
        </p>
      </Section>
      <Section title="6. Security">
        <p>
          Every business has its own access rules, so another business cannot see your data, and logins protect the
          app. No system is perfectly safe, so please keep your password private and your phone locked.
        </p>
      </Section>
      <Section title="7. Your choices">
        <p>
          You can download your data from the Help tab at any time. You can ask us to correct or delete your data, or
          stop using the app.
        </p>
      </Section>
      <Section title="8. How long we keep it">
        <p>
          While your account is active. We keep the latest backups only. When you ask us to delete your data, we do it
          within 30 days.
        </p>
      </Section>
      <Section title="9. Changes">
        <p>We may update this policy. The date at the top shows when it was last changed.</p>
      </Section>
    </LegalPage>
  );
}

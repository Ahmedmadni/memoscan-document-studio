import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { InvoiceQrReader } from "@/components/InvoiceQrReader";
import { PageHeading } from "@/components/PageHeading";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Invoice QR reader — Waraqah" }] }),
  component: InvoicePage,
});

function InvoicePage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-24">
        <PageHeading title={t("zatcaTitle")} />
        <InvoiceQrReader />
      </main>
    </div>
  );
}

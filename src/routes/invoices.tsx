import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { InvoiceQrReader } from "@/components/InvoiceQrReader";
import { PageHeading } from "@/components/PageHeading";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [
    { title: "Invoice QR reader — Waraqah" },
    { name: "description", content: "Read Saudi invoice QR fields privately on your device with Waraqah." },
    { property: "og:title", content: "Invoice QR reader — Waraqah" },
    { property: "og:description", content: "Read invoice QR fields on your device." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
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

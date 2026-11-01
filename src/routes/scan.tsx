import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PageHeading } from "@/components/PageHeading";
import { ImagePickers } from "@/components/ImagePickers";
import { createDoc, deleteDoc } from "@/lib/db";
import { addFilesToDoc, defaultDocName } from "@/lib/docOps";
import { errorKey } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan documents — Waraqah" },
      {
        name: "description",
        content: "Capture or import pages and create private document scans on your device.",
      },
      { property: "og:title", content: "Scan documents — Waraqah" },
      {
        property: "og:description",
        content: "Scan pages with local perspective correction and PDF export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScanPage,
});
function ScanPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  async function startWith(files: File[]) {
    if (!files.length || busy) return;
    setBusy({ done: 0, total: files.length });
    try {
      const doc = await createDoc(defaultDocName(t("untitled"), lang));
      const result = await addFilesToDoc(doc.id, files, (done, total) => setBusy({ done, total }));
      if (result.failed) toast.error(t(errorKey(result.firstError)));
      // Failed imports must not leave empty documents in the library.
      if (result.failed === files.length) {
        await deleteDoc(doc.id);
        return;
      }
      await navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <PageHeading title={t("scanPageTitle")} />
        <section className="grid gap-8 py-4 md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col items-start justify-center gap-5 py-5">
            <span className="grid size-14 place-items-center rounded-lg bg-secondary text-primary">
              <ScanLine className="size-7" />
            </span>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("scanCaption")}</p>
              <h2 className="text-xl font-semibold">{t("selectSource")}</h2>
            </div>
            <ImagePickers onFiles={(files) => void startWith(files)} disabled={!!busy} />
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm text-primary">
                <Loader2 className="size-4 animate-spin" />
                {t("processing")} {busy.done}/{busy.total}
              </p>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-success" />
              {t("privacyShort")}
            </p>
          </div>
          <div className="scan-paper-scene" aria-hidden="true">
            <div className="scan-paper">
              <div className="scan-mark">
                <ScanLine />
              </div>
              <div className="scan-lines" />
              <div className="scan-lines" />
              <div className="scan-lines short" />
              <div className="scan-photo" />
              <div className="scan-lines" />
              <div className="scan-lines short" />
            </div>
            <div className="scan-outline" />
          </div>
        </section>
      </main>
    </div>
  );
}

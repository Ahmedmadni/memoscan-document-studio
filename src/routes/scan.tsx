import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PageHeading } from "@/components/PageHeading";
import { ImagePickers } from "@/components/ImagePickers";
import { createDoc, deleteDoc, getCaptureDraft, getDoc, linkCaptureDraft } from "@/lib/db";
import { addFilesToDoc, defaultDocName } from "@/lib/docOps";
import { errorKey } from "@/lib/errors";
import type { EditSettings } from "@/lib/imaging";
import { useI18n } from "@/lib/i18n";
import scanDesk from "@/assets/scan-desk.jpg";
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
  async function startWith(
    files: File[],
    edits?: ReadonlyMap<File, EditSettings>,
    sourceDraft?: string,
  ) {
    if (!files.length || busy) return files;
    setBusy({ done: 0, total: files.length });
    try {
      const draft = sourceDraft ? await getCaptureDraft(sourceDraft) : null;
      const existing = draft?.destinationDocId ? await getDoc(draft.destinationDocId) : undefined;
      const doc = existing ?? (await createDoc(defaultDocName(t("untitled"), lang)));
      if (sourceDraft) await linkCaptureDraft(sourceDraft, doc.id);
      const result = await addFilesToDoc(
        doc.id,
        files,
        (done, total) => setBusy({ done, total }),
        edits,
        sourceDraft,
      );
      if (result.failed) toast.error(t(errorKey(result.firstError)));
      // Failed imports must not leave empty documents in the library.
      if (result.failed === files.length) {
        if (!(await getDoc(doc.id))?.pageIds.length) await deleteDoc(doc.id);
        return files;
      }
      await navigate({ to: "/doc/$id", params: { id: doc.id } });
      return result.failedFiles;
    } catch (error) {
      toast.error(t(errorKey(error)));
      return files;
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <PageHeading title={t("scanPageTitle")} />
        <section className="pb-8">
          <div className="relative overflow-hidden border-b">
            <img src={scanDesk} alt="" width={1408} height={1024} className="scan-entry-image" />
            <span className="absolute bottom-4 start-4 flex items-center gap-2 rounded-md border bg-card/95 px-3 py-2 text-sm font-semibold text-primary">
              <img src="/memoscan-logo.svg" width={24} height={24} alt="" />
              {t("appName")}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {t("scanCaption")}
              </span>
            </span>
          </div>
          <div className="mx-auto flex max-w-xl flex-col gap-5 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("scanCaption")}</p>
                <h2 className="text-xl font-semibold">{t("selectSource")}</h2>
              </div>
              <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
            </div>
            <div className="scan-source-controls">
              <ImagePickers onFiles={startWith} disabled={!!busy} />
            </div>
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
        </section>
      </main>
    </div>
  );
}

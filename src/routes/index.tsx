import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpLeft,
  Camera,
  CreditCard,
  FileSignature,
  FileText,
  FolderOpen,
  QrCode,
  ScanLine,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { listDocs, getPage, type DocRecord } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import workspaceImage from "@/assets/workspace.jpg";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Waraqah — ورقة | Document workspace" },
      {
        name: "description",
        content:
          "A private workspace for scanning paper, signing PDFs and organizing your local documents.",
      },
      { property: "og:title", content: "Waraqah — ورقة | Document workspace" },
      {
        property: "og:description",
        content: "Scan documents or sign a PDF in independent on-device workspaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
function Home() {
  const { t, lang } = useI18n();
  const [recent, setRecent] = useState<(DocRecord & { thumb?: string | undefined })[]>([]);
  useEffect(() => {
    let active = true;
    void listDocs()
      .then(async (docs) =>
        Promise.all(
          docs.slice(0, 6).map(async (doc) => ({
            ...doc,
            thumb: doc.pageIds[0] ? (await getPage(doc.pageIds[0]))?.thumb : undefined,
          })),
        ),
      )
      .then((docs) => {
        if (active) setRecent(docs);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20">
        {/* CamScanner-Style Top Smart Tool Matrix */}
        <section className="pt-5">
          <div className="rounded-2xl border bg-card p-4 shadow-paper">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-primary">{t("quickModesTitle")}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                {t("privacyShort")}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Link
                to="/scan"
                className="flex flex-col items-center gap-2 rounded-xl p-2.5 text-center transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <Camera className="size-6" />
                </span>
                <span className="text-xs font-semibold leading-tight">{t("modeStandardDoc")}</span>
              </Link>
              <Link
                to="/scan"
                className="flex flex-col items-center gap-2 rounded-xl p-2.5 text-center transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                  <CreditCard className="size-6" />
                </span>
                <span className="text-xs font-semibold leading-tight">{t("modeIdCard2in1")}</span>
              </Link>
              <Link
                to="/sign"
                className="flex flex-col items-center gap-2 rounded-xl p-2.5 text-center transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-signature-soft text-signature">
                  <Stamp className="size-6" />
                </span>
                <span className="text-xs font-semibold leading-tight">
                  {t("modeOfficialStamp")}
                </span>
              </Link>
              <Link
                to="/invoices"
                className="flex flex-col items-center gap-2 rounded-xl p-2.5 text-center transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-700">
                  <QrCode className="size-6" />
                </span>
                <span className="text-xs font-semibold leading-tight">{t("modeZatcaInvoice")}</span>
              </Link>
              <Link
                to="/documents"
                className="flex flex-col items-center gap-2 rounded-xl p-2.5 text-center transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-muted text-foreground">
                  <FolderOpen className="size-6" />
                </span>
                <span className="text-xs font-semibold leading-tight">{t("navDocuments")}</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Primary Dual Workflows */}
        <section className="py-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("startWorkspace")}</h2>
            <span className="text-xs text-muted-foreground">01 — 02</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              asChild
              className="workflow-action workflow-scan h-auto justify-start whitespace-normal rounded-xl border p-5 text-start shadow-none"
            >
              <Link to="/scan">
                <span className="workflow-icon grid size-12 shrink-0 place-items-center rounded-xl">
                  <ScanLine className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs opacity-80">{t("scanLabel")}</span>
                  <span className="block text-lg font-semibold">{t("scanDocuments")}</span>
                </span>
                <ArrowUpLeft className="size-5 shrink-0 ltr:rotate-90" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="workflow-action h-auto justify-start whitespace-normal rounded-xl border bg-card p-5 text-start"
            >
              <Link to="/sign">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-signature-soft text-signature">
                  <FileSignature className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs text-muted-foreground">{t("signLabel")}</span>
                  <span className="block text-lg font-semibold">{t("addSignature")}</span>
                </span>
                <ArrowUpLeft className="size-5 shrink-0 text-muted-foreground ltr:rotate-90" />
              </Link>
            </Button>
          </div>
        </section>

        {/* CamScanner-Style Recent Documents Feed */}
        <section className="border-t pt-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{t("recentDocs")}</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/documents">
                {t("viewAll")}
                <ArrowUpLeft className="ltr:rotate-90" />
              </Link>
            </Button>
          </div>
          {recent.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((doc) => (
                <Link
                  key={doc.id}
                  to="/doc/$id"
                  params={{ id: doc.id }}
                  className="flex min-w-0 items-center gap-3.5 rounded-xl border bg-card p-3 shadow-paper transition-colors hover:border-primary/50"
                >
                  <div className="relative grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                    {doc.thumb ? (
                      <img src={doc.thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <FileText className="size-5 text-muted-foreground" />
                    )}
                    <span className="absolute top-0.5 end-0.5 rounded bg-stage/85 px-1 text-[10px] font-semibold text-stage-foreground">
                      {doc.pageIds.length}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{doc.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doc.pageIds.length} {t("pages")} ·{" "}
                      {new Date(doc.updatedAt).toLocaleDateString(
                        lang === "ar" ? "ar-EG" : "en-GB",
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="workspace-cover relative overflow-hidden rounded-2xl border">
              <img
                src={workspaceImage}
                alt=""
                width={1536}
                height={1024}
                className="absolute inset-0 size-full object-cover"
              />
              <div className="workspace-copy relative flex h-full max-w-xl flex-col justify-center px-6 py-6">
                <p className="text-xs font-semibold text-primary">{t("workspaceLabel")}</p>
                <p className="mt-1 text-lg font-bold">{t("emptyTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
              </div>
            </div>
          )}
        </section>

        {/* CamScanner Floating Camera Action Button (FAB) */}
        <Link to="/scan" className="cs-fab" aria-label={t("scanCamera")}>
          <Camera className="size-5" />
          <span>{t("scanCamera")}</span>
        </Link>
      </main>
    </div>
  );
}

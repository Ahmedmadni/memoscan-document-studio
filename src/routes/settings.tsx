import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, Download, Languages, Moon, ShieldCheck, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/PageHeading";
import { AppHeader } from "@/components/AppHeader";
import { listDocs, type DocRecord } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { downloadBlob } from "@/lib/pdf";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Waraqah" },
      {
        name: "description",
        content: "Manage Waraqah language and review local document privacy.",
      },
      { property: "og:title", content: "Settings — Waraqah" },
      {
        property: "og:description",
        content: "Language preferences and on-device privacy for your document workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang, toggle } = useI18n();
  const [dark, setDark] = useState(false);
  const [docs, setDocs] = useState<DocRecord[]>([]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    void listDocs()
      .then(setDocs)
      .catch(() => {});
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("waraqah.theme", next ? "dark" : "light");
    } catch {
      // ignore
    }
  }

  function exportMetadataBackup() {
    const payload = {
      app: "Waraqah — MemoScan Document Studio",
      exportedAt: new Date().toISOString(),
      documentCount: docs.length,
      documents: docs.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category ?? "all",
        pages: d.pageIds.length,
        notes: d.notes ?? "",
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `waraqah-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success(t("backupSuccess"));
  }

  const totalPages = docs.reduce((acc, d) => acc + d.pageIds.length, 0);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-4 px-5 pb-24">
        <PageHeading title={t("navSettings")} />
        <section className="flex items-center justify-between border-b py-5">
          <div className="flex items-center gap-3">
            <Languages className="size-5 text-primary" />
            <div>
              <p className="font-medium">{t("appLanguage")}</p>
              <p className="text-sm text-muted-foreground">
                {t(lang === "ar" ? "arabic" : "english")}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={toggle}>
            {t("langToggle")}
          </Button>
        </section>

        <section className="flex items-center justify-between border-b py-5">
          <div className="flex items-center gap-3">
            {dark ? (
              <Moon className="size-5 text-primary" />
            ) : (
              <Sun className="size-5 text-primary" />
            )}
            <div>
              <p className="font-medium">{t("themeMode")}</p>
              <p className="text-sm text-muted-foreground">
                {t(dark ? "themeDark" : "themeLight")}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            {t(dark ? "themeLight" : "themeDark")}
          </Button>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 border-b py-5">
          <div className="flex items-center gap-3">
            <Database className="size-5 text-primary" />
            <div>
              <p className="font-medium">{t("backupTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("storageStats")}: {docs.length} · {totalPages} {t("pages")}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportMetadataBackup}>
            <Download className="me-1.5 size-4" />
            {t("exportBackup")}
          </Button>
        </section>

        <Link to="/privacy" className="flex items-center gap-3 border-b py-5 hover:bg-muted">
          <ShieldCheck className="size-5 text-primary" />
          <span>{t("privacyTitle")}</span>
        </Link>
      </main>
    </div>
  );
}

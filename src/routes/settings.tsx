import { createFileRoute, Link } from "@tanstack/react-router";
import { Languages, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/lib/i18n";
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
        <Link to="/privacy" className="flex items-center gap-3 border-b py-5 hover:bg-muted">
          <ShieldCheck className="size-5 text-primary" />
          <span>{t("privacyTitle")}</span>
        </Link>
      </main>
    </div>
  );
}
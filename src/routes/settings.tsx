import { createFileRoute, Link } from "@tanstack/react-router";
import { Languages, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t, lang, toggle } = useI18n();
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 pb-24">
        <h1 className="text-2xl font-bold">{t("navSettings")}</h1>
        <section className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3"><Languages className="size-5 text-primary" /><div><p className="font-medium">{lang === "ar" ? "لغة التطبيق" : "App language"}</p><p className="text-sm text-muted-foreground">{lang === "ar" ? "العربية" : "English"}</p></div></div>
          <Button variant="outline" onClick={toggle}>{t("langToggle")}</Button>
        </section>
        <Link to="/privacy" className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted">
          <ShieldCheck className="size-5 text-primary" /><span>{t("privacyTitle")}</span>
        </Link>
      </main>
    </div>
  );
}

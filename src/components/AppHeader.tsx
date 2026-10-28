import { Link } from "@tanstack/react-router";
import { ExternalLink, Languages, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export function AppHeader({ start }: { start?: ReactNode }) {
  const { t, toggle } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        {start ?? (
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-lg font-semibold text-foreground"
          >
            <img src="/memoscan-logo.svg" alt="" className="size-8 rounded-lg" />
            {t("appName")}
          </Link>
        )}
        <div className="ms-auto flex items-center gap-1">
          <a href="https://ahmedelmadni.com" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted" aria-label="Developer: Ahmed Elmadani">
            <ExternalLink className="size-4" />
            <span className="hidden md:inline">Ahmed Elmadani</span>
          </a>
          <Link
            to="/privacy"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <ShieldCheck className="size-4" />
            <span className="hidden sm:inline">{t("privacy")}</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm hover:bg-muted"
            aria-label="Language / اللغة"
          >
            <Languages className="size-4" />
            {t("langToggle")}
          </button>
        </div>
      </div>
    </header>
  );
}

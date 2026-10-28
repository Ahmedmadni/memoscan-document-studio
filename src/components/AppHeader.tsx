import { Link } from "@tanstack/react-router";
import { Languages, ScanLine, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export function AppHeader({ start }: { start?: ReactNode }) {
  const { t, toggle } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        {start ?? (
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ScanLine className="size-4" />
            </span>
            {t("appName")}
          </Link>
        )}
        <div className="ms-auto flex items-center gap-1">
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

import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink, Languages } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
export function AppHeader({ start }: { start?: ReactNode }) {
  const { t, toggle } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = [
    { to: "/", label: t("navHome") },
    { to: "/scan", label: t("navScan") },
    { to: "/documents", label: t("navDocuments") },
    { to: "/sign", label: t("navSign") },
    { to: "/settings", label: t("navSettings") },
  ] as const;
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
        {start}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 font-display text-xl font-semibold"
        >
          <img src="/memoscan-logo.svg" alt="" className="size-8 rounded-md" />
          {t("appName")}
        </Link>
        <nav aria-label={t("primaryNav")} className="ms-8 hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <Button
              key={item.to}
              variant="ghost"
              size="sm"
              asChild
              className={
                pathname === item.to || (item.to === "/documents" && pathname.startsWith("/doc/"))
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground"
              }
            >
              <Link to={item.to}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://ahmedelmadni.com"
              target="_blank"
              rel="noreferrer"
              aria-label={t("developer")}
              title={t("developer")}
            >
              <ExternalLink />
            </a>
          </Button>
          <Button variant="outline" onClick={toggle} aria-label="Language / اللغة">
            <Languages />
            {t("langToggle")}
          </Button>
        </div>
      </div>
    </header>
  );
}
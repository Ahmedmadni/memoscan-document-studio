import { Link, useRouterState } from "@tanstack/react-router";
import { FileSignature, FolderOpen, Home, ScanLine, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
export function BottomNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = [
    { to: "/", label: t("navHome"), icon: Home, active: pathname === "/" },
    { to: "/scan", label: t("navScan"), icon: ScanLine, active: pathname === "/scan" },
    {
      to: "/documents",
      label: t("navDocuments"),
      icon: FolderOpen,
      active: pathname === "/documents" || pathname.startsWith("/doc/"),
    },
    { to: "/sign", label: t("navSign"), icon: FileSignature, active: pathname === "/sign" },
    {
      to: "/settings",
      label: t("navSettings"),
      icon: Settings,
      active: pathname === "/settings" || pathname === "/privacy",
    },
  ] as const;
  return (
    <nav
      aria-label={t("primaryNav")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {items.map(({ to, label, icon: Icon, active }) => (
          <Button
            key={to}
            variant="ghost"
            asChild
              className={`brand-nav-item relative h-16 min-w-0 flex-col gap-1 rounded-none px-1 text-[11px] ${active ? "bg-secondary/60 font-semibold text-primary" : "text-muted-foreground"}`}
          >
            <Link to={to} aria-current={active ? "page" : undefined}>
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </nav>
  );
}

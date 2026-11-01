import { Link, useRouterState } from "@tanstack/react-router";
import { FileSignature, Home, ScanLine, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = [
    { to: "/", label: t("navHome"), icon: Home, active: pathname === "/" || pathname.startsWith("/doc/") },
    { to: "/", label: t("navScan"), icon: ScanLine, active: false },
    { to: "/sign", label: t("navSign"), icon: FileSignature, active: pathname === "/sign" },
    { to: "/privacy", label: t("navSettings"), icon: Settings, active: pathname === "/privacy" },
  ] as const;
  return (
    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {items.map(({ to, label, icon: Icon, active }, index) => (
          <Link key={label} to={to} onClick={index === 1 ? (event) => { if (pathname === "/") { event.preventDefault(); window.dispatchEvent(new CustomEvent("waraqah:open-scan")); } } : undefined} aria-current={active ? "page" : undefined} className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="size-5" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

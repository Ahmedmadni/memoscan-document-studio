import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
export function PageHeading({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-6 pt-8">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-primary">
          {t("appName")} / {t("workspaceLabel")}
        </p>
        <h1 className="text-3xl font-semibold leading-snug">{title}</h1>
        {children && <div className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}
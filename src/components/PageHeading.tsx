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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-5 pt-6 md:mb-7 md:pt-7">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-primary">
          {t("appName")} / {t("workspaceLabel")}
        </p>
        <h1 className="text-2xl font-semibold leading-snug">{title}</h1>
        {children && <div className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

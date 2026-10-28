import { createFileRoute } from "@tanstack/react-router";
import { CloudOff, HardDrive, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — MemoScan" },
      {
        name: "description",
        content:
          "MemoScan processes and stores your scans only on your device. Nothing is uploaded.",
      },
      { property: "og:title", content: "Privacy — MemoScan" },
      {
        property: "og:description",
        content: "On-device processing, local storage, no uploads, no accounts.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const { t } = useI18n();
  const items = [
    { icon: CloudOff, k: "privacy1" as const },
    { icon: HardDrive, k: "privacy2" as const },
    { icon: ShieldCheck, k: "privacy3" as const },
  ];
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold">{t("privacyTitle")}</h1>
        <ul className="mt-6 space-y-4">
          {items.map(({ icon: Icon, k }) => (
            <li key={k} className="flex gap-4 rounded-xl border bg-card p-4 shadow-paper">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="leading-relaxed">{t(k)}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

import { Database, Download, Upload, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useI18n } from "@/lib/i18n";
import {
  createDocumentBackup,
  inspectDocumentBackup,
  restoreDocumentBackup,
  type PreparedBackup,
} from "@/lib/backup";
import { downloadBlob, shareFile } from "@/lib/pdf";
import { isNative } from "@/lib/native";
import { errorKey } from "@/lib/errors";

export function DocumentBackup({ onRestored }: { onRestored: () => Promise<void> }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [prepared, setPrepared] = useState<{ name: string; data: PreparedBackup } | null>(null);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProgress("");
    try {
      await task();
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      running.current = false;
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Database className="size-5 text-primary" />
        {t("fullBackup")}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("fullBackupHint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const blob = await createDocumentBackup((done, total) =>
                setProgress(`${done}/${total}`),
              );
              const name = `waraqah-${new Date().toISOString().slice(0, 10)}.waraqah`;
              if (isNative()) {
                if ((await shareFile(blob, name)) === "shared") toast.success(t("backupSuccess"));
              } else {
                downloadBlob(blob, name);
                toast.success(t("backupSuccess"));
              }
            })
          }
        >
          <Download />
          {t("exportFullBackup")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <Upload />
          {t("chooseBackup")}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".waraqah,application/octet-stream"
          hidden
          aria-label={t("chooseBackup")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file)
              void run(async () => {
                setPrepared(null);
                const data = await inspectDocumentBackup(file, (done, total) =>
                  setProgress(`${done}/${total}`),
                );
                setPrepared({ name: file.name, data });
              });
          }}
        />
      </div>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {t("processing")} {progress}
        </p>
      )}
      {prepared && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <p className="break-all text-sm font-medium">{prepared.name}</p>
          <p className="text-sm">
            {t("backupChecked")} · {prepared.data.docs.length} {t("documentsCountLabel")} ·{" "}
            {prepared.data.pages.length} {t("pages")}
          </p>
          <p className="text-xs text-muted-foreground">{t("restoreAddsCopies")}</p>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await restoreDocumentBackup(prepared.data);
                  setPrepared(null);
                  await onRestored();
                  toast.success(t("backupRestored"));
                })
              }
            >
              {t("restoreBackup")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPrepared(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

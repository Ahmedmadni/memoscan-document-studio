import { Loader2, Redo2, RotateCcw, RotateCw, Undo2, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PageRecord } from "@/lib/db";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  detectDocument,
  FULL_CORNERS,
  loadImageCanvas,
  processPage,
  scaleCanvas,
  type Corners,
  type EditSettings,
  type FilterMode,
  type Rotation,
} from "@/lib/imaging";

const FILTERS: [FilterMode, TKey][] = [
  ["original", "fOriginal"],
  ["enhance", "fEnhance"],
  ["gray", "fGray"],
  ["bw", "fBw"],
  ["clean", "fClean"],
];

export function PageEditor({
  page,
  onSave,
  onClose,
}: {
  page: PageRecord;
  onSave: (s: EditSettings) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [srcUrl, setSrcUrl] = useState("");
  const [tab, setTab] = useState<"corners" | "adjust">("corners");
  const [hist, setHist] = useState({
    past: [] as EditSettings[],
    present: page.settings,
    future: [] as EditSettings[],
  });
  const last = useRef({ key: "", time: 0 });
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [split, setSplit] = useState(50);
  const [saving, setSaving] = useState(false);
  const s = hist.present;

  useEffect(() => {
    let alive = true;
    loadImageCanvas(page.original, 2400).then((c) => {
      if (!alive) return;
      setSrc(c);
      setSrcUrl(scaleCanvas(c, 1400).toDataURL("image/jpeg", 0.85));
    });
    return () => {
      alive = false;
    };
  }, [page.original]);

  const preview = src ? scaleCanvas(src, 1000) : null;
  useEffect(() => {
    if (!preview || tab !== "adjust") return;
    const id = setTimeout(() => {
      try {
        setAfter(processPage(preview, s, 1000).toDataURL("image/jpeg", 0.85));
        setBefore(
          processPage(preview, s, 1000, { skipAdjust: true }).toDataURL("image/jpeg", 0.85),
        );
      } catch {
        toast.error(t("errGeneric"));
      }
    }, 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, src, tab]);

  function update(patch: Partial<EditSettings>, key: string) {
    const now = Date.now();
    const coalesce = last.current.key === key && now - last.current.time < 800;
    last.current = { key, time: now };
    setHist((h) => ({
      past: coalesce ? h.past : [...h.past, h.present],
      present: { ...h.present, ...patch },
      future: [],
    }));
  }
  const undo = () =>
    setHist((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] }
        : h,
    );
  const redo = () =>
    setHist((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    );

  const box = useRef<HTMLDivElement>(null);
  function drag(i: number, e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const c = s.corners.map((p) => ({ ...p })) as Corners;
    c[i] = { x, y };
    update({ corners: c }, "corner" + i);
  }
  function nudge(i: number, e: React.KeyboardEvent) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const c = s.corners.map((p) => ({ ...p })) as Corners;
    c[i] = {
      x: Math.min(1, Math.max(0, c[i].x + d[0] * 0.005)),
      y: Math.min(1, Math.max(0, c[i].y + d[1] * 0.005)),
    };
    update({ corners: c }, "corner" + i);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(s);
      toast.success(t("saved"));
      onClose();
    } catch {
      toast.error(t("errGeneric"));
    } finally {
      setSaving(false);
    }
  }

  const rot = (d: number) =>
    update({ rotation: ((((s.rotation + d) % 360) + 360) % 360) as Rotation }, "rot" + Date.now());
  const slider = (
    k: "brightness" | "contrast" | "sharpen" | "threshold" | "angle",
    label: TKey,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="block text-sm">
      <span className="flex justify-between">
        {t(label)} <span className="text-muted-foreground tabular-nums">{s[k]}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={s[k]}
        onChange={(e) => update({ [k]: Number(e.target.value) }, k)}
        className="mt-1 w-full accent-primary"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <Button variant="ghost" size="icon" aria-label={t("cancel")} onClick={onClose}>
          <X />
        </Button>
        <div className="flex rounded-lg bg-muted p-1">
          {(["corners", "adjust"] as const).map((k) => (
            <button
              key={k}
              className="chip border-0"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
            >
              {t(k)}
            </button>
          ))}
        </div>
        <div className="ms-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("undo")}
            disabled={!hist.past.length}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("redo")}
            disabled={!hist.future.length}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button onClick={save} disabled={saving || !src}>
            {saving && <Loader2 className="animate-spin" />} {t("save")}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-stage p-4" dir="ltr">
        {!src && <Loader2 className="size-8 animate-spin text-stage-foreground" />}
        {src && tab === "corners" && (
          <div ref={box} className="relative touch-none select-none">
            <img src={srcUrl} alt="" className="block max-h-[55vh] max-w-full" draggable={false} />
            <svg
              className="pointer-events-none absolute inset-0 size-full"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <polygon
                points={s.corners.map((p) => `${p.x},${p.y}`).join(" ")}
                className="fill-handle/20 stroke-handle"
                strokeWidth={0.004}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {s.corners.map((p, i) => (
              <button
                key={i}
                aria-label={`corner ${i + 1}`}
                className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-handle bg-handle/30 focus-visible:ring-4 focus-visible:ring-ring"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  last.current = { key: "", time: 0 };
                }}
                onPointerMove={(e) => e.buttons && drag(i, e)}
                onKeyDown={(e) => nudge(i, e)}
              />
            ))}
          </div>
        )}
        {src && tab === "adjust" && after && (
          <div className="relative h-full max-w-full">
            <img src={after} alt={t("after")} className="h-full max-w-full object-contain" />
            <img
              src={before}
              alt={t("before")}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-handle"
              style={{ left: `${split}%` }}
            />
          </div>
        )}
      </div>

      <div className="max-h-[42vh] space-y-3 overflow-y-auto border-t p-4">
        {tab === "corners" ? (
          <>
            <p className="text-sm text-muted-foreground">{t("dragHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!src) return;
                  const r = detectDocument(src);
                  if (r.detected) update({ corners: r.corners }, "detect" + Date.now());
                  else toast.warning(t("detectFailed"));
                }}
              >
                <Wand2 /> {t("autoDetect")}
              </Button>
              <Button
                variant="outline"
                onClick={() => update({ corners: FULL_CORNERS }, "full" + Date.now())}
              >
                {t("fullImage")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("autoDetectNote")}</p>
          </>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {FILTERS.map(([f, k]) => (
                <button
                  key={f}
                  className="chip"
                  aria-pressed={s.filter === f}
                  onClick={() => update({ filter: f }, "f" + Date.now())}
                >
                  {t(k)}
                </button>
              ))}
              <Button
                variant="outline"
                size="icon"
                aria-label={t("rotateL")}
                onClick={() => rot(-90)}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("rotateR")}
                onClick={() => rot(90)}
              >
                <RotateCw />
              </Button>
            </div>
            {slider("angle", "deskew", -15, 15, 0.5)}
            {slider("brightness", "brightness", -100, 100)}
            {slider("contrast", "contrast", -100, 100)}
            {s.filter === "bw"
              ? slider("threshold", "threshold", 0, 30)
              : slider("sharpen", "sharpen", 0, 100)}
            <label className="block text-sm sm:col-span-2">
              {t("compare")}
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                onChange={(e) => setSplit(+e.target.value)}
                className="mt-1 w-full accent-accent"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

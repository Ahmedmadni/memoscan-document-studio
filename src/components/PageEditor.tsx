import {
  ArrowLeft,
  Check,
  Crop,
  FileText,
  Image,
  Palette,
  Sun,
  Circle,
  Loader2,
  Maximize2,
  Redo2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { PageRecord } from "@/lib/db";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  detectDocument,
  FULL_CORNERS,
  isConvexQuad,
  quadArea,
  loadImageCanvas,
  processPage,
  rotateCanvas,
  scaleCanvas,
  type Corners,
  type EditSettings,
  type FilterMode,
  type Pt,
  type Rotation,
} from "@/lib/imaging";

const FILTERS: [FilterMode, TKey, typeof FileText][] = [
  ["magic", "fMagic", Sparkles],
  ["text", "fText", FileText],
  ["paper", "fPaper", Image],
  ["enhance", "fEnhance", Palette],
  ["clean", "fClean", Sun],
  ["bw", "fBw", Circle],
  ["gray", "fGray", Circle],
  ["original", "fOriginal", Image],
];

// Crop points remain in the original image coordinates used by the export pipeline.
function rotatePoint({ x, y }: Pt, rotation: number): Pt {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: 1 - y, y: x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: y, y: 1 - x };
    default:
      return { x, y };
  }
}

export function PageEditor({
  page,
  onSave,
  onApplyAll,
  onClose,
}: {
  page: PageRecord;
  onSave: (s: EditSettings) => Promise<void>;
  onApplyAll?: ((filter: FilterMode) => Promise<void>) | undefined;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [tab, setTab] = useState<"corners" | "adjust">(
    page.docId === "camera-review" ? "adjust" : "corners",
  );
  const [fineOpen, setFineOpen] = useState(false);
  const [hist, setHist] = useState({
    past: [] as EditSettings[],
    present: page.settings,
    future: [] as EditSettings[],
  });
  const last = useRef({ key: "", time: 0 });
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [split, setSplit] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activeDragIdx, setActiveDragIdx] = useState<number | null>(null);
  const s = hist.present;

  useEffect(() => {
    let alive = true;
    void loadImageCanvas(page.original, 2400)
      .then((c) => {
        if (alive) setSrc(c);
      })
      .catch(() => {
        if (alive) toast.error(t("errGeneric"));
      });
    return () => {
      alive = false;
    };
  }, [page.original, t]);

  const preview = useMemo(() => (src ? scaleCanvas(src, 1000) : null), [src]);
  const srcUrl = useMemo(
    () =>
      src && tab === "corners"
        ? rotateCanvas(scaleCanvas(src, 1400), s.rotation).toDataURL("image/jpeg", 0.85)
        : "",
    [src, s.rotation, tab],
  );
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
    }, 100);
    return () => clearTimeout(id);
  }, [s, preview, tab, t]);

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
    setHist((h) => {
      const previous = h.past.at(-1);
      return previous
        ? { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] }
        : h;
    });
  const redo = () =>
    setHist((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    );

  const box = useRef<HTMLDivElement>(null);
  function drag(i: number, e: React.PointerEvent) {
    if (!box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setCorner(i, { x, y });
  }
  function setCorner(i: number, point: Pt) {
    const corners = [...s.corners] as Corners;
    corners[i] = rotatePoint(point, -s.rotation);
    if (!isConvexQuad(corners) || quadArea(corners) < 0.08) return;
    update({ corners }, "corner" + i);
  }
  function nudge(i: number, e: React.KeyboardEvent) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ];
    if (!delta) return;
    e.preventDefault();
    const point = displayCorners[i];
    setCorner(i, {
      x: Math.min(1, Math.max(0, point.x + delta[0] * 0.005)),
      y: Math.min(1, Math.max(0, point.y + delta[1] * 0.005)),
    });
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
    <label className="block text-xs text-stage-foreground">
      <span className="flex justify-between">
        {t(label)} <span className="text-stage-foreground/70 tabular-nums">{s[k]}</span>
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

  const displayCorners = s.corners.map((point) => rotatePoint(point, s.rotation));
  const activeCornerPt = activeDragIdx !== null ? displayCorners[activeDragIdx] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-stage text-stage-foreground"
      role="dialog"
      aria-modal="true"
      aria-label={t("editSelectedPage")}
    >
      {/* CamScanner Dark Top Stepper Bar */}
      <div className="work-toolbar flex shrink-0 items-center gap-1 border-b border-stage-foreground/15 px-2 py-2.5 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="icon"
          className="camera-tool"
          aria-label={t("cancel")}
          onClick={onClose}
        >
          <X />
        </Button>

        {/* Step Indicator Pills: 1. Crop -> 2. Filters */}
        <div className="flex items-center gap-1 rounded-md bg-stage-foreground/5 p-1">
          <Button
            variant="ghost"
            size="sm"
            className={`work-tab h-9 gap-1 rounded-md px-2 text-xs ${
              tab === "corners"
                ? "bg-primary text-primary-foreground"
                : "text-stage-foreground/75 hover:text-stage-foreground"
            }`}
            aria-label={t("corners")}
            aria-pressed={tab === "corners"}
            onClick={() => setTab("corners")}
          >
            <Crop className="hidden min-[360px]:block" />
            1. {t("corners")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`work-tab h-9 gap-1 rounded-md px-2 text-xs ${
              tab === "adjust"
                ? "bg-primary text-primary-foreground"
                : "text-stage-foreground/75 hover:text-stage-foreground"
            }`}
            aria-label={t("adjust")}
            aria-pressed={tab === "adjust"}
            onClick={() => setTab("adjust")}
          >
            <Sparkles className="hidden min-[360px]:block" />
            2. {t("adjust")}
          </Button>
        </div>

        <div className="ms-auto flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="camera-tool"
            aria-label={t("undo")}
            disabled={!hist.past.length}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="camera-tool"
            aria-label={t("redo")}
            disabled={!hist.future.length}
            onClick={redo}
          >
            <Redo2 />
          </Button>
        </div>
      </div>

      {/* Central Dark Document Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center bg-stage p-4 [container-type:size]"
        dir="ltr"
      >
        {(!src || (tab === "adjust" && !after)) && (
          <Loader2
            aria-label={t("loading")}
            className="size-8 animate-spin text-stage-foreground"
          />
        )}
        {src && tab === "corners" && (
          <div ref={box} className="relative touch-none select-none">
            <img
              src={srcUrl}
              alt=""
              className="block max-h-[100cqh] max-w-full"
              draggable={false}
            />
            <svg
              className="pointer-events-none absolute inset-0 size-full"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <polygon
                points={displayCorners.map((p) => `${p.x},${p.y}`).join(" ")}
                className="fill-handle/20 stroke-handle"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {displayCorners.map((p, i) => (
              <Button
                variant="ghost"
                size="icon"
                key={i}
                aria-label={`${t("corners")} ${i + 1}`}
                className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-handle bg-handle/30 focus-visible:ring-4 focus-visible:ring-ring"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  last.current = { key: "", time: 0 };
                  setActiveDragIdx(i);
                }}
                onPointerMove={(e) => e.buttons && drag(i, e)}
                onPointerUp={() => setActiveDragIdx(null)}
                onPointerCancel={() => setActiveDragIdx(null)}
                onLostPointerCapture={() => setActiveDragIdx(null)}
                onKeyDown={(e) => nudge(i, e)}
              />
            ))}
            {activeCornerPt && (
              <div
                aria-label={t("loupeLabel")}
                className="pointer-events-none absolute start-2 top-2 size-24 overflow-hidden rounded-full border-2 border-handle bg-stage shadow-lg"
                style={{
                  backgroundImage: `url(${srcUrl})`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "300% 300%",
                  backgroundPosition: `${activeCornerPt.x * 100}% ${activeCornerPt.y * 100}%`,
                }}
              >
                <div className="absolute inset-x-0 top-1/2 h-px bg-handle/80" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-handle/80" />
              </div>
            )}
          </div>
        )}
        {src && tab === "adjust" && after && (
          <div className="relative h-full max-w-full">
            <img src={after} alt={t("after")} className="h-full max-w-full object-contain" />
            {split > 0 && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      {/* CamScanner Bottom Dock */}
      <div className="cs-bottom-dock px-3 pt-2">
        {tab === "corners" ? (
          <div className="space-y-2 overflow-y-auto">
            <p className="text-center text-xs text-stage-foreground/70">{t("dragHint")}</p>
            <div className="mx-auto grid max-w-lg grid-cols-5 items-stretch gap-1">
              <Button
                variant="ghost"
                title={t("rotateL")}
                className="cs-dock-action h-auto whitespace-normal"
                onClick={() => rot(-90)}
              >
                <RotateCcw className="size-5" />
                <span>{t("rotateL")}</span>
              </Button>
              <Button
                variant="ghost"
                title={t("rotateR")}
                className="cs-dock-action h-auto whitespace-normal"
                onClick={() => rot(90)}
              >
                <RotateCw className="size-5" />
                <span>{t("rotateR")}</span>
              </Button>
              <Button
                variant="ghost"
                className="cs-dock-action h-auto whitespace-normal"
                onClick={() => update({ corners: FULL_CORNERS }, "full" + Date.now())}
              >
                <Maximize2 className="size-5" />
                <span>{t("fullImage")}</span>
              </Button>
              <Button
                variant="ghost"
                className="cs-dock-action h-auto whitespace-normal"
                onClick={() => {
                  if (!src) return;
                  const r = detectDocument(src);
                  if (r.detected) update({ corners: r.corners }, "detect" + Date.now());
                  else toast.warning(t("detectFailed"));
                }}
              >
                <Wand2 className="size-5" />
                <span>{t("autoDetect")}</span>
              </Button>
              <Button
                onClick={() => setTab("adjust")}
                disabled={!src}
                className="work-confirm h-auto min-h-11 flex-col gap-1 rounded-md px-1 text-xs font-bold"
              >
                <ArrowLeft className="size-4 ltr:rotate-180" />
                <span>{t("next")}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-col gap-2">
            <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain px-0.5">
              {fineOpen ? (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-stage-foreground/15 bg-stage-foreground/5 p-2">
                  {slider("brightness", "brightness", -100, 100)}
                  {slider("contrast", "contrast", -100, 100)}
                  {s.filter === "bw" || s.filter === "text"
                    ? slider("threshold", "threshold", 0, 30)
                    : slider("sharpen", "sharpen", 0, 100)}
                  {slider("angle", "deskew", -15, 15, 0.5)}
                  <label className="col-span-2 block text-xs">
                    {t("compare")}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      onChange={(e) => setSplit(+e.target.value)}
                      className="mt-1 w-full accent-handle"
                    />
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {FILTERS.map(([f, k, Icon]) => (
                    <Button
                      variant="ghost"
                      key={f}
                      aria-pressed={s.filter === f}
                      onClick={() => update({ filter: f }, "f" + Date.now())}
                      className="work-filter camera-tool flex h-auto shrink-0 flex-col items-center gap-1 border border-stage-foreground/15 px-2 py-2 text-xs"
                    >
                      <Icon aria-hidden="true" className="size-5" />
                      <span className="text-center font-medium leading-tight">{t(k)}</span>
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-8 items-center gap-2 text-xs">
                  <Switch
                    aria-label={t("curvedEdges")}
                    checked={s.curvedEdges ?? false}
                    onCheckedChange={(checked) => update({ curvedEdges: checked }, "curvedEdges")}
                  />
                  {t("curvedEdges")}
                </label>
                {onApplyAll && !fineOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="camera-tool h-auto min-h-9 whitespace-normal border border-stage-foreground/15"
                    disabled={saving || !src}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onApplyAll(s.filter);
                        toast.success(t("appliedToAll"));
                      } catch {
                        toast.error(t("errGeneric"));
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {t("applyToAllPagesBtn")}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-[auto_auto_1fr_auto] items-stretch gap-1 border-t border-stage-foreground/15 pt-2">
              <Button
                variant="ghost"
                size="icon"
                className="camera-tool size-11"
                aria-label={t("rotateL")}
                onClick={() => rot(-90)}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="camera-tool size-11"
                aria-label={t("rotateR")}
                onClick={() => rot(90)}
              >
                <RotateCw />
              </Button>
              <Button
                variant="ghost"
                className="camera-tool h-auto min-h-11 whitespace-normal border border-stage-foreground/15 px-2 text-xs aria-expanded:bg-stage-foreground/15"
                aria-expanded={fineOpen}
                onClick={() => setFineOpen((o) => !o)}
              >
                {fineOpen ? <Sparkles /> : <SlidersHorizontal />}
                {t(fineOpen ? "filters" : "editSelectedPage")}
              </Button>
              <Button
                onClick={save}
                disabled={saving || !src}
                className="work-confirm h-auto min-h-11 px-3"
              >
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

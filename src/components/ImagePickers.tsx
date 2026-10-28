import { Camera, ImagePlus } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/**
 * Camera capture uses <input capture="environment">, which opens the native
 * camera on Android/iOS browsers and falls back to a file picker on desktop.
 */
export function ImagePickers({
  onFiles,
  disabled,
  size = "lg",
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  size?: "default" | "lg";
}) {
  const { t } = useI18n();
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} disabled={disabled} onClick={() => cam.current?.click()}>
        <Camera /> {t("scanCamera")}
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={disabled}
        onClick={() => lib.current?.click()}
      >
        <ImagePlus /> {t("importImages")}
      </Button>
      <input
        ref={cam}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handle}
      />
      <input ref={lib} type="file" accept="image/*" multiple hidden onChange={handle} />
    </div>
  );
}

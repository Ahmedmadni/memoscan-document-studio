import type { CapacitorConfig } from "@capacitor/cli";

// TanStack Start's Nitro build writes the SPA shell and public assets to .output/public.
const config: CapacitorConfig = {
  appId: "com.ahmedelmadni.memoscan",
  appName: "MemoScan",
  webDir: ".output/public",
  android: {
    // Documents stay on-device (IndexedDB); no cleartext traffic needed.
    allowMixedContent: false,
  },
};

export default config;

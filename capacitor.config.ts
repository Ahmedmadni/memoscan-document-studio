import type { CapacitorConfig } from "@capacitor/cli";

// TanStack Start's Nitro build writes the SPA shell and public assets to .output/public.
const config: CapacitorConfig = {
  // Keep the existing appId so upgrades can replace the current installed app.
  appId: "com.ahmedelmadni.memoscan",
  appName: "Waraqah",
  webDir: ".output/public",
  android: {
    // Documents stay on-device (IndexedDB); no cleartext traffic needed.
    allowMixedContent: false,
  },
};

export default config;

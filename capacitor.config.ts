import type { CapacitorConfig } from "@capacitor/cli";

// The web build (vite build) emits the prerendered static app into dist/client;
// `bun run cap:sync` rebuilds it and copies it into the Android project.
const config: CapacitorConfig = {
  appId: "com.ahmedelmadni.memoscan",
  appName: "MemoScan",
  webDir: "dist/client",
  android: {
    // Documents stay on-device (IndexedDB); no cleartext traffic needed.
    allowMixedContent: false,
  },
};

export default config;

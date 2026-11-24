import type { CapacitorConfig } from "@capacitor/cli";

/** The Android application: the standalone build (dist/) in a WebView. */
const config: CapacitorConfig = {
  appId: "io.github.cyprienpng.tinyeditor",
  appName: "Tiny Editor",
  webDir: "dist",
};

export default config;

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PDFJS = path.join(ROOT, "node_modules", "pdfjs-dist");
const PDFJS_ASSETS = ["cmaps", "standard_fonts", "wasm", "iccs"];

function* walk(dir: string, base = ""): Generator<string> {
  for (const name of readdirSync(dir)) {
    const rel = path.posix.join(base, name);
    if (statSync(path.join(dir, name)).isDirectory()) yield* walk(path.join(dir, name), rel);
    else yield rel;
  }
}

/** The files pdf.js loads at run time (fonts, character maps, decoders), published under pdfjs/ in the builds and in development. */
function pdfjsAssets(): Plugin {
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        const [top] = rel.split("/");
        if (!PDFJS_ASSETS.includes(top) || rel.includes("..")) return next();
        try {
          res.setHeader("Content-Type", rel.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
          res.end(readFileSync(path.join(PDFJS, rel)));
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const dir of PDFJS_ASSETS) for (const rel of walk(path.join(PDFJS, dir), dir)) this.emitFile({ type: "asset", fileName: `pdfjs/${rel}`, source: readFileSync(path.join(PDFJS, rel)) });
    },
  };
}

/**
 * Two builds from the same sources:
 * - the standalone application (`vite build`, in dist/): what the browser and the Android app run;
 * - the library (`vite build --mode lib`, in dist-lib/): the editor as React components, React left to the host.
 * They differ in how pdf.js finds its worker and its files (src/lib/platform.*.ts).
 */
export default defineConfig(({ mode }) => {
  const lib = mode === "lib";
  return {
    // Relative, so that the application runs from any folder: a sub-path of a site, the files of the Android app.
    base: "./",
    plugins: [react(), tailwindcss(), pdfjsAssets()],
    resolve: { alias: { "#platform": path.join(ROOT, "src", "lib", lib ? "platform.lib.ts" : "platform.app.ts") } },
    worker: { format: "es" as const },
    server: { port: 5190 },
    build: lib
      ? {
          outDir: "dist-lib",
          copyPublicDir: false,
          lib: { entry: path.join(ROOT, "src", "index.ts"), formats: ["es" as const], fileName: "tiny-editor", cssFileName: "tiny-editor" },
          rollupOptions: { external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"] },
        }
      : { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200 },
  };
});

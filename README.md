# Tiny Editor

A small PDF editor for the web and Android, taken out of [HEIG-Kit](https://github.com/Cyprien-png/HEIG-Kit): open a
PDF, write on it, export it with what you wrote.

- **Tools**: pen, highlighter, text, shapes (line, arrow, rectangle, ellipse), eraser, move, undo and redo, clear a page.
- **Reading**: pages at the width of the window, zoom (buttons, pinch, Ctrl or ⌘ + wheel), page navigation, full screen.
- **Mouse, finger or stylus**: once a stylus is seen, fingers only scroll; the button and the eraser end of a stylus erase.
- **Settings** (the gear of the toolbar, kept on the device): a shortcut per tool, a key or a button of the stylus or
  of the mouse, that selects the tool or lends it while held; « Formes automatiques », where a pen stroke held still
  becomes a straight line, a circle, an ellipse or a rectangle.
- **Standalone application**: « Ouvrir un PDF » (or drop a file on the window), « Exporter » writes a new PDF with the
  annotations in it (vector strokes and shapes, real text). The document and its annotations stay on the device
  (IndexedDB) between two visits; nothing is sent anywhere.

The interface is in French.

## Develop

```sh
npm install
npm run dev        # the standalone application on http://localhost:5190
npm test           # shortcuts, automatic shapes, PDF export
npm run build      # the standalone application, in dist/ (static files, any folder of any web server)
npm run build:lib  # the library, in dist-lib/
```

## Use it as a library

`npm run build:lib && npm pack` gives `tiny-editor-<version>.tgz` (also built by the CI, see below), to install in a
React 19 project:

```tsx
import { PdfEditor, exportPdf } from "tiny-editor";
import "tiny-editor/style.css";

<PdfEditor
  source={bytes} // an ArrayBuffer, or an address to fetch
  title="cours.pdf"
  initialAnnotations={saved}
  onChange={(annotations) => save(annotations)}
  className="h-[80vh]" // or `overlay` to cover the window
/>;

const pdf = await exportPdf(bytes, annotations); // Uint8Array
```

- `PdfReader` with `useAnnotations` is the same editor with the annotations held by the host (reset, undo from
  outside); without its `edit` property it is a plain reader.
- pdf.js and its worker are inside the library and load when the first PDF opens. Its optional files (fonts that a PDF
  does not embed, Asian encodings, JPEG 2000) are in the `pdfjs/` folder of the package: publish it and call
  `configurePdf({ assetsUrl: "https://…/pdfjs/" })` once.
- The style sheet is built with Tailwind 4 and comes with its reset; the colours are the CSS variables at the top of
  `src/styles.css` (`--accent`, `--surface`…), to redefine for another look.
- Annotations are plain JSON, by page number, in coordinates relative to the page (`src/lib/annotations.ts`).

## Android

The Android application is the standalone build in a [Capacitor](https://capacitorjs.com) WebView (`android/`).
Exported PDFs go to `Documents/TinyEditor`, with a « Partager » button to hand them to another application.

```sh
npm run android:apk   # needs a JDK 21 and the Android SDK; the APK is in android/app/build/outputs/apk/debug/
```

## CI

- `.github/workflows/web.yml`: tests, then the library (`tiny-editor-lib`, the npm package) and the standalone
  application (`tiny-editor-web`) as artifacts.
- `.github/workflows/android.yml`: the APK as an artifact (`tiny-editor-apk`). A debug APK by default; with the secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, a release APK
  signed with your key, which is what lets a newer APK update an installed one.

Both run on pushes to `main`, pull requests and by hand; on a `v*` tag they also attach their builds to the release.

## Layout

- `src/components/`: `PdfReader.tsx` (pages, zoom, toolbar), `AnnotLayer.tsx` (drawing on one page),
  `ShortcutSettings.tsx`, `PdfEditor.tsx` (the editor in one component)
- `src/lib/`: `annotations.ts` (the operations and how they are drawn), `shortcuts.ts`, `autoshape.ts`,
  `useAnnotations.ts` (undo history), `pdf.ts` (pdf.js), `export.ts` (annotations written into the PDF with pdf-lib),
  `platform.app.ts` / `platform.lib.ts` (how each build finds the pdf.js worker)
- `src/app/`: the standalone application (`App.tsx`, `store.ts` for the device storage, `files.ts` for saving)
- `src/index.ts`: what the library exports

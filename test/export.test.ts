import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, degrees } from "pdf-lib";
import type { Annotations } from "../src/lib/annotations.js";
import { exportPdf, pageFrame } from "../src/lib/export.js";

/** A point of the shown page (0 to 1, from its top left corner) in the coordinates of the PDF. */
const place = (frame: ReturnType<typeof pageFrame>, u: number, v: number) => {
  const [a, b, c, d, e, f] = frame.matrix;
  const [x, y] = [u * frame.width, v * frame.height];
  return [a * x + c * y + e, b * x + d * y + f];
};

async function blank(pages: number, rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([600, 800]).setRotation(degrees(rotation));
  return doc.save();
}

/** What a page draws, all its content streams put together. */
async function content(bytes: Uint8Array, index: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[index];
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : contents ? [contents] : [];
  return streams
    .map((stream) => {
      const raw = (stream as PDFRawStream).contents;
      return Buffer.from((stream as PDFRawStream).dict.get(PDFName.of("Filter")) ? inflateSync(raw) : raw).toString("latin1");
    })
    .join("\n");
}

test("the top left corner of the shown page is where the rotation puts it", () => {
  const box = { x: 10, y: 20, width: 600, height: 800 };
  // Upright: the top left of the PDF; turned a quarter clockwise: its bottom left; and so on round the page.
  assert.deepEqual(place(pageFrame(box, 0), 0, 0), [10, 820]);
  assert.deepEqual(place(pageFrame(box, 90), 0, 0), [10, 20]);
  assert.deepEqual(place(pageFrame(box, 180), 0, 0), [610, 20]);
  assert.deepEqual(place(pageFrame(box, 270), 0, 0), [610, 820]);
  assert.deepEqual(place(pageFrame(box, 0), 1, 1), [610, 20]);
  assert.deepEqual(place(pageFrame(box, 90), 1, 1), [610, 820]);
  // A turned page is shown wider than high; a rotation of -90 is one of 270.
  assert.deepEqual([pageFrame(box, 90).width, pageFrame(box, 90).height], [800, 600]);
  assert.deepEqual(pageFrame(box, -90), pageFrame(box, 270));
  assert.deepEqual(pageFrame(box, 450), pageFrame(box, 90));
});

test("the annotations are written on their pages, the others are left alone", async () => {
  const annotations: Annotations = {
    "2": [
      { t: "pen", c: "#d90115", w: 0.003, p: [0.1, 0.1, 0.2, 0.15, 0.3, 0.1, 0.4, 0.2] },
      { t: "pen", c: "#1c1a17", w: 0.003, p: [0.5, 0.5] },
      { t: "hl", c: "#f59e0b", w: 0.02, p: [0.1, 0.3, 0.6, 0.3] },
      { t: "line", c: "#2563eb", w: 0.003, a: [0.1, 0.4], b: [0.5, 0.4] },
      { t: "arrow", c: "#2563eb", w: 0.003, a: [0.1, 0.5], b: [0.5, 0.6] },
      { t: "rect", c: "#16a34a", w: 0.0016, a: [0.6, 0.6], b: [0.9, 0.7] },
      { t: "ellipse", c: "#7c3aed", w: 0.006, a: [0.6, 0.75], b: [0.9, 0.9] },
      { t: "text", c: "#1c1a17", s: 0.022, x: 0.1, y: 0.7, v: "Réponse : 42\ndeuxième ligne" },
    ],
    // A page the document does not have, and one without anything left on it.
    "9": [{ t: "line", c: "#000000", w: 0.003, a: [0, 0], b: [1, 1] }],
    "3": [],
  };
  const source = await blank(3);
  const out = await exportPdf(source, annotations);
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 3);
  assert.equal(await content(out, 0), await content(source, 0));
  assert.equal(await content(out, 2), await content(source, 2));

  const drawn = await content(out, 1);
  // The frame of an upright page of 600 × 800, then one path or text per annotation.
  assert.match(drawn, /1 0 0 -1 0 800 cm/);
  assert.equal(drawn.match(/\bS\b/g)?.length, 6, "six stroked paths");
  assert.equal(drawn.match(/\bf\b/g)?.length, 1, "the dot is filled");
  assert.equal(drawn.match(/\bTj\b/g)?.length, 2, "two lines of text");
  assert.match(drawn, /\/TinyEditorHighlight\S* gs/);
  // The line, from (0.1, 0.4) to (0.5, 0.4) of the page.
  assert.match(drawn, /60 320 m\s+300 320 l/);
  // Everything it changed is put back: as many restores as saves.
  assert.equal(drawn.match(/\bq\b/g)?.length, drawn.match(/\bQ\b/g)?.length);
});

test("a turned page gets the frame of its rotation, a text the font cannot write is still exported", async () => {
  const out = await exportPdf(await blank(1, 90), { "1": [{ t: "text", c: "#000000", s: 0.02, x: 0.1, y: 0.1, v: "→ 日本" }] });
  const drawn = await content(out, 0);
  assert.match(drawn, /0 1 1 0 0 0 cm/);
  assert.equal(drawn.match(/\bTj\b/g)?.length, 1);
});

test("nothing to write gives the document back", async () => {
  const out = await exportPdf(await blank(2), {});
  assert.equal((await PDFDocument.load(out)).getPageCount(), 2);
});

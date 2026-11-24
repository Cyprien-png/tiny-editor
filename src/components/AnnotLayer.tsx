import { memo, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { type Op, type ShapeKind, type Shape, type Stroke, type TextOp, HIGHLIGHT_WIDTH, TEXT_FONT, TEXT_LINE, drawOps, hitOp, moveOp, simplify, textLines } from "../lib/annotations";
import { type Snap, HOLD_MS, HOLD_SLOP, adjust, recognize } from "../lib/autoshape";
import type { Tool } from "../lib/shortcuts";

export type { Tool };

export interface ToolStyle {
  tool: Tool;
  shape: ShapeKind;
  color: string;
  /** Stroke width relative to the page width. */
  width: number;
  /** Text size relative to the page width. */
  textSize: number;
  /** A pen stroke held still at its end becomes the shape it looks like. */
  autoShape: boolean;
}

/** Shared with the reader: a second finger turns the touch into a pan/zoom gesture and cancels what was being drawn. */
export interface GestureState {
  active: boolean;
  /** A stylus was seen: fingers no longer draw (palm rejection). */
  penSeen: boolean;
}

interface Props {
  page: number;
  cssW: number;
  cssH: number;
  ops: Op[];
  style: ToolStyle;
  gesture: MutableRefObject<GestureState>;
  /** The tool of the buttons a pointer holds (the button of a stylus, its eraser end), when one is bound. */
  held: (buttons: number) => Tool | undefined;
  commit: (page: number, ops: Op[]) => void;
}

const ERASER_REACH = 12;
const MIN_DRAG = 4;

/** The drawing layer of one page: shows the annotations and lets the pen, shapes, text, eraser and move tools change them. */
export const AnnotLayer = memo(function AnnotLayer({ page, cssW, cssH, ops, style, gesture, held, commit }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelsW = Math.max(1, Math.round(cssW * dpr));
  const pixelsH = Math.max(1, Math.round(cssH * dpr));

  const draft = useRef<Stroke | Shape | undefined>(undefined);
  const erased = useRef(new Set<number>());
  const moving = useRef<{ index: number; dx: number; dy: number } | undefined>(undefined);
  // What is being drawn, with the tool it started with: a button pressed or released on the way ends it and starts
  // the next one with the other tool.
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean; tool: Tool } | undefined>(undefined);
  /** A pointer whose buttons went down here: it may start drawing on a later move (see `track`). */
  const armed = useRef<number | undefined>(undefined);
  const frame = useRef(0);
  // Automatic shapes: where the pen last moved for good, the timer that runs while it stays there, and, once the
  // stroke became a shape, that shape with the place of the hold (the pointer then adjusts it).
  const hold = useRef<{ timer: number; x: number; y: number } | undefined>(undefined);
  const snapped = useRef<{ base: Snap; from: [number, number] } | undefined>(undefined);
  const size = useRef({ cssW, cssH });
  size.current = { cssW, cssH };
  // Each text being typed is a session of its own: its field is never reused for the next one, and it is finished
  // once, whoever asks first (a key, a blur, a tap elsewhere that opens another text).
  const [editing, setEditing] = useState<TextSession>();
  const sessions = useRef(0);
  const finished = useRef(new Set<number>());
  /** What the open field holds right now, to finish it from outside. */
  const live = useRef("");
  // What the next frame paints: read from here, not from the render that scheduled it (it may be older than a commit).
  const latest = useRef({ ops, editingIndex: editing?.index });
  latest.current = { ops, editingIndex: editing?.index };

  const paint = () => {
    frame.current = 0;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    const shown: Op[] = [];
    latest.current.ops.forEach((op, i) => {
      if (erased.current.has(i) || latest.current.editingIndex === i) return;
      shown.push(moving.current?.index === i ? moveOp(op, moving.current.dx, moving.current.dy) : op);
    });
    if (draft.current) shown.push(draft.current);
    drawOps(ctx, shown, el.width, el.height);
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };
  // Repainted when the content, the size or the text being edited changes.
  useLayoutEffect(paint);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const still = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = undefined;
  };
  /** The pen is at (x, y): if it is still there after the delay, its stroke becomes a shape. */
  const waitAt = (x: number, y: number) => {
    still();
    const timer = window.setTimeout(() => {
      hold.current = undefined;
      const d = draft.current;
      if (!d || d.t !== "pen") return;
      const base = recognize(d.p, size.current.cssW, size.current.cssH);
      if (!base) return;
      draft.current = { t: base.t, c: d.c, w: d.w, a: base.a, b: base.b };
      snapped.current = { base, from: [x, y] };
      schedule();
    }, HOLD_MS);
    hold.current = { timer, x, y };
  };
  useEffect(() => still, []);

  const reset = () => {
    still();
    snapped.current = undefined;
    draft.current = undefined;
    erased.current.clear();
    moving.current = undefined;
    pointer.current = undefined;
    schedule();
  };

  // Another page ends what was being drawn. Another tool does not: the next move of the pointer finishes
  // the stroke with the tool it started with, then goes on with the new one (a key released while erasing).
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const at = (e: ReactPointerEvent): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  };

  const topHit = (x: number, y: number, reach: number): number => {
    for (let i = ops.length - 1; i >= 0; i--) if (hitOp(ops[i], x, y, cssW, cssH, reach)) return i;
    return -1;
  };
  const eraseAt = (x: number, y: number) => {
    for (let i = 0; i < ops.length; i++) if (!erased.current.has(i) && hitOp(ops[i], x, y, cssW, cssH, ERASER_REACH)) erased.current.add(i);
  };

  const begin = (e: ReactPointerEvent<HTMLCanvasElement>, tool: Tool) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer follows: it draws without the capture.
    }
    const [x, y] = at(e);
    pointer.current = { id: e.pointerId, x, y, moved: false, tool };
    if (tool === "pen" || tool === "hl") draft.current = { t: tool, c: style.color, w: tool === "hl" ? HIGHLIGHT_WIDTH : style.width, p: [x, y] };
    if (tool === "pen" && style.autoShape) waitAt(x, y);
    if (tool === "shape") draft.current = { t: style.shape, c: style.color, w: style.width, a: [x, y], b: [x, y] };
    else if (tool === "erase") eraseAt(x, y);
    else if (tool === "move") {
      const index = topHit(x, y, 10);
      if (index >= 0) moving.current = { index, dx: 0, dy: 0 };
    }
    schedule();
  };

  const extend = (e: ReactPointerEvent<HTMLCanvasElement>, p: NonNullable<typeof pointer.current>) => {
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = events.length > 0 ? events : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    for (const s of samples) {
      const x = (s.clientX - rect.left) / rect.width;
      const y = (s.clientY - rect.top) / rect.height;
      if (Math.hypot((x - p.x) * cssW, (y - p.y) * cssH) > MIN_DRAG) p.moved = true;
      const d = draft.current;
      const snap = snapped.current;
      if (d && snap) {
        const s = adjust(snap.base, snap.from, [x, y], cssW, cssH);
        (d as Shape).a = s.a;
        (d as Shape).b = s.b;
      } else if (d && (d.t === "pen" || d.t === "hl")) {
        const n = d.p.length;
        if (Math.hypot((x - d.p[n - 2]) * cssW, (y - d.p[n - 1]) * cssH) >= 1) d.p.push(x, y);
        // A trembling pen is still held; one that really moved starts the wait again from where it is.
        const w = hold.current;
        if (d.t === "pen" && style.autoShape && (!w || Math.hypot((x - w.x) * cssW, (y - w.y) * cssH) > HOLD_SLOP)) waitAt(x, y);
      } else if (d) (d as Shape).b = [x, y];
      else if (p.tool === "erase") eraseAt(x, y);
      else if (moving.current) {
        moving.current.dx = x - p.x;
        moving.current.dy = y - p.y;
      }
    }
    schedule();
  };

  /** Ends what is being drawn and saves it. */
  const end = (e: ReactPointerEvent<HTMLCanvasElement>, p: NonNullable<typeof pointer.current>) => {
    const d = draft.current;
    const tool = p.tool;
    const wasErased = [...erased.current];
    const m = moving.current;
    const moved = p.moved;
    still();
    snapped.current = undefined;
    pointer.current = undefined;
    draft.current = undefined;
    erased.current = new Set();
    moving.current = undefined;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released with the last button.
    }
    if (d && (d.t === "pen" || d.t === "hl")) commit(page, [...ops, { ...d, p: simplify(d.p, cssW, cssH) }]);
    else if (d) {
      const s = d as Shape;
      if (Math.hypot((s.b[0] - s.a[0]) * cssW, (s.b[1] - s.a[1]) * cssH) > MIN_DRAG) commit(page, [...ops, { ...s, a: [round(s.a[0]), round(s.a[1])], b: [round(s.b[0]), round(s.b[1])] }]);
    } else if (tool === "erase" && wasErased.length > 0) commit(page, ops.filter((_, i) => !wasErased.includes(i)));
    else if (tool === "move" && m && moved) commit(page, ops.map((op, i) => (i === m.index ? moveOp(op, m.dx, m.dy) : op)));
    else if (tool === "text" && !moved) {
      const index = topHit(p.x, p.y, 6);
      const existing = index >= 0 && ops[index].t === "text" ? (ops[index] as TextOp) : undefined;
      // On a touch screen the tap arrives before the open field loses the focus: finish that one first, where it is,
      // with its own text. Otherwise its text would be saved at the place of the new one.
      // A new text is centred on the pointer: its line straddles the place that was pressed.
      let current = ops;
      if (editing) current = finishText(editing, live.current) ?? ops;
      const reopened = existing && current.includes(existing);
      const session = { id: ++sessions.current, index: reopened ? current.indexOf(existing) : null, op: reopened ? existing : ({ t: "text", c: style.color, s: style.textSize, x: round(p.x), y: round(p.y - (style.textSize * cssW) / 2 / cssH), v: "" } as TextOp) };
      live.current = session.op.v;
      setEditing(session);
    }
    schedule();
  };

  /**
   * Every event of a pointer goes through here. What it draws with is the tool of the buttons it holds, when one is
   * bound, otherwise the selected tool; it draws while it presses the page. Both can change between two events without
   * the pointer going up or down: a stylus whose button is pressed or released while its tip stays on the page, or
   * whose driver sends the button as a right click before the tip touches. So a stroke starts and ends on any event,
   * and a change of tool on the way saves what was drawn and goes on with the other tool.
   */
  const track = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const bound = held(e.buttons);
    const tool = bound ?? style.tool;
    // A held button only chooses the tool: nothing is drawn nor erased until the pointer presses the page, with its
    // main button or, for a stylus, its tip (whatever its buttons say) or its eraser end, which is a contact itself.
    const pressing = (e.buttons & 1) !== 0 || (e.buttons & 32) !== 0 || (e.pointerType === "pen" && e.pressure > 0);
    const on = pressing && tool !== "hand";
    const p = pointer.current;
    if (!p) {
      if (!on || gesture.current.active) return;
      if (e.pointerType === "pen") gesture.current.penSeen = true;
      else if (e.pointerType === "touch" && gesture.current.penSeen) return;
      begin(e, tool);
      return;
    }
    if (p.id !== e.pointerId) return;
    if (gesture.current.active) return reset();
    if (!on) return end(e, p);
    if (tool !== p.tool) {
      end(e, p);
      begin(e, tool);
      return;
    }
    extend(e, p);
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") gesture.current.penSeen = true;
    armed.current = e.pointerId;
    track(e);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Without a stroke, only a pointer whose buttons went down here may start one: not a drag that began elsewhere.
    if (!pointer.current && armed.current !== e.pointerId) return;
    if (!pointer.current && e.buttons === 0) {
      armed.current = undefined;
      return;
    }
    track(e);
  };

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (armed.current === e.pointerId) armed.current = undefined;
    track(e);
  };

  /** Saves the text of a session and closes its field; the new operations when something changed. */
  function finishText(session: TextSession, value: string): Op[] | undefined {
    if (finished.current.has(session.id)) return undefined;
    finished.current.add(session.id);
    // Only its own field: another text may already be open.
    setEditing((now) => (now?.id === session.id ? undefined : now));
    const { index, op } = session;
    const text = value.replace(/\s+$/, "");
    let next: Op[] | undefined;
    if (index === null) {
      if (text) next = [...ops, { ...op, v: text }];
    } else if (!text) next = ops.filter((_, i) => i !== index);
    else if (text !== op.v) next = ops.map((o, i) => (i === index ? { ...op, v: text } : o));
    if (next) commit(page, next);
    return next;
  }

  return (
    <>
      <canvas
        ref={canvas}
        width={pixelsW}
        height={pixelsH}
        // The click that follows a tap (and the press of a mouse) would move the focus to the page, away from the text
        // field that the tap has just opened: the canvas never takes the focus, a text is finished by `up`.
        // It listens with the hand tool too: a bound button lends its tool from there (the eraser under the stylus button).
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          armed.current = undefined;
          reset();
        }}
        data-annot-layer
        className="absolute inset-0 h-full w-full"
        // With the hand tool the cursor is the reader's.
        style={{ touchAction: "none", cursor: style.tool === "text" ? "text" : style.tool === "move" ? "move" : style.tool === "hand" ? undefined : "crosshair" }}
      />
      {editing && <TextEditor key={editing.id} op={editing.op} cssW={cssW} live={live} onDone={(value) => finishText(editing, value)} />}
    </>
  );
});

const round = (n: number) => Math.round(n * 10000) / 10000;

interface TextSession {
  id: number;
  /** The operation being changed, or null for a new text. */
  index: number | null;
  op: TextOp;
}

function TextEditor({ op, cssW, live, onDone }: { op: TextOp; cssW: number; live: { current: string }; onDone: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(op.v);
  const size = op.s * cssW;
  const box = useRef<HTMLDivElement>(null);
  // Reported once: removing the field makes the browser send a last blur, which must not finish the text again while
  // React is taking the field out (« removeChild: not a child of this node »).
  const done = useRef(false);
  const finish = (text: string) => {
    if (done.current) return;
    done.current = true;
    onDone(text);
  };
  // Set before React takes the field out, so that the blur of the removal changes nothing.
  useLayoutEffect(() => {
    done.current = false;
    return () => {
      done.current = true;
    };
  }, []);
  const text = useRef(value);
  text.current = value;
  const finishRef = useRef(finish);
  finishRef.current = finish;
  /** Takes the focus back, now and once the browser has finished whatever moved it. */
  const hold = () => {
    for (const delay of [0, 60, 250]) {
      setTimeout(() => {
        const el = ref.current;
        if (!done.current && el && document.activeElement !== el && document.hasFocus()) el.focus({ preventScroll: true });
      }, delay);
    }
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Without scrolling: the field is where the finger is, the page must not jump under it.
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // The text is left on purpose by pressing somewhere else. On the page itself the layer finishes it (and opens the
    // next text there); anywhere else, here. A focus lost without that is not the person's doing: it is taken back.
    const pressed = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || box.current?.contains(target)) return;
      // The layer of this very page (the field's sibling), not the one of another page.
      if (target.closest("[data-annot-layer]") && box.current?.parentElement?.contains(target)) return;
      finishRef.current(text.current);
    };
    document.addEventListener("pointerdown", pressed, true);
    return () => document.removeEventListener("pointerdown", pressed, true);
  }, []);
  return (
    // A box of its own around the field: what a browser extension (spelling, translation, passwords) adds next to a
    // text field stays inside it, and the whole box leaves at once.
    <div
      ref={box}
      className="absolute"
      translate="no"
      // The canvas draws the text from the top of its line; the field centres it in a line 1.25 high: same place.
      style={{ left: `${op.x * 100}%`, top: `${op.y * 100}%`, marginTop: -(size * (TEXT_LINE - 1)) / 2 }}
    >
      <textarea
        ref={ref}
        value={value}
        rows={Math.max(1, textLines({ ...op, v: value }).length)}
        onChange={(e) => {
          live.current = e.target.value;
          setValue(e.target.value);
        }}
        onBlur={(e) => {
          if (done.current) return;
          // The keyboard moved to another control: the text is finished.
          if (e.relatedTarget instanceof HTMLElement && !box.current?.contains(e.relatedTarget)) return finish(value);
          // Anything else (a simulated click after a tap, the browser, an extension, a re-render) is not the person
          // leaving: the field stays open and takes the focus back. Another window or tab: it comes back with it.
          hold();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            finish(value);
          }
        }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-lt-active="false"
        data-1p-ignore
        data-lpignore="true"
        placeholder="Texte…"
        className="block resize-none overflow-hidden rounded-sm bg-white/70 outline-dashed outline-1 outline-accent p-0 m-0 border-0 whitespace-pre"
        style={{ minWidth: size * 6, width: `${Math.max(value.split("\n").reduce((m, l) => Math.max(m, l.length), 0) + 2, 6)}ch`, fontSize: size, lineHeight: TEXT_LINE, color: op.c, fontFamily: TEXT_FONT }}
      />
    </div>
  );
}

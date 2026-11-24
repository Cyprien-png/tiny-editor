/**
 * Shortcuts of the PDF editor: a key, or a button of the stylus or of the mouse, selects a tool, for good (« switch »)
 * or only while it is held (« hold »: the eraser under the button of a stylus, the hand under the space bar).
 * Kept in the browser: a graphics tablet belongs to one computer, not to the account.
 */

export type Tool = "hand" | "pen" | "hl" | "erase" | "text" | "shape" | "move";

export const TOOLS: { id: Tool; label: string }[] = [
  { id: "hand", label: "Main" },
  { id: "pen", label: "Stylo" },
  { id: "hl", label: "Surligneur" },
  { id: "text", label: "Texte" },
  { id: "shape", label: "Forme" },
  { id: "erase", label: "Gomme" },
  { id: "move", label: "Déplacer" },
];

/** The buttons a pointer can hold besides the one that draws, as bits of `PointerEvent.buttons`. */
export const POINTER_BUTTONS: { bit: number; label: string }[] = [
  { bit: 2, label: "Bouton du stylet (clic droit)" },
  { bit: 32, label: "Gomme du stylet (stylet retourné)" },
  { bit: 4, label: "Bouton du milieu" },
  { bit: 8, label: "Bouton latéral arrière" },
  { bit: 16, label: "Bouton latéral avant" },
];

export interface KeyTrigger {
  kind: "key";
  /** The physical key (`KeyboardEvent.code`): the same on keydown and keyup, whatever the modifiers. */
  code: string;
  /** What the key prints, to show it. */
  label: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface PointerTrigger {
  kind: "pointer";
  /** One bit of `PointerEvent.buttons`. */
  button: number;
}

export type Trigger = KeyTrigger | PointerTrigger;
export type Mode = "switch" | "hold";

export interface Binding {
  trigger: Trigger;
  tool: Tool;
  /** A button is always « hold »: it has no state of its own once released. */
  mode: Mode;
}

/** What a keyboard event must give: a `KeyboardEvent`, or a plain object in the tests. */
export interface KeyLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIERS: Record<string, string> = {
  ShiftLeft: "Maj",
  ShiftRight: "Maj droite",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl droite",
  AltLeft: "Alt",
  AltRight: "Alt Gr",
  MetaLeft: "⌘",
  MetaRight: "⌘ droite",
};

const KEY_NAMES: Record<string, string> = {
  " ": "Espace",
  Enter: "Entrée",
  Backspace: "Retour arrière",
  Delete: "Suppr",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

export const isModifier = (code: string) => code in MODIFIERS;

const key = (code: string, label: string): KeyTrigger => ({ kind: "key", code, label });

export const DEFAULT_BINDINGS: Binding[] = [
  { trigger: { kind: "pointer", button: 2 }, tool: "erase", mode: "hold" },
  { trigger: { kind: "pointer", button: 32 }, tool: "erase", mode: "hold" },
  { trigger: key("Space", "Espace"), tool: "hand", mode: "hold" },
  { trigger: key("KeyP", "P"), tool: "pen", mode: "switch" },
  { trigger: key("KeyH", "H"), tool: "hl", mode: "switch" },
  { trigger: key("KeyE", "E"), tool: "erase", mode: "switch" },
  { trigger: key("KeyT", "T"), tool: "text", mode: "switch" },
  { trigger: key("KeyS", "S"), tool: "shape", mode: "switch" },
  { trigger: key("KeyV", "V"), tool: "move", mode: "switch" },
];

/** The trigger a pressed key stands for: a modifier alone, or a key with the modifiers held. */
export function keyTrigger(e: KeyLike): KeyTrigger {
  if (isModifier(e.code)) return key(e.code, MODIFIERS[e.code]);
  const label = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  const trigger = key(e.code, label);
  if (e.ctrlKey) trigger.ctrl = true;
  if (e.altKey) trigger.alt = true;
  if (e.shiftKey) trigger.shift = true;
  if (e.metaKey) trigger.meta = true;
  return trigger;
}

export function sameTrigger(a: Trigger, b: Trigger): boolean {
  if (a.kind === "pointer" || b.kind === "pointer") return a.kind === b.kind && (a as PointerTrigger).button === (b as PointerTrigger).button;
  return a.code === b.code && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift && !!a.meta === !!b.meta;
}

export function triggerLabel(t: Trigger): string {
  if (t.kind === "pointer") return POINTER_BUTTONS.find((b) => b.bit === t.button)?.label ?? `Bouton ${t.button}`;
  return [t.ctrl && "Ctrl", t.alt && "Alt", t.shift && "Maj", t.meta && "⌘", t.label].filter(Boolean).join(" + ");
}

/** The binding of a key that goes down. A modifier alone ignores the modifier flags (it sets its own). */
export function matchKey(bindings: Binding[], e: KeyLike): Binding | undefined {
  return bindings.find(({ trigger: t }) => {
    if (t.kind !== "key" || t.code !== e.code) return false;
    if (isModifier(t.code)) return true;
    return !!t.ctrl === e.ctrlKey && !!t.alt === e.altKey && !!t.shift === e.shiftKey && !!t.meta === e.metaKey;
  });
}

/** The tool of the buttons a pointer holds, if one of them is bound (the first binding wins). */
export function pointerTool(bindings: Binding[], buttons: number): Tool | undefined {
  if (!(buttons & ~1)) return undefined;
  return bindings.find(({ trigger: t }) => t.kind === "pointer" && (buttons & t.button) !== 0)?.tool;
}

/** The button to bind among those a pointer holds: never the one that draws. */
export function pointerButton(buttons: number): number | undefined {
  return POINTER_BUTTONS.find((b) => (buttons & b.bit) !== 0)?.bit;
}

/** Adds a binding, or changes the one at `index`; a trigger only does one thing, the other binding using it leaves. */
export function withBinding(bindings: Binding[], binding: Binding, index?: number): Binding[] {
  const fixed: Binding = binding.trigger.kind === "pointer" ? { ...binding, mode: "hold" } : binding;
  const next = index === undefined ? [...bindings, fixed] : bindings.map((b, i) => (i === index ? fixed : b));
  const at = index ?? next.length - 1;
  return next.filter((b, i) => i === at || !sameTrigger(b.trigger, fixed.trigger));
}

/** The first shortcut of a tool, for the hint of its button. */
export function shortcutOf(bindings: Binding[], tool: Tool): string | undefined {
  const found = bindings.find((b) => b.tool === tool && b.trigger.kind === "key") ?? bindings.find((b) => b.tool === tool);
  return found && triggerLabel(found.trigger);
}

const flag = (v: unknown) => v === true;

/** What was stored, checked: anything unknown is dropped, a missing or broken list gives the defaults. */
export function parseBindings(raw: unknown): Binding[] {
  const list = (raw as { v?: unknown; bindings?: unknown } | null)?.bindings;
  if ((raw as { v?: unknown } | null)?.v !== 1 || !Array.isArray(list)) return DEFAULT_BINDINGS;
  let out: Binding[] = [];
  for (const item of list as { trigger?: Record<string, unknown>; tool?: unknown; mode?: unknown }[]) {
    const t = item?.trigger;
    if (!t || !TOOLS.some((tool) => tool.id === item.tool) || (item.mode !== "switch" && item.mode !== "hold")) continue;
    let trigger: Trigger;
    if (t.kind === "pointer" && POINTER_BUTTONS.some((b) => b.bit === t.button)) trigger = { kind: "pointer", button: t.button as number };
    else if (t.kind === "key" && typeof t.code === "string" && t.code && typeof t.label === "string") {
      trigger = key(t.code, t.label.slice(0, 20));
      if (flag(t.ctrl)) trigger.ctrl = true;
      if (flag(t.alt)) trigger.alt = true;
      if (flag(t.shift)) trigger.shift = true;
      if (flag(t.meta)) trigger.meta = true;
    } else continue;
    out = withBinding(out, { trigger, tool: item.tool as Tool, mode: item.mode });
  }
  return out;
}

const STORE = "tiny-editor-shortcuts";

export function loadBindings(): Binding[] {
  try {
    const saved = localStorage.getItem(STORE);
    return saved ? parseBindings(JSON.parse(saved)) : DEFAULT_BINDINGS;
  } catch {
    return DEFAULT_BINDINGS;
  }
}

export function saveBindings(bindings: Binding[]): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ v: 1, bindings }));
  } catch {
    // Private browsing or storage full: the shortcuts last as long as the page.
  }
}

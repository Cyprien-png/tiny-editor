import { PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { type Binding, type Mode, type Tool, type Trigger, DEFAULT_BINDINGS, TOOLS, isModifier, keyTrigger, pointerButton, triggerLabel, withBinding } from "../lib/shortcuts";
import { Button, IconButton, Kbd, Select, Toggle } from "./ui";

interface Props {
  bindings: Binding[];
  onChange: (next: Binding[]) => void;
  autoShape: boolean;
  onAutoShape: (on: boolean) => void;
  onClose: () => void;
}

/**
 * The shortcuts of the editor: which key or button selects which tool, for good or while it is held. A shortcut is
 * recorded by pressing it: a key (with its modifiers, or a modifier alone), or a button of the stylus or of the mouse
 * over the recording box.
 */
export function ShortcutSettings({ bindings, onChange, autoShape, onAutoShape, onClose }: Props) {
  /** The binding whose trigger is being recorded, or "new". */
  const [recording, setRecording] = useState<number | "new">();
  const state = useRef({ bindings, recording, onChange, onClose });
  state.current = { bindings, recording, onChange, onClose };

  const record = (trigger: Trigger) => {
    const { bindings: list, recording: target, onChange: change } = state.current;
    if (target === undefined) return;
    const previous = target === "new" ? undefined : list[target];
    const mode: Mode = trigger.kind === "pointer" ? "hold" : (previous?.mode ?? "switch");
    change(withBinding(list, { trigger, tool: previous?.tool ?? "erase", mode }, target === "new" ? undefined : target));
    setRecording(undefined);
  };
  const recordRef = useRef(record);
  recordRef.current = record;

  // The keys go to the recording first, before any other shortcut of the page.
  useEffect(() => {
    /** A modifier pressed alone is only known as such once it comes back up without another key. */
    let modifier: KeyboardEvent | undefined;
    const onDown = (e: KeyboardEvent) => {
      const target = state.current.recording;
      if (target === undefined) {
        if (e.key === "Escape") state.current.onClose();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.key === "Escape") return setRecording(undefined);
      if (isModifier(e.code)) {
        modifier = e;
        return;
      }
      modifier = undefined;
      recordRef.current(keyTrigger(e));
    };
    const onUp = (e: KeyboardEvent) => {
      if (state.current.recording === undefined || !modifier || modifier.code !== e.code) return;
      e.preventDefault();
      recordRef.current(keyTrigger(modifier));
      modifier = undefined;
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, []);

  const onButtons = (e: React.PointerEvent) => {
    const button = pointerButton(e.buttons);
    if (button === undefined) return;
    e.preventDefault();
    record({ kind: "pointer", button });
  };

  const update = (index: number, patch: Partial<Binding>) => onChange(bindings.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Réglages de l'éditeur">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[92%] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-card sm:max-w-xl sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <h2 className="text-base font-semibold">Réglages de l'éditeur</h2>
          <IconButton label="Fermer" onClick={onClose}>
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </header>
        <div className="space-y-4 p-4">
          <section className="space-y-1.5 border-b border-line pb-4">
            <Toggle checked={autoShape} onChange={onAutoShape} label="Formes automatiques" />
            <p className="text-sm text-ink-2">
              Avec le stylo, garde la pointe immobile à la fin du tracé : un trait devient une ligne droite, un rond un cercle ou une ellipse, un cadre un rectangle. Sans relâcher, glisse ensuite pour déplacer le bout de la ligne ou changer la taille de la forme.
            </p>
          </section>

          <h3 className="text-sm font-semibold">Raccourcis des outils</h3>
          <p className="text-sm text-ink-2">
            Une touche, ou un bouton du stylet ou de la souris, choisit un outil. « Tant que maintenu » prête l'outil le temps de l'appui, puis revient au précédent : la gomme sous le bouton du stylet, par exemple.
          </p>

          {bindings.length === 0 ? (
            <p className="text-sm text-ink-3">Aucun raccourci.</p>
          ) : (
            <ul className="divide-y divide-line">
              {bindings.map((b, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2">
                  <button onClick={() => setRecording(i)} title="Changer la touche ou le bouton" className="min-w-0 flex-1 basis-40 truncate rounded-lg border border-line px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                    {b.trigger.kind === "key" ? <Kbd>{triggerLabel(b.trigger)}</Kbd> : triggerLabel(b.trigger)}
                  </button>
                  <Select aria-label="Outil" value={b.tool} onChange={(e) => update(i, { tool: e.target.value as Tool })}>
                    {TOOLS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  {/* A button has nothing to switch back from once released: it only lends its tool. */}
                  <Select aria-label="Mode" value={b.mode} disabled={b.trigger.kind === "pointer"} onChange={(e) => update(i, { mode: e.target.value as Mode })} className="disabled:opacity-60">
                    <option value="switch">Sélectionne</option>
                    <option value="hold">Tant que maintenu</option>
                  </Select>
                  <IconButton label="Supprimer ce raccourci" onClick={() => onChange(bindings.filter((_, j) => j !== i))}>
                    <TrashIcon className="h-5 w-5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setRecording("new")}>
              <PlusIcon className="h-4 w-4" />
              Ajouter un raccourci
            </Button>
            <Button variant="ghost" onClick={() => confirm("Remplacer tous les raccourcis par ceux d'origine ?") && onChange(DEFAULT_BINDINGS)}>
              Rétablir les raccourcis d'origine
            </Button>
          </div>

          <p className="text-xs text-ink-3">
            Tablette graphique : si le bouton du stylet n'est pas reconnu, donne-lui une touche (E, par exemple) dans le pilote de la tablette, puis associe cette touche à la gomme en « Tant que maintenu ». Ces réglages restent sur cet appareil.
          </p>
        </div>
      </div>
      {/* Over the whole reader, not inside the list that scrolls. */}
      {recording !== undefined && (
        <div
          onPointerDown={onButtons}
          onPointerMove={onButtons}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface/95 p-6 text-center"
          style={{ touchAction: "none" }}
        >
          <p className="text-base font-medium">Appuie sur la touche ou le bouton à utiliser</p>
          <p className="max-w-sm text-sm text-ink-2">Une touche du clavier, seule ou avec Ctrl, Alt, Maj ou ⌘, ou un bouton du stylet ou de la souris en survolant ce cadre.</p>
          <Button onClick={() => setRecording(undefined)}>Annuler</Button>
        </div>
      )}
    </div>
  );
}

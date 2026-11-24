import { ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentPlusIcon, FolderOpenIcon, ShareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PdfReader } from "../components/PdfReader";
import { Button, IconButton, cx } from "../components/ui";
import { countAnnotated } from "../lib/annotations";
import { useAnnotations } from "../lib/useAnnotations";
import { type Saved, SaveCancelled, exportName, savePdf } from "./files";
import { type Session, clearSession, loadSession, storeAnnotations, storeFile } from "./store";

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** The first bytes of every PDF, within the first kilobyte: what tells a PDF from a file that is only named like one. */
function looksLikePdf(bytes: ArrayBuffer): boolean {
  return new TextDecoder("latin1").decode(bytes.slice(0, 1024)).includes("%PDF-");
}

/**
 * The standalone application: opens a PDF from the device, edits it, and exports it with its annotations written in.
 * The document and its annotations stay on the device between two visits.
 */
export function App() {
  const [session, setSession] = useState<Session>();
  /** The document shown in the editor, or the home screen. */
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /** Counts the documents opened: each one gets an editor of its own. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    loadSession()
      .then((found) => {
        if (!found) return;
        setSession(found);
        setEditing(true);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const openFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    try {
      const bytes = await file.arrayBuffer();
      if (!isPdf(file) && !looksLikePdf(bytes)) throw new Error("Ce fichier n'est pas un PDF.");
      // Without storage (private browsing, quota) the document is still edited, only not kept.
      await storeFile(file.name, bytes).catch(() => undefined);
      setSession({ name: file.name, bytes, annotations: {} });
      setGeneration((n) => n + 1);
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const pick = () => input.current?.click();
  const forget = async () => {
    await clearSession().catch(() => undefined);
    setSession(undefined);
    setEditing(false);
  };

  // A PDF dropped anywhere on the window opens.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void openFile([...e.dataTransfer.files].find(isPdf) ?? e.dataTransfer.files[0]);
  };

  return (
    <div
      className="relative h-full"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          void openFile(e.target.files?.[0]);
          // The same file can be chosen again.
          e.target.value = "";
        }}
      />
      {!ready ? null : session && editing ? (
        <Editor
          key={generation}
          session={session}
          onOpen={pick}
          onClose={(annotations) => {
            setSession({ ...session, annotations });
            setEditing(false);
          }}
        />
      ) : (
        <Home session={session} error={error} onPick={pick} onResume={() => setEditing(true)} onForget={() => void forget()} />
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-[200] grid place-items-center bg-accent/15 p-6">
          <p className="rounded-xl border-2 border-dashed border-accent bg-surface px-6 py-4 text-base font-medium shadow-card">Dépose le PDF pour l'ouvrir</p>
        </div>
      )}
    </div>
  );
}

function Home({ session, error, onPick, onResume, onForget }: { session?: Session; error?: string; onPick: () => void; onResume: () => void; onForget: () => void }) {
  const annotated = session ? countAnnotated(session.annotations) : 0;
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <img src="icon.svg" alt="" className="h-16 w-16" />
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Tiny Editor</h1>
        <p className="text-sm text-ink-2">Ouvre un PDF, écris dessus au stylo, au surligneur, avec du texte et des formes, puis exporte-le.</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button variant="primary" size="lg" onClick={onPick}>
          <ArrowUpTrayIcon className="h-5 w-5" /> Ouvrir un PDF
        </Button>
        <p className="hidden text-xs text-ink-3 sm:block">ou dépose un fichier dans la fenêtre</p>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      {session && (
        <div className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface p-3 text-left shadow-card">
          <button onClick={onResume} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <DocumentPlusIcon className="h-6 w-6 shrink-0 text-ink-3" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{session.name}</span>
              <span className="block text-xs text-ink-3">{annotated === 0 ? "Aucune annotation" : annotated === 1 ? "1 page annotée" : `${annotated} pages annotées`} · sur cet appareil</span>
            </span>
          </button>
          <Button size="sm" onClick={onResume}>
            Reprendre
          </Button>
          <IconButton label="Retirer ce document de l'appareil" onClick={() => confirm(`Retirer « ${session.name} » et ses annotations de cet appareil ?`) && onForget()}>
            <TrashIcon className="h-5 w-5" />
          </IconButton>
        </div>
      )}
      <p className="text-xs text-ink-3">Le PDF reste sur ton appareil : rien n'est envoyé.</p>
    </main>
  );
}

type Notice = { tone: "ok" | "bad"; text: ReactNode; share?: Saved["share"] };

function Editor({ session, onOpen, onClose }: { session: Session; onOpen: () => void; onClose: (annotations: Session["annotations"]) => void }) {
  const ann = useAnnotations(session.annotations);
  const [stored, setStored] = useState<"saved" | "saving" | "error">("saved");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  const ops = useRef(ann.ops);
  const version = useRef(ann.version);
  ops.current = ann.ops;
  version.current = ann.version;
  const storedVersion = useRef(0);

  const flush = useCallback(async () => {
    const sent = version.current;
    if (sent === storedVersion.current) return;
    try {
      await storeAnnotations(ops.current);
      storedVersion.current = Math.max(storedVersion.current, sent);
      setStored(version.current === sent ? "saved" : "saving");
    } catch {
      setStored("error");
    }
  }, []);

  // Kept on the device a moment after each change, and at once when the page is hidden or left.
  useEffect(() => {
    if (ann.version === 0) return;
    setStored("saving");
    const timer = setTimeout(() => void flush(), 500);
    return () => clearTimeout(timer);
  }, [ann.version, flush]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (!notice || notice.tone === "bad") return;
    const timer = setTimeout(() => setNotice(undefined), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const doExport = async () => {
    setExporting(true);
    setNotice(undefined);
    try {
      // Loaded when first needed: writing a PDF is a library of its own.
      const { exportPdf } = await import("../lib/export");
      const saved = await savePdf(exportName(session.name), await exportPdf(session.bytes, ann.ops));
      setNotice({ tone: "ok", text: saved.where ? `Exporté dans ${saved.where}` : "PDF exporté", share: saved.share });
    } catch (e) {
      if (!(e instanceof SaveCancelled)) setNotice({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  };

  const status = stored === "saving" ? "Enregistrement…" : stored === "error" ? <span className="text-bad">Non enregistré sur l'appareil</span> : ann.version > 0 ? "Enregistré sur l'appareil" : "";

  return (
    <>
      <PdfReader
        overlay
        source={session.bytes}
        title={session.name}
        onClose={() => onClose(ann.ops)}
        edit={{ ...ann, status }}
        actions={
          <>
            <IconButton label="Ouvrir un autre PDF" onClick={onOpen}>
              <FolderOpenIcon className="h-5 w-5" />
            </IconButton>
            <Button size="sm" variant="primary" disabled={exporting} onClick={() => void doExport()}>
              <ArrowDownTrayIcon className="h-4 w-4" /> {exporting ? "Export…" : "Exporter"}
            </Button>
          </>
        }
      />
      {notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[150] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div role="status" className={cx("pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border bg-surface px-4 py-2.5 text-sm shadow-card", notice.tone === "bad" ? "border-bad text-bad" : "border-line")}>
            <span className="min-w-0 break-words">{notice.text}</span>
            {notice.share && (
              <Button size="sm" onClick={() => void notice.share?.()}>
                <ShareIcon className="h-4 w-4" /> Partager
              </Button>
            )}
            <button onClick={() => setNotice(undefined)} className="text-xs text-ink-3 underline">
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

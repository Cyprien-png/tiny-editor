/**
 * Writing the exported PDF where the person can find it: a « save as » dialog where the browser has one, a download
 * elsewhere, the Documents folder in the Android application (a WebView cannot download).
 */
import { Capacitor } from "@capacitor/core";

export interface Saved {
  /** Where the file went, to tell the person; nothing when they chose the place themselves. */
  where?: string;
  /** Hands the file to another application (Android). */
  share?: () => Promise<void>;
}

/** The person closed the dialog: nothing was saved, and nothing went wrong. */
export class SaveCancelled extends Error {}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function saveNative(name: string, bytes: Uint8Array): Promise<Saved> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const data = base64(bytes);
  const share = async () => {
    const { Share } = await import("@capacitor/share");
    // Only the files of the cache can be handed to another application.
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: name, files: [uri] }).catch(() => undefined);
  };
  try {
    await Filesystem.writeFile({ path: `TinyEditor/${name}`, data, directory: Directory.Documents, recursive: true });
    return { where: `Documents/TinyEditor/${name}`, share };
  } catch {
    // No access to the shared folders (an old Android that refused the permission, a file of the same name written
    // by another installation): the person chooses where it goes.
    await share();
    return {};
  }
}

type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

export async function savePdf(name: string, bytes: Uint8Array): Promise<Saved> {
  if (Capacitor.isNativePlatform()) return saveNative(name, bytes);
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {};
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new SaveCancelled();
      // Refused here (an embedded page, a browser that only pretends): downloaded instead.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { where: "Téléchargements" };
}

/** `cours.pdf` → `cours-annoté.pdf`; a name that already says so is kept. */
export function exportName(name: string): string {
  const base = name.replace(/\.pdf$/i, "");
  return `${/-annoté$/.test(base) ? base : `${base}-annoté`}.pdf`;
}

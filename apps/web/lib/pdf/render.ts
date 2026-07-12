/**
 * lib/pdf/render.ts — der einzige unreine Teil von lib/pdf: rendert eine reine
 * pdfmake-Dokumentdefinition zu einem PDF-Buffer (doc 10 §6.4 Hybrid-Pipeline,
 * pdfmake als portabler Kern).
 *
 * Die eingebettete Roboto-Schrift wird über das Virtual File System (`vfs_fonts`)
 * geladen — kein Chromium, kein Dateisystem-Font nötig, läuft lokal (Tauri) und
 * serverseitig gleich. Import ist lazy (dynamic import), damit die schwere
 * pdfmake-Browser-Build nicht in Edge-Bundles landet und nur bei echter
 * PDF-Erzeugung geladen wird. Dokument-Layouts liegen als reine Funktionen in
 * timesheet.ts / invoice.ts und sind ohne diesen Renderer testbar.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";

/** Minimales Interface des pdfmake-Client-Builds (nur was wir serverseitig nutzen). */
interface PdfMakeLike {
  vfs: Record<string, string>;
  createPdf(dd: TDocumentDefinitions): {
    getBuffer(cb: (buffer: Buffer) => void): void;
  };
}

let pdfMakePromise: Promise<PdfMakeLike> | null = null;

/** Lädt pdfmake + vfs_fonts einmalig und verdrahtet das Virtual File System. */
async function getPdfMake(): Promise<PdfMakeLike> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const mod = (await import("pdfmake/build/pdfmake")) as unknown as {
        default?: PdfMakeLike;
      } & PdfMakeLike;
      const vfsMod = (await import("pdfmake/build/vfs_fonts")) as unknown as {
        default?: Record<string, string>;
      } & Record<string, string>;
      const pdfMake: PdfMakeLike = mod.default ?? mod;
      const vfs = vfsMod.default ?? vfsMod;
      pdfMake.vfs = vfs;
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

/**
 * Rendert eine Dokumentdefinition zu einem PDF-Buffer. Reine Layout-Logik liegt
 * in den Buildern; hier passiert nur die pdfmake-Ausführung.
 */
export async function renderPdf(docDefinition: TDocumentDefinitions): Promise<Buffer> {
  const pdfMake = await getPdfMake();
  return new Promise<Buffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBuffer((buffer) => resolve(buffer));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

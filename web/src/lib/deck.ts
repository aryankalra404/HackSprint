import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Deck } from "./contract";

// The presenter's deck (contract: POST /api/room/deck). The laptop turns the upload into one JPEG per slide and serves
// them itself, so the headset never needs the internet: PowerPoint and Keynote go through LibreOffice to a PDF, and every
// PDF through Ghostscript to images.
export const DECKS_DIR = path.join(process.cwd(), ".decks");
export const MAX_DECK_BYTES = 100 * 1024 * 1024;
const MAX_SLIDES = 200;
// Long side of a slide image: enough for the TV in VR, small enough for the headset to hold the whole deck
const SLIDE_PX = 1920;
const OFFICE = [".pptx", ".ppt", ".key", ".odp"];

export class DeckError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 500,
  ) {
    super(message);
  }
}

const run = promisify(execFile);

// Homebrew's and LibreOffice's usual places, so it works even when the server's PATH doesn't have them
function tool(name: string, places: string[]): string {
  return places.find((p) => existsSync(p)) ?? name;
}
const soffice = () => tool("soffice", ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "/opt/homebrew/bin/soffice", "/usr/local/bin/soffice", "/usr/bin/soffice"]);
const gs = () => tool("gs", ["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "/usr/bin/gs"]);
const magick = () => tool("magick", ["/opt/homebrew/bin/magick", "/usr/local/bin/magick", "/usr/bin/magick"]);

export function deckDir(id: string): string {
  return path.join(DECKS_DIR, id);
}

export function isDeckId(id: string): boolean {
  return /^d[a-z0-9-]+$/.test(id);
}

// Converts an upload into slide images under .decks/<id>/1.jpg, 2.jpg, …
export async function convertDeck(name: string, data: Buffer): Promise<Deck> {
  const ext = path.extname(name).toLowerCase();
  const isPdf = ext === ".pdf" || data.subarray(0, 4).toString("latin1") === "%PDF";
  if (!isPdf && !OFFICE.includes(ext)) throw new DeckError("Upload a PDF or a PowerPoint (.pptx, .ppt) or Keynote (.key) file.", 400);
  if (data.length === 0) throw new DeckError("That file is empty.", 400);
  if (data.length > MAX_DECK_BYTES) throw new DeckError("That file is over 100 MB.", 400);

  const id = `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const work = await mkdtemp(path.join(os.tmpdir(), "dryrun-deck-"));
  try {
    const input = path.join(work, `deck${isPdf ? ".pdf" : ext}`);
    await writeFile(input, data);
    const pdf = isPdf ? input : await officeToPdf(input, work);
    const out = path.join(work, "slides");
    await mkdir(out);
    await pdfToImages(pdf, out);
    const files = (await readdir(out)).filter((f) => /^\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    if (files.length === 0) throw new DeckError("The file has no pages we could read.", 400);
    const slides = await Promise.all(
      files.map(async (f, index) => {
        const { width, height } = jpegSize(await readFile(path.join(out, f)));
        return { index, image_url: `/api/deck/${id}/${index + 1}.jpg`, width, height };
      }),
    );
    await mkdir(DECKS_DIR, { recursive: true });
    await rename(out, deckDir(id));
    return { id, name: path.basename(name), slides };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// Removes a deck's images once the room no longer uses it
export async function removeDeckFiles(id: string): Promise<void> {
  if (isDeckId(id)) await rm(deckDir(id), { recursive: true, force: true });
}

async function officeToPdf(input: string, work: string): Promise<string> {
  // Its own profile, so a LibreOffice the presenter has open (or its first-run setup) never gets in the way
  const profile = `file://${path.join(work, "profile")}`;
  try {
    await run(soffice(), [`-env:UserInstallation=${profile}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", work, input], { timeout: 180_000 });
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new DeckError(missing ? "PowerPoint needs LibreOffice on the laptop (brew install --cask libreoffice). Or upload a PDF." : "Couldn't open that presentation. Export it as a PDF and upload that.", 500);
  }
  const pdf = input.replace(/\.[^.]+$/, ".pdf");
  if (!existsSync(pdf)) throw new DeckError("Couldn't open that presentation. Export it as a PDF and upload that.", 500);
  return pdf;
}

async function pdfToImages(pdf: string, out: string): Promise<void> {
  try {
    // 144 dpi makes a 13.33 in widescreen slide exactly 1920 px wide
    await run(
      gs(),
      ["-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=jpeg", "-dJPEGQ=85", "-r144", "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", `-dLastPage=${MAX_SLIDES}`, `-sOutputFile=${path.join(out, "%d.jpg")}`, pdf],
      { timeout: 300_000 },
    );
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new DeckError(missing ? "Reading a PDF needs Ghostscript on the laptop (brew install ghostscript)." : "Couldn't read that PDF.", missing ? 500 : 400);
  }
  // Pages bigger than a slide (e.g. a Keynote export) come down to SLIDE_PX; smaller ones stay as they are
  try {
    await run(magick(), ["mogrify", "-resize", `${SLIDE_PX}x${SLIDE_PX}>`, "-quality", "85", path.join(out, "*.jpg")], { timeout: 300_000 });
  } catch {
    // Without ImageMagick the slides are just bigger than they need to be
  }
}

// Width and height from a JPEG's frame header
function jpegSize(data: Buffer): { width: number; height: number } {
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = data[i + 1];
    const length = data.readUInt16BE(i + 2);
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return { width: SLIDE_PX, height: Math.round((SLIDE_PX * 9) / 16) };
}

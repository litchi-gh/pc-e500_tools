// A picture being edited: its dots, the file as it was read, and what saving writes.
import { decodeLcd, encode, formatOf, HEIGHT, LcdFormat, partnerPath, sameDots, WIDTH } from "./lcdFile";

/** The files, as the editor reads and writes them. */
export interface LcdFiles {
  /** undefined when the file is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}

/** What saving did with the other file of the same name. */
export type PartnerResult = "none" | "written" | "different";

export class LcdPicture {
  dots: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  format: LcdFormat;
  /** The file's size when it is not a picture; it cannot be edited then. */
  wrongSize: number | undefined;
  /** The file as read or written last. */
  private disk: Uint8Array = new Uint8Array(0);
  /** The picture in that file. */
  private savedDots: Uint8Array = this.dots;

  constructor(readonly path: string) { this.format = formatOf(path); }

  /** What is shown is from before the file was last read again: saving asks. */
  private stale = false;

  get dirty(): boolean { return !sameDots(this.dots, this.savedDots); }

  /** Takes a file's bytes as what is on the disk and, unless `keep`, as the picture. An empty file is a blank picture. */
  load(bytes: Uint8Array, keep = false): void {
    const picture = bytes.length === 0 ? { format: formatOf(this.path), dots: new Uint8Array(WIDTH * HEIGHT) } : decodeLcd(bytes);
    this.disk = Uint8Array.from(bytes);
    this.stale = false;
    this.wrongSize = picture ? undefined : bytes.length;
    if (!picture) return;
    this.format = picture.format;
    this.savedDots = picture.dots;
    if (!keep) this.dots = Uint8Array.from(picture.dots);
  }

  /** Whether the file is as it was last read or written here. */
  isDisk(bytes: Uint8Array | undefined): boolean {
    return !this.stale && bytes !== undefined && bytes.length === this.disk.length && bytes.every((b, i) => b === this.disk[i]);
  }

  /** An edit from before the file was read again is undone or redone. */
  forgetDisk(): void { this.stale = true; }

  /** For a hot exit: the picture and the file it is of. */
  backup(): string { return JSON.stringify({ dots: Buffer.from(this.dots).toString("base64"), disk: Buffer.from(this.disk).toString("base64") }); }
  /** Takes a backup; false when it is not one. */
  restore(text: string): boolean {
    let kept: { dots?: unknown; disk?: unknown };
    try { kept = JSON.parse(text) as typeof kept; } catch { return false; }
    if (typeof kept.dots !== "string" || typeof kept.disk !== "string") return false;
    const dots = Uint8Array.from(Buffer.from(kept.dots, "base64"), d => (d ? 1 : 0));
    if (dots.length !== WIDTH * HEIGHT) return false;
    this.load(Uint8Array.from(Buffer.from(kept.disk, "base64")));
    if (this.wrongSize !== undefined) return false;
    this.dots = dots;
    return true;
  }

  bytes(): Uint8Array { return encode(this.format, this.dots, this.disk); }

  /**
   * Writes the picture, and the other file of the name (.lcd or .pixels) when it had the
   * same picture; one with another picture is left alone.
   */
  async save(files: LcdFiles): Promise<PartnerResult> {
    const partner = partnerPath(this.path);
    const other = partner && await files.read(partner.path);
    const before = other && decodeLcd(other);
    const bytes = this.bytes();
    await files.write(this.path, bytes);
    const was = this.savedDots;
    this.load(bytes, true);
    if (!partner || !other || !before || before.format !== partner.format) return "none";
    if (sameDots(before.dots, this.dots)) return "none";
    if (!sameDots(before.dots, was)) return "different";
    await files.write(partner.path, encode(partner.format, this.dots, other));
    return "written";
  }
}

// How a BASIC program, or a line at the prompt, has ended: read from the screen, as a user does.
import { EmulatorClient } from "./client";

/** BASIC's error messages, as the ROM has them (a table of texts, each ended by 0). */
async function errorTexts(client: EmulatorClient): Promise<string[]> {
  for (const [from, length] of [[0xe0000, 0x10000], [0x30000, 0x10000]]) {
    const bytes = await client.read(from, length), at = bytes.indexOf("Syntax error\0Direct command error\0", 0, "latin1");
    if (at < 0) continue;
    const texts = bytes.subarray(at, at + 1100).toString("latin1").split("\0");
    const end = texts.findIndex(t => !/^[ -~]*$/.test(t));
    return ["Error", ...texts.slice(0, end < 0 ? -1 : end).filter(t => t !== "")];
  }
  return ["Error"];
}

export type BasicState = "running" | "ended" | "error" | "menu";

/** Tells how BASIC stands; one for a machine that has started. */
export class BasicWatch {
  private constructor(private readonly client: EmulatorClient, private readonly texts: readonly string[]) {}

  static async create(client: EmulatorClient): Promise<BasicWatch> { return new BasicWatch(client, await errorTexts(client)); }

  /** "menu": out of BASIC, after a crash. `broken`: ON/BRK was pressed, and a break is what was asked for. */
  async look(broken = false): Promise<{ state: BasicState; error?: string }> {
    const mode = await this.client.mode(), screen = (await this.client.screen()).text ?? "";
    if ((!mode.run && !mode.pro) || (await this.client.registers()).off || screen.trim() === "NO MEMORY") return { state: "menu" };
    if (mode.busy) return { state: "running" };
    const error = errorOnScreen(screen, this.texts, broken, await this.errorLine());
    return error === undefined ? { state: "ended" } : { state: "error", error };
  }

  /** The line of the last error (ERL), where the ROM keeps it; ROM 2.1 keeps it elsewhere. */
  private async errorLine(): Promise<number | undefined> {
    if (this.client.info?.romVersion.startsWith("2.1")) return undefined;
    const b = await this.client.read(0xbf87c, 2);
    return b[0] | b[1] << 8;
  }
}

/**
 * The error on the screen of a machine that has stopped: "Division by Zero in 30", wherever the
 * program left the cursor and whatever it has drawn to the right of it, of the line the ROM has
 * as that of the error; or without a line when there is no prompt. A ">" may also be the program's,
 * but one alone right under the text is the prompt: the text is then what the program has shown.
 */
export function errorOnScreen(screen: string, texts: readonly string[], broken: boolean, errorLine: number | undefined): string | undefined {
  const lines = screen.split("\n").map(l => l.trim()), prompt = lines.some(l => l.startsWith(">"));
  const found: string[] = [];
  // The longer texts first: "Error" begins others.
  const longest = [...texts].sort((a, b) => b.length - a.length);
  lines.forEach((l, row) => {
    if (/^Direct command error(?: {2}|$)/.test(l)) { found.push("Direct command error"); return; }
    if (lines[row + 1] === ">") return;
    const broke = /^Break(?: in \d{1,5})?(?= |$)/.exec(l)?.[0];
    if (broke && !broken && (broke !== "Break" || !prompt)) { found.push(broke); return; }
    for (const text of longest) {
      if (!l.startsWith(text)) continue;
      const at = /^ in (\d{1,5})(?= |$)/.exec(l.slice(text.length));
      if (at ? errorLine === undefined || Number(at[1]) === errorLine : !prompt && /^(?: {2}|$)/.test(l.slice(text.length))) { found.push(text + (at?.[0] ?? "")); return; }
    }
  });
  // "Error" alone is the least of them.
  return found.find(e => !/^Error\b/.test(e)) ?? found[0];
}

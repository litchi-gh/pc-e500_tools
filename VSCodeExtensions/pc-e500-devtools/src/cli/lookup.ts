// What the hovers say, as plain text: "e500 help MV".
import { DIRECTIVE_INFO, formLines, INSTRUCTIONS, legend } from "../asm/instructions";
import { OPERATIONS, REGISTERS } from "../asm/hover";
import { COMMANDS, commandLines, DEVICES, ENTRIES, ARGUMENTS, ERRORS, FILE_COMMANDS, FILE_ERRORS } from "../asm/iocs";
import { BASIC_HELP, forms, keywordOf, notes } from "../basic/help";
import * as fs from "node:fs";
import * as path from "node:path";
import { L } from "../l10n";
import { extensionRoot } from "./options";

const hex = (n: number): string => "$" + n.toString(16).toUpperCase().padStart(2, "0");

export interface IncludeName { readonly name: string; readonly file: string; readonly lines: string[] }

/** The names the include files define (but iocs.inc's, said better above), with the comments before them. */
export function includeNames(folder = path.join(extensionRoot, "inc")): IncludeName[] {
  const out: IncludeName[] = [];
  for (const file of fs.readdirSync(folder).filter(f => f.endsWith(".inc") && f !== "iocs.inc").sort()) {
    const source = fs.readFileSync(path.join(folder, file), "utf8").split(/\r?\n/);
    const notes = source.map(l => /^\s*;\s?(.*)$/.exec(l)?.[1]);
    let comment: string[] = [];
    source.forEach((line, i) => {
      const note = notes[i];
      if (note !== undefined) { comment.push(note); return; }
      const label = /^([A-Za-z_]\w*):\s*(?:(D[BWPS]\b[^;]*))?(?:;\s*(.*))?/.exec(line), equ = /^([A-Za-z_]\w*)\s+EQU\s+([^;]+?)\s*(?:;\s*(.*))?$/i.exec(line);
      const name = (equ ?? label)?.[1];
      if (name !== undefined) {
        // What else the file says about it.
        const said = notes.filter((n): n is string => n !== undefined && new RegExp(`\\b${name}\\b`).test(n) && !comment.includes(n));
        const value = equ ? `EQU ${equ[2]}${equ[3] ? `  ; ${equ[3]}` : ""}` : label?.[2] ? `${label[2].trim()}${label[3] ? `  ; ${label[3]}` : ""}` : undefined;
        // A label nothing is said about is a place inside a routine.
        if (value || comment.length > 0 || said.length > 0) out.push({ name, file, lines: [...(equ ? [] : comment), ...(value ? [value] : []), ...said] });
      }
      comment = [];
    });
  }
  return out;
}

/** Everything there is to say about a word: an instruction, a directive, a register, a name of iocs.inc, a BASIC keyword. */
export function lookup(word: string): string[] {
  const w = word.toUpperCase(), out: string[] = [];
  const instruction = Object.hasOwn(INSTRUCTIONS, w) ? INSTRUCTIONS[w] : undefined;
  if (instruction) {
    out.push(L(`[命令] ${w}: ${instruction.ja}`, `[instruction] ${w}: ${instruction.en}`));
    if (OPERATIONS[w]) out.push(`  ${OPERATIONS[w]}`);
    out.push(...formLines(w).map(f => `  ${f}`));
    const l = legend(w);
    if (l) out.push(...l.split("\n").map(x => `  ${x}`));
    out.push(L(`  フラグ: ${instruction.flags || "変わらない"}`, `  Flags: ${instruction.flags || "not changed"}`));
  }
  const bare = w.replace(/^\./, "");
  if (Object.hasOwn(DIRECTIVE_INFO, bare)) out.push(L(`[疑似命令] ${DIRECTIVE_INFO[bare].form}: ${DIRECTIVE_INFO[bare].ja}`, `[directive] ${DIRECTIVE_INFO[bare].form}: ${DIRECTIVE_INFO[bare].en}`));
  if (Object.hasOwn(REGISTERS, w)) out.push(L(`[レジスタ] ${w}: ${REGISTERS[w].ja}`, `[register] ${w}: ${REGISTERS[w].en}`));
  for (const c of [...COMMANDS, ...FILE_COMMANDS]) if (c.constant === w) out.push(`[IOCS] ${c.constant} EQU ${hex(c.number)}`, ...commandLines(c).map(x => `  ${x}`));
  for (const d of Object.values(DEVICES)) if (d.constant === w) out.push(`[IOCS] ${d.constant}: ${L(d.ja, d.en)}`, ...COMMANDS.filter(c => DEVICES[c.device] === d).map(c => `  ${c.constant} (${hex(c.number)}) ${L(c.ja, c.en)}`));
  for (const n of [...ENTRIES, ...ARGUMENTS, ...ERRORS, ...FILE_ERRORS]) if (n.constant === w) out.push(`[IOCS] ${n.constant} EQU ${hex(n.value)}: ${L(n.ja, n.en)}`);
  for (const n of includeNames()) if (n.name.toUpperCase() === w) out.push(`[${n.file}] ${n.name}`, ...n.lines.map(x => `  ${x}`));
  const keyword = keywordOf(w);
  if (keyword) {
    const help = BASIC_HELP[keyword];
    out.push(`[BASIC] ${keyword}`, ...forms(help).map(f => `  ${f}`), ...notes(help).split("\n").filter(x => x).map(x => `  ${x}`));
  }
  return out;
}

/** The words there are, by kind. */
export function words(): Array<[string, string[]]> {
  return [
    [L("命令", "Instructions"), Object.keys(INSTRUCTIONS)], [L("疑似命令", "Directives"), Object.keys(DIRECTIVE_INFO)],
    [L("IOCS のデバイス", "IOCS devices"), Object.values(DEVICES).map(d => d.constant)], ["IOCS", COMMANDS.map(c => c.constant)], ["FCS", FILE_COMMANDS.map(c => c.constant)],
    ["INCLUDE", includeNames().map(n => n.name)], ["BASIC", Object.keys(BASIC_HELP)]
  ];
}

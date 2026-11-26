// What can be typed at a place in an assembly source: an instruction or directive, or
// the registers and symbols an operand takes.
import { DIRECTIVES } from "./assembler";
import { INSTRUCTIONS } from "./instructions";

export interface CompletionContext {
  /** "op": an instruction or directive; "equ": EQU after a name; "operand": registers and symbols. */
  readonly kind: "op" | "equ" | "operand";
  /** Column where the word being typed starts. */
  readonly start: number;
  readonly prefix: string;
  /** The operand's instruction or directive, in capitals. */
  readonly op?: string;
  /** The registers that fit there. */
  readonly registers: readonly string[];
}

const ALL = ["A", "B", "IL", "BA", "I", "X", "Y", "U", "S"];
const POINTERS = ["X", "Y", "U", "S"];

const GROUPS: Readonly<Record<string, readonly string[]>> = {
  r: ["A", "IL", "BA", "I", "X", "Y", "U", "S"], q: ["A", "IL", "BA", "I", "X", "Y", "U"], w: ["BA", "I", "X", "Y", "U", "S"],
  v: ["A", "IL", "BA", "I"], r2: ["BA", "I"], r3: POINTERS
};
const NAMES = new Set([...ALL, "F", "IMR"]);

/** The registers a form's operand stands for. */
function registersIn(operand: string): readonly string[] {
  return GROUPS[operand] ?? operand.split("/").filter(r => NAMES.has(r));
}

/** Whether what is written before the comma can be the form's first operand. */
function fits(written: string, operand: string): boolean {
  const s = written.trim().toUpperCase();
  if (s.startsWith("(")) return /^\([mn]\)$/.test(operand);
  if (s.startsWith("[")) return operand === "[lmn]" || operand === "[p]";
  return registersIn(operand).includes(s);
}

/** The registers an operand may start with, from the instruction's forms. */
function registersOf(op: string, index: number, first: string): string[] {
  const out = new Set<string>();
  for (const form of INSTRUCTIONS[op].forms) {
    const operands = form.split(",");
    if (operands[index] === undefined || (index > 0 && !fits(first, operands[0]))) continue;
    registersIn(operands[index]).forEach(r => out.add(r));
  }
  return [...out];
}

/** Whether the code before the cursor is inside a string or a comment. */
function inTextOrComment(before: string): boolean {
  let quote = "";
  for (let i = 0; i < before.length; i++) {
    if (quote) {
      if (before[i] === "\\") i++;
      else if (before[i] === quote) quote = "";
    } else if (before[i] === "\"" || before[i] === "'") quote = before[i];
    else if (before[i] === ";") return true;
  }
  return quote !== "";
}

/** What may be typed at the end of `before`, the line up to the cursor. */
export function completionContext(before: string): CompletionContext | undefined {
  if (inTextOrComment(before)) return undefined;
  const prefix = /[A-Za-z_.][A-Za-z_0-9.]*$/.exec(before)?.[0] ?? "";
  const start = before.length - prefix.length;
  const ahead = before.slice(0, start);
  // A number being typed: $BED, &HBE, 0BE.
  if (/[$&0-9]$/.test(ahead)) return undefined;
  const statement = ahead.replace(/^\s*[A-Za-z_.][A-Za-z_0-9.]*\s*:/, "");
  if (statement.trim() === "") return { kind: "op", start, prefix, registers: [] };
  const m = /^\s*(\.?[A-Za-z_][A-Za-z_0-9.]*)\s+(.*)$/s.exec(statement);
  if (!m) {
    // "name =": the value of a constant.
    return /^\s*[A-Za-z_.][A-Za-z_0-9.]*\s*=/.test(statement) ? { kind: "operand", start, prefix, op: "EQU", registers: [] } : undefined;
  }
  const first = m[1].toUpperCase();
  const op = first.startsWith(".") ? first.slice(1) : first;
  if (!(first in INSTRUCTIONS) && !DIRECTIVES.has(op)) {
    if (m[2] === "") return { kind: "equ", start, prefix, registers: [] };
    return /^(?:\.?EQU\s|=)/i.test(m[2]) ? { kind: "operand", start, prefix, op: "EQU", registers: [] } : undefined;
  }
  if (DIRECTIVES.has(op)) return op === "END" || op === "INCLUDE" || op === "INCBIN" ? undefined : { kind: "operand", start, prefix, op, registers: [] };
  const info = INSTRUCTIONS[first];
  if (info.forms.length === 1 && info.forms[0] === "") return undefined;
  // Which operand, and inside what brackets.
  let index = 0;
  const open: string[] = [];
  for (const c of m[2]) {
    if (c === "(" || c === "[") open.push(c);
    else if (c === ")" || c === "]") open.pop();
    else if (c === "," && open.length === 0) index++;
  }
  const operand = m[2].slice(m[2].lastIndexOf(",") + 1);
  // Right after a value or a closing bracket there is nothing to add but an operator.
  if (prefix === "" && /[A-Za-z0-9_.)\]]\s*$/.test(operand)) return undefined;
  const inner = open[open.length - 1];
  const bracket = operand.slice(Math.max(operand.lastIndexOf("["), operand.lastIndexOf("(")) + 1).trim();
  let registers: string[];
  if (inner === "[") registers = bracket === "" || bracket === "--" ? POINTERS : [];
  else if (inner === "(") registers = bracket === "" ? ["BP", "PX", "PY"] : /^BP\s*\+$/i.test(bracket) ? ["PX", "PY"] : [];
  else registers = operand.trim() === "" ? registersOf(first, index, m[2].slice(0, m[2].indexOf(",") + 1).replace(/,$/, "")) : [];
  return { kind: "operand", start, prefix, op: first, registers };
}

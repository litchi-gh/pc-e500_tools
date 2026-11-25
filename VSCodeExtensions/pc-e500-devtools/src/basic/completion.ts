// What can be typed at a place in a BASIC program, and what a word there is.
import { BASIC_HELP, keywordOf } from "./help";

export interface BasicContext {
  /** "statement": start of a statement; "value": inside one; "target": a line number or a label. */
  readonly kind: "statement" | "value" | "target";
  /** Column where the word being typed starts. */
  readonly start: number;
  readonly prefix: string;
}

const TARGET = /(?:^|[^A-Z0-9$#])(?:GOTO|GOSUB|THEN|ELSE|RESTORE|RESUME|RUN|ARUN|AUTOGOTO|LIST|LLIST)\s*(?:(?:\d+|\*[A-Z][A-Z0-9]*)\s*,\s*)*$/i;

/** The part of a line before the cursor that is code, or undefined in a string or a comment. */
function codeBefore(before: string): string | undefined {
  let quote = false, start = 0;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (c === "\"") quote = !quote;
    else if (quote) continue;
    else if (c === "'") return undefined;
    else if (c === ":") start = i + 1;
    else if (/^REM(?![A-Z0-9])/i.test(before.slice(i)) && before.slice(start, i).trim().replace(/^\d+\s*/, "").replace(/^\*[A-Z][A-Z0-9]*\s*/i, "") === "") return undefined;
  }
  return quote ? undefined : before;
}

/** The last statement of a line of code (split at ":" outside strings). */
function lastStatement(code: string): string {
  let quote = false, start = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\"") quote = !quote;
    else if (code[i] === ":" && !quote) start = i + 1;
  }
  return start === 0 ? code.replace(/^\s*\d+(?=\s|[A-Z*?]|$)/i, "") : code.slice(start);
}

/** What may be typed at the end of `before`, the line up to the cursor. */
export function basicContext(before: string): BasicContext | undefined {
  const code = codeBefore(before);
  if (code === undefined) return undefined;
  // The line number itself, or a line that has none yet.
  if (/^\s*\d*$/.test(code)) return undefined;
  const label = /\*[A-Z][A-Z0-9]*$|\*$/i.exec(code);
  if (label && TARGET.test(code.slice(0, label.index))) return { kind: "target", start: label.index, prefix: label[0] };
  const prefix = /(?:[A-Z][A-Z0-9]*[$#]?|\d+)$/i.exec(code)?.[0] ?? "";
  const start = code.length - prefix.length;
  const ahead = code.slice(0, start);
  const statement = lastStatement(ahead);
  if (/^\s*DATA\b/i.test(statement)) return undefined;
  if (TARGET.test(ahead) && !/^[A-Z]/i.test(prefix)) return { kind: "target", start, prefix };
  if (/^\d/.test(prefix) || /&H?[0-9A-F]*$/i.test(ahead) || /[0-9.]$/.test(ahead)) {
    // "10PRINT": a line number with no space after it.
    if (!/^\s*\d+$/.test(ahead)) return undefined;
  }
  const begins = /^\s*(?:\*[A-Z][A-Z0-9]*\s+)?$/i.test(statement) || /(?:^|[^A-Z0-9$#])(?:THEN|ELSE)\s*$/i.test(statement);
  return { kind: begins ? "statement" : "value", start, prefix };
}

export interface BasicNames {
  /** Line number → the rest of its line. */
  readonly lines: Map<number, string>;
  /** Label without "*" → its line of the source. */
  readonly labels: Map<string, number>;
  /** Variables by their name: "A", "B$", "P#"; arrays as "T(" and "N$(". */
  readonly variables: Set<string>;
}

/** The line numbers, labels and variables of a program. */
export function basicNames(source: string): BasicNames {
  const names: BasicNames = { lines: new Map(), labels: new Map(), variables: new Set() };
  source.split(/\r?\n/).forEach((text, n) => {
    const m = /^\s*(\d+)\s*(.*)$/.exec(text);
    const body = m ? m[2] : text;
    if (m && !names.lines.has(Number(m[1]))) names.lines.set(Number(m[1]), body.trim());
    const label = /^\s*\*([A-Z][A-Z0-9]*)/i.exec(body);
    if (label && !names.labels.has(label[1].toUpperCase())) names.labels.set(label[1].toUpperCase(), n);
    let code = body.replace(/"[^"]*"?/g, "\"\"").replace(/'.*$/, "").replace(/(^|:)\s*(?:REM(?![A-Z0-9])|DATA\b).*$/i, "$1");
    code = code.replace(/\*[A-Z][A-Z0-9]*/gi, (w, at: number) => TARGET.test(code.slice(0, at)) || /^\s*$/.test(code.slice(0, at)) ? " " : w);
    for (const v of code.matchAll(/&H[0-9A-F]+|\d+(?:\.\d*)?(?:E[+-]?\d+)?|([A-Z][A-Z0-9]*[$#]?)(\s*\()?/gi)) {
      if (!v[1] || keywordOf(v[1])) continue;
      names.variables.add(v[1].toUpperCase() + (v[2] ? "(" : ""));
    }
  });
  return names;
}

/** The word at a column, outside strings and comments: "CHR$", "INPUT#", "100". */
export function basicWordAt(line: string, column: number): { word: string; start: number; end: number; ahead: string } | undefined {
  for (const m of line.matchAll(/\*?[A-Z][A-Z0-9]*[$#?]?|\d+/gi)) {
    const start = m.index, end = start + m[0].length;
    if (column < start) return undefined;
    if (column > end || codeBefore(line.slice(0, start)) === undefined) continue;
    const ahead = line.slice(0, start);
    // "*" is only part of a label where one goes.
    if (m[0].startsWith("*") && !TARGET.test(ahead) && !/^\s*\d*\s*$/.test(ahead)) return { word: m[0].slice(1), start: start + 1, end, ahead: ahead + "*" };
    if (!m[0].startsWith("*") && /[$#?]$/.test(m[0]) && !keywordOf(m[0]) && keywordOf(m[0].slice(0, -1))) return { word: m[0].slice(0, -1), start, end: end - 1, ahead };
    return { word: m[0], start, end, ahead };
  }
  return undefined;
}

/** Whether a line number or label follows this code. */
export function isTargetPlace(ahead: string): boolean {
  return TARGET.test(ahead);
}

/** The keywords that start a statement, or that go inside one. */
export function keywordsFor(kind: "statement" | "value"): string[] {
  return Object.keys(BASIC_HELP).filter(k => BASIC_HELP[k].kinds.some(s => (s === "statement") === (kind === "statement")));
}

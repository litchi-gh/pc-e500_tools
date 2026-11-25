// Where a name in an assembly source is defined: a label ("name:"), a constant ("name EQU"
// or "name ="), or the file of an INCLUDE. Names match in any case, as in the assembler.
import * as path from "node:path";
import { AsmOptions, findFile } from "./assembler";
import { parseString, stripComment } from "./expression";

export interface Span {
  /** Column of the first character and of the one after the last. */
  readonly start: number;
  readonly end: number;
}

export interface Definition extends Span {
  readonly file: string;
  /** 0-based. */
  readonly line: number;
  /** As written there. */
  readonly name: string;
  /** A constant's expression; a label has none. */
  readonly value?: string;
  /** The comment on the line. */
  readonly comment?: string;
}

const splitLines = (text: string): string[] => text.replace(/\r\n?/g, "\n").split("\n");

/** The line without its comment; the whole line while a string is still being typed. */
function code(line: string): string {
  try { return stripComment(line); } catch { return line; }
}

/** The file name of an INCLUDE or INCBIN line, and where it is. */
export function fileNameAt(line: string, directive: "INCLUDE" | "INCBIN"): (Span & { name: string }) | undefined {
  const m = /^\s*(?:[A-Za-z_.][A-Za-z_0-9.]*\s*:\s*)?\.?(INCLUDE|INCBIN)\s+("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/i.exec(code(line));
  if (!m || m[1].toUpperCase() !== directive) return undefined;
  const start = m[0].length - m[2].length;
  try { return { name: parseString(m[2]), start, end: m[0].length }; } catch { return undefined; }
}

/** The label or constant a line defines. */
function definedName(line: string): (Span & { name: string; value?: string; comment?: string }) | undefined {
  const text = code(line);
  const m = /^(\s*)([A-Za-z_.][A-Za-z_0-9.]*)(?:\s*:|\s+(?:\.?EQU\b|=)\s*(.*))/is.exec(text);
  if (!m) return undefined;
  const comment = line.slice(text.length).replace(/^;+\s*/, "").trim();
  return { name: m[2], start: m[1].length, end: m[1].length + m[2].length, value: m[3]?.trim(), comment: comment || undefined };
}

/** The name at a column of a line: not in a comment, a string or a number ($BED00, &HBED00). */
export function nameAt(line: string, column: number): (Span & { name: string }) | undefined {
  const text = code(line);
  for (const m of text.matchAll(/"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|[$&]H?[0-9A-Fa-f]+(?![A-Za-z_0-9.])|[0-9][A-Za-z_0-9]*|[A-Za-z_.][A-Za-z_0-9.]*/g)) {
    const start = m.index, end = start + m[0].length;
    if (column < start) return undefined;
    if (column <= end && /^[A-Za-z_.]/.test(m[0])) return { name: m[0], start, end };
    if (column < end) return undefined;
  }
  return undefined;
}

/** The definitions in a file and in the files it includes, upper-cased name → places. */
export function definitions(file: string, options: AsmOptions, found = new Map<string, Definition[]>(), seen = new Set<string>()): Map<string, Definition[]> {
  const key = path.resolve(file).toLowerCase();
  const text = seen.has(key) || seen.size >= 64 ? undefined : options.host?.readText(file);
  if (text === undefined) return found;
  seen.add(key);
  splitLines(text).forEach((line, n) => {
    const name = definedName(line);
    if (name) {
      const list = found.get(name.name.toUpperCase()) ?? [];
      list.push({ file: path.resolve(file), line: n, ...name });
      found.set(name.name.toUpperCase(), list);
    }
    const include = fileNameAt(line, "INCLUDE");
    const included = include && findFile(include.name, file, options);
    if (included) definitions(included, options, found, seen);
  });
  return found;
}

/**
 * What a place in a source refers to: the span of the name there, and where it is
 * defined (empty when the file and its INCLUDEs do not define it).
 */
export function definitionAt(file: string, line: number, column: number, options: AsmOptions): { at: Span; name?: string; targets: Definition[] } | undefined {
  const text = options.host?.readText(file);
  const source = text === undefined ? undefined : splitLines(text)[line];
  if (source === undefined) return undefined;
  const include = fileNameAt(source, "INCLUDE");
  if (include && column >= include.start && column <= include.end) {
    const target = findFile(include.name, file, options);
    return { at: include, targets: target ? [{ file: target, line: 0, start: 0, end: 0, name: include.name }] : [] };
  }
  const name = nameAt(source, column);
  if (!name) return undefined;
  return { at: name, name: name.name, targets: definitions(file, options).get(name.name.toUpperCase()) ?? [] };
}

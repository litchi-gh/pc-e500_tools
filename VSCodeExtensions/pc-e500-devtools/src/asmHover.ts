// The explanation shown for a word in an assembly source.
import * as path from "node:path";
import * as vscode from "vscode";
import { Definition } from "./asm/definition";
import { asmWordAt, OPERATIONS, registerText } from "./asm/hover";
import { Command, commandLines, commandNamed, commandsAt, literal } from "./asm/iocs";
import { DIRECTIVE_INFO, formLines, INSTRUCTIONS, legend } from "./asm/instructions";
import { AsmNames } from "./definitionProvider";
import { L } from "./l10n";

const escape = (s: string): string => s.replace(/[\\[\]*_<>|]/g, "\\$&");

export function instructionMarkdown(name: string): vscode.MarkdownString {
  const i = INSTRUCTIONS[name];
  const doc = new vscode.MarkdownString();
  doc.appendMarkdown(escape(L(i.ja, i.en)));
  if (OPERATIONS[name]) doc.appendMarkdown(`  \n\`${OPERATIONS[name]}\``);
  doc.appendCodeblock(formLines(name).join("\n"), "pc-e500-asm");
  const notes = legend(name);
  if (notes) doc.appendMarkdown(`\n\n${notes.split("  \n").map(escape).join("  \n")}`);
  doc.appendMarkdown(`\n\n${L("フラグ", "Flags")}: ${i.flags || L("変わらない", "unchanged")}`);
  return doc;
}

export function directiveMarkdown(name: string): vscode.MarkdownString {
  const d = DIRECTIVE_INFO[name];
  const doc = new vscode.MarkdownString();
  doc.appendMarkdown(escape(L(d.ja, d.en)));
  doc.appendCodeblock(d.form, "pc-e500-asm");
  return doc;
}

const hexByte = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0") + "h";

/** An IOCS call: what it does, takes and gives. */
export function commandMarkdown(c: Command): vscode.MarkdownString {
  const doc = new vscode.MarkdownString();
  doc.appendCodeblock(`${c.constant} EQU $${hexByte(c.number).slice(0, 2)}`, "pc-e500-asm");
  doc.appendMarkdown(commandLines(c).map(escape).join("  \n"));
  return doc;
}

export class AsmHoverProvider implements vscode.HoverProvider {
  constructor(private readonly names: AsmNames) {}

  async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
    const text = document.lineAt(position.line).text;
    // The number in "MV IL,$42" before CALLF IOCS.
    const number = /^\s*(?:[A-Za-z_.][\w.]*\s*:)?\s*MV\s+IL\s*,\s*([\w$&]+)/i.exec(text);
    if (number) {
      const start = number[0].length - number[1].length, value = literal(number[1]);
      if (value !== undefined && position.character >= start && position.character <= number[0].length) {
        const lines = Array.from({ length: Math.min(document.lineCount, position.line + 9) }, (_, n) => document.lineAt(n).text);
        if (!lines.slice(position.line).some(l => /\bCALLF\b/i.test(l))) return undefined;
        const found = commandsAt(lines, position.line, value);
        return found.length === 0 ? undefined : new vscode.Hover(found.map(commandMarkdown), new vscode.Range(position.line, start, position.line, number[0].length));
      }
    }
    const at = asmWordAt(text, position.character);
    if (!at) return undefined;
    const range = new vscode.Range(position.line, at.start, position.line, at.end);
    if (at.kind === "instruction") return new vscode.Hover(instructionMarkdown(at.name), range);
    if (at.kind === "directive") return new vscode.Hover(directiveMarkdown(at.name), range);
    if (at.kind === "register") return new vscode.Hover(new vscode.MarkdownString(escape(`${at.name}: ${registerText(at.name)}`)), range);
    const call = commandNamed(at.name);
    if (call) return new vscode.Hover(commandMarkdown(call), range);
    const d: Definition | undefined = (await this.names.all(document, token)).get(at.name.toUpperCase())?.[0];
    if (!d) return undefined;
    const here = d.file.toLowerCase() === path.resolve(document.uri.fsPath).toLowerCase();
    const doc = new vscode.MarkdownString();
    doc.appendCodeblock(d.value !== undefined ? `${d.name} EQU ${d.value}` : `${d.name}:`, "pc-e500-asm");
    if (d.comment) doc.appendText(d.comment + "\n\n");
    doc.appendText(here ? L(`${d.line + 1} 行`, `Line ${d.line + 1}`) : `${path.basename(d.file)}:${d.line + 1}`);
    return new vscode.Hover(doc, range);
  }
}

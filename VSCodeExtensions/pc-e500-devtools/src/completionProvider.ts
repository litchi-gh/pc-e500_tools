// The list of instructions, registers and symbols while typing an assembly source.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { completionContext } from "./asm/completion";
import { Definition } from "./asm/definition";
import { callsFcs, Command, commandsOf, deviceBefore, FILE_COMMANDS, wantsCommand } from "./asm/iocs";
import { DIRECTIVE_INFO, INSTRUCTIONS } from "./asm/instructions";
import { commandMarkdown, directiveMarkdown, instructionMarkdown } from "./asmHover";
import { ownIncludeFolder } from "./emu/config";
import { registerText } from "./asm/hover";
import { AsmNames } from "./definitionProvider";
import { L } from "./l10n";

/** Instructions whose operand is first of all a label. */
const BRANCHES = /^(JP|JR|CALL)/;

const hexByte = (n: number): string => "$" + n.toString(16).toUpperCase().padStart(2, "0");

export class AsmCompletionProvider implements vscode.CompletionItemProvider {
  /** Typing one of these opens the list (a space only after an instruction). */
  static readonly triggers = [" ", ",", "(", "[", "\""];

  constructor(private readonly names: AsmNames) {}

  /** In INCLUDE "...": the files beside the source and the extension's own; in INCBIN "...": pictures and data. */
  private includeFiles(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const m = /^\s*(?:[A-Za-z_.][\w.]*\s*:)?\s*\.?(INCLUDE|INCBIN)\s+(["'])([^"']*)$/i.exec(before);
    if (!m || document.uri.scheme !== "file") return undefined;
    const typed = m[3], sub = typed.slice(0, typed.lastIndexOf("/") + 1), include = m[1].toUpperCase() === "INCLUDE";
    const range = new vscode.Range(position.line, position.character - (typed.length - sub.length), position.line, position.character);
    const items: vscode.CompletionItem[] = [], seen = new Set<string>();
    const list = (folder: string, own: boolean): void => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (seen.has(e.name.toLowerCase()) || e.name.startsWith(".")) continue;
        if (!e.isDirectory() && (include ? !/\.(inc|asm|e500asm)$/i.test(e.name) : /\.(asm|inc|e500asm|md|json|ts|js|ps1)$/i.test(e.name))) continue;
        if (path.join(folder, e.name).toLowerCase() === document.uri.fsPath.toLowerCase()) continue;
        seen.add(e.name.toLowerCase());
        const item = new vscode.CompletionItem({ label: e.name, description: own ? firstComment(path.join(folder, e.name)) : "" }, e.isDirectory() ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File);
        item.insertText = e.isDirectory() ? e.name + "/" : e.name;
        item.range = range;
        item.sortText = (own ? "2" : "1") + e.name;
        items.push(item);
      }
    };
    list(path.join(path.dirname(document.uri.fsPath), sub), false);
    if (include && sub === "" && ownIncludeFolder()) list(ownIncludeFolder(), true);
    return items;
  }

  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
    const include = this.includeFiles(document, position);
    if (include) return include;
    const where = completionContext(document.lineAt(position.line).text.slice(0, position.character));
    if (!where) return [];
    // Not while indenting.
    if (where.kind !== "operand" && context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) return [];
    const range = new vscode.Range(position.line, where.start, position.line, position.character);
    const lower = where.prefix !== "" && where.prefix === where.prefix.toLowerCase() && where.prefix !== where.prefix.toUpperCase();
    const cased = (s: string): string => lower ? s.toLowerCase() : s;
    const items: vscode.CompletionItem[] = [];
    const add = (label: string, kind: vscode.CompletionItemKind, sort: string, detail: string, documentation?: vscode.MarkdownString): void => {
      // The description is on every row of the list, not only the one selected.
      const item = new vscode.CompletionItem({ label, description: detail }, kind);
      item.range = range;
      item.filterText = label;
      item.sortText = sort + label;
      item.documentation = documentation;
      items.push(item);
    };
    const directive = (name: string): void => {
      const d = DIRECTIVE_INFO[name];
      add(cased(name), vscode.CompletionItemKind.Keyword, "2", L(d.ja, d.en), directiveMarkdown(name));
    };
    if (where.kind === "equ") { directive("EQU"); return items; }
    if (where.kind === "op") {
      for (const [name, i] of Object.entries(INSTRUCTIONS)) add(cased(name), vscode.CompletionItemKind.Function, "1", L(i.ja, i.en), instructionMarkdown(name));
      // EQU goes after a name, not in the place of an instruction.
      for (const name of Object.keys(DIRECTIVE_INFO)) if (name !== "EQU") directive(name);
      return items;
    }
    const branch = BRANCHES.test(where.op ?? "");
    // "MV IL,": the numbers of IOCS, those of the device set before first.
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const calls = new Map<string, Command>();
    if (wantsCommand(before)) {
      const lines = Array.from({ length: document.lineCount }, (_, n) => document.lineAt(n).text);
      const list = callsFcs(lines, position.line) ? FILE_COMMANDS : commandsOf(deviceBefore(lines, position.line));
      for (const c of list) {
        calls.set(c.constant, c);
        add(c.constant, vscode.CompletionItemKind.EnumMember, c.device < 0 ? "0b" : "0a", `${hexByte(c.number)} ${L(c.ja, c.en)}`, commandMarkdown(c));
      }
    }
    for (const r of where.registers) add(cased(r), vscode.CompletionItemKind.Variable, branch ? "3" : "1", registerText(r));
    const here = document.uri.fsPath;
    for (const places of (await this.names.all(document, token)).values()) {
      const d: Definition = places[0];
      if (calls.has(d.name.toUpperCase())) continue;
      const doc = d.comment ? new vscode.MarkdownString().appendText(d.comment) : undefined;
      const at = d.file.toLowerCase() === path.resolve(here).toLowerCase() ? L(`${d.line + 1} 行`, `line ${d.line + 1}`) : `${path.basename(d.file)}:${d.line + 1}`;
      const constant = d.value !== undefined;
      add(d.name, constant ? vscode.CompletionItemKind.Constant : vscode.CompletionItemKind.Reference, (branch ? constant : !constant) ? "2b" : "2a", constant ? `= ${d.value}` : L(`ラベル（${at}）`, `Label (${at})`), doc);
    }
    return items;
  }
}

/** What an include file says it is, on its first line. */
function firstComment(file: string): string {
  try { return fs.readFileSync(file, "utf8").split(/\r?\n/, 1)[0].replace(/^;\s*[\w.]+:\s*/, ""); } catch { return ""; }
}

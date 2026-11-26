// The completion list and the hover of BASIC programs.
import * as vscode from "vscode";
import { L } from "../l10n";
import { basicContext, basicNames, basicWordAt, isTargetPlace, keywordsFor } from "./completion";
import { BASIC_HELP, forms, keywordOf, notes } from "./help";

/** A keyword's forms and explanation. */
export function keywordMarkdown(keyword: string): vscode.MarkdownString {
  const help = BASIC_HELP[keyword];
  const doc = new vscode.MarkdownString();
  doc.appendCodeblock(forms(help).join("\n"), "pc-e500-basic");
  doc.appendMarkdown("\n\n" + notes(help).replace(/\*/g, "\\*"));
  return doc;
}

const plain = (s: string): string => s.replace(/`/g, "");

export class BasicCompletionProvider implements vscode.CompletionItemProvider {
  /** Typing one of these opens the list: labels, and the number of a line to go to. */
  static readonly triggers = ["*", " "];

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.CompletionItem[] {
    const where = basicContext(document.lineAt(position.line).text.slice(0, position.character));
    if (!where) return [];
    if (where.kind !== "target" && context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) return [];
    const names = basicNames(document.getText());
    const range = new vscode.Range(position.line, where.start, position.line, position.character);
    const lower = where.prefix !== "" && where.prefix === where.prefix.toLowerCase() && where.prefix !== where.prefix.toUpperCase();
    const items: vscode.CompletionItem[] = [];
    const add = (label: string, description: string, kind: vscode.CompletionItemKind, sort: string, documentation?: vscode.MarkdownString): void => {
      const item = new vscode.CompletionItem({ label, description }, kind);
      item.range = range;
      item.filterText = label;
      item.sortText = sort + label;
      item.documentation = documentation;
      items.push(item);
    };
    if (where.kind === "target") {
      for (const [name, line] of names.labels) add("*" + name, L(`${line + 1} 行目`, `row ${line + 1}`), vscode.CompletionItemKind.Reference, "1");
      for (const [number, text] of names.lines) add(String(number), text, vscode.CompletionItemKind.Value, "2" + String(number).padStart(5, "0"));
      // THEN and ELSE take statements too.
      if (where.prefix !== "" || !/(?:THEN|ELSE)\s*$/i.test(document.lineAt(position.line).text.slice(0, where.start))) return items;
    }
    const kinds = where.kind === "value" ? (["value"] as const) : (["statement"] as const);
    for (const kind of kinds) {
      for (const k of keywordsFor(kind)) {
        const help = BASIC_HELP[k];
        add(lower ? k.toLowerCase() : k, plain(L(help.ja, help.en)), kind === "statement" || !help.kinds.includes("function") ? vscode.CompletionItemKind.Keyword : vscode.CompletionItemKind.Function, kind === "statement" ? "3" : "4", keywordMarkdown(k));
      }
    }
    for (const v of names.variables) {
      // Not the word being typed.
      if (v.replace(/\($/, "") === where.prefix.toUpperCase()) continue;
      add(v.replace(/\($/, ""), v.endsWith("(") ? L("配列", "Array") : v.includes("$") ? L("文字列の変数", "String variable") : L("変数", "Variable"), vscode.CompletionItemKind.Variable, where.kind === "value" ? "3" : "4");
    }
    return items;
  }
}

export class BasicHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const at = basicWordAt(document.lineAt(position.line).text, position.character);
    if (!at) return undefined;
    const range = new vscode.Range(position.line, at.start, position.line, at.end);
    const keyword = keywordOf(at.word);
    if (keyword) return new vscode.Hover(keywordMarkdown(keyword), range);
    // Where a GOTO goes.
    if (!isTargetPlace(at.ahead)) return undefined;
    const names = basicNames(document.getText());
    let text: string | undefined;
    if (/^\d+$/.test(at.word)) {
      const line = names.lines.get(Number(at.word));
      text = line === undefined ? undefined : `${Number(at.word)} ${line}`;
    } else if (at.word.startsWith("*")) {
      const line = names.labels.get(at.word.slice(1).toUpperCase());
      text = line === undefined ? undefined : document.lineAt(line).text;
    }
    return text === undefined ? undefined : new vscode.Hover(new vscode.MarkdownString().appendCodeblock(text, "pc-e500-basic"), range);
  }
}

// Go to Definition (Ctrl+click, F12) in assembly sources, and the names a source can use.
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmHost, AsmOptions } from "./asm/assembler";
import { Definition, definitionAt, definitions } from "./asm/definition";

const SOURCES = "**/*.{asm,inc,e500asm}";
/** How long the names of the sources that include a file are kept, in ms. */
const KEEP = 5000;

const same = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** The names defined in a source, its INCLUDEs, and the workspace's sources that include it. */
export class AsmNames {
  private readonly kept = new Map<string, { at: number; names: Promise<Map<string, Definition[]>> }>();

  constructor(private readonly fileHost: AsmHost, private readonly settings: (resource: vscode.Uri) => Pick<AsmOptions, "includeDirectories">) {}

  /** Files as the editors have them, saved or not. */
  options(document: vscode.TextDocument, resource: vscode.Uri = document.uri): AsmOptions {
    return {
      host: {
        readText: file => vscode.workspace.textDocuments.find(d => (d === document || d.uri.scheme === "file") && same(file, d.uri.fsPath))?.getText() ?? this.fileHost.readText(file),
        readBinary: file => this.fileHost.readBinary(file)
      },
      ...this.settings(resource)
    };
  }

  /** What the sources that include this one define: an included file uses names of theirs. */
  includers(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<Map<string, Definition[]>> {
    if (document.uri.scheme !== "file") return Promise.resolve(new Map());
    const key = document.uri.toString();
    const kept = this.kept.get(key);
    if (kept && Date.now() - kept.at < KEEP) return kept.names;
    const names = this.search(document, token);
    this.kept.set(key, { at: Date.now(), names });
    return names;
  }

  private async search(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<Map<string, Definition[]>> {
    const file = path.resolve(document.uri.fsPath).toLowerCase();
    const all = new Map<string, Definition[]>();
    for (const uri of await vscode.workspace.findFiles(SOURCES, "**/node_modules/**", 500)) {
      if (token.isCancellationRequested) { this.kept.delete(document.uri.toString()); break; }
      if (same(uri.fsPath, file)) continue;
      const seen = new Set<string>();
      const names = definitions(uri.fsPath, this.options(document, uri), new Map(), seen);
      if (!seen.has(file)) continue;
      for (const [name, places] of names) {
        const list = all.get(name) ?? [];
        for (const p of places) if (!list.some(l => l.line === p.line && same(l.file, p.file))) list.push(p);
        all.set(name, list);
      }
    }
    return all;
  }

  /** Every name the source can use, upper-cased → where it is defined. */
  async all(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<Map<string, Definition[]>> {
    return new Map([...await this.includers(document, token), ...definitions(document.uri.fsPath, this.options(document))]);
  }
}

export class AsmDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly names: AsmNames) {}

  async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.LocationLink[]> {
    const file = document.uri.fsPath;
    const found = definitionAt(file, position.line, position.character, this.names.options(document));
    if (!found) return [];
    let targets: Definition[] = found.targets;
    if (targets.length === 0 && found.name) targets = (await this.names.includers(document, token)).get(found.name.toUpperCase()) ?? [];
    const origin = new vscode.Range(position.line, found.at.start, position.line, found.at.end);
    return targets.map(t => ({
      originSelectionRange: origin,
      targetUri: same(t.file, file) ? document.uri : vscode.Uri.file(t.file),
      targetRange: new vscode.Range(t.line, t.start, t.line, t.end),
      targetSelectionRange: new vscode.Range(t.line, t.start, t.line, t.end)
    }));
  }
}

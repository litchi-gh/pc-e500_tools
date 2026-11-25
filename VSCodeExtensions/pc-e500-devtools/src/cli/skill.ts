// Puts the skill for AI assistants (skills/pc-e500) into a project: .claude/skills for
// Claude Code, .agents/skills for Codex.
import * as fs from "node:fs";
import * as path from "node:path";
import { L } from "../l10n";

const PLACES = [".claude/skills/pc-e500", ".agents/skills/pc-e500"];

/** Copies the skill; files that are there and differ are kept unless `force`. What was done, a line each. */
export function installSkill(project: string, extension: string, force: boolean): string[] {
  const from = path.join(extension, "skills", "pc-e500"), done: string[] = [];
  const names = fs.readdirSync(from, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.relative(from, path.join(e.parentPath, e.name)));
  for (const place of PLACES) for (const name of names) {
    const to = path.join(project, place, name), text = fs.readFileSync(path.join(from, name), "utf8");
    const old = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : undefined;
    if (old === text) continue;
    if (old !== undefined && !force) { done.push(L(`残しました（--force で上書き）: ${to}`, `Kept (--force replaces): ${to}`)); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text);
    done.push(to);
  }
  return done.length > 0 ? done : [L("既に最新です。", "It is up to date.")];
}

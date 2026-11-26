// Puts the skill for AI assistants (skills/pc-e500) into a project: .claude/skills for
// Claude Code, .agents/skills for Codex.
import * as fs from "node:fs";
import * as path from "node:path";

const PLACES = [".claude/skills/pc-e500", ".agents/skills/pc-e500"];

/** The skill: at the top of the repository, and in the extension as it is installed (npm run copy:skill). */
export function skillFolder(extension: string): string {
  const repository = path.resolve(extension, "..", "..", "skills", "pc-e500");
  return path.basename(path.dirname(extension)) === "VSCodeExtensions" && fs.existsSync(repository) ? repository : path.join(extension, "skills", "pc-e500");
}

/** The skill's front matter (name and description) and its text. */
function split(text: string): { head: string; body: string } {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error("SKILL.md has no front matter");
  return { head: m[0].replace(/\r\n/g, "\n"), body: text.slice(m[0].length).replace(/\r\n/g, "\n") };
}

/** The topics of `e500 guide NAME`: the files of references/. */
export function guideTopics(extension: string): string[] {
  return fs.readdirSync(path.join(skillFolder(extension), "references")).filter(f => f.endsWith(".md")).map(f => f.slice(0, -3)).sort();
}

/**
 * The skill as a command prints it: the text of SKILL.md (no topic) or of a reference, with the
 * links to the references turned into the commands that print them.
 */
export function guideText(extension: string, topic?: string): string | undefined {
  const folder = skillFolder(extension);
  if (topic !== undefined && !guideTopics(extension).includes(topic)) return undefined;
  const file = topic === undefined ? path.join(folder, "SKILL.md") : path.join(folder, "references", `${topic}.md`);
  let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (topic === undefined) text = split(text).body.replace(/^\n+/, "");
  return text.replace(/\[([^\]]*)\]\((?:references\/)?([a-z]+)\.md(#[^)]*)?\)/g, (all, label: string, name: string, at: string | undefined) =>
    guideTopics(extension).includes(name) ? `\`e500 guide ${name}\`${at ? `（${at.slice(1)}）` : ""}${label.includes(".md") ? "" : `（${label}）`}` : all);
}

/** What `e500 setup` puts in a home folder: the skill's name and description, and where its text comes from. */
export const STUB_MARK = "<!-- e500 setup -->";
export function stubText(extension: string): string {
  return split(fs.readFileSync(path.join(skillFolder(extension), "SKILL.md"), "utf8")).head + `
# PC-E500 シリーズのプログラム

${STUB_MARK}
このスキルの本文は、コマンドが出す（いつも最新の版）。**作業を始める前に、次を実行して出力を全部読み、その指示に従う。**

1. \`npx -y pc-e500-tools@latest guide\` を実行する（いつも最新の版が出る）。npx がないか、ネットにつながらずに失敗したときだけ、\`e500 guide\` を実行する。
2. 本文の \`e500 guide 名前\`（basic、assembly、game など）は、その作業になったときに実行して読む。
3. 本文の \`e500 …\` は、\`e500\` があればそれで、なければ \`npx -y pc-e500-tools@latest …\` で実行する。

このファイルは \`e500 setup\` が置いた入口で、書き換えない。
`;
}

const HOME_PLACES = [".claude/skills/pc-e500", ".agents/skills/pc-e500"];

/**
 * Puts the entry of the skill into a home folder (Claude Code: ~/.claude/skills, Codex: ~/.agents/skills).
 * A SKILL.md that is not one of these entries is kept unless `force`.
 */
export function installStub(home: string, extension: string, force: boolean): { written: string[]; kept: string[] } {
  const text = stubText(extension), written: string[] = [], kept: string[] = [];
  for (const place of HOME_PLACES) {
    const to = path.join(home, place, "SKILL.md");
    const old = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : undefined;
    if (old === text) continue;
    if (old !== undefined && !old.includes(STUB_MARK) && !force) { kept.push(to); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    // A whole copy that was there: its references would be old.
    if (force) fs.rmSync(path.join(home, place, "references"), { recursive: true, force: true });
    fs.writeFileSync(to, text);
    written.push(to);
  }
  return { written, kept };
}

/** Copies the skill; files that are there and differ are kept unless `force`. */
export function installSkill(project: string, extension: string, force: boolean): { written: string[]; kept: string[] } {
  const from = skillFolder(extension), written: string[] = [], kept: string[] = [];
  const names = fs.readdirSync(from, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.relative(from, path.join(e.parentPath, e.name)));
  for (const place of PLACES) for (const name of names) {
    const to = path.join(project, place, name), text = fs.readFileSync(path.join(from, name), "utf8");
    const old = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : undefined;
    if (old === text) continue;
    if (old !== undefined && !force) { kept.push(to); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text);
    written.push(to);
  }
  return { written, kept };
}

// Makes the npm package pc-e500-tools: the command e500 with its skill, INCLUDE files and the
// emulator server, from what npm run compile, build:server and copy:skill made.
//
//   node scripts/npm-package.js [FOLDER]   → FOLDER/pc-e500-tools-VERSION.tgz (default: npm-dist)
//
// Publishing is a separate step: npm publish FOLDER/pc-e500-tools-VERSION.tgz
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "npm-dist"));
const stage = path.join(out, "package");
const extension = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

for (const need of ["out/cli/main.js", "out/server", "skills/pc-e500/SKILL.md", "inc"])
  if (!fs.existsSync(path.join(root, need))) { console.error(`${need} is missing: run npm run compile, npm run build:server and npm run copy:skill first.`); process.exit(2); }

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
const copy = (from, to = from, filter = () => true) => fs.cpSync(path.join(root, from), path.join(stage, to), { recursive: true, filter: f => filter(path.relative(path.join(root, from), f).replace(/\\/g, "/")) });
// The JavaScript, without the tests and maps; the server without its debug files.
copy("out", "out", f => !/^test(\/|$)/.test(f) && !f.endsWith(".map") && !f.endsWith(".pdb"));
for (const f of ["inc", "skills", "schemas", "LICENSE"]) copy(f);

const repository = "https://github.com/litchi-gh/pc-e500_tools";
fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify({
  name: "pc-e500-tools",
  version: extension.version,
  description: "e500: write, check and run programs for the SHARP PC-E500 series (SC62015 assembler, BASIC, emulator tests) and the skill for AI assistants",
  keywords: ["pc-e500", "sc62015", "pocket-computer", "assembler", "basic", "claude-code", "codex", "agent-skills"],
  license: extension.license,
  repository: { type: "git", url: `git+${repository}.git` },
  homepage: repository,
  bin: { e500: "out/cli/main.js" },
  engines: { node: ">=18" }
}, undefined, 2) + "\n");
fs.writeFileSync(path.join(stage, "README.md"), `# pc-e500-tools

SHARP PC-E500 シリーズ（CPU は SC62015）のプログラムを、書く、確かめる、動かすコマンド \`e500\` と、AI（Claude Code、Codex）用のスキルです。

\`\`\`sh
npx -y pc-e500-tools@latest setup
\`\`\`

これで、Claude Code と Codex が、どのフォルダでも PC-E500 のプログラムを作れるようになります。スキルの本文は \`e500 guide\` が出すので、いつも最新の版を使います。

\`\`\`sh
npm install -g pc-e500-tools   # e500 をいつでも使えるようにする（更新も同じ）
e500 --help
\`\`\`

\`e500 run\` と \`e500 test\` には、PC-E500 エミュレータと ROM が要ります。説明は ${repository} にあります。

---

The command \`e500\` (write, check and run programs for the SHARP PC-E500 series) and the skill for Claude Code and Codex. \`npx -y pc-e500-tools@latest setup\` puts the skill's entry into your home folder; its text comes from \`e500 guide\`, so it is always the latest. \`e500 run\` and \`e500 test\` need the PC-E500 emulator and a ROM: see ${repository}.
`);

// npm is a .cmd on Windows: it runs through the shell, with the one argument quoted.
const file = execSync(`npm pack --silent --pack-destination "${out}"`, { cwd: stage, encoding: "utf8" }).trim().split(/\r?\n/).pop();
fs.rmSync(stage, { recursive: true, force: true });
console.log(path.join(out, file));

// How the "e500asm でアセンブル" command starts the assembler.
// A .cmd or .bat file runs through cmd.exe, which treats & | < > ( ) ^ in an unquoted
// argument as command syntax, so a file named a&calc&.asm would run calc. A % is worse: it is
// replaced within the quotes too (%CMDCMDLINE:~-1% is a quote), and nothing can be put before it.
import * as fs from "node:fs";
import * as path from "node:path";
import { L } from "../l10n";

export interface Invocation {
  readonly file: string;
  readonly args: readonly string[];
  /** Pass the arguments unchanged: the cmd.exe command line is already quoted. */
  readonly verbatim: boolean;
}

export function assemblerInvocation(command: string, args: readonly string[], comSpec = process.env.ComSpec): Invocation {
  if (!/\.(?:cmd|bat)$/i.test(command)) return { file: command, args: [...args], verbatim: false };
  // The .cmd of the repository only starts the .exe in its app folder.
  const own = path.join(path.dirname(command), "app", path.basename(command).replace(/\.(?:cmd|bat)$/i, ".exe"));
  if (path.isAbsolute(command) && fs.existsSync(own)) return { file: own, args: [...args], verbatim: false };
  const parts = [command, ...args];
  // A double quote or line break would end the quoting below. Windows file names cannot contain them.
  const unsafe = parts.find(part => /["%\r\n]/.test(part));
  if (unsafe !== undefined) throw new Error(L(`.cmd / .bat 経由では使用できない文字を含む引数があります: ${unsafe}`, `An argument contains a character that cannot go through a .cmd / .bat: ${unsafe}`));
  // /s removes only the outer quotes, so each argument stays quoted inside.
  const commandLine = parts.map(part => `"${part}"`).join(" ");
  return { file: comSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${commandLine}"`], verbatim: true };
}

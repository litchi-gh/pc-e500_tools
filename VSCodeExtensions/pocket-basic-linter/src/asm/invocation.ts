// How the "e500asm でアセンブル" command starts the assembler.
// A .cmd or .bat file runs through cmd.exe, which treats & | < > ( ) ^ in an unquoted
// argument as command syntax, so a file named a&calc&.asm would run calc.

export interface Invocation {
  readonly file: string;
  readonly args: readonly string[];
  /** Pass the arguments unchanged: the cmd.exe command line is already quoted. */
  readonly verbatim: boolean;
}

export function assemblerInvocation(command: string, args: readonly string[], comSpec = process.env.ComSpec): Invocation {
  if (!/\.(?:cmd|bat)$/i.test(command)) return { file: command, args: [...args], verbatim: false };
  const parts = [command, ...args];
  // A double quote or line break would end the quoting below. Windows file names cannot contain them.
  const unsafe = parts.find(part => /["\r\n]/.test(part));
  if (unsafe !== undefined) throw new Error(`.cmd / .bat 経由では使用できない文字を含む引数があります: ${unsafe}`);
  // /s removes only the outer quotes, so each argument stays quoted inside.
  const commandLine = parts.map(part => `"${part}"`).join(" ");
  return { file: comSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${commandLine}"`], verbatim: true };
}

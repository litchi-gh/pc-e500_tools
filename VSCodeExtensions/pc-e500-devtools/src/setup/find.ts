// Where the assembler and the emulator are: folders on PATH, the places they are
// installed in, and folders of the workspace.
import * as fs from "node:fs";
import * as path from "node:path";

/** The environment looked at (a stand-in in the tests). */
export interface Places {
  /** PATH, as it is in the environment. */
  readonly path: string;
  readonly platform: string;
  readonly programFiles?: string;
  readonly localAppData?: string;
  /** The folders open in the workspace. */
  readonly workspace: readonly string[];
}

export function places(workspace: readonly string[], env: NodeJS.ProcessEnv = process.env): Places {
  return { path: env.PATH ?? env.Path ?? "", platform: process.platform, programFiles: env.ProgramFiles, localAppData: process.platform === "win32" ? env.LOCALAPPDATA : env.XDG_DATA_HOME || (env.HOME && path.join(env.HOME, ".local", "share")), workspace };
}

const isFile = (f: string): boolean => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const isFolder = (f: string): boolean => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };

/** The folders of PATH. Relative ones are left out: they would be the workspace's. */
export function pathFolders(where: Places): string[] {
  return where.path.split(where.platform === "win32" ? ";" : ":").map(d => d.trim().replace(/^"(.*)"$/, "$1")).filter(d => path.isAbsolute(d));
}

const assemblerNames = (where: Places): string[] => where.platform === "win32" ? ["e500asm.exe", "e500asm.cmd", "e500asm.bat"] : ["e500asm"];

/** The e500asm that a command line would run. */
export function assemblerOnPath(where: Places): string | undefined {
  for (const folder of pathFolders(where)) for (const name of assemblerNames(where)) if (isFile(path.join(folder, name))) return path.join(folder, name);
  return undefined;
}

/** An e500asm in the workspace, as this repository has it. Only to be suggested, not run as it is. */
export function assemblerInWorkspace(where: Places): string | undefined {
  for (const folder of where.workspace) for (const sub of ["Assembler/app", "pc-e500_tools/Assembler/app", "Assembler", "."]) for (const name of assemblerNames(where)) {
    const f = path.join(folder, sub, name);
    if (isFile(f)) return f;
  }
  return undefined;
}

/** The emulator's core. */
export const coreName = (platform: string): string => platform === "win32" ? "e500core.dll" : platform === "darwin" ? "libe500core.dylib" : "libe500core.so";

/** Whether an e500core.dll has the debugger functions this extension needs. */
export function hasDebugger(core: string): boolean {
  try { return fs.readFileSync(core).includes("e500_debug_run"); } catch { return false; }
}

/** The ROM files in a folder, the PC-E500 Ver.7.2 first. */
function romsIn(folder: string): string[] {
  try {
    const files = fs.readdirSync(folder).filter(f => /\.rom$/i.test(f)).sort();
    const preferred = files.filter(f => /^PC-E500\(7\.2\)/i.test(f));
    return [...preferred, ...files.filter(f => !preferred.includes(f))].map(f => path.join(folder, f));
  } catch {
    return [];
  }
}

export interface EmulatorFolder {
  /** e500core.dll, one with the debugger functions if there is one. */
  readonly core?: string;
  readonly rom?: string;
  /** The folder of the CE-140F's X: drive. */
  readonly disk?: string;
}

/** What an emulator's folder has. An installed copy keeps its ROMs and disks in %LocalAppData%. */
export function inEmulatorFolder(folder: string, where: Pick<Places, "localAppData"> & { readonly platform?: string }): EmulatorFolder {
  const cores = ["bin", ".", "app"].map(d => path.join(folder, d, coreName(where.platform ?? process.platform))).filter(isFile);
  const data = [folder, path.join(folder, "app")];
  // A folder of PATH may be the one with the DLL only.
  if (/^(bin|app)$/i.test(path.basename(folder))) data.push(path.dirname(folder), path.join(path.dirname(folder), "app"));
  if (where.localAppData && isFile(path.join(folder, "PockeComE500.installed"))) data.push(path.join(where.localAppData, "PockeComE500"));
  return {
    core: cores.find(hasDebugger) ?? cores[0],
    rom: data.flatMap(d => romsIn(path.join(d, "rom")))[0],
    disk: data.map(d => path.join(d, "drive-x")).find(isFolder)
  };
}

/** The emulator's folder on PATH. */
export function emulatorOnPath(where: Places): string | undefined {
  return pathFolders(where).find(d => isFile(path.join(d, coreName(where.platform))) || isFile(path.join(d, "PC-E500.exe")));
}

/** The emulator where its installer puts it. */
export function emulatorInstalled(where: Places): string | undefined {
  if (where.platform === "linux") return ["/opt/pc-e500"].find(isFolder);
  return [where.programFiles && path.join(where.programFiles, "PockeComE500"), where.localAppData && path.join(where.localAppData, "Programs", "PockeComE500")]
    .find(d => !!d && isFolder(d)) || undefined;
}

/** An emulator in the workspace, as this repository has it. Only to be suggested, not used as it is. */
export function emulatorInWorkspace(where: Places): string | undefined {
  return where.workspace.flatMap(f => [path.join(f, "Emulator"), f]).find(d => ["bin", ".", "app"].some(s => isFile(path.join(d, s, coreName(where.platform)))));
}

/** The emulator's folder when no setting says it: one on PATH, or installed. */
export function emulatorByItself(where: Places): string | undefined {
  return emulatorOnPath(where) ?? emulatorInstalled(where);
}

/** The .NET runtimes installed, from "dotnet --list-runtimes": whether one can run e500dbg. */
export function hasRuntime(list: string): boolean {
  return /^Microsoft\.NETCore\.App 10\./m.test(list);
}

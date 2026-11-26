// Takes over the settings of the extension's old name (Pocket BASIC / ASM Linter).
import * as vscode from "vscode";

const OLD: Readonly<Record<string, string>> = {
  "pocketBasic.requireLineNumbers": "pcE500.basic.requireLineNumbers",
  "pocketBasic.checkMissingTargets": "pcE500.basic.checkMissingTargets",
  "pocketAsm.includeDirectories": "pcE500.asm.includeDirectories",
  "pocketAsm.defines": "pcE500.asm.defines",
  "pocketAsm.assemblerPath": "pcE500.asm.assemblerPath",
  ...Object.fromEntries(["emulatorPath", "diskFolder", "corePath", "romPath", "ramKB", "speed", "openPanelOnDebug", "serverPath"].map(k => [`pocketE500.${k}`, `pcE500.${k}`]))
};
const DONE = "settingsTakenOver";

/** Copies what the old names have, once for the user and once a workspace, where the new ones have nothing. */
export async function migrateSettings(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const levels = [
    { state: context.globalState, target: vscode.ConfigurationTarget.Global, key: "globalValue" as const, on: true },
    { state: context.workspaceState, target: vscode.ConfigurationTarget.Workspace, // A folder that is not trusted does not show its settings.
      key: "workspaceValue" as const, on: vscode.workspace.workspaceFolders !== undefined && vscode.workspace.isTrusted }
  ];
  for (const { state, target, key, on } of levels) {
    if (!on || state.get<boolean>(DONE)) continue;
    let failed = false;
    for (const [from, to] of Object.entries(OLD)) {
      const value = config.inspect(from)?.[key];
      if (value === undefined || config.inspect(to)?.[key] !== undefined) continue;
      // Settings that cannot be written now are tried the next time.
      try { await config.update(to, value, target); } catch { failed = true; }
    }
    if (!failed) await state.update(DONE, true);
  }
}

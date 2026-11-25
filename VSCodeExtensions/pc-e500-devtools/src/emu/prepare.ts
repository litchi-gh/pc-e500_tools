// Getting a machine ready: start the server, boot to BASIC (or load a saved
// state), make room in the machine-code area and write the program there.
import { ClientOptions, EmulatorClient } from "./client";
import { hex5, Program } from "./program";
import { L } from "../l10n";

export interface MachineConfig extends ClientOptions {
  /** ROM image (256KB or 384KB). */
  readonly rom: string;
  /** Internal RAM in KB (32 for the PC-E500). */
  readonly ram: number;
  /** A state file of the PC-E500 emulator (*.e500state) to start from instead of a cold start. */
  readonly state?: string;
}

/** Starts e500dbg and brings the machine to BASIC's RUN mode prompt. */
export async function startMachine(config: MachineConfig, log: (text: string) => void = () => undefined): Promise<EmulatorClient> {
  const client = new EmulatorClient(config);
  try {
    const info = await client.open(config.rom, config.ram);
    log(L(`ROM Ver.${info.romVersion}（${info.romKB}KB）、内蔵 RAM ${info.internalKB}KB`, `ROM Ver.${info.romVersion} (${info.romKB}KB), internal RAM ${info.internalKB}KB`));
    if (config.state) {
      await client.loadStateFile(config.state);
      log(L(`状態ファイルから開始: ${config.state}`, `Started from the state file: ${config.state}`));
    } else {
      await client.boot();
      log(L("初期化して BASIC の RUN モードにしました。", "Initialized and put BASIC in RUN mode."));
    }
    return client;
  } catch (error) {
    client.dispose();
    throw error;
  }
}

/** Writes the program into RAM, reserving the machine-code area for it first when it needs one. */
export async function loadProgram(client: EmulatorClient, program: Program, log: (text: string) => void = () => undefined): Promise<void> {
  if (program.binary.length === 0) throw new Error(L("プログラムが空です（出力されるバイトがありません）。", "The program is empty (it puts out no bytes)."));
  const size = program.areaSize(client.info?.internalKB ?? 32);
  if (size !== undefined) {
    const area = await client.area();
    if (!area || area.start > program.origin) {
      try {
        const got = await client.reserve(size);
        log(L(`機械語エリアを ${size.toString(16).toUpperCase()}h バイト確保しました（${hex5(got.start)}〜BFBFF）。`, `Reserved ${size.toString(16).toUpperCase()}h bytes for machine code (${hex5(got.start)}-BFBFF).`));
      } catch (error) {
        // Like the emulator's own "load it as it is": it runs, but BASIC may overwrite it.
        const why = error instanceof Error ? error.message : String(error);
        log(L(`機械語エリアを ${size.toString(16).toUpperCase()}h バイト確保できませんでした（${why}）。` +
          "BASIC の空き領域にそのまま書き込みます。BASIC のプログラムや変数で上書きされることがあります。ORG を BFC00h に近づけると確保できます。",
          `Could not reserve ${size.toString(16).toUpperCase()}h bytes for machine code (${why}). ` +
          "Writing it into BASIC's free space as it is, where the BASIC program or variables may overwrite it. An ORG closer to BFC00h can be reserved."));
      }
    }
  }
  try {
    await client.write(program.origin, program.binary);
  } catch (error) {
    throw new Error(L(`${hex5(program.origin)}〜${hex5(program.end - 1)} に書き込めません。RAM の範囲（内蔵 RAM または RAM カード）に ORG してください。`, `Cannot write to ${hex5(program.origin)}-${hex5(program.end - 1)}. ORG the program in RAM (internal RAM or a RAM card).`));
  }
  log(L(`${hex5(program.origin)}〜${hex5(program.end - 1)} に ${program.binary.length} バイト書き込みました。`, `Wrote ${program.binary.length} bytes to ${hex5(program.origin)}-${hex5(program.end - 1)}.`));
}

/** The BASIC line that calls `address` (decimal: every character of it is on the keys). */
export function basicCall(address: number): string {
  return `CALL ${address}`;
}

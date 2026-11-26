// How a RAM slot is laid out, read from the machine, as the emulator's debug window
// shows it (Emulator/src/desktop/MemoryMapView.cs RamLayout, docs/analysis/03_MEMORY.md §3.2-§4):
// the slot header, the chain of named blocks and the free space one of them holds,
// and for the internal RAM the work areas, stacks and machine-code area the pointer
// table at BFCDEh gives, up to the system's own bytes from BFC00h.

import { L } from "../l10n";

export type RegionKind = "header" | "variables" | "program" | "block" | "ramdisk" | "free" | "stack" | "work" | "machinecode" | "system";
export interface Region { readonly start: number; readonly end: number; readonly kind: RegionKind; readonly name: string }

type Read = (address: number, length: number) => Promise<Uint8Array>;
const le3 = (b: Uint8Array, i: number): number => b[i] | b[i + 1] << 8 | b[i + 2] << 16;
const TABLE_AT = 0xbfcde, TABLE_COUNT = 21, SYSTEM_AT = 0xbfc00;

async function chain(read: Read, bottom: number, limit: number, regions: Region[]): Promise<number> {
  regions.push({ start: bottom, end: bottom + 0x18, kind: "header", name: L("スロットの見出し", "Slot header") });
  let at = bottom + 0x18;
  for (let n = 0; n < 64 && at < limit - 0x22; n++) {
    const h = await read(at, 0x1c);
    if (h[0] !== 0xfb) break;
    const size = le3(h, 0x11), used = le3(h, 0x16);
    if (size < used || used < 0x1c || at + size > limit) break;
    const name = String.fromCharCode(...h.subarray(1, 9)).trimEnd();
    const [kind, shown]: [RegionKind, string] = name === "DATA" ? ["variables", L("変数", "Variables")] : name === "TEXT" ? ["program", L("プログラム", "Program")]
      : name === "RAMFILE" ? ["ramdisk", L("RAM ディスク", "RAM disk")] : name === "FUNCKEY" ? ["block", L("PF キー", "PF keys")] : ["block", name];
    regions.push({ start: at, end: at + used, kind, name: shown });
    if (size > used) regions.push({ start: at + used, end: at + size, kind: "free", name: L("空き", "Free") });
    at += size;
  }
  return at;
}

/** The internal RAM (an "unknown" region where it cannot be read). */
export async function internalLayout(read: Read, internalKB: number): Promise<Region[]> {
  const bottom = 0xc0000 - internalKB * 1024;
  const regions: Region[] = [];
  const chainEnd = await chain(read, bottom, SYSTEM_AT, regions);
  const table = await read(TABLE_AT, TABLE_COUNT * 3);
  const p = Array.from({ length: TABLE_COUNT }, (_, i) => le3(table, i * 3));
  const ordered = p[0] >= chainEnd && p[TABLE_COUNT - 1] <= SYSTEM_AT && p.every((v, i) => i === 0 || p[i - 1] <= v);
  if (!ordered) regions.push({ start: chainEnd, end: SYSTEM_AT, kind: "header", name: L("不明", "Unknown") });
  else {
    if (p[0] > chainEnd) regions.push({ start: chainEnd, end: p[0], kind: "header", name: L("ブロックの終わり", "End of blocks") });
    for (let i = 0; i < TABLE_COUNT - 1; i++) {
      if (p[i + 1] <= p[i]) continue;
      const [kind, name]: [RegionKind, string] = i === 0 ? ["stack", L("U スタック", "U stack")] : i === 1 ? ["stack", L("S スタック", "S stack")]
        : i === 16 ? ["work", L("BASIC 作業域", "BASIC work")] : i === 19 ? ["work", L("IOCS 作業域", "IOCS work")] : ["work", L("作業域", "Work area")];
      regions.push({ start: p[i], end: p[i + 1], kind, name });
    }
    regions.push({ start: p[TABLE_COUNT - 1], end: SYSTEM_AT, kind: "machinecode", name: L("機械語エリア", "Machine code") });
  }
  regions.push({ start: SYSTEM_AT, end: 0xc0000, kind: "system", name: L("システム", "System") });
  return regions.filter(r => r.end > r.start);
}

/** The RAM card (one region when it is not set up). */
export async function cardLayout(read: Read, cardKB: number): Promise<Region[]> {
  const bottom = 0x40000, top = bottom + cardKB * 1024;
  const head = await read(bottom, 2);
  if (head[0] !== 0x10 || head[1] !== 0x12) return [{ start: bottom, end: top, kind: "free", name: L("未初期化", "Not set up") }];
  const regions: Region[] = [];
  const end = await chain(read, bottom, top, regions);
  if (end < top) regions.push({ start: end, end: top, kind: "free", name: L("使っていない", "Unused") });
  return regions;
}

/** What the bus has at an address (HexView.MemoryMap.Name). */
export function areaName(a: number, internalKB: number, cardKB: number, e650: boolean): string {
  if (a >= 0xc0000) return L("内蔵ROM (CE2)", "Internal ROM (CE2)");
  if (a >= 0xc0000 - internalKB * 1024) return L(`内蔵RAM ${internalKB}KB`, `Internal RAM ${internalKB}KB`);
  if (a >= 0x80000) return L(`内蔵RAM ${internalKB}KBのミラー`, `Mirror of internal RAM ${internalKB}KB`);
  if (a >= 0x40000) return cardKB > 0 ? L(`RAMカード ${cardKB}KB とそのミラー`, `RAM card ${cardKB}KB and its mirrors`) : L("カードスロット (未装着)", "Card slot (empty)");
  if (a >= 0x20000) return e650 ? L("拡張ROM (CE3)", "Extension ROM (CE3)") : L("CE3 (未使用)", "CE3 (unused)");
  if (a >= 0x10000) return L("CE6 (未使用)", "CE6 (unused)");
  if (a >= 0x2000 && a < 0x4000) return L("LCDコントローラのウィンドウ (表示に影響しない生の値)", "LCD controller window (raw bus, display unaffected)");
  return L("内部エリア", "Internal area");
}

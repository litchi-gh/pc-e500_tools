// @ts-check
// The debug panel's page: what the PC-E500 emulator's debug window shows
// (Emulator/src/desktop/Debugger.cs, MemoryMapView.cs, HexView.cs).
(function () {
  // The page's language is the extension's (<html lang>).
  const EN = document.documentElement.lang === "en";
  const L = (/** @type {string} */ ja, /** @type {string} */ en) => EN ? en : ja;
  // @ts-ignore given by VS Code
  const vscode = acquireVsCodeApi();
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const hex = (/** @type {number} */ n, /** @type {number} */ w) => n.toString(16).toUpperCase().padStart(w, "0");
  const saved = vscode.getState() ?? {};

  /** @type {{internalKB:number, cardKB:number, e650:boolean}} */
  let info = { internalKB: 32, cardKB: 0, e650: false };
  /** @type {any} */
  let registers;
  let attached = false;
  let columns = saved.columns === 8 ? 8 : 16;
  let caret = -1, nibble = 0, pendingHigh = 0;
  /** @type {{address:number, data:Uint8Array}} */
  let memory = { address: 0, data: new Uint8Array(0) };
  /** @type {{internal:any[], card:any[]} | undefined} */
  let layout;

  // ---- The memory: 1MB, a row of 16 (or 8) bytes in groups of eight, each with its checksum ----
  const hexBox = $("hex"), spacer = $("hexSpacer"), rows = $("hexRows");
  const LINE = 18;
  const totalRows = () => 0x100000 / columns;
  const visibleRows = () => Math.max(1, Math.ceil(hexBox.clientHeight / LINE) + 1);
  const topRow = () => Math.min(totalRows() - 1, Math.floor(hexBox.scrollTop / LINE));
  const topAddress = () => topRow() * columns;
  function layoutHex() { spacer.style.height = `${totalRows() * LINE}px`; }
  function kindOf(/** @type {number} */ a) {
    if (a >= 0xc0000) return "rom";
    if (a >= 0x80000) return "ram";
    if (a >= 0x40000) return info.cardKB > 0 ? "ram" : "none";
    if (a >= 0x20000) return info.e650 ? "rom" : "none";
    return "none";
  }
  function areaName(/** @type {number} */ a) {
    if (a >= 0xc0000) return L("内蔵ROM (CE2)", "Internal ROM (CE2)");
    if (a >= 0xc0000 - info.internalKB * 1024) return L(`内蔵RAM ${info.internalKB}KB`, `Internal RAM ${info.internalKB}KB`);
    if (a >= 0x80000) return L(`内蔵RAM ${info.internalKB}KBのミラー`, `Mirror of internal RAM ${info.internalKB}KB`);
    if (a >= 0x40000) return info.cardKB > 0 ? L(`RAMカード ${info.cardKB}KB とそのミラー`, `RAM card ${info.cardKB}KB and its mirrors`) : L("カードスロット (未装着)", "Card slot (empty)");
    if (a >= 0x20000) return info.e650 ? L("拡張ROM (CE3)", "Extension ROM (CE3)") : L("CE3 (未使用)", "CE3 (unused)");
    if (a >= 0x10000) return L("CE6 (未使用)", "CE6 (unused)");
    if (a >= 0x2000 && a < 0x4000) return L("LCDコントローラのウィンドウ (表示に影響しない生の値)", "LCD controller window (raw bus, display unaffected)");
    return L("内部エリア", "Internal area");
  }
  function byteAt(/** @type {number} */ a) {
    const i = a - memory.address;
    return i >= 0 && i < memory.data.length ? memory.data[i] : undefined;
  }
  function renderHex() {
    rows.style.transform = `translateY(${topRow() * LINE}px)`;
    const html = [];
    const first = topAddress();
    for (let r = 0; r < visibleRows(); r++) {
      const row = first + r * columns;
      if (row >= 0x100000) break;
      let line = `<span class="addr">${hex(row, 5)}</span>  `;
      for (let g = 0; g < columns / 8; g++) {
        if (g > 0) line += "  - ";
        let sum = 0, known = true;
        for (let i = 0; i < 8; i++) {
          const a = row + g * 8 + i, b = byteAt(a);
          if (b === undefined) known = false; else sum += b;
          const text = b === undefined ? "··" : a === caret && nibble === 1 ? hex(pendingHigh, 1) + "_" : hex(b, 2);
          line += `<span class="b ${kindOf(a)}${a === caret ? " caret" : ""}" data-a="${a}">${text}</span>${i < 7 ? " " : ""}`;
        }
        line += ` : <span class="sum">${known ? hex(sum & 255, 2) : "··"}</span>`;
      }
      html.push(line);
    }
    rows.innerHTML = html.join("\n");
    const shown = caret >= 0 ? caret : first;
    $("region").textContent = `${hex(first, 5)}-${hex(Math.min(0xfffff, first + visibleRows() * columns - 1), 5)}   ${areaName(first)}` +
      (caret >= 0 ? L(`   カーソル ${hex(caret, 5)} (${areaName(caret)})`, `   Caret ${hex(caret, 5)} (${areaName(caret)})`) : "");
    // Not while it is being typed in.
    if (document.activeElement !== $("address")) /** @type {HTMLInputElement} */ ($("address")).value = hex(shown, 5);
    markMaps();
  }
  function jump(/** @type {number} */ address) {
    address &= 0xfffff;
    caret = address; nibble = 0;
    hexBox.scrollTop = Math.floor(address / columns) * LINE;
    renderHex();
    request(true);
  }
  hexBox.addEventListener("scroll", () => { renderHex(); request(false); });
  rows.addEventListener("mousedown", e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (!t.dataset.a) return;
    caret = Number(t.dataset.a); nibble = 0;
    hexBox.focus(); renderHex();
  });
  hexBox.addEventListener("keydown", e => {
    if (caret < 0) return;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
    if (move !== undefined) {
      e.preventDefault(); caret = Math.max(0, Math.min(0xfffff, caret + move)); nibble = 0;
      const row = Math.floor(caret / columns);
      if (row < topRow()) hexBox.scrollTop = row * LINE;
      else if (row >= topRow() + visibleRows() - 1) hexBox.scrollTop = (row - visibleRows() + 2) * LINE;
      renderHex(); return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9a-fA-F]$/.test(e.key)) return;
    e.preventDefault();
    const digit = parseInt(e.key, 16);
    if (kindOf(caret) !== "ram") { note(L(`${hex(caret, 5)} は RAM ではないため書き換えられません。`, `${hex(caret, 5)} is not RAM and cannot be changed.`)); return; }
    if (nibble === 0) { pendingHigh = digit; nibble = 1; renderHex(); return; }
    const value = pendingHigh << 4 | digit;
    const i = caret - memory.address;
    if (i >= 0 && i < memory.data.length) memory.data[i] = value;
    vscode.postMessage({ type: "write", address: caret, value });
    nibble = 0; caret = Math.min(0xfffff, caret + 1);
    renderHex();
  });

  // ---- The memory map: a bar per RAM slot, widths by size with a floor ----
  const COLORS = {
    light: { program: "#0067c0", variables: "#00998f", block: "#6e6ea0", ramdisk: "#46963c", free: "#e8e8e8", stack: "#8764b8", work: "#a082c8", machinecode: "#e66e0a", system: "#787878", header: "#b4b4b4" },
    dark: { program: "#4ca0ff", variables: "#38c4ba", block: "#9696c8", ramdisk: "#78c86e", free: "#3a3a3a", stack: "#be96f0", work: "#a082d2", machinecode: "#ff963c", system: "#6e6e6e", header: "#5a5a5a" }
  };
  const KIND_NAMES = EN
    ? { header: "Headers", variables: "Variables", program: "Program", block: "PF keys, AER...", ramdisk: "RAM disk", free: "Free", stack: "Stacks", work: "Work areas", machinecode: "Machine code", system: "System" }
    : { header: "見出しなど", variables: "変数", program: "プログラム", block: "PFキー・AER など", ramdisk: "RAM ディスク", free: "空き", stack: "スタック", work: "作業域", machinecode: "機械語エリア", system: "システム" };
  const ORDER = ["header", "variables", "program", "block", "ramdisk", "free", "stack", "work", "machinecode", "system"];
  const dark = () => document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast");
  const size = (/** @type {number} */ n) => n >= 1024 ? (n % 1024 === 0 ? `${n / 1024}KB` : `${(n / 1024).toFixed(1)}KB`) : `${n}B`;
  function widths(/** @type {any[]} */ regions, /** @type {number} */ total) {
    const n = regions.length, min = 6, w = new Array(n).fill(0), small = new Array(n).fill(false);
    for (let pass = 0; pass < 4; pass++) {
      const big = regions.reduce((s, r, i) => small[i] ? s : s + (r.end - r.start), 0);
      const left = total - small.filter(Boolean).length * min;
      let changed = false;
      for (let i = 0; i < n; i++) {
        if (small[i]) { w[i] = min; continue; }
        w[i] = big > 0 ? left * (regions[i].end - regions[i].start) / big : 0;
        if (w[i] < min) { small[i] = true; changed = true; }
      }
      if (!changed) break;
    }
    return w;
  }
  function renderMap(/** @type {HTMLElement} */ box, /** @type {string} */ title, /** @type {any[]} */ regions) {
    if (!regions.length) { box.hidden = true; return; }
    box.hidden = false;
    const palette = dark() ? COLORS.dark : COLORS.light;
    const total = Math.max(100, box.clientWidth - 2);
    const w = widths(regions, total);
    const escaped = (/** @type {string} */ t) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
    const parts = regions.map((r, i) => {
      const label = `${r.name}  ${size(r.end - r.start)}`;
      const text = w[i] > label.length * 6.5 + 8 ? label : w[i] > r.name.length * 7 + 8 ? r.name : "";
      return `<div class="seg ${r.kind}" data-width="${w[i]}" data-color="${/** @type {any} */ (palette)[r.kind]}" data-start="${r.start}" title="${escaped(r.name)}\n${hex(r.start, 5)}〜${hex(r.end - 1, 5)}  (${(r.end - r.start).toString(16).toUpperCase()}h = ${(r.end - r.start).toLocaleString()} ${L("バイト", "bytes")})">${escaped(text)}</div>`;
    }).join("");
    const kinds = ORDER.filter(k => regions.some(r => r.kind === k));
    box.innerHTML = `<div class="maptitle">${title}</div><div class="bar">${parts}</div>` +
      `<div class="ends"><span>${hex(regions[0].start, 5)}</span><span class="marker"></span><span>${hex(regions[regions.length - 1].end - 1, 5)}</span></div>` +
      `<div class="legend">${kinds.map(k => `<span><i data-color="${/** @type {any} */ (palette)[k]}"></i>${/** @type {any} */ (KIND_NAMES)[k]}</span>`).join("")}</div>`;
    // The page's policy lets no style="" through: they are set here.
    for (const e of /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll("[data-color]"))) {
      e.style.backgroundColor = e.dataset.color ?? "";
      if (e.dataset.width) e.style.width = `${e.dataset.width}px`;
    }
    box.dataset.regions = JSON.stringify(regions.map((r, i) => [r.start, r.end, w[i]]));
    for (const seg of box.querySelectorAll(".seg")) seg.addEventListener("click", () => jump(Number(/** @type {HTMLElement} */ (seg).dataset.start)));
  }
  function markMaps() {
    const at = caret >= 0 ? caret : topAddress();
    for (const box of [$("internalMap"), $("cardMap")]) {
      const marker = /** @type {HTMLElement | null} */ (box.querySelector(".marker"));
      if (!marker || !box.dataset.regions) continue;
      let x = 0, found = -1;
      for (const [s, e, w] of JSON.parse(box.dataset.regions)) { if (at >= s && at < e) { found = x + w * (at - s) / Math.max(1, e - s); break; } x += w; }
      marker.style.display = found < 0 ? "none" : "block";
      marker.style.left = `${found}px`;
    }
  }

  // ---- CPU ----
  const PORTS = [["BP", 0xec], ["PX", 0xed], ["PY", 0xee], ["AMC", 0xef], ["KOL", 0xf0], ["KOH", 0xf1], ["KI", 0xf2], ["EOL", 0xf3], ["EOH", 0xf4], ["EIL", 0xf5], ["EIH", 0xf6], ["UCR", 0xf7], ["USR", 0xf8], ["RXD", 0xf9], ["TXD", 0xfa], ["IMR", 0xfb], ["ISR", 0xfc], ["SCR", 0xfd], ["LCC", 0xfe], ["SSR", 0xff]];
  function renderCpu(/** @type {any} */ r, /** @type {Uint8Array} */ imem, /** @type {boolean} */ running) {
    const cells = [["A", hex(r.A, 2)], ["B", hex(r.BA >> 8, 2)], ["BA", hex(r.BA, 4)], ["I", hex(r.I, 4)], ["IL", hex(r.IL, 2)], ["IH", hex(r.I >> 8, 2)], ["F", hex(r.F, 2)], ["PC", hex(r.P, 5)],
      ["X", hex(r.X, 5)], ["Y", hex(r.Y, 5)], ["U", hex(r.U, 5)], ["S", hex(r.S, 5)]];
    stopped = !running;
    if (!editingRegister) {
      const html = cells.map(([n, v]) => `<div class="tile" data-reg="${n}"${stopped ? ` title="${L("ダブルクリックで書き換え", "Double-click to change")}"` : ""}><span>${n}</span><b>${v}</b></div>`).join("");
      if (html !== shownRegisters) { shownRegisters = html; $("registers").innerHTML = html; }
    }
    const [text, cls] = r.fault ? [L("エラー停止", "Fault"), "fault"] : r.off ? [L("電源OFF", "Power OFF"), "off"] : !running ? [L("停止中", "Stopped"), "stopped"] : r.halt ? ["HALT", "halt"] : [L("実行中", "Running"), "run"];
    $("badge").textContent = text; $("badge").className = "badge " + cls;
    $("cycles").textContent = L(`サイクル ${Number(r.cycles).toLocaleString()}`, `Cycles ${Number(r.cycles).toLocaleString()}`);
    $("flagC").classList.toggle("on", (r.F & 1) !== 0);
    $("flagZ").classList.toggle("on", (r.F & 2) !== 0);
    const lines = [];
    for (let p = 0; p < PORTS.length; p += 4) lines.push(PORTS.slice(p, p + 4).map(([n, a]) => `${String(n).padEnd(3)} ${hex(Number(a), 2)}=${hex(imem[Number(a)], 2)}`).join("  "));
    lines.push("");
    for (let row = 0; row < 256; row += 16) {
      lines.push(`${hex(row, 2)}  ${[...imem.subarray(row, row + 16)].map((b, i) => {
        const at = row + i;
        return `<span class="b${at < IMEM_EDIT_END ? "" : " none"}${at === imemCaret ? " caret" : ""}" data-i="${at}">${at === imemCaret && imemNibble ? hex(imemHigh, 1) + "_" : hex(b, 2)}</span>`;
      }).join(" ")}`);
    }
    const html = lines.join("\n");
    if (html !== shownImem) { shownImem = html; $("imem").innerHTML = html; }
    lastImem = imem;
  }

  // ---- Changing registers (double-click) and internal RAM (click a byte and type), while stopped ----
  // EFh is the AMC and F0h on the I/O, which act when written.
  const IMEM_EDIT_END = 0xef;
  let stopped = false, editingRegister = false, shownRegisters = "", shownImem = "";
  let imemCaret = -1, imemNibble = 0, imemHigh = 0;
  /** @type {Uint8Array} */
  let lastImem = new Uint8Array(256);
  const whileStopped = () => note(L("レジスタと内部 RAM は、止めているときに書き換えられます。", "Registers and internal RAM can be changed while stopped."));
  $("registers").addEventListener("dblclick", e => {
    const tile = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(".tile"));
    if (!tile || editingRegister) return;
    if (!stopped) { whileStopped(); return; }
    const cell = /** @type {HTMLElement} */ (tile.querySelector("b"));
    const before = cell.textContent ?? "";
    editingRegister = true;
    const input = document.createElement("input");
    input.className = "regvalue";
    input.spellcheck = false;
    input.value = before;
    cell.textContent = "";
    cell.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (/** @type {boolean} */ set) => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      editingRegister = false;
      shownRegisters = "";
      cell.textContent = before;
      // The tiles are hexadecimal, so what is typed into them is too.
      if (set && text && text !== before) vscode.postMessage({ type: "register", name: tile.dataset.reg, text: /^[0-9A-Fa-f]+$/.test(text) ? "$" + text : text });
    };
    input.addEventListener("keydown", k => {
      if (k.isComposing) return;
      if (k.key === "Enter") { k.preventDefault(); finish(true); }
      else if (k.key === "Escape") { k.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
  });
  for (const [id, name] of [["flagC", "C"], ["flagZ", "Z"]]) {
    $(id).addEventListener("dblclick", () => {
      if (!stopped) { whileStopped(); return; }
      vscode.postMessage({ type: "register", name, text: $(id).classList.contains("on") ? "0" : "1" });
    });
  }
  function drawImem() { if (registers) renderCpu(registers, lastImem, !stopped); }
  $("imem").addEventListener("mousedown", e => {
    const i = /** @type {HTMLElement} */ (e.target).dataset.i;
    if (i === undefined) return;
    e.preventDefault();
    imemCaret = Number(i); imemNibble = 0;
    $("imem").focus();
    drawImem();
  });
  $("imem").addEventListener("blur", () => { imemCaret = -1; imemNibble = 0; drawImem(); });
  $("imem").addEventListener("keydown", e => {
    if (imemCaret < 0) return;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[e.key];
    if (move !== undefined) { e.preventDefault(); imemCaret = Math.max(0, Math.min(255, imemCaret + move)); imemNibble = 0; drawImem(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9a-fA-F]$/.test(e.key)) return;
    e.preventDefault();
    if (!stopped) { whileStopped(); return; }
    if (imemCaret >= IMEM_EDIT_END) { note(L("内部 RAM は 00h〜EEh だけ書き換えられます（EFh の AMC と F0h からの I/O は書くと動作が変わるため）。", "Only internal RAM 00h-EEh can be changed (the AMC at EFh and the I/O from F0h act when written).")); return; }
    const digit = parseInt(e.key, 16);
    if (imemNibble === 0) { imemHigh = digit; imemNibble = 1; drawImem(); return; }
    vscode.postMessage({ type: "imem", address: imemCaret, value: imemHigh << 4 | digit });
    imemNibble = 0;
    imemCaret = Math.min(255, imemCaret + 1);
    drawImem();
  });

  // ---- Talking to the extension ----
  let ticks = 0, opened = false;
  function request(/** @type {boolean} */ withLayout) {
    if (!attached) return;
    vscode.postMessage({ type: "refresh", address: topAddress(), length: Math.min(0x100000 - topAddress(), visibleRows() * columns), layout: withLayout });
  }
  function note(/** @type {string} */ text) { $("note").textContent = text; }
  const internalTitle = () => L(`内蔵 RAM ${info.internalKB}KB`, `Internal RAM ${info.internalKB}KB`);
  const cardTitle = () => L(`RAM カード ${info.cardKB}KB`, `RAM card ${info.cardKB}KB`);
  window.addEventListener("message", event => {
    const m = event.data;
    if (m.type === "machine") {
      attached = m.attached;
      if (!attached) { $("badge").textContent = L("マシンなし", "No machine"); $("badge").className = "badge off"; note(L("エミュレータのパネルかデバッグでマシンを動かすと、ここに表示します。", "Start a machine in the emulator panel or by debugging, and it shows here.")); }
      else request(true);
    } else if (m.type === "snapshot") {
      info = m.info; registers = m.registers;
      memory = { address: m.memory.address, data: Uint8Array.from(atob(m.memory.data), c => c.charCodeAt(0)) };
      renderCpu(m.registers, Uint8Array.from(atob(m.imem), c => c.charCodeAt(0)), m.running);
      if (m.layout) {
        layout = m.layout;
        renderMap($("internalMap"), internalTitle(), layout?.internal ?? []);
        renderMap($("cardMap"), cardTitle(), layout?.card ?? []);
      }
      // Opened on the machine's own RAM, not on its mirror below it (as the emulator does).
      if (!opened) { opened = true; jump(0xc0000 - info.internalKB * 1024); return; }
      renderHex();
    } else if (m.type === "changed") request(false);
    else if (m.type === "note") note(m.text);
    else if (m.type === "jump") jump(m.address);
  });

  // ---- Bar ----
  for (const b of document.querySelectorAll("[data-jump]")) {
    b.addEventListener("click", () => {
      const j = /** @type {HTMLElement} */ (b).dataset.jump;
      if (j === "internal") jump(0xc0000 - info.internalKB * 1024);
      else if (j === "card") jump(0x40000);
      else if (j === "rom") jump(0xc0000);
      else if (registers) jump(registers[/** @type {string} */ (j)]);
    });
  }
  const address = /** @type {HTMLInputElement} */ ($("address"));
  address.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const v = parseInt(address.value.trim().replace(/^(&H|0x|\$|&)/i, ""), 16);
    if (!Number.isNaN(v)) jump(v);
  });
  $("refresh").addEventListener("click", () => request(true));
  $("load").addEventListener("click", () => vscode.postMessage({ type: "bin", save: false, address: caret >= 0 ? caret : topAddress() }));
  $("save").addEventListener("click", () => vscode.postMessage({ type: "bin", save: true, address: caret >= 0 ? caret : topAddress() }));
  const columnBox = /** @type {HTMLSelectElement} */ ($("columns"));
  columnBox.value = String(columns);
  columnBox.addEventListener("change", () => {
    const keep = caret >= 0 ? caret : topAddress();
    columns = Number(columnBox.value) === 8 ? 8 : 16; saved.columns = columns; vscode.setState(saved);
    layoutHex(); jump(keep);
  });
  const live = /** @type {HTMLInputElement} */ ($("live"));
  setInterval(() => { if (live.checked && attached) request(++ticks % 4 === 0); }, 250);
  window.addEventListener("resize", () => { renderHex(); if (layout) { renderMap($("internalMap"), internalTitle(), layout.internal); renderMap($("cardMap"), cardTitle(), layout.card); } });

  layoutHex();
  renderHex();
  vscode.postMessage({ type: "ready" });
})();

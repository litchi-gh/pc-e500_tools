// @ts-check
// The emulator panel's page. The case, the glass, the legends and the keys are drawn
// the way the PC-E500 emulator draws them (Emulator/src/desktop/PocketSurface.cs): the
// same measured positions, sizes and colours, in its virtual units (744 x 400 for the
// PC-E500, 860 x 400 for the PC-E650/U6000 case).
(function () {
  // The page's language is the extension's (<html lang>). Lettering printed on the case stays as printed.
  const EN = document.documentElement.lang === "en";
  const L = (/** @type {string} */ ja, /** @type {string} */ en) => EN ? en : ja;
  // @ts-ignore acquireVsCodeApi is given by VS Code
  const vscode = acquireVsCodeApi();
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const saved = vscode.getState() ?? {};

  /** @typedef {{ id: string, label: string, x: number, y: number, w: number, h: number, shift: string, extra: string, style: number, lower: string, minor: string }} Key */

  // ---- Keys (PocketSurface.BuildKeys / BuildWideKeys) ----
  const MARKS = { "(": ["「", ""], ")": ["」", ""], ",": ["、", ""], ".": ["。", ""], "+": ["・", ""], "/": ["", "/"], "*": ["", "*"] };
  /** @returns {Key[]} */
  function buildKeys(/** @type {boolean} */ wide) {
    /** @type {Key[]} */
    const keys = [];
    const add = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ x, /** @type {number} */ y, w = 27, h = 18, shift = "", extra = "", style = 0) => {
      const [lower, minor] = /** @type {Record<string, string[]>} */ (MARKS)[id] ?? ["", ""];
      keys.push({ id, label, x, y, w, h, shift, extra, style, lower, minor });
    };
    const fn = ["BASIC", "電卓", "行列", "統計", "エンジニアソフトウェア"];
    const shifts = ["!", "\"", "#", "$", "%", "&", "'", "<", ">", "@"];
    const asdf = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
    const ashift = ["[", "]", "{", "}", "¥", "¦", "~", "_", "^"];
    const zrow = ["Z", "X", "C", "V", "B", "N", "M", ",", ";"];
    const scientific = [["HYP", "SIN", "COS", "TAN", "FSE", "C-CE"], ["HEX", "DEG", "LN", "LOG", "1/x", "STAT"], ["EXP", "^", "SQRT", "x²", "(", ")"]];
    const labels = [["hyp", "sin", "cos", "tan", "FSE", "C-CE"], ["→HEX", "→DEG", "ln", "log", "1/x", "↕"], ["EXP", "yˣ", "√", "x²", "(", ")"]];
    const legends = [["archyp", "sin⁻¹", "cos⁻¹", "tan⁻¹", "TAB", "CA"], ["→DEC", "→D.MS", "eˣ", "10ˣ", "→rθ", "TITLE"], ["π", "x√y", "³√", "%", "→xy", "n!"]];
    const numeric = [["7", "8", "9", "/", "DEL"], ["4", "5", "6", "*", "BS"], ["1", "2", "3", "-", "INS"], ["0", "+/-", ".", "+", "="]];
    const nlabels = [["7", "8", "9", "÷", "DEL"], ["4", "5", "6", "×", "BS"], ["1", "2", "3", "−", "INS"], ["0", "+/−", ".", "+", "="]];
    const memory = ["x↔M", "RM", "M+", ""];
    if (!wide) {
      add("TEXT", "↕", 32, 207, 25, 16);
      for (let i = 0; i < 5; i++) add("F" + (i + 1), "PF" + (i + 1), 78 + i * 73, 207, 61, 16, "", fn[i], 1);
      add("2ndF", "2ndF", 444, 207, 24, 17, "", "", 2);
      add("MENU", "MENU", 31, 239, 27, 18, "CAL", "", 3);
      add("BASIC", "BASIC", 31, 273, 27, 18, "AER", "", 3);
      add("RESET", "", 67, 273, 13, 18, "", "", 7);
      add("OFF", "OFF", 31, 306, 27, 18);
      add("ON/BRK", "ON", 67, 306, 29, 18, "BREAK");
      add("SHIFT", "SHIFT", 30, 341, 37, 19, "", "", 2);
      for (let i = 0; i < 10; i++) add("QWERTYUIOP"[i], "QWERTYUIOP"[i], 78 + i * 36.5, 240, 26, 18, shifts[i]);
      for (let i = 0; i < 9; i++) add(asdf[i], asdf[i], 87 + i * 36.5, 273, 26, 18, ashift[i]);
      for (let i = 0; i < 9; i++) add(zrow[i], zrow[i], 103.5 + i * 36.5, 306, 27, 19, i === 7 ? "?" : i === 8 ? ":" : "");
      add("STO", "STO", 444, 240, 25, 18); add("RCL", "RCL", 444, 273, 25, 18, "ANS");
      add("ENTER", "↵", 437, 308, 31, 50, "P↔NP", "", 4);
      add("CTRL", "CTRL", 94, 342, 36, 18); add("CAPS", "CAPS", 139, 342, 29, 18, "小文字");
      add("KANA", "カナ", 176, 342, 29, 18, "ー"); add("SPACE", "SPACE", 214, 340, 63, 21);
      add("DOWN", "↓", 288, 340, 27, 21); add("UP", "↑", 325, 340, 27, 21);
      add("LEFT", "◀", 362, 340, 27, 21); add("RIGHT", "▶", 399, 340, 27, 21);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) add(scientific[r][c], labels[r][c], 493 + c * 39.2, 99 + r * 33, 28, 19, "", legends[r][c], r === 0 && c === 5 ? 5 : 0);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) add(numeric[r][c], nlabels[r][c], 492 + c * 48.5, 214 + r * 40, 35, 25, r === 3 && c === 2 ? "DRG" : "", c === 4 ? memory[r] : "", 6);
    } else {
      add("TEXT", "↕", 20, 211, 33, 18);
      for (let i = 0; i < 5; i++) add("F" + (i + 1), "PF" + (i + 1), 75 + i * 88.5, 211, 75, 18, "", fn[i], 1);
      add("2ndF", "2ndF", 519, 211, 30, 19, "", "", 2);
      add("MENU", "MENU", 20, 247, 34, 20, "CAL", "", 3);
      add("BASIC", "BASIC", 20, 284, 34, 20, "AER", "", 3);
      add("RESET", "", 65, 284, 15, 20, "", "", 7);
      add("OFF", "OFF", 19, 321, 35, 20); add("ON/BRK", "ON", 63, 321, 36, 20, "BREAK");
      add("SHIFT", "SHIFT", 18, 359, 46, 21, "", "", 2);
      for (let i = 0; i < 10; i++) add("QWERTYUIOP"[i], "QWERTYUIOP"[i], 78 + i * 42, 247, 31, 20, shifts[i]);
      for (let i = 0; i < 9; i++) add(asdf[i], asdf[i], 90 + i * 42, 284, 31, 20, ashift[i]);
      for (let i = 0; i < 9; i++) add(zrow[i], zrow[i], 111 + i * 42, 321, 32, 21, i === 7 ? "?" : i === 8 ? ":" : "");
      add("STO", "STO", 516, 247, 34, 20); add("RCL", "RCL", 516, 284, 34, 20, "ANS");
      add("ENTER", "↵", 514, 320, 38, 58, "P↔NP", "", 4);
      add("CTRL", "CTRL", 97, 359, 42, 21); add("CAPS", "CAPS", 147, 359, 37, 21, "小文字");
      add("KANA", "カナ", 194, 359, 38, 21, "ー"); add("SPACE", "SPACE", 242, 358, 70, 22);
      add("DOWN", "▼", 338, 358, 35, 22); add("UP", "▲", 381, 358, 35, 22);
      add("LEFT", "◀", 424, 358, 35, 22); add("RIGHT", "▶", 467, 358, 35, 22);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) add(scientific[r][c], labels[r][c], 574 + c * 43, 88 + r * 36, 30, 20, "", legends[r][c], r === 0 && c === 5 ? 5 : 0);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) add(numeric[r][c], nlabels[r][c], 580 + c * 52, 214 + r * 44, 38, 28, r === 3 && c === 2 ? "DRG" : "", c === 4 ? memory[r] : "", 6);
    }
    return keys;
  }

  // ---- Drawing helpers (Round, TextAt, Lettering) ----
  const rgb = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => `rgb(${r},${g},${b})`;
  const LATIN = "Arial, Helvetica, sans-serif";
  const KANA = "\"Yu Gothic UI\", \"Yu Gothic\", Meiryo, \"MS Gothic\", sans-serif";
  const familyOf = (/** @type {string} */ text) => /[^\u0000-ÿ]/.test(text) ? KANA : LATIN;
  const WHITE = rgb(245, 245, 245), GOLD = rgb(238, 204, 121), GREEN = rgb(155, 223, 185);

  function round(/** @type {CanvasRenderingContext2D} */ g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {number} */ r) {
    g.beginPath(); g.roundRect(x, y, w, h, r);
  }
  function vertical(/** @type {CanvasRenderingContext2D} */ g, /** @type {number} */ y0, /** @type {number} */ y1, /** @type {string} */ c0, /** @type {string} */ c1) {
    const grad = g.createLinearGradient(0, y0, 0, y1); grad.addColorStop(0, c0); grad.addColorStop(1, c1); return grad;
  }
  function horizontal(/** @type {CanvasRenderingContext2D} */ g, /** @type {number} */ x0, /** @type {number} */ x1, /** @type {string} */ c0, /** @type {string} */ c1) {
    const grad = g.createLinearGradient(x0, 0, x1, 0); grad.addColorStop(0, c0); grad.addColorStop(1, c1); return grad;
  }
  /** Text centred in (x, y, width, size*1.5), shrunk when it does not fit; or from x when width is 0. */
  function textAt(/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ size, /** @type {string} */ color, bold = false, width = 0) {
    const family = familyOf(text);
    g.font = `${bold ? "bold " : ""}${size}px ${family}`;
    let actual = size;
    const measured = g.measureText(text).width;
    if (width > 0 && measured > width - 3) actual = Math.max(4, size * (width - 3) / measured);
    g.font = `${bold ? "bold " : ""}${actual}px ${family}`;
    g.fillStyle = color;
    // As GDI+ places it (the emulator's DrawString): the font's line, ascent plus
    // descent, centred in a box size*1.5 high, or its top at y; the baseline sits
    // the ascent below the line's top. Canvas's "middle" put it higher.
    const m = g.measureText(text);
    const ascent = m.fontBoundingBoxAscent || actual * 0.905, descent = m.fontBoundingBoxDescent || actual * 0.212;
    g.textBaseline = "alphabetic";
    if (width > 0) { g.textAlign = "center"; g.fillText(text, x + width / 2, y + (size * 1.5 - ascent - descent) / 2 + ascent); }
    else { g.textAlign = "left"; g.fillText(text, x, y + ascent); }
  }
  /** @type {Map<string, {left: number, ink: number, cap: number}>} */
  const shapes = new Map();
  /** Text stretched so its ink spans left..right and its capitals top..bottom (as measured on the case). */
  function lettering(/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ text, /** @type {number} */ left, /** @type {number} */ right, /** @type {number} */ top, /** @type {number} */ bottom, /** @type {string} */ color, bold = true) {
    const font = `${bold ? "bold " : ""}100px ${familyOf(text)}`;
    let shape = shapes.get(font + text);
    if (!shape) {
      g.font = font; g.textAlign = "left"; g.textBaseline = "alphabetic";
      const m = g.measureText(text), h = g.measureText("H");
      shape = { left: m.actualBoundingBoxLeft, ink: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, cap: h.actualBoundingBoxAscent };
      shapes.set(font + text, shape);
    }
    if (shape.ink <= 0 || shape.cap <= 0) return;
    g.save();
    g.translate(left, top); g.scale((right - left) / shape.ink, (bottom - top) / shape.cap);
    g.font = font; g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = color;
    g.fillText(text, shape.left, shape.cap);
    g.restore();
  }

  // ---- The case ----
  let model = "PC-E500";
  const isWide = () => model !== "PC-E500";
  const canvasWidth = () => isWide() ? 860 : 744;
  let keys = buildKeys(false);
  /** @type {Set<string>} */
  const pressed = new Set();
  const lcdRegion = () => isWide() ? { x: 70, y: 74, w: 444, h: 106 } : { x: 78, y: 86, w: 360, h: 96 };
  const dotRegion = () => isWide() ? { x: 76, y: 101, w: 432, h: 72 } : { x: 84, y: 113, w: 348, h: 62 };
  const glassPanel = () => isWide()
    ? { x: 70, y: 76, w: 442, h: 104, top: rgb(188, 207, 132), bottom: rgb(151, 178, 111) }
    : { x: 79, y: 89, w: 360, h: 94, top: rgb(191, 212, 126), bottom: rgb(164, 187, 116) };

  function drawE500Body(/** @type {CanvasRenderingContext2D} */ g) {
    round(g, 8, 13, 728, 374, 12); g.fillStyle = vertical(g, 13, 387, rgb(170, 161, 139), rgb(109, 108, 96)); g.fill();
    g.lineWidth = 2; g.strokeStyle = rgb(203, 197, 177); g.stroke();
    round(g, 14, 19, 716, 42, 6); g.fillStyle = vertical(g, 19, 61, rgb(194, 185, 162), rgb(140, 138, 123)); g.fill();
    g.lineWidth = 1; g.strokeStyle = rgb(92, 94, 86);
    g.beginPath(); g.moveTo(14, 64); g.lineTo(730, 64); g.moveTo(14, 74); g.lineTo(730, 74); g.stroke();
    lettering(g, "SHARP", 42, 133, 29.8, 43.2, WHITE);
    lettering(g, "POCKET COMPUTER", 150.6, 243.4, 35.4, 42.1, WHITE, false); lettering(g, "PC-E500", 254.5, 296.7, 35.4, 42.1, WHITE, false);
    lettering(g, "ENGINEER SOFTWARE", 517.1, 695, 27.1, 37.2, GOLD, false); lettering(g, "SCIENTIFIC CONSTANTS AND FORMULAS", 517.6, 697.6, 38.2, 44.4, GOLD, false);
    round(g, 40, 77, 433, 115, 4); g.fillStyle = horizontal(g, 40, 473, rgb(33, 38, 35), rgb(80, 82, 69)); g.fill();
    g.lineWidth = 1.5; g.strokeStyle = rgb(207, 202, 183); g.stroke();
    g.lineWidth = 1; g.strokeStyle = rgb(92, 94, 86); g.beginPath();
    for (let y = 91; y < 189; y += 10) { g.moveTo(43, y); g.lineTo(469, y); }
    g.stroke();
    const p = glassPanel(); round(g, p.x, p.y, p.w, p.h, 4); g.fillStyle = vertical(g, p.y, p.y + p.h, p.top, p.bottom); g.fill();
  }

  function drawWideBody(/** @type {CanvasRenderingContext2D} */ g) {
    round(g, 2, 4, 856, 392, 18); g.fillStyle = vertical(g, 4, 396, rgb(112, 104, 94), rgb(57, 52, 47)); g.fill();
    g.lineWidth = 2; g.strokeStyle = rgb(139, 130, 116); g.stroke();
    round(g, 3, 2, 854, 38, 9); g.fillStyle = vertical(g, 2, 40, rgb(186, 181, 170), rgb(118, 113, 104)); g.fill();
    g.lineWidth = 2; g.strokeStyle = rgb(42, 39, 36); g.beginPath(); g.moveTo(9, 43); g.lineTo(850, 43); g.stroke();
    lettering(g, "SHARP", 73, 174.4, 14.3, 28.2, WHITE);
    lettering(g, "POCKET COMPUTER", 192.8, 294.6, 20.3, 27.6, WHITE, false);
    const ratio = (() => { g.font = "100px " + LATIN; const a = g.measureText(model), b = g.measureText("PC-U6000"); return (a.actualBoundingBoxLeft + a.actualBoundingBoxRight) / (b.actualBoundingBoxLeft + b.actualBoundingBoxRight); })();
    lettering(g, model, 312.4, 312.4 + 49.2 * ratio, 20.3, 27.6, WHITE, false);
    textAt(g, "64KB", 746, 4, 25, WHITE, true, 88);
    round(g, 28, 60, 521, 132, 8); g.fillStyle = horizontal(g, 28, 549, rgb(72, 67, 79), rgb(172, 167, 158)); g.fill();
    g.lineWidth = 2.5; g.strokeStyle = rgb(211, 205, 191); g.stroke();
    round(g, 65, 73, 450, 109, 3); g.fillStyle = rgb(66, 65, 59); g.fill();
    const p = glassPanel(); round(g, p.x, p.y, p.w, p.h, 2); g.fillStyle = vertical(g, p.y, p.y + p.h, p.top, p.bottom); g.fill();
    g.lineWidth = 1; g.strokeStyle = rgb(43, 40, 36); g.beginPath(); g.moveTo(556, 61); g.lineTo(556, 389); g.stroke();
  }

  function drawTransportFrame(/** @type {CanvasRenderingContext2D} */ g) {
    const wide = isWide();
    const x = wide ? 418 : 357, y = wide ? 343 : 325, w = wide ? 90 : 74, h = wide ? 42 : 40;
    const words = wide ? [0.159, 0.455, 0.514, 0.827] : [0.106, 0.437, 0.519, 0.888];
    const top = y + 8, bottom = y + h;
    g.lineWidth = 1.1; g.strokeStyle = rgb(237, 234, 220); g.beginPath();
    g.moveTo(x, top); g.lineTo(x, bottom); g.lineTo(x + w, bottom); g.lineTo(x + w, top);
    g.moveTo(x, top); g.lineTo(x + w * words[0] - 2, top); g.moveTo(x + w * words[3] + 2, top); g.lineTo(x + w, top);
    g.stroke();
    lettering(g, "PLAY", x + w * words[0], x + w * words[1], top - 3.15, top + 3.15, WHITE, false);
    lettering(g, "BACK", x + w * words[2], x + w * words[3], top - 3.15, top + 3.15, WHITE, false);
  }

  function drawKanaMark(/** @type {CanvasRenderingContext2D} */ g, /** @type {string} */ mark, /** @type {Key} */ k) {
    const right = k.x + k.w, bottomEdge = k.y + k.h;
    g.lineWidth = 0.8; g.strokeStyle = WHITE; g.fillStyle = WHITE;
    if (mark === "「" || mark === "」") {
      const left = right + 0.5, r = right + 4, top = bottomEdge - 6.5, bottom = bottomEdge + 1;
      g.beginPath();
      if (mark === "「") { g.moveTo(r, top); g.lineTo(left, top); g.lineTo(left, bottom); }
      else { g.moveTo(r, top); g.lineTo(r, bottom); g.lineTo(left, bottom); }
      g.stroke();
      return;
    }
    const bx = right + 3, by = bottomEdge - 5, bw = 6, bh = 6.5;
    g.strokeRect(bx, by, bw, bh);
    g.beginPath();
    if (mark === "、") { g.moveTo(bx + 1.2, by + bh - 2.6); g.lineTo(bx + 2.4, by + bh - 1.2); g.stroke(); }
    else if (mark === "。") { g.ellipse(bx + 0.9 + 1, by + bh - 2.9 + 1, 1, 1, 0, 0, Math.PI * 2); g.stroke(); }
    else { g.arc(bx + bw / 2, by + bh / 2, 0.9, 0, Math.PI * 2); g.fill(); }
  }

  function drawKey(/** @type {CanvasRenderingContext2D} */ g, /** @type {Key} */ k) {
    const wide = isWide(), down = pressed.has(k.id);
    const x = k.x, w = k.w, h = k.h, y = k.y + (down ? 1.2 : 0);
    if (k.style === 7) {
      textAt(g, "RESET", k.x - 8, k.y - 13, 6.5, WHITE, false, k.w + 16);
      const cx = x + w / 2, cy = y + h / 2;
      g.beginPath(); g.arc(cx, cy, 2.7, 0, Math.PI * 2); g.fillStyle = rgb(24, 27, 24); g.fill();
      g.beginPath(); g.arc(cx, cy, 3.2, 0, Math.PI * 2); g.lineWidth = 1.2; g.strokeStyle = down ? rgb(104, 147, 128) : rgb(193, 187, 164); g.stroke();
      return;
    }
    if (k.shift) textAt(g, k.shift, k.x - 6, k.y - 13, 8, k.id === "ON/BRK" || k.id === "CAPS" ? WHITE : GOLD, false, k.w + 12);
    if (k.extra) textAt(g, k.extra, k.x - 9, k.y - 14, 8, k.style === 6 ? rgb(169, 188, 226) : GREEN, false, k.w + 18);
    round(g, x - 1, y + 1, w + 2, h + 2, 2); g.fillStyle = rgb(57, 60, 51); g.fill();
    /** @type {Record<number, number[][]>} */
    const narrow = { 2: [[247, 220, 144], [214, 180, 102]], 3: [[115, 188, 155], [50, 117, 87]], 5: [[236, 135, 107], [188, 62, 39]], 1: [[126, 129, 115], [91, 96, 83]], 4: [[126, 129, 115], [91, 96, 83]] };
    /** @type {Record<number, number[][]>} */
    const broad = { 2: [[133, 112, 78], [78, 65, 48]], 3: [[73, 137, 96], [34, 87, 57]], 5: [[155, 83, 75], [102, 43, 40]], 1: [[111, 101, 89], [65, 58, 51]], 4: [[111, 101, 89], [65, 58, 51]] };
    let [upper, lower] = (wide ? broad : narrow)[k.style] ?? (wide ? [[91, 80, 68], [43, 37, 32]] : [[78, 80, 67], [24, 30, 25]]);
    if (down) { upper = [104, 147, 128]; lower = [47, 81, 66]; }
    round(g, x, y, w, h, k.style === 6 ? 3 : 2);
    g.fillStyle = vertical(g, y, y + h, rgb(upper[0], upper[1], upper[2]), rgb(lower[0], lower[1], lower[2])); g.fill();
    g.lineWidth = 0.7; g.strokeStyle = wide ? rgb(137, 124, 105) : rgb(175, 172, 150); g.stroke();
    if (k.style === 4) {
      const mx = x + 19, my = y + 8;
      g.lineWidth = 1; g.strokeStyle = rgb(238, 234, 208); g.beginPath();
      g.moveTo(mx, my); g.lineTo(mx, my + 25); g.lineTo(mx - 8, my + 25); g.lineTo(mx - 8, my + 20); g.lineTo(mx - 14, my + 28);
      g.lineTo(mx - 8, my + 35); g.lineTo(mx - 8, my + 30); g.lineTo(mx + 5, my + 30); g.lineTo(mx + 5, my);
      g.stroke();
      return;
    }
    const size = k.style === 6 ? (k.id === "DEL" || k.id === "BS" || k.id === "INS" ? 12 : 21) : k.style === 1 ? 14 : k.label.length > 3 ? 9 : 12;
    const ink = k.style === 2 && !wide ? rgb(60, 54, 33) : rgb(245, 240, 220);
    if (k.minor) {
      textAt(g, k.label, x + w * 0.08, y + (h - size * 1.5) / 2, size, ink, true, w * 0.6);
      textAt(g, k.minor, x + w * 0.6, y + (h - size * 0.9) / 2 + 2, size * 0.6, ink, true, w * 0.3);
    } else textAt(g, k.label, x, y + (h - size * 1.5) / 2, size, ink, true, w);
    if (k.lower) drawKanaMark(g, k.lower, k);
  }

  // ---- The glass: dots and legends (DrawLcd, DrawRealLcd, DrawSymbols) ----
  // The legends: lit darker than the dots so they stand out, off ones faint against the glass.
  const INK = [53, 75, 48], GHOST = rgb(166, 189, 117), GLASS = rgb(181, 202, 125), LEGEND = rgb(22, 32, 20);
  const DOT_FILL_X = 0.82, DOT_FILL_Y = 0.86;
  let real = !!saved.real;
  let pixels = new Uint8Array(960);
  let symbols = [0, 0, 0, 0];
  const lcd = document.createElement("canvas"); lcd.width = 240; lcd.height = 32;
  const lcdG = /** @type {CanvasRenderingContext2D} */ (lcd.getContext("2d"));
  const lcdImage = lcdG.createImageData(240, 32);

  function drawLcd(/** @type {CanvasRenderingContext2D} */ g) {
    const d = dotRegion();
    if (!real) {
      // Packed: one dot one cell, edge to edge; off dots are the glass.
      const data = lcdImage.data;
      for (let i = 0; i < 240 * 32; i++) {
        const on = (pixels[i >> 3] >> (7 - (i & 7))) & 1;
        data[i * 4] = INK[0]; data[i * 4 + 1] = INK[1]; data[i * 4 + 2] = INK[2]; data[i * 4 + 3] = on ? 255 : 0;
      }
      lcdG.putImageData(lcdImage, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(lcd, Math.trunc(d.x), Math.trunc(d.y), Math.trunc(d.w), Math.trunc(d.h));
      g.imageSmoothingEnabled = true;
      return;
    }
    // Real: every dot apart from its neighbours, filling 82% of its cell across and
    // 86% down; the dots that are off show faintly (7%), as on the glass.
    const cw = d.w / 240, ch = d.h / 32, dw = cw * DOT_FILL_X, dh = ch * DOT_FILL_Y;
    g.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.07)`;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 240; x++) g.fillRect(d.x + x * cw, d.y + y * ch, dw, dh);
    g.fillStyle = rgb(INK[0], INK[1], INK[2]);
    for (let i = 0; i < 240 * 32; i++) if ((pixels[i >> 3] >> (7 - (i & 7))) & 1) g.fillRect(d.x + (i % 240) * cw, d.y + Math.floor(i / 240) * ch, dw, dh);
  }

  function drawSymbols(/** @type {CanvasRenderingContext2D} */ g) {
    const wide = isWide();
    const pixelX = wide ? 76 : 84, pixelY = wide ? 101 : 113, dotW = wide ? 1.8 : 1.45, dotH = wide ? 2.25 : 1.9375;
    const UPPER = -7.6, LOWER = -3.2, CAP = 2.35;
    const E500_DOT = 1.45, E500_CAP = CAP * 1.9375;
    const [s0, s4, s5, s6] = symbols;
    const lit = LEGEND;
    /** @type {Array<[string, number, number, number, number, number, boolean]>} */
    const list = [
      ["BUSY", 4.2, 17.4, LOWER, s0, 1, false], ["DBL", 24.3, 33.9, LOWER, s0, 8, false],
      ["RUN", 39.3, 49.2, LOWER, s0, 2, false], ["PRO", 54.3, 64.5, LOWER, s0, 4, false],
      ["DE", 114.2, 120.6, UPPER, s5, 16, false], ["G", 121.2, 124.8, UPPER, s5, 8, true], ["RAD", 125.7, 135.3, UPPER, s5, 4, true],
      ["HYP", 140.7, 150.6, UPPER, s4, 4, false], ["2ndF", 119.4, 131.4, LOWER, s4, 16, false], ["CAPS", 136.5, 150.3, LOWER, s4, 8, false],
      ["PRINT", 186, 201.3, UPPER, s5, 1, false],
      ["カナ", 181.2, 188.7, LOWER, s4, 2, false], ["小文字", 192.3, 205.8, LOWER, s4, 1, false], ["E", 208.2, 211.8, LOWER, s5, 2, false]
    ];
    let previousFrom = 0, previousAt = 0;
    for (const [name, from, to, row, value, mask, joined] of list) {
      const at = joined ? previousAt + (from - previousFrom) * E500_DOT : pixelX + from * dotW;
      const middle = pixelY + row * dotH;
      lettering(g, name, at, at + (to - from) * E500_DOT, middle - E500_CAP / 2, middle + E500_CAP / 2, (value & mask) !== 0 ? lit : GHOST);
      previousFrom = from; previousAt = at;
    }
    const battX = pixelX + 219.7 * dotW, battMiddle = pixelY + LOWER * dotH;
    g.fillStyle = (s6 & 1) !== 0 ? lit : GHOST;
    g.fillRect(battX, battMiddle - 3.1, 15.9 * E500_DOT, 6.2);
    g.fillRect(battX - 1.3 * E500_DOT, battMiddle - 1.3, 1.3 * E500_DOT + 0.6, 2.6);
    lettering(g, "BATT", battX + 2.4 * E500_DOT, battX + 14.2 * E500_DOT, battMiddle - E500_CAP / 2, battMiddle + E500_CAP / 2, GLASS);
  }

  // ---- What is shown: the case from the glass's frame down, or the glass alone ----
  // The strip above the glass (the maker's name) is left off: the panel has no room to spare.
  let view = saved.view === "screen" ? "screen" : "body";
  function viewArea() {
    if (view === "screen") return lcdRegion();
    const top = isWide() ? 50 : 68;
    return { x: 0, y: top, w: canvasWidth(), h: 400 - top };
  }
  // Screen only: the glass alone, square and out to the edges (DrawGlass).
  function drawGlass(/** @type {CanvasRenderingContext2D} */ g) {
    const p = glassPanel(), a = lcdRegion();
    g.fillStyle = vertical(g, p.y, p.y + p.h, p.top, p.bottom);
    g.fillRect(a.x, a.y, a.w, a.h);
  }

  // ---- Putting it on the page ----
  const device = /** @type {HTMLCanvasElement} */ ($("device"));
  const g = /** @type {CanvasRenderingContext2D} */ (device.getContext("2d"));
  const chrome = document.createElement("canvas");
  const chromeG = /** @type {CanvasRenderingContext2D} */ (chrome.getContext("2d"));
  let scale = 1;
  let chromeDirty = true;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const area = viewArea();
    device.style.aspectRatio = `${area.w} / ${area.h}`;
    const cssWidth = Math.max(240, device.clientWidth);
    scale = cssWidth * ratio / area.w;
    const w = Math.round(area.w * scale), h = Math.round(area.h * scale);
    if (device.width !== w || device.height !== h) {
      device.width = w; device.height = h; chrome.width = w; chrome.height = h;
    }
    chromeDirty = true;
    paint();
  }

  function paint() {
    if (chromeDirty) {
      chromeG.setTransform(1, 0, 0, 1, 0, 0);
      chromeG.clearRect(0, 0, chrome.width, chrome.height);
      const area = viewArea();
      chromeG.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
      if (view === "screen") drawGlass(chromeG);
      else {
        if (isWide()) drawWideBody(chromeG); else drawE500Body(chromeG);
        drawTransportFrame(chromeG);
        for (const k of keys) drawKey(chromeG, k);
      }
      chromeDirty = false;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, device.width, device.height);
    g.drawImage(chrome, 0, 0);
    const area = viewArea();
    g.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
    drawLcd(g);
    drawSymbols(g);
  }
  let painting = false;
  const schedule = () => { if (painting) return; painting = true; requestAnimationFrame(() => { painting = false; paint(); }); };
  new ResizeObserver(resize).observe(device);

  // ---- Keys: the mouse on the case, and the PC's keyboard ----
  /** @type {Set<string>} */
  const latched = new Set();
  const MODIFIERS = new Set(["SHIFT", "CTRL"]);
  function key(/** @type {string} */ name, /** @type {boolean} */ down) {
    vscode.postMessage({ type: "key", name, down });
    if (down ? !pressed.has(name) : pressed.has(name)) {
      if (down) pressed.add(name); else pressed.delete(name);
      chromeDirty = true; schedule();
    }
  }
  function keyAt(/** @type {PointerEvent} */ e) {
    if (view === "screen") return undefined;
    const r = device.getBoundingClientRect(), area = viewArea();
    const x = area.x + (e.clientX - r.left) * area.w / r.width, y = area.y + (e.clientY - r.top) * area.h / r.height;
    return keys.find(k => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h);
  }
  /** @type {string | undefined} */
  let mouseKey;
  device.addEventListener("pointermove", e => { device.style.cursor = keyAt(e) ? "pointer" : "default"; });
  device.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const k = keyAt(e);
    device.focus();
    if (!k) return;
    e.preventDefault();
    if (k.id === "RESET") { vscode.postMessage({ type: "control", action: "reset" }); return; }
    // Clicked, SHIFT or CTRL stays down for the next key, as in the emulator.
    if (MODIFIERS.has(k.id)) {
      if (latched.has(k.id)) { latched.delete(k.id); key(k.id, false); } else { latched.add(k.id); key(k.id, true); }
      return;
    }
    device.setPointerCapture(e.pointerId);
    mouseKey = k.id;
    key(k.id, true);
  });
  const mouseUp = () => {
    if (!mouseKey) return;
    key(mouseKey, false);
    mouseKey = undefined;
    for (const m of latched) key(m, false);
    latched.clear();
  };
  device.addEventListener("pointerup", mouseUp);
  device.addEventListener("pointercancel", mouseUp);

  /** @type {Record<string, string>} */
  const SPECIAL = {
    Enter: "ENTER", Backspace: "BS", Delete: "DEL", Insert: "INS",
    ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
    Escape: "ON/BRK", F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "MENU", F7: "BASIC", F8: "2ndF", Control: "CTRL"
  };
  /** @type {Set<string>} */
  const pcDown = new Set();
  device.addEventListener("keydown", e => {
    const special = SPECIAL[e.key];
    if (special) {
      e.preventDefault();
      if (!e.repeat && !pcDown.has(special)) { pcDown.add(special); key(special, true); }
      return;
    }
    if (e.key.length === 1 && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (!e.repeat) vscode.postMessage({ type: "type", text: e.key });
    }
  });
  device.addEventListener("keyup", e => {
    const special = SPECIAL[e.key];
    if (special && pcDown.delete(special)) { e.preventDefault(); key(special, false); }
  });
  device.addEventListener("blur", () => { for (const k of pcDown) key(k, false); pcDown.clear(); });

  // ---- Bar ----
  let running = false;
  $("run").addEventListener("click", () => vscode.postMessage({ type: "control", action: running ? "pause" : "continue" }));
  $("reset").addEventListener("click", () => vscode.postMessage({ type: "control", action: "reset" }));
  $("copy").addEventListener("click", () => vscode.postMessage({ type: "control", action: "copy" }));
  $("debugger").addEventListener("click", () => vscode.postMessage({ type: "control", action: "debugger" }));
  $("start").addEventListener("click", () => vscode.postMessage({ type: "control", action: "start" }));
  const speed = /** @type {HTMLSelectElement} */ ($("speed"));
  speed.addEventListener("change", () => vscode.postMessage({ type: "control", action: "speed", value: Number(speed.value) }));
  const viewBox = /** @type {HTMLSelectElement} */ ($("view"));
  viewBox.value = view;
  viewBox.addEventListener("change", () => { view = viewBox.value === "screen" ? "screen" : "body"; saved.view = view; vscode.setState(saved); resize(); });
  const realBox = /** @type {HTMLInputElement} */ ($("real"));
  realBox.checked = real;
  realBox.addEventListener("change", () => { real = realBox.checked; saved.real = real; vscode.setState(saved); schedule(); });
  const text = /** @type {HTMLTextAreaElement} */ ($("text"));
  $("send").addEventListener("click", () => {
    if (!text.value) return;
    vscode.postMessage({ type: "type", text: text.value.endsWith("\n") ? text.value : text.value + "\n" });
    text.value = "";
  });
  text.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("send").click(); } });

  window.addEventListener("message", event => {
    const m = event.data;
    if (m.type === "frame") {
      pixels = Uint8Array.from(atob(m.pixels), c => c.charCodeAt(0));
      symbols = m.symbols ?? symbols;
      schedule();
    } else if (m.type === "state") {
      running = !!m.running;
      if (m.model && m.model !== model) { model = m.model; keys = buildKeys(isWide()); resize(); }
      $("title").textContent = m.title ?? "PC-E500";
      $("status").textContent = m.attached ? (m.pausing ? L("次の行で停止します（もう一度押すとすぐ停止）", "Stopping at the next line (press again to stop at once)") : running ? L("実行中", "Running") : (m.message ?? L("停止中", "Stopped"))) : "";
      $("status").className = "status " + (running ? "running" : "stopped");
      $("run").textContent = running ? L("⏸ 一時停止", "⏸ Pause") : L("▶ 実行", "▶ Run");
      $("empty").hidden = !!m.attached;
      for (const id of ["run", "reset", "copy", "send"]) /** @type {HTMLButtonElement} */ ($(id)).disabled = !m.attached;
      attached = !!m.attached;
    } else if (m.type === "watches") {
      watches = Array.isArray(m.list) ? m.list : [];
      renderWatches([]);
    } else if (m.type === "inspection") {
      waiting = false;
      can = m.can ?? {};
      renderVariables(m.groups ?? []);
      renderWatches(m.watches ?? []);
    } else if (m.type === "edited") {
      showNote(m.error ?? "", !!m.error);
      poll();
    }
  });

  // ---- Variables and watches: read from the machine as it runs ----
  let attached = false, waiting = false;
  /** @type {string[]} */
  let watches = [];
  // Which groups and arrays are open, kept across the refreshes.
  /** @type {Set<string>} */
  const open = new Set(saved.open ?? ["basic"]);
  const escape = (/** @type {string} */ s) => s.replace(/[&<>"]/g, c => /** @type {Record<string,string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
  const showBox = /** @type {HTMLInputElement} */ ($("showInspect"));
  showBox.checked = saved.inspect !== false;
  const applyShow = () => { $("inspect").hidden = !showBox.checked; };
  applyShow();
  showBox.addEventListener("change", () => { saved.inspect = showBox.checked; vscode.setState(saved); applyShow(); });

  function valueHtml(/** @type {string} */ value, /** @type {string | undefined} */ edit, /** @type {string} */ target) {
    if (!edit) return `<span class="value">${escape(value)}</span>`;
    return `<span class="value edit" data-kind="${edit}" data-target="${escape(target)}"${can[edit] ? ` title="${L("ダブルクリックで書き換え", "Double-click to change")}"` : ""}>${escape(value)}</span>`;
  }
  /** @param {any[]} rows @param {string} path */
  function rowsHtml(rows, path) {
    return rows.map(r => {
      if (!r.children) return `<div class="row"><span class="name">${escape(r.name)}</span>${valueHtml(r.value, r.edit, r.target ?? r.name)}</div>`;
      const key = path + "/" + r.name;
      return `<details data-key="${escape(key)}"${open.has(key) ? " open" : ""}><summary><span class="name">${escape(r.name)}</span><span class="value">${escape(r.value)}</span></summary>${rowsHtml(r.children, key)}</details>`;
    }).join("");
  }
  /** @param {any[]} groups */
  function renderVariables(groups) {
    // Not under a value being typed; and not when nothing changed (a double click,
    // or text being selected, is not cut short).
    if (editing) return;
    const box = $("vars");
    const scroll = box.scrollTop;
    const html = groups.map(g => {
      const id = g.id ?? g.title;
      const isOpen = open.has(id) || (!g.closed && !saved.touched?.includes(id));
      return `<details class="group" data-key="${escape(id)}"${isOpen ? " open" : ""}><summary>${escape(g.title)}</summary>${rowsHtml(g.rows, id)}</details>`;
    }).join("");
    if (html === shownVariables) return;
    shownVariables = html;
    box.innerHTML = html;
    box.scrollTop = scroll;
  }

  // ---- Changing a value: double-click it, Enter sets it, Esc does not ----
  /** @type {Record<string, boolean>} */
  let can = {};
  let editing = false, shownVariables = "", shownWatches = "";
  /** @type {Record<string, () => string>} */
  const WHY_NOT = {
    basic: () => L("変数は、BASIC のデバッグ中に、ブレークポイント・ステップ・一時停止で止めると書き換えられます。", "Variables can be changed while a BASIC program being debugged is stopped at the start of a line."),
    asm: () => L("レジスタと内部 RAM は、止めているときに書き換えられます（BASIC のデバッグ中を除く）。", "Registers and internal RAM can be changed while stopped (not while debugging BASIC)."),
    memory: () => L("メモリは、止めているときに書き換えられます。", "Memory can be changed while stopped.")
  };
  function showNote(/** @type {string} */ text, error = false) {
    $("varsNote").textContent = text;
    $("varsNote").classList.toggle("error", error);
  }
  $("inspect").addEventListener("dblclick", e => {
    const cell = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest(".value.edit"));
    if (!cell || editing) return;
    const kind = cell.dataset.kind ?? "", target = cell.dataset.target;
    if (!can[kind]) { showNote(WHY_NOT[kind]?.() ?? ""); return; }
    editing = true;
    showNote("");
    const shown = cell.textContent ?? "";
    // "BED00h: 03 04" is typed over as 03 04, "0307h（775）  @BED00" as 0307h.
    const before = kind === "basic" ? shown : shown.replace(/^[0-9A-F]{5}h: /, "").replace(/\s*[（(].*$/, "");
    const input = document.createElement("input");
    input.className = "valueinput";
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
      const text = input.value;
      editing = false;
      shownVariables = shownWatches = "";
      cell.textContent = shown;
      if (set && text !== before) vscode.postMessage({ type: "set", kind, target, text });
    };
    input.addEventListener("keydown", k => {
      if (k.isComposing) return;
      if (k.key === "Enter") { k.preventDefault(); finish(true); }
      else if (k.key === "Escape") { k.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
  });
  // A group or array opened or closed by hand stays so.
  $("vars").addEventListener("toggle", e => {
    const d = /** @type {HTMLDetailsElement} */ (e.target);
    const key = d.dataset.key ?? "";
    if (d.open) open.add(key); else open.delete(key);
    saved.open = [...open];
    saved.touched = [...new Set([...(saved.touched ?? []), key])];
    vscode.setState(saved);
  }, true);

  /** @param {any[]} values */
  function renderWatches(values) {
    if (editing) return;
    const html = watches.map((w, i) => {
      const v = values.find(x => x.expression === w);
      const value = !v ? `<span class="value">…</span>` : v.error ? `<span class="value"><span class="error">${escape(v.error)}</span></span>` : valueHtml(v.value, v.edit, w);
      return `<div class="row"><span class="name">${escape(w)}</span>${value}<button class="remove" data-i="${i}" title="${L("削除", "Remove")}">×</button></div>`;
    }).join("") || `<div class="hint">${L("式を下の欄に入れて Enter で追加します。", "Type an expression below and press Enter to add it.")}</div>`;
    if (html === shownWatches) return;
    shownWatches = html;
    $("watchList").innerHTML = html;
  }
  $("watchList").addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target);
    if (!b.classList.contains("remove")) return;
    watches.splice(Number(b.dataset.i), 1);
    vscode.postMessage({ type: "watches", list: watches });
    renderWatches([]);
    poll();
  });
  const watchInput = /** @type {HTMLInputElement} */ ($("watchInput"));
  watchInput.addEventListener("keydown", e => {
    if (e.key !== "Enter" || !watchInput.value.trim()) return;
    watches.push(watchInput.value.trim());
    watchInput.value = "";
    vscode.postMessage({ type: "watches", list: watches });
    renderWatches([]);
    poll();
  });
  function poll() {
    if (!attached || !showBox.checked || waiting || document.visibilityState !== "visible") return;
    waiting = true;
    vscode.postMessage({ type: "inspect", watches });
    // An answer that never comes (the machine went away) does not stop the polling.
    setTimeout(() => { waiting = false; }, 3000);
  }
  setInterval(poll, 500);

  resize();
  vscode.postMessage({ type: "ready" });
  device.focus();
})();

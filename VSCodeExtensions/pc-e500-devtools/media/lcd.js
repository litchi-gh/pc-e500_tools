// @ts-check
// The page of the .lcd / .pixels editor: a dot editor for the 240 x 32 LCD.
(function () {
  // @ts-ignore given by VS Code
  const vscode = acquireVsCodeApi();
  const EN = document.documentElement.lang === "en";
  const L = (/** @type {string} */ ja, /** @type {string} */ en) => EN ? en : ja;
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
  /** The editor of sprites: several frames, whose dots are 0 clear, 1 on or 2 off. */
  const SPR = document.documentElement.dataset.kind === "spr";
  let W = SPR ? 8 : 240, H = SPR ? 8 : 32;
  /** @type {Uint8Array[]} */
  let frames = [];
  let current = 0;
  let mask = true;
  const GLASS = "rgb(181,202,125)", INK = "rgb(53,75,48)", OFF = "rgba(53,75,48,0.07)", WHITE = "rgb(228,238,196)";
  const saved = Object.assign({ zoom: 0, ox: 0, oy: 0, tool: "pen", ink: "auto", brush: 1, grid: true, guide: true, areas: false, gaps: false, clear: false, onion: false, play: false, fps: 6, current: 0 }, vscode.getState() ?? {});
  const canvas = /** @type {HTMLCanvasElement} */ ($("glass"));
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const mini = /** @type {HTMLCanvasElement} */ ($("mini"));
  const mg = /** @type {CanvasRenderingContext2D} */ (mini.getContext("2d"));

  /** @typedef {{x: number, y: number, w: number, h: number}} Rect */
  /** @typedef {{w: number, h: number, dots: Uint8Array}} Piece */
  /** The picture. @type {Uint8Array | undefined} */
  let dots;
  let format = "lcd";
  /** The picture with what is being drawn, until the button is let go. @type {Uint8Array | undefined} */
  let drawing;
  /** @type {Rect | undefined} */
  let selection;
  /** Dots taken off the picture, which can be moved about: the picture without them, and where they are. @type {{base: Uint8Array, piece: Piece, x: number, y: number} | undefined} */
  let lift;
  /** Text or an image being placed: not in the picture until it is put there. @type {{piece: Piece, x: number, y: number, kind: "text" | "image"} | undefined} */
  let placing;
  /** @type {Piece | undefined} */
  let clipboard;
  /** @type {{kind: string, x: number, y: number, x0: number, y0: number, on: number | "invert", base: Uint8Array, touched?: Uint8Array, px?: number, py?: number, copy?: boolean, moved?: boolean} | undefined} */
  let drag;
  /** @type {[number, number] | undefined} */
  let hover;
  let spaceHeld = false;

  // ---- The view ----
  /** Screen pixels (not CSS ones) a dot takes, and where dot (0,0) is. */
  let size = 4, ox = 0, oy = 0;
  const ratio = () => window.devicePixelRatio || 1;
  const fitSize = () => Math.max(1, Math.min(Math.round(48 * ratio()), Math.floor((canvas.width - 16 * ratio()) / W)));
  /** As high as the view, at most 20x, and not smaller than all of it. */
  const tallSize = () => SPR ? Math.max(1, Math.min(Math.round(48 * ratio()), Math.floor((canvas.width - 24 * ratio()) / W), Math.floor((canvas.height - 24 * ratio()) / H)))
    : Math.max(fitSize(), Math.min(Math.round(20 * ratio()), Math.floor((canvas.height - 16 * ratio()) / H)));
  /** saved.zoom: CSS pixels a dot takes, 0 to fill the height, -1 to show all. */
  const askedSize = () => saved.zoom > 0 ? Math.max(1, Math.round(saved.zoom * ratio())) : saved.zoom < 0 ? fitSize() : tallSize();
  function clampView() {
    const keep = (/** @type {number} */ o, /** @type {number} */ view, /** @type {number} */ full) => {
      const margin = Math.round(8 * ratio());
      return full + margin * 2 <= view ? Math.round((view - full) / 2) : Math.min(margin, Math.max(view - full - margin, o));
    };
    ox = keep(ox, canvas.width, W * size);
    oy = keep(oy, canvas.height, H * size);
  }
  function resize() {
    const r = $("view").getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * ratio()));
    canvas.height = Math.max(1, Math.round(r.height * ratio()));
    size = askedSize();
    clampView();
    draw();
  }
  /** Zooms, keeping the place under a point of the canvas. */
  function zoomTo(/** @type {number} */ next, cx = canvas.width / 2, cy = canvas.height / 2) {
    next = Math.max(1, Math.min(Math.round(48 * ratio()), Math.round(next)));
    const dx = (cx - ox) / size, dy = (cy - oy) / size;
    size = next;
    ox = Math.round(cx - dx * size);
    oy = Math.round(cy - dy * size);
    saved.zoom = size / ratio();
    clampView();
    keep();
  }
  /** The sizes the wheel goes through. */
  function step(/** @type {number} */ by) {
    const steps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48].map(s => Math.round(s * ratio()));
    return by > 0 ? steps.find(s => s > size) ?? size : [...steps].reverse().find(s => s < size) ?? size;
  }
  let asked = false;
  function draw() {
    if (asked) return;
    asked = true;
    requestAnimationFrame(() => { asked = false; paint(); });
  }
  const rectOfLift = () => lift ? { x: lift.x, y: lift.y, w: lift.piece.w, h: lift.piece.h } : placing ? { x: placing.x, y: placing.y, w: placing.piece.w, h: placing.piece.h } : selection;
  /** What the screen shows: the picture, with what is under way. */
  function shown() {
    if (drawing) return drawing;
    if (dots && placing) { const out = Uint8Array.from(dots); stamp(out, placing.piece, placing.x, placing.y, true); return out; }
    return dots;
  }
  function paint() {
    const picture = shown();
    $("app").classList.toggle("none", !picture);
    if (!picture) return;
    const s = size, r = ratio();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = GLASS;
    g.fillRect(ox, oy, W * s, H * s);
    const gap = saved.gaps && s >= 3 ? Math.max(1, Math.round(s * 0.16)) : 0;
    const x0 = Math.max(0, Math.floor(-ox / s)), x1 = Math.min(W, Math.ceil((canvas.width - ox) / s));
    const y0 = Math.max(0, Math.floor(-oy / s)), y1 = Math.min(H, Math.ceil((canvas.height - oy) / s));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const on = picture[y * W + x];
      if (SPR && !on) {
        // Clear: a chequer, with the frame before under it.
        const half = Math.max(1, s >> 1);
        g.fillStyle = "rgb(158,176,118)";
        g.fillRect(ox + x * s, oy + y * s, half, half);
        g.fillRect(ox + x * s + half, oy + y * s + half, s - half, s - half);
        if (saved.onion && frames.length > 1 && frames[(current + frames.length - 1) % frames.length][y * W + x] === 1) { g.fillStyle = "rgba(60,90,200,0.35)"; g.fillRect(ox + x * s, oy + y * s, s, s); }
        continue;
      }
      if (!on && !gap) continue;
      g.fillStyle = on === 2 ? WHITE : on ? INK : OFF;
      g.fillRect(ox + x * s, oy + y * s, s - gap, s - gap);
    }
    const vline = (/** @type {number} */ x, /** @type {number} */ w) => g.fillRect(ox + x * s - (w >> 1), oy, w, H * s);
    const hline = (/** @type {number} */ y, /** @type {number} */ w) => g.fillRect(ox, oy + y * s - (w >> 1), W * s, w);
    if (saved.grid && s >= 5 * r) {
      g.fillStyle = "rgba(60,80,40,0.22)";
      for (let x = Math.max(1, x0); x < Math.min(W, x1 + 1); x++) vline(x, 1);
      for (let y = 1; y < H; y++) hline(y, 1);
    }
    if (saved.guide && s >= 2) {
      g.fillStyle = "rgba(170,40,20,0.5)";
      const wide = s >= 12 * r ? 2 : 1;
      for (let x = 8; x < W; x += 8) vline(x, wide);
      for (let y = 8; y < H; y += 8) hline(y, wide);
    }
    if (saved.areas) {
      g.fillStyle = "rgba(20,70,190,0.8)";
      for (const x of [64, 120, 176]) vline(x, Math.max(2, Math.round(2 * r)));
    }
    const box = rectOfLift();
    if (box) dashes(box, r);
    if (hover && !drag && !placing && !spaceHeld && ["pen", "eraser"].includes(saved.tool)) {
      const [bx, by] = brushAt(hover[0], hover[1]);
      g.lineWidth = Math.max(1, Math.round(r));
      g.strokeStyle = "rgba(192,48,32,0.9)";
      g.strokeRect(ox + bx * s + 0.5, oy + by * s + 0.5, saved.brush * s - 1, saved.brush * s - 1);
    }
    paintMini(picture);
    Object.assign(canvas.dataset, { s: String(s), ox: String(ox), oy: String(oy) });
    $("zoomText").textContent = `${Math.round(size / r * 10) / 10}x`;
  }
  function dashes(/** @type {Rect} */ b, /** @type {number} */ r) {
    const wide = Math.max(1, Math.round(r));
    g.lineWidth = wide;
    for (const [color, offset] of /** @type {[string, number][]} */ ([["#fff", 0], ["#c03020", 4 * wide]])) {
      g.strokeStyle = color;
      g.setLineDash([4 * wide, 4 * wide]);
      g.lineDashOffset = offset;
      g.strokeRect(ox + b.x * size + wide / 2, oy + b.y * size + wide / 2, b.w * size - wide, b.h * size - wide);
    }
    g.setLineDash([]);
  }
  /** A sprite's frames: one that moves, and all of them to pick from. */
  function paintFrame(/** @type {HTMLCanvasElement} */ to, /** @type {Uint8Array} */ picture, /** @type {number} */ s) {
    to.width = W * s; to.height = H * s;
    const p = /** @type {CanvasRenderingContext2D} */ (to.getContext("2d"));
    p.fillStyle = GLASS;
    p.fillRect(0, 0, to.width, to.height);
    for (let i = 0; i < picture.length; i++) if (picture[i]) { p.fillStyle = picture[i] === 2 ? WHITE : INK; p.fillRect((i % W) * s, Math.floor(i / W) * s, s, s); }
    to.style.width = `${W * s / ratio()}px`;
    to.style.height = `${H * s / ratio()}px`;
  }
  let playing = 0;
  function paintStrip(/** @type {Uint8Array} */ picture) {
    const strip = $("strip"), s = Math.max(1, Math.round(Math.min(3, 48 / H) * ratio()));
    while (strip.children.length > frames.length) strip.lastChild?.remove();
    while (strip.children.length < frames.length) {
      const b = document.createElement("button"), n = strip.children.length;
      b.append(document.createElement("canvas"), document.createElement("span"));
      b.title = L(`コマ ${n}`, `Frame ${n}`);
      b.addEventListener("click", () => pick(n));
      strip.append(b);
    }
    frames.forEach((f, n) => {
      const b = /** @type {HTMLElement} */ (strip.children[n]);
      b.classList.toggle("chosen", n === current);
      paintFrame(/** @type {HTMLCanvasElement} */ (b.children[0]), n === current ? picture : f, s);
      b.children[1].textContent = String(n);
    });
    paintFrame(mini, saved.play ? frames[playing % frames.length] : picture, Math.max(1, Math.round(Math.min(4, 96 / H) * ratio())));
  }
  function pick(/** @type {number} */ n) {
    if (n < 0 || n >= frames.length) return;
    current = saved.current = n;
    dots = frames[n];
    selection = undefined;
    lift = undefined;
    buttons();
    keep();
  }
  function tick() {
    if (SPR && saved.play && frames.length > 1) { playing = (playing + 1) % frames.length; if (!drag) paintFrame(mini, frames[playing], Math.max(1, Math.round(Math.min(4, 96 / H) * ratio()))); }
    setTimeout(tick, 1000 / Math.max(1, Math.min(30, saved.fps || 6)));
  }
  function miniScale() { return Math.max(1, Math.min(3, Math.floor(mini.parentElement ? (mini.parentElement.clientWidth - 28) / W : 2))) * Math.max(1, Math.round(ratio())); }
  /** The whole picture as the LCD shows it, with the part in view. */
  function paintMini(/** @type {Uint8Array} */ picture) {
    if (SPR) { paintStrip(picture); return; }
    const s = miniScale(), r = Math.max(1, Math.round(ratio()));
    mini.width = W * s; mini.height = H * s;
    mini.style.width = `${W * s / ratio()}px`;
    mini.style.height = `${H * s / ratio()}px`;
    mg.fillStyle = GLASS;
    mg.fillRect(0, 0, mini.width, mini.height);
    mg.fillStyle = INK;
    for (let i = 0; i < picture.length; i++) if (picture[i]) mg.fillRect((i % W) * s, Math.floor(i / W) * s, s, s);
    const x = -ox / size, y = -oy / size, w = canvas.width / size, h = canvas.height / size;
    if (x > 0.5 || y > 0.5 || x + w < W - 0.5 || y + h < H - 0.5) {
      mg.strokeStyle = "#c03020";
      mg.lineWidth = r;
      const a = Math.max(0, x) * s, b = Math.max(0, y) * s;
      mg.strokeRect(a + r / 2, b + r / 2, (Math.min(W, x + w) * s) - a - r, (Math.min(H, y + h) * s) - b - r);
    }
  }
  function keep() {
    saved.ox = ox; saved.oy = oy;
    vscode.setState(saved);
    draw();
  }
  new ResizeObserver(resize).observe($("view"));
  const toMini = (/** @type {PointerEvent} */ e) => {
    if (!(e.buttons & 1) || SPR) return;
    const r = mini.getBoundingClientRect();
    ox = Math.round(canvas.width / 2 - (e.clientX - r.left) / r.width * W * size);
    oy = Math.round(canvas.height / 2 - (e.clientY - r.top) / r.height * H * size);
    clampView();
    keep();
  };
  mini.addEventListener("pointerdown", e => { mini.setPointerCapture(e.pointerId); toMini(e); });
  mini.addEventListener("pointermove", toMini);

  // ---- Drawing on a picture ----
  const base64 = (/** @type {Uint8Array} */ data) => { let s = ""; for (const b of data) s += String.fromCharCode(b); return btoa(s); };
  const bytes = (/** @type {string} */ s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  /** Makes a picture the new one, as one step of Undo. Lifted dots stay lifted only when asked. */
  function commit(/** @type {Uint8Array} */ next, /** @type {string} */ label, keepLift = false) {
    if (!keepLift) lift = undefined;
    if (dots && !next.every((d, i) => d === /** @type {Uint8Array} */ (dots)[i])) {
      dots = next;
      if (SPR) { frames[current] = next; sendSprite(label); }
      else vscode.postMessage({ type: "edit", data: base64(next), label });
    }
    draw();
  }
  function sendSprite(/** @type {string} */ label) {
    vscode.postMessage({ type: "editSprite", label, sprite: { width: W, height: H, mask, frames: frames.map(base64) } });
  }
  /** Changes the frames, as one step of Undo. */
  function setFrames(/** @type {Uint8Array[]} */ next, /** @type {number} */ at, /** @type {string} */ label) {
    frames = next;
    lift = undefined;
    selection = undefined;
    pick(Math.max(0, Math.min(next.length - 1, at)));
    sendSprite(label);
  }
  /** On for off and off for on; in a sprite what is clear becomes on. */
  const inverse = (/** @type {number} */ d) => SPR ? (d === 1 ? 2 : 1) : d ? 0 : 1;
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < W && y < H;
  /** Sets a dot, or inverts it from how it was before the stroke. */
  function put(/** @type {Uint8Array} */ to, /** @type {number} */ x, /** @type {number} */ y) {
    if (!drag || !inside(x, y)) return;
    const i = y * W + x;
    to[i] = drag.on === "invert" ? inverse(drag.base[i]) : drag.on;
  }
  const brushAt = (/** @type {number} */ x, /** @type {number} */ y) => [x - ((saved.brush - 1) >> 1), y - ((saved.brush - 1) >> 1)];
  function dab(/** @type {Uint8Array} */ to, /** @type {number} */ x, /** @type {number} */ y) {
    const [a, b] = brushAt(x, y);
    for (let v = 0; v < saved.brush; v++) for (let u = 0; u < saved.brush; u++) put(to, a + u, b + v);
  }
  function line(/** @type {Uint8Array} */ to, /** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      dab(to, x0, y0);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** @returns {Rect} */
  const rectOf = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) =>
    ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 });
  /** The part of a rectangle on the picture. @returns {Rect} */
  function clip(/** @type {Rect} */ r) {
    const x = Math.max(0, r.x), y = Math.max(0, r.y);
    return { x, y, w: Math.max(0, Math.min(W, r.x + r.w) - x), h: Math.max(0, Math.min(H, r.y + r.h) - y) };
  }
  function box(/** @type {Uint8Array} */ to, /** @type {Rect} */ r, /** @type {boolean} */ filled) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (filled || x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) (filled ? put : dab)(to, x, y);
    }
  }
  function ellipse(/** @type {Uint8Array} */ to, /** @type {Rect} */ r, /** @type {boolean} */ filled) {
    const a = r.w / 2, b = r.h / 2;
    const isIn = (/** @type {number} */ x, /** @type {number} */ y) => {
      if (x < 0 || y < 0 || x >= r.w || y >= r.h) return false;
      const u = (x + 0.5 - a) / a, v = (y + 0.5 - b) / b;
      return u * u + v * v <= 1 + 0.15 / Math.min(a, b);
    };
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!isIn(x, y)) continue;
      if (filled) put(to, r.x + x, r.y + y);
      else if (!isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1)) dab(to, r.x + x, r.y + y);
    }
  }
  function flood(/** @type {Uint8Array} */ to, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ on) {
    const was = to[y * W + x], todo = [[x, y]];
    if (was === on) return;
    while (todo.length > 0) {
      const [u, v] = /** @type {number[]} */ (todo.pop());
      if (!inside(u, v) || to[v * W + u] !== was) continue;
      to[v * W + u] = on;
      todo.push([u + 1, v], [u - 1, v], [u, v + 1], [u, v - 1]);
    }
  }
  /** @returns {Piece} */
  function cut(/** @type {Uint8Array} */ from, /** @type {Rect} */ r) {
    const out = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (inside(r.x + x, r.y + y)) out[y * r.w + x] = from[(r.y + y) * W + r.x + x];
    return { w: r.w, h: r.h, dots: out };
  }
  function stamp(/** @type {Uint8Array} */ to, /** @type {Piece} */ piece, /** @type {number} */ x, /** @type {number} */ y, transparent = saved.clear) {
    for (let v = 0; v < piece.h; v++) for (let u = 0; u < piece.w; u++) {
      const d = piece.dots[v * piece.w + u];
      if (inside(x + u, y + v) && (d || !transparent)) to[(y + v) * W + x + u] = d;
    }
  }
  function wipe(/** @type {Uint8Array} */ to, /** @type {Rect} */ r) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inside(x, y)) to[y * W + x] = 0;
  }
  const all = () => ({ x: 0, y: 0, w: W, h: H });

  // ---- The selection ----
  /** Takes the selected dots off the picture, to move or change them. */
  function raise(leave = false) {
    if (!dots || !selection) return false;
    if (lift) {
      // A copy of them stays where they are.
      if (leave) lift.base = Uint8Array.from(dots);
      return true;
    }
    const base = Uint8Array.from(dots), piece = cut(dots, selection);
    if (!leave) wipe(base, selection);
    lift = { base, piece, x: selection.x, y: selection.y };
    return true;
  }
  /** The picture with the lifted dots where they are now. */
  function settle(/** @type {string} */ label) {
    if (!lift) return;
    const next = Uint8Array.from(lift.base);
    stamp(next, lift.piece, lift.x, lift.y);
    selection = { x: lift.x, y: lift.y, w: lift.piece.w, h: lift.piece.h };
    commit(next, label, true);
  }
  function deselect() { selection = undefined; lift = undefined; draw(); }
  /** Changes the selected dots, or the whole picture. */
  function change(/** @type {string} */ label, /** @type {(p: Piece) => Piece} */ how) {
    if (!dots) return;
    if (raise() && lift) {
      const p = how(lift.piece);
      // Turned: about the middle.
      lift.x += Math.trunc((lift.piece.w - p.w) / 2);
      lift.y += Math.trunc((lift.piece.h - p.h) / 2);
      lift.piece = p;
      settle(label);
    } else {
      const p = how(cut(dots, all()));
      if (p.w === W && p.h === H) commit(p.dots, label);
    }
  }
  const map = (/** @type {Piece} */ p, /** @type {number} */ w, /** @type {number} */ h, /** @type {(x: number, y: number) => number} */ at) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = p.dots[at(x, y)];
    return { w, h, dots: out };
  };
  function paste(/** @type {Piece} */ piece, /** @type {string} */ label, /** @type {{x: number, y: number} | undefined} */ at) {
    if (!dots) return;
    const where = at ?? (selection ? { x: selection.x, y: selection.y } : inView(piece));
    lift = { base: Uint8Array.from(dots), piece: { w: piece.w, h: piece.h, dots: Uint8Array.from(piece.dots) }, x: where.x, y: where.y };
    choose("select", true);
    settle(label);
  }
  /** Where a piece goes when no place was given: the top left of what is in view. */
  function inView(/** @type {Piece} */ p) {
    return { x: Math.max(0, Math.min(W - p.w, Math.ceil(-ox / size))), y: Math.max(0, Math.min(H - p.h, Math.ceil(-oy / size))) };
  }
  function nudge(/** @type {number} */ dx, /** @type {number} */ dy) {
    if (!dots) return;
    if (raise() && lift) { lift.x += dx; lift.y += dy; settle(L("移動", "Move")); return; }
    // With nothing selected the whole picture goes round.
    const p = cut(dots, all());
    commit(map(p, W, H, (x, y) => ((y - dy + H) % H) * W + (x - dx + W) % W).dots, L("ずらす", "Shift"));
  }
  /** Columns of 8 dots, bit 0 at the top, a list for every 8 rows. */
  function columns(/** @type {Piece} */ p) {
    /** @type {number[][]} */
    const out = [];
    for (let top = 0; top < p.h; top += 8) {
      const row = [];
      for (let x = 0; x < p.w; x++) {
        let b = 0;
        for (let i = 0; i < 8 && top + i < p.h; i++) if (p.dots[(top + i) * p.w + x] === 1) b |= 1 << i;
        row.push(b);
      }
      out.push(row);
    }
    return out;
  }
  const hex2 = (/** @type {number} */ n) => n.toString(16).toUpperCase().padStart(2, "0");
  const picked = () => lift ? lift.piece : cut(/** @type {Uint8Array} */ (dots), selection ? clip(selection) : all());
  function asDb(/** @type {Piece} */ p) {
    const lines = [`; ${p.w} x ${p.h}`];
    for (const row of columns(p)) for (let i = 0; i < row.length; i += 16) lines.push("        DB    " + row.slice(i, i + 16).map(b => "$" + hex2(b)).join(","));
    return lines.join("\n") + "\n";
  }
  function asGprint(/** @type {Piece} */ p) {
    const rows = columns(p);
    // Where it is in the picture; a sprite goes to X, Y.
    const at = lift || selection ? /** @type {Rect} */ (rectOfLift()) : { x: 0, y: 0 };
    return rows.map((row, r) => {
      const parts = [];
      // A line of BASIC has room for this many; with ; the next one goes on from there.
      for (let i = 0; i < row.length; i += 100) parts.push(`GPRINT "${row.slice(i, i + 100).map(hex2).join("")}"${i + 100 < row.length ? ";" : ""}`);
      // GCURSOR is the bottom dot of the eight.
      if (rows.length > 1 || parts.length > 1) parts[0] = `GCURSOR (${SPR ? `X,Y+${r * 8 + 7}` : `${at.x},${at.y + r * 8 + 7}`}):` + parts[0];
      return parts.join("\n");
    }).join("\n") + "\n";
  }
  function moveFrame(/** @type {number} */ by) {
    const to = current + by;
    if (to < 0 || to >= frames.length) return;
    const next = [...frames];
    [next[current], next[to]] = [next[to], next[current]];
    setFrames(next, to, L("コマの移動", "Move a frame"));
  }
  /** Another size: what fits stays, at the top left. */
  function resizeSprite(/** @type {number} */ w, /** @type {number} */ h) {
    w = Math.max(1, Math.min(64, Math.round(w) || W));
    if (w === W && h === H) { sizeInputs(); return; }
    const fits = (/** @type {Uint8Array} */ f) => {
      const out = new Uint8Array(w * h);
      for (let y = 0; y < Math.min(h, H); y++) for (let x = 0; x < Math.min(w, W); x++) out[y * w + x] = f[y * W + x];
      return out;
    };
    const next = frames.map(fits);
    W = w; H = h;
    setFrames(next, current, L("大きさ", "Size"));
    sizeInputs();
    resize();
  }
  function sizeInputs() {
    input("sizeW").value = String(W);
    input("sizeH").value = String(H);
    input("mask").checked = mask;
  }
  /** @type {Record<string, () => void>} */
  const actions = {
    undo() { vscode.postMessage({ type: "undo" }); },
    redo() { vscode.postMessage({ type: "redo" }); },
    copy() {
      if (!dots) return;
      const p = picked();
      clipboard = p;
      vscode.postMessage({ type: "clip", w: p.w, h: p.h, data: base64(p.dots) });
      tellAction(L(`${p.w}×${p.h} をコピーしました`, `Copied ${p.w} x ${p.h}`));
      buttons();
    },
    paste() { if (clipboard) paste(clipboard, L("貼り付け", "Paste"), undefined); },
    clear() {
      if (!dots) return;
      if (lift) { const base = lift.base; selection = rectOfLift(); lift = undefined; commit(base, L("消す", "Clear")); return; }
      const next = Uint8Array.from(dots);
      wipe(next, selection ?? all());
      commit(next, L("消す", "Clear"));
    },
    invert() { change(L("反転", "Invert"), p => ({ ...p, dots: p.dots.map(d => SPR && mask ? (d === 1 ? 2 : d === 2 ? 1 : 0) : d === 1 ? 0 : 1) })); },
    outline() {
      change(L("縁取り", "Outline"), p => ({ ...p, dots: p.dots.map((d, i) => {
        if (d) return d;
        const x = i % p.w, y = Math.floor(i / p.w);
        for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) if (x + u >= 0 && x + u < p.w && y + v >= 0 && y + v < p.h && p.dots[(y + v) * p.w + x + u] === 1) return 2;
        return 0;
      }) }));
    },
    opaque() { change(L("透明を消灯に", "Clear to off"), p => ({ ...p, dots: p.dots.map(d => d || 2) })); },
    frameAdd() { setFrames([...frames.slice(0, current + 1), new Uint8Array(W * H), ...frames.slice(current + 1)], current + 1, L("コマの追加", "Add a frame")); },
    frameCopy() { setFrames([...frames.slice(0, current + 1), Uint8Array.from(frames[current]), ...frames.slice(current + 1)], current + 1, L("コマの複製", "Duplicate a frame")); },
    frameDelete() { if (frames.length > 1) setFrames(frames.filter((_, n) => n !== current), current, L("コマを削除", "Delete a frame")); },
    frameLeft() { moveFrame(-1); }, frameRight() { moveFrame(1); },
    flipH() { change(L("左右反転", "Flip horizontally"), p => map(p, p.w, p.h, (x, y) => y * p.w + p.w - 1 - x)); },
    flipV() { change(L("上下反転", "Flip vertically"), p => map(p, p.w, p.h, (x, y) => (p.h - 1 - y) * p.w + x)); },
    rotate() { if (selection || lift || (SPR && W === H)) change(L("回転", "Rotate"), p => map(p, p.h, p.w, (x, y) => (p.h - 1 - x) * p.w + y)); },
    left() { nudge(-1, 0); }, right() { nudge(1, 0); }, up() { nudge(0, -1); }, down() { nudge(0, 1); },
    db() { if (dots) { vscode.postMessage({ type: "text", text: asDb(picked()) }); tellAction(L("DB の行をコピーしました", "Copied as DB lines")); } },
    gprint() { if (dots) { vscode.postMessage({ type: "text", text: asGprint(picked()) }); tellAction(L("GPRINT の行をコピーしました", "Copied as GPRINT lines")); } },
    import() { vscode.postMessage({ type: "import" }); },
    png() { if (dots) vscode.postMessage({ type: "png", data: toPng() }); },
    other() { vscode.postMessage({ type: "other" }); },
    zoomIn() { zoomTo(step(1)); },
    zoomOut() { zoomTo(step(-1)); },
    fit() { saved.zoom = -1; size = askedSize(); clampView(); keep(); },
    tall() { const x = (canvas.width / 2 - ox) / size; saved.zoom = 0; size = askedSize(); ox = Math.round(canvas.width / 2 - x * size); clampView(); keep(); },
    place() { place(); },
    cancel() { cancelPlacing(); }
  };
  function toPng() {
    const picture = /** @type {Uint8Array} */ (shown()), s = Math.max(1, size), c = document.createElement("canvas");
    c.width = W * s; c.height = H * s;
    const p = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
    const gap = saved.gaps && s >= 3 ? Math.max(1, Math.round(s * 0.16)) : 0;
    p.fillStyle = GLASS;
    p.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < picture.length; i++) {
      if (!picture[i] && !gap) continue;
      p.fillStyle = picture[i] === 2 ? WHITE : picture[i] ? INK : OFF;
      p.fillRect((i % W) * s, Math.floor(i / W) * s, s - gap, s - gap);
    }
    return c.toDataURL("image/png").split(",")[1];
  }

  // ---- Text and images ----
  /** @type {HTMLImageElement | undefined} */
  let image;
  /** What is seen of a canvas's drawing, without the empty edges. @returns {Piece | undefined} */
  function trim(/** @type {Piece} */ p) {
    let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
    p.dots.forEach((d, i) => { if (d) { const x = i % p.w, y = Math.floor(i / p.w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    return x1 < 0 ? undefined : map(p, x1 - x0 + 1, y1 - y0 + 1, (x, y) => (y + y0) * p.w + x + x0);
  }
  // The characters from 20h on, five columns each, bit 0 at the top: the ASCII table of SparkFun's
  // GraphicLCD_Nokia_5110 (MIT License, Copyright (c) 2016 SparkFun Electronics; see ThirdPartyNotices.txt).
  const FONT =
    "000000000000005F00000007000700147F147F14242A7F2A12231308646236495522500005030000001C2241000041221C0014083E081408083E08080050300000080808080800606000002010080402" +
    "3E5149453E00427F400042615149462141454B311814127F1027454545393C4A49493001710905033649494936064949291E003636000000563600000814224100141414141400412214080201510906" +
    "324979413E7E1111117E7F494949363E414141227F4141221C7F494949417F090909013E4149497A7F0808087F00417F41002040413F017F081422417F404040407F020C027F7F0408107F3E4141413E" +
    "7F090909063E4151215E7F09192946464949493101017F01013F4040403F1F2040201F3F4038403F631408146307087008076151494543007F41410002040810200041417F0004020102044040404040" +
    "000102040020545454787F484444383844444420384444487F3854545418087E0901020C5252523E7F0804047800447D40002040443D007F1028440000417F40007C041804787C080404783844444438" +
    "7C14141408081414187C7C080404084854545420043F4440203C4040207C1C2040201C3C4030403C44281028440C5050503C4464544C44000836410000007F000000413608001008081008";
  /** Text in 5 x 7 dots, its characters 6 dots apart (8 high, 16 is twice as big). @returns {Piece} */
  function dotText(/** @type {string} */ text, /** @type {number} */ px) {
    const n = Math.max(1, Math.floor(Math.min(32, px) / 8)), bold = input("textBold").checked ? 1 : 0, w = (text.length * 6 - 1 + bold) * n, out = new Uint8Array(w * 8 * n);
    [...text].forEach((c, k) => {
      const at = (c.charCodeAt(0) - 32) * 10;
      for (let x = 0; x < (5 + bold) * n; x++) {
        const u = Math.floor(x / n), column = (/** @type {number} */ i) => i < 0 || i > 4 ? 0 : parseInt(FONT.slice(at + i * 2, at + i * 2 + 2), 16);
        const b = column(u) | (bold ? column(u - 1) : 0);
        for (let y = 0; y < 8 * n; y++) if (b >> Math.floor(y / n) & 1) out[y * w + k * 6 * n + x] = 1;
      }
    });
    return { w, h: 8 * n, dots: out };
  }
  /** @returns {Piece | undefined} */
  function textPiece() {
    const text = input("text").value;
    if (!text) return undefined;
    const dotted = input("textFont").value === "dots";
    if (dotted && /^[ -~]*$/.test(text)) return dotText(text, Number(input("textSize").value) || 8);
    // The dots have no Japanese, which takes 10 dots to be read.
    const family = dotted ? "'MS Gothic', monospace" : input("textFont").value, least = dotted ? 10 : 5;
    const px = Math.max(least, Math.min(32, Number(input("textSize").value) || 8));
    const c = document.createElement("canvas");
    const font = `${input("textBold").checked ? "bold " : ""}${px}px ${family}`;
    let p = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    p.font = font;
    c.width = Math.min(1024, Math.ceil(p.measureText(text).width) + px * 2);
    c.height = px * 2;
    p = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    p.font = font;
    p.textBaseline = "middle";
    p.fillStyle = "#000";
    p.fillText(text, px, px);
    const data = p.getImageData(0, 0, c.width, c.height).data, limit = Number(input("textLimit").value);
    return trim({ w: c.width, h: c.height, dots: Uint8Array.from({ length: c.width * c.height }, (_, i) => data[i * 4 + 3] >= limit ? 1 : 0) });
  }
  /** @returns {Piece | undefined} */
  function imagePiece() {
    if (!image || !image.naturalWidth) return undefined;
    const scale = input("imageFit").checked ? Math.min(W / image.naturalWidth, H / image.naturalHeight) : Math.min(1, 1024 / image.naturalWidth, 256 / image.naturalHeight);
    const w = Math.max(1, Math.round(image.naturalWidth * scale)), h = Math.max(1, Math.round(image.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const p = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    p.fillStyle = "#fff";
    p.fillRect(0, 0, w, h);
    p.imageSmoothingQuality = "high";
    p.drawImage(image, 0, 0, w, h);
    const data = p.getImageData(0, 0, w, h).data, limit = Number(input("imageLimit").value), flip = input("imageInvert").checked;
    const light = Float32Array.from({ length: w * h }, (_, i) => {
      const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      return flip ? 255 - v : v;
    });
    const out = new Uint8Array(w * h), dither = input("imageDither").checked;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, dark = light[i] < limit;
      out[i] = dark ? 1 : 0;
      if (!dither) continue;
      const e = light[i] - (dark ? 0 : 255);
      if (x + 1 < w) light[i + 1] += e * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) light[i + w - 1] += e * 3 / 16;
        light[i + w] += e * 5 / 16;
        if (x + 1 < w) light[i + w + 1] += e / 16;
      }
    }
    return { w, h, dots: out };
  }
  /** Makes what is being placed again from its settings. */
  function remake(/** @type {"text" | "image"} */ kind, /** @type {{x: number, y: number} | undefined} */ at) {
    const piece = kind === "text" ? textPiece() : imagePiece();
    const where = at ?? placing ?? (piece && kind === "image" ? { x: 0, y: 0 } : piece && inView(piece)) ?? { x: 0, y: 0 };
    placing = piece ? { piece, x: where.x, y: where.y, kind } : undefined;
    draw();
    buttons();
  }
  function place() {
    if (!placing) return;
    const { piece, x, y, kind } = placing;
    cancelPlacing();
    lift = { base: Uint8Array.from(/** @type {Uint8Array} */ (dots)), piece, x, y };
    saved.clear = true;
    input("clearBox").checked = true;
    choose("select", true);
    settle(kind === "text" ? L("文字", "Text") : L("画像", "Image"));
  }
  function cancelPlacing() {
    placing = undefined;
    image = undefined;
    input("text").value = "";
    if (saved.tool === "text") choose("select", true);
    buttons();
    draw();
  }
  for (const id of ["text", "textSize", "textFont", "textBold", "textLimit"]) $(id).addEventListener("input", () => remake("text", undefined));
  for (const id of ["imageLimit", "imageDither", "imageInvert", "imageFit"]) $(id).addEventListener("input", () => remake("image", undefined));

  // ---- The buttons ----
  const HINTS = /** @type {Record<string, string>} */ ({
    pen: L("左ボタンで描く。右ボタンで消す", "Draw with the left button, erase with the right"),
    eraser: L("ドラッグで消す", "Drag to erase"),
    line: L("Shift で縦・横・45 度", "Shift keeps it straight or at 45 degrees"),
    rect: L("Shift で正方形", "Shift makes a square"), box: L("Shift で正方形", "Shift makes a square"),
    oval: L("Shift で円", "Shift makes a circle"), disc: L("Shift で円", "Shift makes a circle"),
    fill: L("つながった同じ色の範囲を塗る", "Fills the area of the same color"),
    select: L("ドラッグで選び、中をドラッグで移動（Ctrl でコピー）。矢印キーで 1 ドットずつ", "Drag to select, drag inside to move (Ctrl copies). Arrow keys move by a dot"),
    text: L("文字を入力し、ドラッグで位置を決めて「置く」（Enter）", "Type, drag it into place, then Place (Enter)")
  });
  function buttons() {
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll("button[data-tool], button[data-act]"))) {
      if (b.dataset.tool) { b.classList.toggle("chosen", b.dataset.tool === saved.tool); b.setAttribute("aria-pressed", String(b.dataset.tool === saved.tool)); }
      const act = b.dataset.act;
      b.disabled = !dots ? act !== "other" : act === "paste" ? !clipboard : act === "rotate" ? !selection && !lift && !(SPR && W === H) : act === "place" ? !placing : act === "frameDelete" ? frames.length < 2 : act === "frameLeft" ? current === 0 : act === "frameRight" ? current >= frames.length - 1 : act === "frameAdd" || act === "frameCopy" ? frames.length >= 255 : false;
    }
    $("textBar").hidden = saved.tool !== "text";
    $("imageBar").hidden = !image;
    $("placeBar").hidden = saved.tool !== "text" && !image;
    $("inkBar").hidden = ["eraser", "select", "text"].includes(saved.tool);
    $("brushBar").hidden = ["fill", "select", "text", "box", "disc"].includes(saved.tool);
    $("clearLabel").hidden = saved.tool !== "select";
    $("hint").textContent = image ? L("ドラッグで位置を決めて「置く」（Enter）", "Drag it into place, then Place (Enter)") : HINTS[saved.tool] ?? "";
    canvas.style.cursor = spaceHeld ? "grab" : saved.tool === "select" || saved.tool === "text" || image ? "default" : "crosshair";
  }
  function choose(/** @type {string} */ name, keepSelection = false) {
    saved.tool = name;
    if (!keepSelection && name !== "select") { selection = undefined; lift = undefined; }
    if (name !== "text" && placing?.kind === "text") placing = undefined;
    buttons();
    keep();
    if (name === "text") { input("text").focus(); remake("text", undefined); }
  }
  document.addEventListener("click", e => {
    const b = /** @type {HTMLElement} */ (e.target).closest?.("button");
    if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
    if (b.dataset.tool) choose(b.dataset.tool);
    else if (b.dataset.act) actions[b.dataset.act]();
    if (b.dataset.tool !== "text") canvas.focus();
  });
  if (SPR) {
    for (const id of ["sizeW", "sizeH"]) $(id).addEventListener("change", () => resizeSprite(Number(input("sizeW").value), Number(input("sizeH").value)));
    $("mask").addEventListener("change", () => { mask = input("mask").checked; sendSprite(L("マスク", "Mask")); draw(); });
    const fps = input("fps");
    fps.value = String(saved.fps);
    fps.addEventListener("change", () => { saved.fps = Number(fps.value) || 6; keep(); });
    tick();
  }
  for (const [id, name] of /** @type {[string, "grid" | "guide" | "areas" | "gaps" | "clear" | "onion" | "play"][]} */ ([["grid", "grid"], ["guide", "guide"], ["areas", "areas"], ["gaps", "gaps"], ["clearBox", "clear"], ["onion", "onion"], .../** @type {[string, "play"][]} */ (SPR ? [["play", "play"]] : [])])) {
    input(id).checked = saved[name];
    $(id).addEventListener("change", () => {
      saved[name] = input(id).checked;
      keep();
      if (name === "clear" && lift) settle(L("透過", "Transparent"));
    });
  }
  const ink = input("ink"), brush = input("brush");
  ink.value = saved.ink;
  brush.value = String(saved.brush);
  ink.addEventListener("change", () => { saved.ink = ink.value; keep(); });
  brush.addEventListener("change", () => { saved.brush = Number(brush.value); keep(); });

  // ---- The mouse ----
  /** The place under the mouse on the canvas, in its pixels. @returns {[number, number]} */
  function spot(/** @type {MouseEvent} */ e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  }
  /** The dot under the mouse, which may be off the picture. @returns {[number, number]} */
  function dotAt(/** @type {MouseEvent} */ e) {
    const [x, y] = spot(e);
    return [Math.floor((x - ox) / size), Math.floor((y - oy) / size)];
  }
  const within = (/** @type {Rect | undefined} */ r, /** @type {number} */ x, /** @type {number} */ y) => !!r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (e.shiftKey || (e.deltaX !== 0 && e.deltaY === 0)) {
      ox -= Math.round((e.deltaX || e.deltaY) * ratio());
      clampView();
      keep();
    } else zoomTo(step(e.deltaY < 0 ? 1 : -1), ...spot(e));
  }, { passive: false });
  canvas.addEventListener("pointerdown", e => {
    if (!dots || drag) return;
    const [x, y] = dotAt(e);
    canvas.focus();
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const [a, b] = spot(e);
      drag = { kind: "pan", x: a, y: b, x0: ox, y0: oy, on: 0, base: dots };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const tool = saved.tool;
    if (placing && e.button === 0) {
      canvas.setPointerCapture(e.pointerId);
      // Grabbed, or put where it was clicked.
      if (!within(rectOfLift(), x, y)) { placing.x = x; placing.y = y; }
      drag = { kind: "place", x, y, x0: x, y0: y, on: 0, base: dots, px: placing.x, py: placing.y };
      draw();
      return;
    }
    if (tool === "text") return;
    if (tool === "select") {
      canvas.setPointerCapture(e.pointerId);
      const grab = e.button === 0 && within(rectOfLift(), x, y);
      drag = { kind: grab ? "move" : "select", x, y, x0: x, y0: y, on: 0, base: dots, copy: e.ctrlKey || e.metaKey };
      if (grab) { const r = /** @type {Rect} */ (rectOfLift()); drag.px = r.x; drag.py = r.y; }
      else { selection = undefined; lift = undefined; }
      draw();
      return;
    }
    if (!inside(x, y) && (tool === "fill" || tool === "pen" || tool === "eraser")) return;
    canvas.setPointerCapture(e.pointerId);
    const lit = inside(x, y) ? dots[y * W + x] : 0;
    /** @type {number | "invert"} */
    const on = e.button === 2 || tool === "eraser" ? 0 : saved.ink === "on" ? 1 : saved.ink === "white" ? 2 : saved.ink === "off" ? 0 : saved.ink === "invert" ? "invert" : tool === "pen" || tool === "fill" ? (lit === 1 ? (SPR && mask ? 2 : 0) : lit === 2 && tool === "pen" ? 0 : 1) : 1;
    if (tool === "fill") {
      const next = Uint8Array.from(dots);
      flood(next, x, y, on === "invert" ? inverse(lit) : on);
      commit(next, L("塗りつぶし", "Fill"));
      return;
    }
    drag = { kind: tool, x, y, x0: x, y0: y, on, base: Uint8Array.from(dots) };
    move(x, y, e.shiftKey);
  });
  function move(/** @type {number} */ x, /** @type {number} */ y, /** @type {boolean} */ straight) {
    if (!drag) return;
    const d = drag;
    if (d.kind === "place" && placing) { placing.x = /** @type {number} */ (d.px) + x - d.x0; placing.y = /** @type {number} */ (d.py) + y - d.y0; }
    else if (d.kind === "pen" || d.kind === "eraser") {
      drawing ??= Uint8Array.from(d.base);
      line(drawing, d.x, d.y, x, y);
      d.x = x; d.y = y;
    } else if (d.kind === "select") selection = x === d.x0 && y === d.y0 && !d.moved ? undefined : (d.moved = true, clip(rectOf(d.x0, d.y0, x, y)));
    else if (d.kind === "move") {
      if (!d.moved && x === d.x0 && y === d.y0) return;
      if (!d.moved) { raise(d.copy); d.moved = true; }
      if (lift) {
        lift.x = /** @type {number} */ (d.px) + x - d.x0;
        lift.y = /** @type {number} */ (d.py) + y - d.y0;
        drawing = Uint8Array.from(lift.base);
        stamp(drawing, lift.piece, lift.x, lift.y);
      }
    } else {
      if (straight) [x, y] = constrain(d.kind, d.x0, d.y0, x, y);
      drawing = Uint8Array.from(d.base);
      if (d.kind === "line") line(drawing, d.x0, d.y0, x, y);
      else if (d.kind === "oval" || d.kind === "disc") ellipse(drawing, rectOf(d.x0, d.y0, x, y), d.kind === "disc");
      else box(drawing, rectOf(d.x0, d.y0, x, y), d.kind === "box");
    }
    draw();
  }
  /** With Shift: a straight line, or a square. @returns {[number, number]} */
  function constrain(/** @type {string} */ kind, /** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x, /** @type {number} */ y) {
    const dx = x - x0, dy = y - y0, a = Math.abs(dx), b = Math.abs(dy);
    if (kind === "line" && a > b * 2) return [x, y0];
    if (kind === "line" && b > a * 2) return [x0, y];
    const n = kind === "line" ? Math.min(a, b) : Math.max(a, b);
    return [x0 + n * (dx < 0 ? -1 : 1), y0 + n * (dy < 0 ? -1 : 1)];
  }
  const LABELS = /** @type {Record<string, string>} */ ({ pen: L("描く", "Draw"), eraser: L("消す", "Erase"), line: L("直線", "Line"), rect: L("四角", "Box"), box: L("塗り四角", "Filled box"), oval: L("円", "Ellipse"), disc: L("塗り円", "Filled ellipse"), move: L("移動", "Move") });
  function finish(/** @type {boolean} */ take) {
    if (!drag) return;
    const was = drag, next = drawing;
    drag = undefined;
    drawing = undefined;
    if (was.kind === "pan") { keep(); buttons(); return; }
    if (was.kind === "place") { draw(); return; }
    if (was.kind === "select") {
      if (!take || (selection && (selection.w === 0 || selection.h === 0))) selection = undefined;
      buttons();
    } else if (was.kind === "move") {
      if (lift && was.moved && take) settle(LABELS.move);
      else if (lift && was.moved) {
        // Back where it was.
        lift.x = /** @type {number} */ (was.px);
        lift.y = /** @type {number} */ (was.py);
        selection = { x: lift.x, y: lift.y, w: lift.piece.w, h: lift.piece.h };
      } else if (!was.moved && take) deselect();
      buttons();
    } else if (take && next) commit(next, LABELS[was.kind]);
    draw();
  }
  canvas.addEventListener("pointermove", e => {
    const at = dotAt(e);
    hover = at;
    if (drag?.kind === "pan") {
      const [a, b] = spot(e);
      ox = Math.round(drag.x0 + a - drag.x);
      oy = Math.round(drag.y0 + b - drag.y);
      clampView();
      draw();
      return;
    }
    if (drag) move(at[0], at[1], e.shiftKey);
    else draw();
    tell(at[0], at[1]);
  });
  canvas.addEventListener("pointerup", () => finish(true));
  canvas.addEventListener("pointercancel", () => finish(false));
  canvas.addEventListener("pointerleave", () => { hover = undefined; if (!drag) $("where").textContent = " "; draw(); });
  let acted = 0;
  function tellAction(/** @type {string} */ text) {
    $("where").textContent = text;
    acted = Date.now();
  }
  function tell(/** @type {number} */ x, /** @type {number} */ y) {
    const picture = shown();
    if (!picture || Date.now() - acted < 1500) return;
    const r = drag && drag.kind === "select" ? selection : drag && !["pan", "move", "place", "pen", "eraser"].includes(drag.kind) ? rectOf(drag.x0, drag.y0, x, y) : rectOfLift();
    const measure = r ? `  ${r.w}×${r.h} @ (${r.x}, ${r.y})` : "";
    if (!inside(x, y)) { $("where").textContent = measure || " "; return; }
    if (SPR) {
      const at = 4 + (current * W * H / 8 + (y >> 3) * W + x) * (mask ? 2 : 1), d = picture[y * W + x];
      $("where").textContent = `(${x}, ${y}) ${d === 1 ? L("点灯", "on") : d ? L("消灯", "off") : L("透明", "clear")}${measure}  ${L(`コマ ${current}、+${at.toString(16).toUpperCase().padStart(3, "0")}h${mask ? "（マスク、次が絵）" : ""} のビット ${y & 7}`, `frame ${current}, +${at.toString(16).toUpperCase().padStart(3, "0")}h${mask ? " (mask, then the dots)" : ""} bit ${y & 7}`)}`;
      return;
    }
    let at = L(`${y * W + x} バイト目`, `byte ${y * W + x}`);
    if (format === "lcd") {
      // As src/lcd/lcdFile.ts dotPlace.
      const controller = x < 64 || x >= 176 ? 1 : 0, column = x < 64 ? x : x < 120 ? x - 64 : x < 176 ? 175 - x : 239 - x, row = y + (x >= 120 ? 32 : 0);
      const offset = controller * 512 + (row >> 3) * 64 + column;
      at = L(`+${offset.toString(16).toUpperCase().padStart(3, "0")}h のビット ${row & 7}（コントローラ ${controller}、ページ ${row >> 3}、桁 ${column}）`,
        `+${offset.toString(16).toUpperCase().padStart(3, "0")}h bit ${row & 7} (controller ${controller}, page ${row >> 3}, column ${column})`);
    }
    $("where").textContent = `(${x}, ${y}) ${picture[y * W + x] ? L("点灯", "on") : L("消灯", "off")}${measure}  ${at}`;
  }

  // ---- Keys (Undo, Redo and Save are VS Code's own) ----
  const TOOLS = /** @type {Record<string, string>} */ ({ p: "pen", e: "eraser", l: "line", r: "rect", b: "box", o: "oval", d: "disc", f: "fill", s: "select", t: "text" });
  const ARROWS = /** @type {Record<string, [number, number]>} */ ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] });
  window.addEventListener("keydown", e => {
    if (!dots) return;
    const command = e.ctrlKey || e.metaKey, key = e.key.toLowerCase(), plain = !command && !e.altKey;
    const typing = e.target instanceof HTMLInputElement && e.target.type !== "checkbox" && e.target.type !== "range";
    // While a word is being put together the keys are the IME's.
    if (e.isComposing) return;
    if (key === "escape") {
      if (drag) finish(false);
      else if (placing || image || saved.tool === "text") cancelPlacing();
      else { deselect(); buttons(); }
    } else if (drag && !typing) return; // a drag is finished first: it would put its own picture over what these do
    else if (key === "enter" && placing) place();
    else if (typing || e.target instanceof HTMLSelectElement) return;
    else if (key === " " && plain) { if (e.target instanceof HTMLButtonElement) return; if (!spaceHeld) { spaceHeld = true; buttons(); draw(); } }
    else if (command && !e.altKey && !e.shiftKey && key === "c") actions.copy();
    else if (command && !e.altKey && !e.shiftKey && key === "v") actions.paste();
    else if (command && !e.altKey && !e.shiftKey && key === "x") { actions.copy(); actions.clear(); }
    else if (command && !e.altKey && !e.shiftKey && key === "a") { lift = undefined; selection = all(); choose("select", true); }
    else if (command && !e.altKey && !e.shiftKey && key === "d") { if (selection) { const p = picked(), r = /** @type {Rect} */ (rectOfLift()); paste(p, L("複製", "Duplicate"), { x: r.x + 4, y: r.y + 4 }); } }
    else if (plain && (key === "delete" || key === "backspace")) actions.clear();
    else if (plain && TOOLS[key] && !drag) choose(TOOLS[key]);
    else if (SPR && plain && (key === "," || key === ".")) pick((current + frames.length + (key === "." ? 1 : -1)) % frames.length);
    else if (plain && key === "g") { input("grid").checked = saved.grid = !saved.grid; keep(); }
    else if (plain && key === "h") actions.flipH();
    else if (plain && key === "v") actions.flipV();
    else if (plain && key === "i") actions.invert();
    else if (plain && (key === "[" || key === "]")) { saved.brush = Math.max(1, Math.min(8, saved.brush + (key === "]" ? 1 : -1))); brush.value = String(saved.brush); keep(); }
    else if (plain && (key === "+" || key === ";" || key === "=")) actions.zoomIn();
    else if (plain && key === "-") actions.zoomOut();
    else if (plain && key === "0") actions.fit();
    else if (plain && key === "9") actions.tall();
    else if (plain && ARROWS[key] && !drag) {
      const n = e.shiftKey ? 8 : 1, [dx, dy] = ARROWS[key];
      if (placing) { placing.x += dx * n; placing.y += dy * n; draw(); }
      else if (selection || lift) nudge(dx * n, dy * n);
      else { ox -= dx * size * n; oy -= dy * size * n; clampView(); keep(); }
    } else return;
    e.preventDefault();
  });
  window.addEventListener("keyup", e => { if (e.key === " " && spaceHeld) { spaceHeld = false; buttons(); draw(); } });
  window.addEventListener("blur", () => { if (spaceHeld) { spaceHeld = false; buttons(); } });

  // ---- VS Code ----
  window.addEventListener("message", event => {
    const m = event.data;
    if (m.type === "clip") {
      clipboard = { w: m.w, h: m.h, dots: bytes(m.data).map(d => SPR ? d : d === 1 ? 1 : 0) };
      buttons();
    } else if (m.type === "image") {
      const i = new Image();
      i.onload = () => { if (!dots) return; placing = undefined; lift = undefined; selection = undefined; image = i; if (saved.tool === "text") choose("select"); remake("image", undefined); canvas.focus(); };
      i.onerror = () => tellAction(L("画像を読めませんでした", "Could not read the image"));
      i.src = m.data;
    } else if (m.type === "sprite") {
      drag = undefined;
      drawing = undefined;
      lift = undefined;
      $("about").textContent = m.about ?? "";
      if (!m.sprite) { dots = undefined; selection = undefined; placing = undefined; image = undefined; buttons(); draw(); return; }
      const sizeWas = `${W}x${H}`, first = frames.length === 0;
      W = m.sprite.width; H = m.sprite.height; mask = m.sprite.mask;
      frames = m.sprite.frames.map(bytes);
      current = Math.min(first ? saved.current : current, frames.length - 1);
      dots = frames[current];
      if (selection) { const r = clip(selection); selection = r.w > 0 && r.h > 0 ? r : undefined; }
      sizeInputs();
      buttons();
      if (first || sizeWas !== `${W}x${H}`) resize();
      draw();
    } else if (m.type === "picture") {
      const next = m.dots ? bytes(m.dots) : undefined;
      // Undone or reloaded: what was being drawn goes, and dots that were lifted are the picture's.
      drag = undefined;
      drawing = undefined;
      lift = undefined;
      dots = next;
      format = m.format ?? "lcd";
      $("about").textContent = m.about ?? "";
      if (!dots) { selection = undefined; placing = undefined; image = undefined; }
      else if (selection) { const r = clip(selection); selection = r.w > 0 && r.h > 0 ? r : undefined; }
      buttons();
      draw();
    }
  });
  ox = saved.ox;
  oy = saved.oy;
  if (saved.tool === "text") saved.tool = "pen";
  buttons();
  vscode.postMessage({ type: "ready" });
})();

// The page of the dot editor (media/lcd.js works it).
import { isEnglish, L } from "../l10n";

const icon = (shapes: string): string => `<svg viewBox="0 0 18 18" aria-hidden="true">${shapes}</svg>`;

function tools(sprite: boolean): string {
  const tool = (name: string, title: string, shapes: string): string => `<button data-tool="${name}" title="${title}" aria-label="${title}">${icon(shapes)}</button>`;
  const act = (name: string, title: string, shapes: string): string => `<button data-act="${name}" title="${title}" aria-label="${title}">${icon(shapes)}</button>`;
  return [
    tool("pen", L("鉛筆（P）", "Pencil (P)"), `<path d="M3 15l1-4 8-8 3 3-8 8z"/><path d="M10.5 4.5l3 3"/>`),
    tool("eraser", L("消しゴム（E）", "Eraser (E)"), `<path d="M6 15l-4-4 7-8 6 5-6 7z"/><path d="M5.5 7l6 5M6 15h9"/>`),
    tool("line", L("直線（L）", "Line (L)"), `<path d="M3 15L15 3"/>`),
    tool("fill", L("塗りつぶし（F）", "Fill (F)"), `<path d="M3 9l6-6 6 6-6 6z"/><path class="solid" d="M4 9.5h10l-5 5z"/><path d="M16 12v3"/>`),
    tool("rect", L("四角（R）", "Box (R)"), `<rect x="2.5" y="4.5" width="13" height="9"/>`),
    tool("box", L("塗り四角（B）", "Filled box (B)"), `<rect class="solid" x="2.5" y="4.5" width="13" height="9"/>`),
    tool("oval", L("円（O）", "Ellipse (O)"), `<ellipse cx="9" cy="9" rx="6.5" ry="5"/>`),
    tool("disc", L("塗り円（D）", "Filled ellipse (D)"), `<ellipse class="solid" cx="9" cy="9" rx="6.5" ry="5"/>`),
    tool("select", L("選択（S）", "Select (S)"), `<rect x="2.5" y="3.5" width="13" height="11" stroke-dasharray="2.5 2.5"/>`),
    tool("text", L("文字（T）", "Text (T)"), `<path d="M4 5V3.5h10V5M9 3.5v11M7 14.5h4"/>`),
    "<hr>",
    act("copy", L("コピー（Ctrl+C）", "Copy (Ctrl+C)"), `<rect x="6" y="6" width="9" height="9"/><path d="M12 3H3v9"/>`),
    act("paste", L("貼り付け（Ctrl+V）", "Paste (Ctrl+V)"), `<rect x="3.5" y="4" width="11" height="11.5"/><path d="M6.5 4V2.5h5V4M9 7v5M6.8 10L9 12.2 11.2 10"/>`),
    act("flipH", L("左右反転（H）", "Flip horizontally (H)"), `<path d="M9 2v14" stroke-dasharray="2 2"/><path d="M7 5v8H2zM11 5v8h5z"/>`),
    act("flipV", L("上下反転（V）", "Flip vertically (V)"), `<path d="M2 9h14" stroke-dasharray="2 2"/><path d="M5 7h8V2zM5 11h8v5z"/>`),
    act("rotate", L("右に 90 度回す（選択した範囲）", "Rotate right by 90 degrees (the selection)"), `<path d="M14.5 9a5.5 5.5 0 1 1-2-4.2"/><path d="M13 1.5v3.8H9.2"/>`),
    act("invert", L("点灯と消灯を反転（I）", "Invert (I)"), `<circle cx="9" cy="9" r="6"/><path class="solid" d="M9 3a6 6 0 0 1 0 12z"/>`),
    act("left", L("左へ 1 ドット（選択がなければ全体を回す）", "Left by a dot (all of it goes round without a selection)"), `<path d="M15 9H3M7 5L3 9l4 4"/>`),
    act("right", L("右へ 1 ドット", "Right by a dot"), `<path d="M3 9h12M11 5l4 4-4 4"/>`),
    act("up", L("上へ 1 ドット", "Up by a dot"), `<path d="M9 15V3M5 7l4-4 4 4"/>`),
    act("down", L("下へ 1 ドット", "Down by a dot"), `<path d="M9 3v12M5 11l4 4 4-4"/>`),
    act("clear", L("消す（Del。選択がなければ全体）", "Clear (Del; all of it without a selection)"), `<path d="M3 5h12M7 5V3h4v2M5 5l1 10h6l1-10"/>`),
    ...(sprite ? [
      act("outline", L("縁取り（点灯の周り 1 ドットを消灯にして、背景と分ける）", "Outline (the dots around become off, to stand out of the background)"), `<rect x="2.5" y="2.5" width="13" height="13" stroke-dasharray="2 2"/><rect class="solid" x="6" y="6" width="6" height="6"/>`),
      act("opaque", L("透明をすべて消灯にする（背景を透かさない）", "All that is clear becomes off (nothing shows through)"), `<rect x="2.5" y="2.5" width="13" height="13"/><rect class="solid" x="6" y="6" width="6" height="6"/>`)
    ] : []),
    "<hr>",
    act("db", L("DB の行としてコピー（縦 8 ドットずつ、ASM 用）", "Copy as DB lines (columns of 8 dots, for assembly)"), `<text x="2" y="12">DB</text><path d="M2 3h14M2 15h14"/>`),
    act("gprint", L("GPRINT の行としてコピー（BASIC 用）", "Copy as GPRINT lines (for BASIC)"), `<text x="3" y="12">GP</text><path d="M2 3h14M2 15h14"/>`)
  ].join("\n  ");
}

/** The whole page, for pictures or for sprites. `resource` gives the address of a file in media/. */
export function lcdPage(kind: "lcd" | "spr", resource: (name: string) => string, cspSource: string, nonce: string): string {
  const sprite = kind === "spr";
  return `<!DOCTYPE html>
<html data-kind="${kind}" lang="${isEnglish() ? "en" : "ja"}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${resource("lcd.css")}" rel="stylesheet"><title>LCD</title></head>
<body><div id="app">
<header class="bar" id="top">
  <span class="group"><button data-act="undo" title="Ctrl+Z">${L("元に戻す", "Undo")}</button><button data-act="redo" title="Ctrl+Y">${L("やり直す", "Redo")}</button></span>
  <span class="group"><button data-act="zoomOut" title="${L("縮小（-、ホイール）", "Zoom out (-, wheel)")}">−</button><span id="zoomText">4x</span><button data-act="zoomIn" title="${L("拡大（+、ホイール）", "Zoom in (+, wheel)")}">＋</button><button data-act="tall" title="${L("高さいっぱいに拡大する（9）", "Fill the height (9)")}">${L("大きく", "Large")}</button><button data-act="fit" title="${L("全体を表示する（0）", "Show all of it (0)")}">${L("全体", "All")}</button></span>
  <label title="G"><input type="checkbox" id="grid">${L("方眼", "Grid")}</label>
  <label><input type="checkbox" id="guide">${L("8 ドットの線", "8-dot lines")}</label>
  <label title="${L("表示 RAM の区切り（x = 64、120、176）", "Where the display RAM is divided (x = 64, 120, 176)")}"${sprite ? " hidden" : ""}><input type="checkbox" id="areas">${L("コントローラの境", "Controller borders")}</label>
  <label title="${L("前のコマを薄く重ねる", "Shows the frame before faintly")}"${sprite ? "" : " hidden"}><input type="checkbox" id="onion">${L("前のコマ", "Frame Before")}</label>
  <label><input type="checkbox" id="gaps">${L("ドットの間", "Dot gaps")}</label>
  <span class="group"><button data-act="import" title="${L("PNG や JPEG を白黒にして置く", "Places a PNG or JPEG in black and white")}">${L("画像を読み込む", "Import Image")}</button><button data-act="png">${L("PNG に保存", "Save as PNG")}</button></span>
</header>
<div class="bar options" id="options">
  <span class="group" id="inkBar"><span>${L("描き方", "Ink")}</span><select id="ink"><option value="auto">${sprite ? L("自動（点灯 → 消灯 → 透明）", "Auto (on, off, clear)") : L("自動（点いていれば消す）", "Auto (clears what is on)")}</option><option value="on">${L("点灯", "On")}</option>${sprite ? `<option value="white">${L("消灯（背景を隠す）", "Off (hides the background)")}</option><option value="off">${L("透明", "Clear")}</option>` : `<option value="off">${L("消灯", "Off")}</option>`}<option value="invert">${L("反転", "Invert")}</option></select></span>
  <span class="group" id="brushBar" title="[ ]"><span>${L("太さ", "Width")}</span><select id="brush">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">${n}</option>`).join("")}</select></span>
  <label id="clearLabel" title="${L("動かす・貼り付ける範囲の、消えているドットで下の絵を消さない", "The dots that are off do not clear what is under them")}"><input type="checkbox" id="clearBox">${L("透過", "Transparent")}</label>
  <span class="group" id="textBar"><input type="text" id="text" placeholder="${L("文字", "Text")}"><input type="number" id="textSize" min="5" max="32" value="8" title="${L("大きさ", "Size")}"><select id="textFont" title="${L("書体", "Font")}"><option value="dots">${L("5×7 ドット", "5 x 7 dots")}</option><option value="'MS Gothic', monospace">MS Gothic</option><option value="Meiryo, sans-serif">Meiryo</option><option value="Consolas, monospace">Consolas</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option></select><label><input type="checkbox" id="textBold">${L("太字", "Bold")}</label><span>${L("濃さ", "Weight")}</span><input type="range" id="textLimit" min="20" max="235" value="110" dir="rtl"></span>
  <span class="group" id="imageBar"><label><input type="checkbox" id="imageFit" checked>${L("画面に合わせる", "Fit the screen")}</label><label><input type="checkbox" id="imageDither">${L("網点", "Dither")}</label><label><input type="checkbox" id="imageInvert">${L("反転", "Invert")}</label><span>${L("濃さ", "Darkness")}</span><input type="range" id="imageLimit" min="10" max="245" value="128"></span>
  <span class="group" id="placeBar"><button class="main" data-act="place">${L("置く", "Place")}</button><button data-act="cancel">${L("キャンセル", "Cancel")}</button></span>
  <span id="hint"></span>
</div>
<div id="work">
<nav id="tools">
  ${tools(sprite)}
</nav>
<main id="view"><canvas id="glass" tabindex="0"></canvas></main>
</div>
<footer>
  <div class="sprite"${sprite ? "" : " hidden"}>
    <div class="strip" id="strip"></div>
    <span class="group"><button data-act="frameAdd" title="${L("今のコマの後に、空のコマを入れる", "Adds an empty frame after this one")}">${L("追加", "Add")}</button><button data-act="frameCopy" title="${L("今のコマのコピーを入れる", "Adds a copy of this one")}">${L("複製", "Duplicate")}</button><button data-act="frameLeft" title="${L("前へ", "Earlier")}">◀</button><button data-act="frameRight" title="${L("後へ", "Later")}">▶</button><button data-act="frameDelete">${L("コマを削除", "Delete Frame")}</button></span>
    <span class="group"><span>${L("大きさ", "Size")}</span><input type="number" id="sizeW" min="1" max="64" title="${L("幅（1〜64）", "Width (1-64)")}">×<select id="sizeH" title="${L("高さ", "Height")}"><option>8</option><option>16</option><option>24</option><option>32</option></select></span>
    <label title="${L("マスクなしにすると、ファイルが半分になり、消灯のドットは透明になる", "Without one the file is half as big, and dots that are off are clear")}"><input type="checkbox" id="mask">${L("マスク", "Mask")}</label>
    <span class="group"><label><input type="checkbox" id="play">${L("再生", "Play")}</label><input type="number" id="fps" min="1" max="30" value="6" title="${L("1 秒のコマ数", "Frames a second")}"></span>
  </div>
  <canvas id="mini" width="240" height="32" title="${L("全体。ドラッグで見る場所を動かす", "All of it. Drag to move the view")}"></canvas>
  <div class="status"><span id="where">&nbsp;</span><span id="about"></span><button data-act="other">${L("ほかの方法で開く", "Open With...")}</button></div>
</footer>
</div>
<script nonce="${nonce}" src="${resource("lcd.js")}"></script>
</body></html>`;
}

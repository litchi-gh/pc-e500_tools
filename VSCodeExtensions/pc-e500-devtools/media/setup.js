// @ts-check
// The page of the setup check.
(function () {
  // @ts-ignore given by VS Code
  const vscode = acquireVsCodeApi();
  const EN = document.documentElement.lang === "en";
  const L = (/** @type {string} */ ja, /** @type {string} */ en) => EN ? en : ja;
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const MARK = /** @type {Record<string, string>} */ ({ ok: "✓", warn: "!", error: "✕", info: "–" });
  const SAID = /** @type {Record<string, string>} */ ({ ok: L("使えます", "OK"), warn: L("注意", "Note"), error: L("要対応", "To fix"), info: L("任意", "Optional") });
  const element = (/** @type {string} */ tag, /** @type {string} */ name, text = "") => {
    const e = document.createElement(tag);
    if (name) e.className = name;
    e.textContent = text;
    return e;
  };
  $("check").addEventListener("click", () => vscode.postMessage({ type: "check" }));
  $("settings").addEventListener("click", () => vscode.postMessage({ type: "settings" }));
  window.addEventListener("message", event => {
    const m = event.data;
    document.body.classList.toggle("busy", m.type === "busy");
    /** @type {HTMLButtonElement} */ ($("check")).disabled = m.type === "busy";
    if (m.type === "busy") { $("summary").textContent = L("確認中…", "Checking…"); return; }
    if (m.type !== "checks") return;
    $("summary").textContent = m.summary.text;
    $("summary").className = m.summary.state;
    for (const group of ["assembler", "emulator"]) {
      const rows = [];
      for (const c of m.checks.filter((/** @type {any} */ x) => x.group === group)) {
        const row = element("div", `row ${c.state}`), mark = element("span", "mark", MARK[c.state]);
        mark.setAttribute("aria-hidden", "true");
        const text = element("div", "text"), title = element("div", "title", c.title);
        title.append(element("span", "said", SAID[c.state]));
        text.append(title);
        for (const line of c.lines) text.append(element("div", "line", line));
        const buttons = element("span", "buttons");
        c.fixes.forEach((/** @type {any} */ f, /** @type {number} */ index) => {
          const b = element("button", f.kind === "use" ? "main" : "", f.label);
          if (f.value) b.title = f.value;
          b.addEventListener("click", () => vscode.postMessage({ type: "fix", id: c.id, index }));
          buttons.append(b);
        });
        row.append(mark, text, buttons);
        rows.push(row);
      }
      $(group).replaceChildren(...rows);
    }
  });
  vscode.postMessage({ type: "ready" });
})();

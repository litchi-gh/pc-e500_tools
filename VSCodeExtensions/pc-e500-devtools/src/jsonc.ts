/** JSON as VS Code's settings have it: // and /* *\/ comments go, and a comma before a bracket. */
export function plainJson(text: string): string {
  let out = "", quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') quote = false;
    } else if (c === '"') { quote = true; out += c; }
    else if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; }
    else if (c === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) { if (text[i] === "\n") out += "\n"; i++; } i++; }
    // A comma before the bracket is let go (outside strings: here).
    else if (c === "}" || c === "]") out = out.replace(/,(\s*)$/, "$1") + c;
    else out += c;
  }
  return out;
}

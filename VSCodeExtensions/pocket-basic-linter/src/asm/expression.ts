// Port of Assembler/src/E500Assembler.Core/Expression.cs (Expression, Syntax).
// Values are bigint so that 64-bit shifts and overflow checks match the C# assembler.

export class AssemblyError extends Error {
  constructor(message: string, readonly code: string = "ASM020") {
    super(message);
  }
}

export class DivideByZeroError extends AssemblyError {
  constructor() {
    super("0 で除算しています。", "ASM040");
  }
}

export type SymbolResolver = (name: string) => bigint;

const INT64_MAX = (1n << 63n) - 1n;
const INT64_MIN = -(1n << 63n);

function checked(value: bigint): bigint {
  if (value > INT64_MAX || value < INT64_MIN) throw new AssemblyError("演算結果が 64 ビットを超えました。", "ASM040");
  return value;
}

export function isNameStart(ch: string): boolean {
  return /^[\p{L}_.]$/u.test(ch);
}

function isNamePart(ch: string): boolean {
  return /^[\p{L}\p{Nd}_.]$/u.test(ch);
}

function isHexDigit(ch: string): boolean {
  return /^[0-9A-Fa-f]$/.test(ch);
}

class Parser {
  private pos = 0;

  constructor(private readonly text: string, private readonly symbol: SymbolResolver, private readonly pc: number) {}

  evaluate(): bigint {
    const value = this.binary(0);
    this.space();
    if (this.pos !== this.text.length) throw new AssemblyError(`式の末尾に解釈できない文字があります: ${this.text.slice(this.pos)}`, "ASM010");
    return value;
  }

  private space(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos += 1;
  }

  private binary(minimum: number): bigint {
    let left = this.atom();
    for (;;) {
      this.space();
      const two = this.text.slice(this.pos, this.pos + 2);
      const op = two === "<<" || two === ">>" ? two : this.pos < this.text.length ? this.text[this.pos] : "";
      const priority = op === "|" ? 1 : op === "^" ? 2 : op === "&" ? 3 : op === "<<" || op === ">>" ? 4 : op === "+" || op === "-" ? 5 : op === "*" || op === "/" || op === "%" ? 6 : -1;
      if (priority < minimum) return left;
      this.pos += op.length;
      const right = this.binary(priority + 1);
      switch (op) {
        case "+": left = checked(left + right); break;
        case "-": left = checked(left - right); break;
        case "*": left = checked(left * right); break;
        case "/": if (right === 0n) throw new DivideByZeroError(); left = left / right; break;
        case "%": if (right === 0n) throw new DivideByZeroError(); left = left % right; break;
        case "&": left &= right; break;
        case "|": left |= right; break;
        case "^": left ^= right; break;
        case "<<":
          if (right < 0n || right > 63n) throw new AssemblyError("シフト量は 0～63 です。", "ASM040");
          left = BigInt.asIntN(64, left << right);
          break;
        case ">>":
          if (right < 0n || right > 63n) throw new AssemblyError("シフト量は 0～63 です。", "ASM040");
          left >>= right;
          break;
        default: throw new AssemblyError("不正な演算子です。", "ASM010");
      }
    }
  }

  private atom(): bigint {
    this.space();
    if (this.pos === this.text.length) throw new AssemblyError("式がありません。", "ASM010");
    const ch = this.text[this.pos];
    this.pos += 1;
    if (ch === "+" || ch === "-" || ch === "~") {
      const v = this.atom();
      return ch === "-" ? checked(-v) : ch === "~" ? ~v : v;
    }
    if (ch === "(") {
      const v = this.binary(0);
      this.space();
      if (this.pos >= this.text.length || this.text[this.pos] !== ")") throw new AssemblyError("式の ')' がありません。", "ASM010");
      this.pos += 1;
      return v;
    }
    if (ch === "'") {
      const start = this.pos - 1;
      while (this.pos < this.text.length) {
        const c = this.text[this.pos];
        this.pos += 1;
        if (c === "\\" && this.pos < this.text.length) this.pos += 1;
        else if (c === "'") break;
      }
      const s = parseString(this.text.slice(start, this.pos));
      if (s.length !== 1 || s.charCodeAt(0) > 255) throw new AssemblyError("文字定数は 1 バイトの文字 1 つです。", "ASM040");
      return BigInt(s.charCodeAt(0));
    }
    if (ch === "$" && (this.pos === this.text.length || !isHexDigit(this.text[this.pos]))) return BigInt(this.pc);
    if (ch === "*") return BigInt(this.pc);
    if (/[0-9]/.test(ch) || ch === "$" || ch === "&") {
      const start = this.pos - 1;
      while (this.pos < this.text.length && /[\p{L}\p{Nd}_]/u.test(this.text[this.pos])) this.pos += 1;
      const raw = this.text.slice(start, this.pos);
      let n = raw.replace(/_/g, "");
      let radix = 10;
      if (n[0] === "$" || n[0] === "&") { n = n.slice(1); radix = 16; }
      else if (/^0x/i.test(n)) { n = n.slice(2); radix = 16; }
      else if (/^0b/i.test(n)) { n = n.slice(2); radix = 2; }
      else if (/h$/i.test(n)) { n = n.slice(0, -1); radix = 16; }
      const valid = radix === 16 ? /^[0-9A-Fa-f]+$/ : radix === 2 ? /^[01]+$/ : /^[0-9]+$/;
      if (!valid.test(n)) {
        const body = raw.slice(1, -1);
        const hint = /^0b.*h$/i.test(raw) ? `（B で始まる 16 進数は e500asm が 2 進数と解釈するため、$${body} または &${body} と書きます）` : "";
        throw new AssemblyError(`数値 ${raw} を解釈できません。${hint}`, "ASM010");
      }
      const value = BigInt((radix === 16 ? "0x" : radix === 2 ? "0b" : "") + n);
      if (value > INT64_MAX) throw new AssemblyError(`数値 ${raw} を解釈できません。`, "ASM010");
      return value;
    }
    if (isNameStart(ch)) {
      const start = this.pos - 1;
      while (this.pos < this.text.length && isNamePart(this.text[this.pos])) this.pos += 1;
      const name = this.text.slice(start, this.pos);
      this.space();
      if (this.pos < this.text.length && this.text[this.pos] === "(") {
        this.pos += 1;
        const v = this.binary(0);
        this.space();
        if (this.pos >= this.text.length || this.text[this.pos] !== ")") throw new AssemblyError("関数の ')' がありません。", "ASM010");
        this.pos += 1;
        switch (name.toUpperCase()) {
          case "LOW": return v & 255n;
          case "HIGH": return (v >> 8n) & 255n;
          case "BANK": return (v >> 16n) & 15n;
          default: throw new AssemblyError(`不明な関数 ${name} です。`, "ASM020");
        }
      }
      return this.symbol(name);
    }
    throw new AssemblyError(`式に使用できない文字です: ${ch}`, "ASM010");
  }
}

export function evaluate(text: string, symbol: SymbolResolver, pc: number): bigint {
  return new Parser(text, symbol, pc).evaluate();
}

/** Remove a ';' comment, honouring quoted strings. */
export function stripComment(s: string): string {
  let quote = "";
  for (let i = 0; i < s.length; i += 1) {
    if (quote) {
      if (s[i] === "\\") i += 1;
      else if (s[i] === quote) quote = "";
    } else if (s[i] === "'" || s[i] === '"') {
      quote = s[i];
    } else if (s[i] === ";") {
      return s.slice(0, i);
    }
  }
  if (quote) throw new AssemblyError("文字列が閉じていません。", "ASM010");
  return s;
}

/** Split an operand list on top-level commas. */
export function splitOperands(s: string): string[] {
  if (!s.trim()) return [];
  const parts: string[] = [];
  let start = 0;
  const brackets: string[] = [];
  let quote = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(" || c === "[") brackets.push(c);
    else if (c === ")" || c === "]") {
      if (brackets.length === 0 || brackets.pop() !== (c === ")" ? "(" : "[")) throw new AssemblyError("括弧の対応が取れていません。", "ASM010");
    } else if (c === "," && brackets.length === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote || brackets.length !== 0) throw new AssemblyError("文字列または括弧が閉じていません。", "ASM010");
  parts.push(s.slice(start).trim());
  if (parts.some(p => p.length === 0)) throw new AssemblyError("空のオペランドがあります。", "ASM010");
  return parts;
}

/** Decode a quoted string literal with C-style escapes. Each character is a byte value (0..255) unless the source contained non-Latin-1 text. */
export function parseString(s: string): string {
  if (s.length < 2 || (s[0] !== '"' && s[0] !== "'") || s[s.length - 1] !== s[0]) throw new AssemblyError("引用符で囲んだ文字列が必要です。", "ASM010");
  let result = "";
  for (let i = 1; i < s.length - 1; i += 1) {
    let c = s[i];
    if (c === s[0]) throw new AssemblyError("文字列の途中に引用符があります。", "ASM010");
    if (c === "\\") {
      i += 1;
      if (i >= s.length - 1) throw new AssemblyError("エスケープが不完全です。", "ASM010");
      const e = s[i];
      switch (e) {
        case "n": c = "\n"; break;
        case "r": c = "\r"; break;
        case "t": c = "\t"; break;
        case "0": c = "\0"; break;
        case "\\": c = "\\"; break;
        case "'": c = "'"; break;
        case '"': c = '"'; break;
        case "x": {
          const hex = s.slice(i + 1, i + 3);
          if (i + 2 >= s.length - 1 || !/^[0-9A-Fa-f]{2}$/.test(hex)) throw new AssemblyError("\\x には 16 進数 2 桁が必要です。", "ASM010");
          c = String.fromCharCode(parseInt(hex, 16));
          i += 2;
          break;
        }
        default: throw new AssemblyError(`不明なエスケープ \\${e} です。`, "ASM010");
      }
    }
    result += c;
  }
  return result;
}

import { Dialect, LintIssue, LintOptions, ParsedLine } from "../core";
import { L } from "../l10n";
import { maskStringsAndComments, splitStatements } from "./text";

const labelPattern = /^(?:\*[A-Z][A-Z0-9]*\b|"[^"]*"\s*(?=:|$|[A-Z]))/i;
/** The longest line LOAD takes, its number included. */
const LONGEST = 254;
// Words of other statements: one that begins a name (TOTAL) does not make it a statement.
const INNER = new Set(["TO", "AS", "THEN", "STEP", "USING", "OUTPUT", "APPEND", "DEFAULT"]);

/** Whether a statement sets a variable or an element, A=, A$(B(1)+1)=, the subscripts read to their closing parenthesis. */
function isAssignment(masked: string): boolean {
  const name = /^(?:LET\s*)?[A-Z][A-Z0-9]*[$#!]?\s*/i.exec(masked);
  if (!name) return false;
  let i = name[0].length;
  if (masked[i] === "(") {
    let depth = 0;
    do {
      if (masked[i] === "(") depth += 1;
      if (masked[i] === ")") depth -= 1;
      i += 1;
    } while (i < masked.length && depth > 0);
  }
  return /^\s*=/.test(masked.slice(i));
}

/** The statement a text starts with, as the machine reads it: spaces are not needed (GOTO30, PRINTA), and a word may be cut with a period (P.). */
function statementWord(masked: string, dialect: Dialect): { word: string; length: number; known: boolean } | undefined {
  const match = /^([A-Z][A-Z0-9]*[$#]?)/i.exec(masked);
  if (!match) return undefined;
  // "PRINT# 1" is PRINT with a file number.
  const whole = match[1].toUpperCase().replace(/#$/, "");
  if (dialect.statements.has(whole)) return { word: whole, length: match[0].length, known: true };
  const cut = /^([A-Z]+)\./i.exec(masked);
  if (cut) {
    const word = [...dialect.statements].filter(w => w.startsWith(cut[1].toUpperCase())).sort()[0];
    if (word) return { word, length: cut[0].length, known: true };
  }
  for (let n = whole.length - 1; n >= 2; n -= 1) {
    const word = whole.slice(0, n);
    if (dialect.statements.has(word) && !INNER.has(word)) return { word, length: n, known: true };
  }
  return { word: whole, length: match[0].length, known: false };
}

function issue(code: string, message: string, severity: LintIssue["severity"], line: number, start: number, end: number): LintIssue {
  return { code, message, severity, range: { line, start, end: Math.max(start + 1, end) } };
}

function parseLines(source: string, dialect: Dialect, options: LintOptions, issues: LintIssue[]): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  const seen = new Map<number, number>();
  let previous: number | undefined;

  // Lines as LOAD and the editor take them; 1Ah ends a file of the machine's.
  source.replace(/\u001a\s*$/, "").split(/\r\n?|\n/).forEach((text, sourceLine) => {
    if (!text.trim()) return;
    const match = /^(\s*)(\d+)\s*(.*)$/.exec(text);
    if (!match) {
      if (options.requireLineNumbers) {
        issues.push(issue("E500001", L("行番号がありません。", "Missing line number."), "error", sourceLine, 0, text.length));
      }
      parsed.push({ sourceLine, source: text, bodyOffset: 0, body: text });
      return;
    }

    const lineNumber = Number(match[2]);
    const numberStart = match[1].length;
    if (lineNumber < dialect.minLineNumber || lineNumber > dialect.maxLineNumber) {
      issues.push(issue("E500002", L(`行番号は ${dialect.minLineNumber}～${dialect.maxLineNumber} の範囲で指定します。`, `A line number must be ${dialect.minLineNumber} to ${dialect.maxLineNumber}.`), "error", sourceLine, numberStart, numberStart + match[2].length));
    }
    if (seen.has(lineNumber)) {
      issues.push(issue("E500003", L(`行番号 ${lineNumber} が重複しています（後の行だけが残ります）。`, `Duplicate line number ${lineNumber}.`), "warning", sourceLine, numberStart, numberStart + match[2].length));
    } else {
      seen.set(lineNumber, sourceLine);
    }
    if (previous !== undefined && lineNumber < previous) {
      issues.push(issue("E500004", L("行番号が昇順になっていません。", "Line numbers are not in ascending order."), "warning", sourceLine, numberStart, numberStart + match[2].length));
    }
    previous = lineNumber;
    const bodyOffset = text.length - match[3].length;
    if (!match[3].trim()) issues.push(issue("E500006", L("行番号だけの行です。LOAD がここで止まります。", "A line with only a number: LOAD stops here."), "error", sourceLine, numberStart, numberStart + match[2].length));
    const size = text.trim().length;
    if (size > LONGEST) issues.push(issue("E500007", L(`行が長すぎます（${size} 文字）。LOAD できるのは ${LONGEST} 文字までです。`, `The line is too long (${size} characters). LOAD takes ${LONGEST}.`), "error", sourceLine, LONGEST, text.length));
    parsed.push({ sourceLine, source: text, lineNumber, bodyOffset, body: match[3] });
  });
  return parsed;
}

/** Whether a string is not closed (quotes in a comment do not count). */
function hasOpenQuote(body: string, dialect: Dialect): boolean {
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '"') inString = !inString;
    else if (!inString && dialect.isCommentStart(body, i)) return false;
  }
  return inString;
}

export function lint(source: string, dialect: Dialect, options: LintOptions): LintIssue[] {
  const issues: LintIssue[] = [];
  const lines = parseLines(source, dialect, options, issues);
  const lineNumbers = new Set(lines.flatMap(line => line.lineNumber === undefined ? [] : [line.lineNumber]));
  const labels = new Set<string>();
  /** `doubtful`: WHILEA=0, which a ROM without WHILE takes for a variable. */
  const stack: Array<{ opener: string; closer: string; line: ParsedLine; start: number; doubtful: boolean }> = [];

  for (const line of lines) {
    const label = /^\s*\*([A-Z][A-Z0-9]*)\b/i.exec(line.body);
    if (label) {
      const normalized = label[1].toUpperCase();
      if (labels.has(normalized)) {
        issues.push(issue("E500005", L(`ラベル *${label[1]} が重複しています。`, `Duplicate label *${label[1]}.`), "error", line.sourceLine, line.bodyOffset + (label.index ?? 0), line.bodyOffset + (label.index ?? 0) + label[0].length));
      }
      labels.add(normalized);
    }
  }

  for (const line of lines) {
    const masked = maskStringsAndComments(line.body, dialect);
    const isData = /(?:^|:)\s*(?:\*[A-Z][A-Z0-9]*\s+)?DATA/i.test(masked);
    checkCharacters(line, issues, dialect);
    // The machine closes it at the end of the line (not after INPUT).
    if (hasOpenQuote(line.body, dialect) && !isData) {
      issues.push(issue("E500010", L("文字列リテラルの引用符が閉じていません。", "Unterminated string literal."), /INPUT\s*$/i.test(line.body.slice(0, line.body.lastIndexOf('"'))) ? "error" : "warning", line.sourceLine, line.bodyOffset + line.body.lastIndexOf('"'), line.source.length));
    }
    // DATA may intentionally contain unmatched display characters as raw data.
    if (!isData) {
      let depth = 0;
      for (let i = 0; i < masked.length; i += 1) {
        if (masked[i] === "(") depth += 1;
        if (masked[i] === ")") depth -= 1;
        if (depth < 0) {
          issues.push(issue("E500011", L("対応する開き括弧がありません。", "No matching opening parenthesis."), "error", line.sourceLine, line.bodyOffset + i, line.bodyOffset + i + 1));
          depth = 0;
        }
      }
      if (depth > 0) {
        issues.push(issue("E500012", L("閉じ括弧が不足しています。", "Missing closing parenthesis."), "error", line.sourceLine, line.bodyOffset, line.source.length));
      }
    }

    for (const segment of splitStatements(line.body, dialect)) {
      const text = segment.text, leading = text.length - text.trimStart().length;
      check(line, text.trim(), masked.slice(segment.offset + leading, segment.offset + text.length), line.bodyOffset + segment.offset + leading);
    }
  }

  // One statement: its text, the same with strings blanked, and where it starts.
  function check(line: ParsedLine, text: string, blank: string, at: number, inIf = false): void {
    let statement = text, masked = blank, start = at;
    if (!statement || dialect.isCommentStart(statement, 0)) return;
    const label = labelPattern.exec(statement);
    if (label) {
      const rest = statement.slice(label[0].length);
      const skip = label[0].length + rest.length - rest.trimStart().length;
      statement = statement.slice(skip); masked = masked.slice(skip); start += skip;
      if (!statement || dialect.isCommentStart(statement, 0)) return;
    }
    // FORI=1TO3 is FOR, as the machine reads it.
    const isFor = /^FOR\s*[A-Z][A-Z0-9]*\s*=.*TO/i.test(masked);
    if ((!isFor && !/^(?:IF.*(?:THEN|GOTO|GOSUB)|WHILE|UNTIL)/i.test(masked) && isAssignment(masked))) return;

    const found = isFor ? { word: "FOR", length: 3, known: true } : statementWord(masked, dialect);
    if (!found) {
      issues.push(issue("E500020", L("文の先頭を解釈できません。", "Cannot read the start of the statement."), "error", line.sourceLine, start, start + statement.length));
      return;
    }
    const { word } = found;
    if (!found.known) {
      const message = dialect.functions.has(word)
        ? L(`${word} は関数であり、文の先頭では使用できません。`, `${word} is a function and cannot start a statement.`)
        : L(`PC-E500 BASIC にない命令 '${word}' です。`, `'${word}' is not a PC-E500 BASIC statement.`);
      issues.push(issue("E500021", message, "error", line.sourceLine, start, start + found.length));
      return;
    }
    if (word === "REM") return;

    // What a line runs after THEN, ELSE or the condition is its statements too.
    if (word === "IF") {
      const inner = /THEN|ELSE/gi, parts: number[] = [];
      for (const m of masked.matchAll(inner)) parts.push(m.index! + m[0].length);
      const plain = /(?<![A-Z])(?:FOR\s*[A-Z][A-Z0-9]*\s*=.*TO|NEXT(?![A-Z0-9]*\s*=))/i.exec(masked);
      if (parts.length === 0 && plain) parts.push(plain.index);
      parts.forEach((from, i) => {
        const next = parts[i + 1];
        const to = next === undefined ? masked.length : next - 4;
        const blanks = masked.slice(from, to).length - masked.slice(from, to).trimStart().length;
        const body = statement.slice(from + blanks, to).trimEnd();
        if (!/^(?:\d|\*|"|$)/.test(body)) check(line, body, masked.slice(from + blanks, to), start + from + blanks, true);
      });
    }

    const expectedCloser = dialect.structuralPairs.get(word);
    const doubtful = /^(?:WHILE|UNTIL)[A-Z0-9$]/i.test(masked) && isAssignment(masked);
    if (expectedCloser) {
      stack.push({ opener: word, closer: expectedCloser, line, start, doubtful });
    } else if (inIf) {
      // One that a condition leaves out ends nothing.
    } else if ([...dialect.structuralPairs.values()].includes(word)) {
      const open = stack.at(-1);
      if (!open || open.closer !== word) {
        // A FOR may be left by a jump and have more than one NEXT.
        issues.push(issue("E500030", L(`${word} に対応する開始文がありません。`, `${word} has no matching opening statement.`), word === "NEXT" || doubtful ? "warning" : "error", line.sourceLine, start, start + word.length));
      } else {
        stack.pop();
      }
    }

    if ((word === "FOR" && !/TO/i.test(masked.slice(3))) || (word === "ON" && !/GOTO|GOSUB|ERROR/i.test(masked))) {
      issues.push(issue("E500022", L(`${word} 文の必須キーワードがありません。`, `A required keyword of ${word} is missing.`), "error", line.sourceLine, start, start + statement.length));
    }

    if (options.checkMissingTargets && (dialect.targetStatements.has(word) || word === "ON" || word === "IF")) {
      for (const target of extractTargets(masked, word, found.length)) {
        if (target.kind === "line" && !lineNumbers.has(Number(target.value)) && !(target.value === "0" && (word === "RESUME" || /^ON\s*ERROR/i.test(masked)))) {
          issues.push(issue("E500040", L(`参照先の行番号 ${target.value} がありません。`, `Line ${target.value} does not exist.`), "warning", line.sourceLine, start + target.index, start + target.index + target.value.length));
        }
        if (target.kind === "label" && !labels.has(target.value.slice(1).toUpperCase())) {
          issues.push(issue("E500041", L(`参照先のラベル ${target.value} がありません。`, `Label ${target.value} does not exist.`), "warning", line.sourceLine, start + target.index, start + target.index + target.value.length));
        }
      }
    }
  }

  for (const open of stack) {
    issues.push(issue("E500031", L(`${open.opener} に対応する ${open.closer} がありません。`, `${open.opener} has no matching ${open.closer}.`), open.opener === "FOR" || open.doubtful ? "warning" : "error", open.line.sourceLine, open.start, open.start + open.opener.length));
  }
  return issues;
}

interface Target { kind: "line" | "label"; value: string; index: number }

function extractTargets(masked: string, firstWord: string, length: number): Target[] {
  const result: Target[] = [];
  const add = (value: string, index: number): void => { result.push({ kind: value.startsWith("*") ? "label" : "line", value, index }); };
  if (firstWord === "IF") {
    for (const m of masked.matchAll(/(?:THEN|ELSE|GOTO|GOSUB)\s*(\d+|\*[A-Z][A-Z0-9]*)/gi)) add(m[1], m.index! + m[0].length - m[1].length);
    return result;
  }
  let offset = length;
  if (firstWord === "ON") {
    const branch = /GOTO|GOSUB/i.exec(masked);
    if (!branch) return [];
    offset = branch.index + branch[0].length;
  }
  for (const m of masked.slice(offset).matchAll(/(?:^|,)\s*(\d+|\*[A-Z][A-Z0-9]*)\b/gi)) add(m[1], offset + m.index! + m[0].lastIndexOf(m[1]));
  return result;
}

/** Characters the machine does not have: they would be left out, and code would mean something else. */
function checkCharacters(line: ParsedLine, issues: LintIssue[], dialect: Dialect): void {
  let inString = false;
  for (let i = 0; i < line.body.length; i += 1) {
    const c = line.body[i];
    if (c === '"') { inString = !inString; continue; }
    if (!inString && dialect.isCommentStart(line.body, i)) return;
    if (/[\t\u0020-\u007e\uff61-\uff9f¥]/.test(c)) continue;
    const message = c === "\ufffd"
      ? L("UTF-8 で保存されていないファイルです。", "The file is not saved as UTF-8.")
      : L(`本体にない文字 '${c}' です（読み込むと抜けます）。`, `'${c}' is not a character of the machine, and is left out.`);
    issues.push(issue("E500008", message, inString && c !== "\ufffd" ? "warning" : "error", line.sourceLine, line.bodyOffset + i, line.bodyOffset + i + 1));
    return;
  }
}

import { Dialect, LintIssue, LintOptions, ParsedLine } from "../core";
import { maskStringsAndComments, splitStatements } from "./text";

const assignmentPattern = /^(?:LET\s+)?[A-Z][A-Z0-9]*(?:[$#])?(?:\s*\([^)]*\))?\s*=/i;
const labelPattern = /^\*[A-Z][A-Z0-9]*\b/i;

function issue(code: string, message: string, severity: LintIssue["severity"], line: number, start: number, end: number): LintIssue {
  return { code, message, severity, range: { line, start, end: Math.max(start + 1, end) } };
}

function parseLines(source: string, dialect: Dialect, options: LintOptions, issues: LintIssue[]): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  const seen = new Map<number, number>();
  let previous: number | undefined;

  source.split(/\r?\n/).forEach((text, sourceLine) => {
    if (!text.trim()) return;
    const match = /^(\s*)(\d+)(?:\s+|$)(.*)$/.exec(text);
    if (!match) {
      if (options.requireLineNumbers) {
        issues.push(issue("E500001", "行番号がありません。", "error", sourceLine, 0, text.length));
      }
      parsed.push({ sourceLine, source: text, bodyOffset: 0, body: text });
      return;
    }

    const lineNumber = Number(match[2]);
    const numberStart = match[1].length;
    if (lineNumber < dialect.minLineNumber || lineNumber > dialect.maxLineNumber) {
      issues.push(issue("E500002", `行番号は ${dialect.minLineNumber}～${dialect.maxLineNumber} の範囲で指定します。`, "error", sourceLine, numberStart, numberStart + match[2].length));
    }
    if (seen.has(lineNumber)) {
      issues.push(issue("E500003", `行番号 ${lineNumber} が重複しています。`, "error", sourceLine, numberStart, numberStart + match[2].length));
    } else {
      seen.set(lineNumber, sourceLine);
    }
    if (previous !== undefined && lineNumber < previous) {
      issues.push(issue("E500004", "行番号が昇順になっていません。", "warning", sourceLine, numberStart, numberStart + match[2].length));
    }
    previous = lineNumber;
    const bodyOffset = text.length - match[3].length;
    parsed.push({ sourceLine, source: text, lineNumber, bodyOffset, body: match[3] });
  });
  return parsed;
}

export function lint(source: string, dialect: Dialect, options: LintOptions): LintIssue[] {
  const issues: LintIssue[] = [];
  const lines = parseLines(source, dialect, options, issues);
  const lineNumbers = new Set(lines.flatMap(line => line.lineNumber === undefined ? [] : [line.lineNumber]));
  const labels = new Set<string>();
  const stack: Array<{ opener: string; closer: string; line: ParsedLine; start: number }> = [];

  for (const line of lines) {
    const label = /^\s*\*([A-Z][A-Z0-9]*)\b/i.exec(line.body);
    if (label) {
      const normalized = label[1].toUpperCase();
      if (labels.has(normalized)) {
        issues.push(issue("E500005", `ラベル *${label[1]} が重複しています。`, "error", line.sourceLine, line.bodyOffset + (label.index ?? 0), line.bodyOffset + (label.index ?? 0) + label[0].length));
      }
      labels.add(normalized);
    }
  }

  for (const line of lines) {
    const masked = maskStringsAndComments(line.body, dialect);
    const quoteCount = [...line.body].filter(char => char === '"').length;
    if (quoteCount % 2 !== 0) {
      issues.push(issue("E500010", "文字列リテラルの引用符が閉じていません。", "error", line.sourceLine, line.bodyOffset + line.body.lastIndexOf('"'), line.source.length));
    }
    // DATA may intentionally contain unmatched display characters as raw data.
    if (!/^\s*(?:\*[A-Z][A-Z0-9]*\s+)?DATA\b/i.test(line.body)) {
      let depth = 0;
      for (let i = 0; i < masked.length; i += 1) {
        if (masked[i] === "(") depth += 1;
        if (masked[i] === ")") depth -= 1;
        if (depth < 0) {
          issues.push(issue("E500011", "対応する開き括弧がありません。", "error", line.sourceLine, line.bodyOffset + i, line.bodyOffset + i + 1));
          depth = 0;
        }
      }
      if (depth > 0) {
        issues.push(issue("E500012", "閉じ括弧が不足しています。", "error", line.sourceLine, line.bodyOffset, line.source.length));
      }
    }

    for (const segment of splitStatements(line.body, dialect)) {
      let statement = segment.text.trim();
      if (!statement || statement.startsWith("'")) continue;
      const leading = segment.text.length - segment.text.trimStart().length;
      let start = line.bodyOffset + segment.offset + leading;
      if (labelPattern.test(statement)) {
        const labelMatch = labelPattern.exec(statement)!;
        statement = statement.slice(labelMatch[0].length).trimStart();
        start += segment.text.trimStart().length - statement.length;
        if (!statement) continue;
      }
      if (assignmentPattern.test(statement) || statement.startsWith("?")) continue;

      const wordMatch = /^([A-Z][A-Z0-9]*[$#]?)/i.exec(statement);
      if (!wordMatch) {
        issues.push(issue("E500020", "文の先頭を解釈できません。", "error", line.sourceLine, start, start + statement.length));
        continue;
      }
      const word = wordMatch[1].toUpperCase();
      if (!dialect.statements.has(word)) {
        const message = dialect.functions.has(word)
          ? `${word} は関数であり、文の先頭では使用できません。`
          : `PC-E500 BASIC にない命令 '${word}' です。`;
        issues.push(issue("E500021", message, "error", line.sourceLine, start, start + wordMatch[0].length));
        continue;
      }
      if (word === "REM") continue;

      const expectedCloser = dialect.structuralPairs.get(word);
      if (expectedCloser) {
        stack.push({ opener: word, closer: expectedCloser, line, start });
      } else if ([...dialect.structuralPairs.values()].includes(word)) {
        const open = stack.at(-1);
        if (!open || open.closer !== word) {
          issues.push(issue("E500030", `${word} に対応する開始文がありません。`, "error", line.sourceLine, start, start + word.length));
        } else {
          stack.pop();
        }
      }

      if ((word === "FOR" && !/\bTO\b/i.test(statement)) || (word === "ON" && !/\b(?:GOTO|GOSUB|ERROR)\b/i.test(statement))) {
        issues.push(issue("E500022", `${word} 文の必須キーワードがありません。`, "error", line.sourceLine, start, start + statement.length));
      }

      if (options.checkMissingTargets && (dialect.targetStatements.has(word) || word === "ON")) {
        const targets = extractTargets(statement, word);
        for (const target of targets) {
          if (target.kind === "line" && !lineNumbers.has(Number(target.value)) && !(word === "RESUME" && target.value === "0")) {
            issues.push(issue("E500040", `参照先の行番号 ${target.value} がありません。`, "warning", line.sourceLine, start + target.index, start + target.index + target.value.length));
          }
          if (target.kind === "label" && !labels.has(target.value.slice(1).toUpperCase())) {
            issues.push(issue("E500041", `参照先のラベル ${target.value} がありません。`, "warning", line.sourceLine, start + target.index, start + target.index + target.value.length));
          }
        }
      }
    }
  }

  for (const open of stack) {
    issues.push(issue("E500031", `${open.opener} に対応する ${open.closer} がありません。`, "error", open.line.sourceLine, open.start, open.start + open.opener.length));
  }
  return issues;
}

interface Target { kind: "line" | "label"; value: string; index: number }

function extractTargets(statement: string, firstWord: string): Target[] {
  let tail = "";
  let offset = 0;
  if (firstWord === "ON") {
    const branch = /\b(?:GOTO|GOSUB)\b/i.exec(statement);
    if (!branch) return [];
    offset = (branch.index ?? 0) + branch[0].length;
    tail = statement.slice(offset);
  } else {
    const keyword = new RegExp(`^${firstWord}\\b`, "i").exec(statement)!;
    offset = keyword[0].length;
    tail = statement.slice(offset);
  }
  const result: Target[] = [];
  const targetPattern = /(?:^|,)\s*(\d+|\*[A-Z][A-Z0-9]*)\b/gi;
  for (const match of tail.matchAll(targetPattern)) {
    const value = match[1];
    result.push({ kind: value.startsWith("*") ? "label" : "line", value, index: offset + (match.index ?? 0) + match[0].lastIndexOf(value) });
  }
  return result;
}

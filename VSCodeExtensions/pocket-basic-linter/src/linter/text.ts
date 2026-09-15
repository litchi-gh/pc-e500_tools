import { Dialect } from "../core";

export interface Segment {
  readonly text: string;
  readonly offset: number;
}

export function splitStatements(body: string, dialect: Dialect): Segment[] {
  const result: Segment[] = [];
  let start = 0;
  let inString = false;
  let depth = 0;

  for (let i = 0; i < body.length; i += 1) {
    const character = body[i];
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (dialect.isCommentStart(body, i)) {
      break;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === ":" && depth === 0) {
      result.push({ text: body.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  result.push({ text: body.slice(start), offset: start });
  return result;
}

export function maskStringsAndComments(text: string, dialect: Dialect): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') {
      inString = !inString;
      result += " ";
    } else if (!inString && dialect.isCommentStart(text, i)) {
      return result.padEnd(text.length, " ");
    } else {
      result += inString ? " " : text[i];
    }
  }
  return result;
}

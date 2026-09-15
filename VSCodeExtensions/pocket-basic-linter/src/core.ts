export type Severity = "error" | "warning" | "information";

export interface SourceRange {
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

export interface LintIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: Severity;
  readonly range: SourceRange;
}

export interface ParsedLine {
  readonly sourceLine: number;
  readonly source: string;
  readonly lineNumber?: number;
  readonly bodyOffset: number;
  readonly body: string;
}

export interface LintOptions {
  readonly requireLineNumbers: boolean;
  readonly checkMissingTargets: boolean;
}

export interface Dialect {
  readonly id: string;
  readonly displayName: string;
  readonly minLineNumber: number;
  readonly maxLineNumber: number;
  readonly statements: ReadonlySet<string>;
  readonly functions: ReadonlySet<string>;
  readonly structuralPairs: ReadonlyMap<string, string>;
  readonly targetStatements: ReadonlySet<string>;
  isCommentStart(text: string, index: number): boolean;
}

// Japanese or English, by VS Code's display language (set once at activation).
// Text is written as L("日本語", "English"), the way the PC-E500 emulator does it.
// Without VS Code (the unit tests) it stays Japanese.

let english = false;

/** Picks the language from a VS Code language id ("ja", "en", "en-us", "de" ...): Japanese for ja, English for the rest. */
export function setLanguage(language: string): void {
  english = !/^ja(\b|-)/i.test(language);
}

export function isEnglish(): boolean {
  return english;
}

/** The text in the language in use. */
export function L(ja: string, en: string): string {
  return english ? en : ja;
}

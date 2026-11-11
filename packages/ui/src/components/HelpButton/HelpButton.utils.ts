/** Абзацы пояснения: текст делится по пустым строкам, пустые куски выбрасываются. */
export const helpParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

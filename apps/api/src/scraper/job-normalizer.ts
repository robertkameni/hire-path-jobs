const normalizeNewlines = (text: string): string =>
  text.replace(/\r\n?/g, '\n');

const collapseWhitespace = (text: string): string =>
  text
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/[ ]+\n/g, '\n');

const collapseBlankLines = (text: string): string =>
  text.replace(/\n{3,}/g, '\n\n');

const dedupeConsecutiveLines = (text: string): string => {
  const lines = text.split('\n');
  const out: string[] = [];
  let prevNonEmptyTrimmed: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    if (trimmed === prevNonEmptyTrimmed) continue;

    prevNonEmptyTrimmed = trimmed;
    out.push(line);
  }

  return out.join('\n');
};

export function normalizeJobText(text: string): string {
  const normalized = collapseBlankLines(
    collapseWhitespace(normalizeNewlines(text)),
  ).trim();

  // Dedupe only consecutive identical lines to avoid dropping repeated headings.
  return dedupeConsecutiveLines(normalized).trim();
}

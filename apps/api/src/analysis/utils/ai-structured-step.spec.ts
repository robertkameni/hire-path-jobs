import { describe, expect, it } from 'vitest';
import { decodeHtmlEntitiesDeep, ensureDecodedResultGuard } from './ai-structured-step.js';

describe('decodeHtmlEntitiesDeep', () => {
  it('decodes decimal numeric entities', () => {
    const counter = { count: 0 };
    expect(decodeHtmlEntitiesDeep('Gespr&#228;ch', counter)).toBe('Gespräch');
    expect(counter.count).toBe(1);
  });

  it('decodes hex numeric entities', () => {
    const counter = { count: 0 };
    expect(decodeHtmlEntitiesDeep('Gespr&#xE4;ch', counter)).toBe('Gespräch');
    expect(counter.count).toBe(1);
  });

  it('decodes multiple entities in one string', () => {
    const counter = { count: 0 };
    const input = 'k&#246;nnte zu h&#246;her';
    expect(decodeHtmlEntitiesDeep(input, counter)).toBe('könnte zu höher');
    expect(counter.count).toBe(2);
  });

  it('decodes ellipsis entity', () => {
    const counter = { count: 0 };
    expect(decodeHtmlEntitiesDeep('Archite&#8230;', counter)).toBe('Archite\u2026');
  });

  it('decodes German quote entities', () => {
    const counter = { count: 0 };
    const result = decodeHtmlEntitiesDeep('&#8222;Security Architect&#8220;', counter) as string;
    expect(result).toBe('\u201ESecurity Architect\u201C');
  });

  it('decodes newline entity', () => {
    const counter = { count: 0 };
    expect(decodeHtmlEntitiesDeep('Line1&#10;Line2', counter)).toBe('Line1\nLine2');
  });

  it('leaves clean strings unchanged', () => {
    const counter = { count: 0 };
    expect(decodeHtmlEntitiesDeep('Gespräch', counter)).toBe('Gespräch');
    expect(counter.count).toBe(0);
  });

  it('decodes deeply nested objects', () => {
    const counter = { count: 0 };
    const input = {
      message: {
        subject: 'Frage zur Rolle Archite&#8230;',
        body: 'f&#252;r die Position',
      },
    };
    const result = decodeHtmlEntitiesDeep(input, counter) as typeof input;
    expect(result.message.subject).toBe('Frage zur Rolle Archite\u2026');
    expect(result.message.body).toBe('für die Position');
    expect(counter.count).toBe(2);
  });

  it('decodes arrays of strings', () => {
    const counter = { count: 0 };
    const input = ['k&#246;nnte', 'f&#252;hren'];
    const result = decodeHtmlEntitiesDeep(input, counter) as string[];
    expect(result[0]).toBe('könnte');
    expect(result[1]).toBe('führen');
    expect(counter.count).toBe(2);
  });

  it('handles non-string values gracefully', () => {
    const counter = { count: 0 };
    expect(decodeHtmlEntitiesDeep(42, counter)).toBe(42);
    expect(decodeHtmlEntitiesDeep(null, counter)).toBe(null);
    expect(decodeHtmlEntitiesDeep(true, counter)).toBe(true);
    expect(counter.count).toBe(0);
  });
});

describe('ensureDecodedResultGuard', () => {
  it('decodes entities that slipped through', () => {
    const warnings: string[] = [];
    const result = ensureDecodedResultGuard(
      {
        message: { subject: 'Archite&#8230;', body: 'f&#252;r' },
        insights: { ghostRiskReason: 'Kein Gehalt&#10;angegeben' },
        redFlags: ['k&#246;nnte'],
      },
      (msg: string) => warnings.push(msg),
    ) as Record<string, unknown>;

    const msg = result.message as Record<string, string>;
    expect(msg.subject).toBe('Archite\u2026');
    expect(msg.body).toBe('für');

    const insights = result.insights as Record<string, string>;
    expect(insights.ghostRiskReason).toBe('Kein Gehalt\nangegeben');

    const flags = result.redFlags as string[];
    expect(flags[0]).toBe('könnte');

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('4 HTML entities');
  });

  it('does not log when no entities present', () => {
    const warnings: string[] = [];
    const result = ensureDecodedResultGuard({ message: { subject: 'Archite…', body: 'für' } }, (msg: string) => warnings.push(msg));
    expect(warnings.length).toBe(0);
    expect(result).toEqual({ message: { subject: 'Archite…', body: 'für' } });
  });
});

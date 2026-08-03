import { describe, expect, it } from 'vitest';
import { buildRecruiterValidationSubject } from './recruiter-validation-subject.js';

describe('buildRecruiterValidationSubject', () => {
  it('builds a subject with title and company', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Security Assurance Solutions Architect',
      company: 'AWS EMEA SARL (Germany Branch) GmbH',
    });

    expect(result).toMatch(/^Frage zur Rolle /);
    expect(result).toContain(' bei AWS EMEA SARL (Germany Branch)');
  });

  it('strips legal form suffix from company', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Solutions Architect',
      company: 'Acme GmbH',
    });

    expect(result).not.toContain('GmbH');
    expect(result).toContain(' bei Acme');
  });

  it('truncates long titles at word boundaries', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Very Long Senior Security Assurance Solutions Architect Manager Director Lead',
      company: 'AWS',
    });

    expect(result.length).toBeLessThanOrEqual(88);
    // Should end with … not mid-word
    expect(result).toContain('\u2026');
    // The cut should be before a space, not mid-word
    const beforeEllipsis = result.split('\u2026')[0];
    const lastWord = beforeEllipsis.split(' ').pop() ?? '';
    // A word cut mid-word would leave a partial like "Archite" or "Solutio"
    // With word boundary truncation, the last "word" before … should be complete
    expect(lastWord.length).toBeGreaterThan(1);
  });

  it('does not truncate short titles', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Solutions Architect',
      company: 'AWS',
    });

    expect(result).not.toContain('\u2026');
    expect(result).toBe(`Frage zur Rolle Solutions Architect bei AWS`);
  });

  it('decodes HTML entities in title before truncation', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Archite&#8230; Solutions Architect',
      company: 'AWS',
    });

    // Entity should be decoded to ellipsis, then the title is treated as clean unicode
    expect(result).toContain('Archite\u2026');
    expect(result).not.toContain('&#8230;');
  });

  it('handles hyphen-separated titles', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Security Assurance - Solutions Architect',
      company: 'AWS',
    });

    // Should use only the part before the dash
    expect(result).toContain('Security Assurance');
    expect(result).not.toContain('Solutions Architect');
  });

  it('splits hyphen titles and truncates at word boundary if needed', () => {
    const result = buildRecruiterValidationSubject({
      title: 'Senior Director of International Security Strategy and Architecture - Engineering',
      company: 'AWS',
    });

    // Takes part before dash, then truncates at word boundary
    expect(result).not.toContain('Engineering');
    expect(result).toContain('\u2026');
    expect(result).toContain(' bei AWS');
  });
});

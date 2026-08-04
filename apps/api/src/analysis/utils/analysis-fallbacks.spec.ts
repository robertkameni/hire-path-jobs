import { describe, expect, it } from 'vitest';
import type { ParsedJob } from '../schemas/analysis.schemas.js';
import { buildFallbackMessage, buildParseFailureResult } from './analysis-fallbacks.js';

function makeJob(overrides: Partial<ParsedJob> = {}): ParsedJob {
  return {
    title: 'Security Assurance Solutions Architect',
    company: 'AWS EMEA SARL (Germany Branch)',
    location: 'Berlin',
    salary: null,
    skills: ['AWS', 'Security', 'Compliance'],
    requirements: ['5+ Jahre Erfahrung', 'Cloud-Security-Kenntnisse'],
    responsibilities: ['Sicherheitsarchitektur', 'Kundenberatung'],
    remote: false,
    ...overrides,
  };
}

describe('buildFallbackMessage', () => {
  it('produces clean output with standard German characters', () => {
    const job = makeJob();
    const result = buildFallbackMessage(job, false);

    expect(result.subject).not.toContain('&#');
    expect(result.body).not.toContain('&#');

    // Subject should contain literal ellipsis if truncated, or full title if short
    expect(result.subject).toMatch(/^Frage zur Rolle /);
  });

  it('decodes entities in job title', () => {
    const job = makeJob({ title: 'AWS Archite&#8230; Solutions Architect' });
    const result = buildFallbackMessage(job, false);

    expect(result.subject).toContain('Archite\u2026');
    expect(result.subject).not.toContain('&#8230;');
  });

  it('decodes entities in company name', () => {
    const job = makeJob({
      company: 'AWS EMEA SARL&#10;Germany',
      title: 'Solutions Architect',
    });
    const result = buildFallbackMessage(job, false);

    expect(result.body).not.toContain('&#10;');
  });

  it('with-profile fallback produces clean output', () => {
    const job = makeJob();
    const result = buildFallbackMessage(job, true);

    expect(result.subject).not.toContain('&#');
    expect(result.body).not.toContain('&#');
    expect(result.tone).toBe('direct');
  });

  it('with-profile fallback decodes entities in title and company', () => {
    const job = makeJob({
      title: 'Sicherheits&#228;rchitekt',
      company: 'Firma&#10;GmbH',
    });
    const result = buildFallbackMessage(job, true);

    expect(result.subject).not.toContain('&#');
    expect(result.body).not.toContain('&#');
  });
});

describe('buildParseFailureResult', () => {
  it('returns a structured partial result', () => {
    const result = buildParseFailureResult('parse timeout', 45000);

    expect(result.status).toBe('partial');
    expect(result.job).toBeNull();
    expect(result.insights).toBeNull();
    expect(result.message).toBeNull();
    expect(result.fallbacks).toEqual([{ step: 'parseJobAndTruth', reason: 'parse timeout' }]);
    expect(result.timings).toEqual({ parseJobAndTruth: 45000 });
  });
});

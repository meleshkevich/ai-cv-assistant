import { describe, it, expect } from 'vitest'
import {
  parseCvCompressionProposal,
  validateCompressionProposal,
  mergeCvWithProposal,
} from '@/services/cvCompressionService'
import type { CvCompressionProposal } from '@/services/cvCompressionService'
import type { GeneratedCv } from '@/types/application'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOriginalCv(overrides: Partial<GeneratedCv> = {}): GeneratedCv {
  return {
    language: 'en',
    professionalTitle: 'Software Engineer',
    professionalSummary: 'Experienced engineer with 5 years building scalable web applications.',
    technicalSkills: ['TypeScript', 'Vue 3', 'Node.js', 'PostgreSQL', 'Docker'],
    experience: [
      {
        sourceId: 'exp-1',
        company: 'Acme Corp',
        position: 'Senior Engineer',
        startDate: '2021-01',
        endDate: null,
        highlights: [
          'Led migration of monolith to microservices, reducing latency by 40%.',
          'Mentored 3 junior engineers and ran weekly code reviews.',
          'Owned CI/CD pipeline using GitHub Actions and ArgoCD.',
        ],
      },
      {
        sourceId: 'exp-2',
        company: 'Beta Ltd',
        position: 'Software Engineer',
        startDate: '2019-03',
        endDate: '2021-01',
        highlights: [
          'Built REST APIs in Node.js serving 50k daily active users.',
          'Reduced database query time by 60% through index optimization.',
        ],
      },
    ],
    projects: [
      {
        sourceId: 'proj-1',
        name: 'Open Logger',
        role: 'Lead',
        highlights: ['Rust-based structured logging library with 2k GitHub stars.', 'Zero-copy log serialization.'],
        url: 'https://github.com/example/open-logger',
      },
      {
        sourceId: 'proj-2',
        name: 'CV Builder',
        role: 'Creator',
        highlights: ['Generates PDF CVs from JSON using pdfmake.'],
        url: '',
      },
    ],
    education: [
      {
        sourceId: 'edu-1',
        institution: 'Czech Technical University',
        degree: 'Bachelor',
        field: 'Computer Science',
      },
    ],
    languages: [
      { sourceId: 'lang-1', language: 'Czech', proficiency: 'Native' },
      { sourceId: 'lang-2', language: 'English', proficiency: 'Fluent' },
    ],
    ...overrides,
  }
}

function makeValidProposal(overrides: Partial<CvCompressionProposal> = {}): CvCompressionProposal {
  return {
    professionalSummary: 'Engineer with 5 years in scalable web development.',
    technicalSkills: ['TypeScript', 'Vue 3', 'Node.js'],
    experience: [
      { sourceId: 'exp-1', highlights: ['Led microservices migration, cutting latency 40%.', 'Owned CI/CD pipeline.'] },
      { sourceId: 'exp-2', highlights: ['Built REST APIs for 50k DAU.'] },
    ],
    projects: [
      { sourceId: 'proj-1', highlights: ['Rust logging library with 2k stars.'] },
      { sourceId: 'proj-2', highlights: ['PDF CV generator using pdfmake.'] },
    ],
    ...overrides,
  }
}

// ── parseCvCompressionProposal ─────────────────────────────────────────────────

describe('parseCvCompressionProposal', () => {
  // Test 1: rejects null and non-object values
  it('throws RESPONSE_INVALID for null', () => {
    expect(() => parseCvCompressionProposal(null)).toThrow()
    try {
      parseCvCompressionProposal(null)
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  it('throws RESPONSE_INVALID for string input', () => {
    expect(() => parseCvCompressionProposal('not an object')).toThrow()
    try {
      parseCvCompressionProposal('not an object')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  // Test 2: rejects missing professionalSummary
  it('throws RESPONSE_INVALID when professionalSummary is missing', () => {
    const raw = { technicalSkills: [], experience: [], projects: [] }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  it('throws RESPONSE_INVALID when professionalSummary is not a string', () => {
    const raw = { professionalSummary: 42, technicalSkills: [], experience: [], projects: [] }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  // Test 3: rejects non-array technicalSkills
  it('throws RESPONSE_INVALID when technicalSkills is not an array', () => {
    const raw = { professionalSummary: 'x', technicalSkills: 'TypeScript', experience: [], projects: [] }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  it('throws RESPONSE_INVALID when technicalSkills contains a non-string item', () => {
    const raw = { professionalSummary: 'x', technicalSkills: ['TS', 42], experience: [], projects: [] }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  // Test 4: rejects experience entry with missing sourceId
  it('throws RESPONSE_INVALID when experience entry is missing sourceId', () => {
    const raw = {
      professionalSummary: 'x',
      technicalSkills: [],
      experience: [{ highlights: ['bullet'] }],
      projects: [],
    }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  it('throws RESPONSE_INVALID when experience entry has non-string sourceId', () => {
    const raw = {
      professionalSummary: 'x',
      technicalSkills: [],
      experience: [{ sourceId: 123, highlights: ['bullet'] }],
      projects: [],
    }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  // Test 5: rejects experience entry with non-string highlight items
  it('throws RESPONSE_INVALID when experience highlights contains a non-string', () => {
    const raw = {
      professionalSummary: 'x',
      technicalSkills: [],
      experience: [{ sourceId: 'exp-1', highlights: ['valid', 99] }],
      projects: [],
    }
    try {
      parseCvCompressionProposal(raw)
      throw new Error('Should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('RESPONSE_INVALID')
    }
  })

  // Test 6: accepts a fully valid proposal
  it('returns a typed CvCompressionProposal for valid input', () => {
    const raw = {
      professionalSummary: 'Short summary.',
      technicalSkills: ['TypeScript', 'Vue'],
      experience: [{ sourceId: 'exp-1', highlights: ['Did things.'] }],
      projects: [{ sourceId: 'proj-1', highlights: ['Built stuff.'] }],
    }
    const result = parseCvCompressionProposal(raw)
    expect(result.professionalSummary).toBe('Short summary.')
    expect(result.technicalSkills).toEqual(['TypeScript', 'Vue'])
    expect(result.experience).toHaveLength(1)
    expect(result.experience[0]!.sourceId).toBe('exp-1')
    expect(result.projects[0]!.sourceId).toBe('proj-1')
  })
})

// ── validateCompressionProposal ───────────────────────────────────────────────

describe('validateCompressionProposal', () => {
  const originalCv = makeOriginalCv()

  // Test 7: passes with a fully valid proposal
  it('returns valid=true for a correct proposal', () => {
    const proposal = makeValidProposal()
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  // Test 8: catches unknown experience sourceId
  it('reports UNKNOWN_EXP_SOURCE_ID for a sourceId not in original CV', () => {
    const proposal = makeValidProposal({
      experience: [
        { sourceId: 'exp-999', highlights: ['Something.'] },
        { sourceId: 'exp-2', highlights: ['Built APIs.'] },
      ],
    })
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'UNKNOWN_EXP_SOURCE_ID')).toBe(true)
  })

  // Test 9: catches unknown project sourceId
  it('reports UNKNOWN_PROJ_SOURCE_ID for a sourceId not in original CV', () => {
    const proposal = makeValidProposal({
      projects: [{ sourceId: 'proj-999', highlights: ['Made a thing.'] }],
    })
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'UNKNOWN_PROJ_SOURCE_ID')).toBe(true)
  })

  // Test 10: catches duplicate experience sourceId
  it('reports DUPLICATE_EXP_SOURCE_ID when experience sourceId appears twice', () => {
    const proposal = makeValidProposal({
      experience: [
        { sourceId: 'exp-1', highlights: ['First.'] },
        { sourceId: 'exp-1', highlights: ['Duplicate.'] },
      ],
    })
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'DUPLICATE_EXP_SOURCE_ID')).toBe(true)
  })

  // Test 11: catches duplicate project sourceId
  it('reports DUPLICATE_PROJ_SOURCE_ID when project sourceId appears twice', () => {
    const proposal = makeValidProposal({
      projects: [
        { sourceId: 'proj-1', highlights: ['First.'] },
        { sourceId: 'proj-1', highlights: ['Duplicate.'] },
      ],
    })
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'DUPLICATE_PROJ_SOURCE_ID')).toBe(true)
  })

  // Test 12: catches experience entry with zero highlights
  it('reports EMPTY_HIGHLIGHTS when an experience entry has an empty highlights array', () => {
    const proposal = makeValidProposal({
      experience: [
        { sourceId: 'exp-1', highlights: [] },
        { sourceId: 'exp-2', highlights: ['Built APIs.'] },
      ],
    })
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'EMPTY_HIGHLIGHTS')).toBe(true)
  })

  it('reports EMPTY_HIGHLIGHTS when a project entry has an empty highlights array', () => {
    const proposal = makeValidProposal({
      projects: [
        { sourceId: 'proj-1', highlights: [] },
        { sourceId: 'proj-2', highlights: ['Built stuff.'] },
      ],
    })
    const result = validateCompressionProposal(proposal, originalCv)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.code === 'EMPTY_HIGHLIGHTS')).toBe(true)
  })
})

// ── mergeCvWithProposal ───────────────────────────────────────────────────────

describe('mergeCvWithProposal', () => {
  const originalCv = makeOriginalCv()

  // Test 13: replaces summary and skills from proposal
  it('replaces professionalSummary and technicalSkills with proposal values', () => {
    const proposal = makeValidProposal({
      professionalSummary: 'Compressed summary.',
      technicalSkills: ['TypeScript', 'Vue 3'],
    })
    const merged = mergeCvWithProposal(originalCv, proposal)
    expect(merged.professionalSummary).toBe('Compressed summary.')
    expect(merged.technicalSkills).toEqual(['TypeScript', 'Vue 3'])
  })

  // Test 14: replaces experience highlights for matching sourceIds
  it('replaces experience highlights when sourceId matches', () => {
    const proposal = makeValidProposal({
      experience: [
        { sourceId: 'exp-1', highlights: ['Compressed exp-1 highlight.'] },
        { sourceId: 'exp-2', highlights: ['Compressed exp-2 highlight.'] },
      ],
    })
    const merged = mergeCvWithProposal(originalCv, proposal)
    const exp1 = merged.experience.find((e) => e.sourceId === 'exp-1')
    const exp2 = merged.experience.find((e) => e.sourceId === 'exp-2')
    expect(exp1!.highlights).toEqual(['Compressed exp-1 highlight.'])
    expect(exp2!.highlights).toEqual(['Compressed exp-2 highlight.'])
  })

  // Test 15: keeps original highlights for experience entries absent from proposal
  it('keeps original highlights for experience entries not present in proposal', () => {
    const proposal = makeValidProposal({
      experience: [
        { sourceId: 'exp-1', highlights: ['Compressed.'] },
        // exp-2 intentionally omitted from proposal
      ],
    })
    const merged = mergeCvWithProposal(originalCv, proposal)
    const exp2 = merged.experience.find((e) => e.sourceId === 'exp-2')
    expect(exp2!.highlights).toEqual(originalCv.experience[1]!.highlights)
  })

  // Test 16: immutable fields (company, position, dates) remain unchanged
  it('preserves immutable experience fields: company, position, startDate, endDate', () => {
    const proposal = makeValidProposal()
    const merged = mergeCvWithProposal(originalCv, proposal)

    for (const exp of originalCv.experience) {
      const mergedExp = merged.experience.find((e) => e.sourceId === exp.sourceId)!
      expect(mergedExp.company).toBe(exp.company)
      expect(mergedExp.position).toBe(exp.position)
      expect(mergedExp.startDate).toBe(exp.startDate)
      expect(mergedExp.endDate).toBe(exp.endDate)
    }
  })

  it('preserves immutable project fields: name, role, url', () => {
    const proposal = makeValidProposal()
    const merged = mergeCvWithProposal(originalCv, proposal)

    for (const proj of originalCv.projects) {
      const mergedProj = merged.projects.find((p) => p.sourceId === proj.sourceId)!
      expect(mergedProj.name).toBe(proj.name)
      expect(mergedProj.role).toBe(proj.role)
      expect(mergedProj.url).toBe(proj.url)
    }
  })

  it('preserves education and languages unchanged', () => {
    const proposal = makeValidProposal()
    const merged = mergeCvWithProposal(originalCv, proposal)
    expect(merged.education).toEqual(originalCv.education)
    expect(merged.languages).toEqual(originalCv.languages)
  })

  it('preserves language and professionalTitle from original', () => {
    const proposal = makeValidProposal()
    const merged = mergeCvWithProposal(originalCv, proposal)
    expect(merged.language).toBe(originalCv.language)
    expect(merged.professionalTitle).toBe(originalCv.professionalTitle)
  })

  it('does not mutate the original CV', () => {
    const cv = makeOriginalCv()
    const originalSummary = cv.professionalSummary
    const originalExpHighlights = [...cv.experience[0]!.highlights]

    const proposal = makeValidProposal({
      professionalSummary: 'Completely different.',
      experience: [
        { sourceId: 'exp-1', highlights: ['New highlight only.'] },
        { sourceId: 'exp-2', highlights: ['Also new.'] },
      ],
    })
    mergeCvWithProposal(cv, proposal)

    expect(cv.professionalSummary).toBe(originalSummary)
    expect(cv.experience[0]!.highlights).toEqual(originalExpHighlights)
  })
})

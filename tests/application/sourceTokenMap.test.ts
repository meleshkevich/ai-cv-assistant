import { describe, it, expect } from 'vitest'
import { buildSourceTokenMap, resolveTokensToIds } from '@/utils/sourceTokenMap'
import type { MasterProfile } from '@/types/profile'
import type { GeneratedApplication } from '@/types/application'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    schemaVersion: 1,
    personal: {
      fullName: 'Jana Nováková',
      title: 'Senior Engineer',
      location: 'Prague',
      email: 'jana@example.com',
      phone: '',
      linkedIn: '',
      github: '',
    },
    experience: [
      { id: 'exp-1', company: 'Acme Corp', position: 'Engineer', location: '', startDate: '2020-01', endDate: null, description: '' },
      { id: 'exp-2', company: 'Beta Ltd', position: 'Lead', location: '', startDate: '2018-01', endDate: '2020-01', description: '' },
    ],
    projects: [
      { id: 'proj-1', name: 'Open Logger', role: 'Lead', url: '', startDate: '2022-06', endDate: null, description: '' },
      { id: 'proj-2', name: 'Dashboard', role: 'Dev', url: '', startDate: '2021-01', endDate: '2022-01', description: '' },
    ],
    education: [
      { id: 'edu-1', institution: 'CTU', degree: 'BSc', field: 'CS', startDate: '2016-09', endDate: '2020-06', description: '' },
    ],
    languages: [
      { id: 'lang-1', language: 'Czech', proficiency: 'Native' },
      { id: 'lang-2', language: 'English', proficiency: 'C1' },
    ],
    generalNotes: '',
    ...overrides,
  }
}

function makeApplication(overrides: Partial<GeneratedApplication['cv']> = {}): GeneratedApplication {
  return {
    coverLetter: { language: 'en', subject: 'Test', body: 'Test body.' },
    cv: {
      language: 'en',
      professionalTitle: 'Engineer',
      professionalSummary: 'Summary.',
      technicalSkills: ['TypeScript'],
      experience: [{ sourceId: 'EXP_1', company: 'Acme Corp', position: 'Engineer', startDate: '2020-01', endDate: null, highlights: [] }],
      projects: [{ sourceId: 'PROJ_1', name: 'Open Logger', role: 'Lead', highlights: [] }],
      education: [{ sourceId: 'EDU_1', institution: 'CTU', degree: 'BSc', field: 'CS' }],
      languages: [{ sourceId: 'LANG_1', language: 'Czech', proficiency: 'Native' }],
      ...overrides,
    },
  }
}

// ── buildSourceTokenMap ───────────────────────────────────────────────────────

describe('buildSourceTokenMap — forward maps (token → UUID)', () => {
  it('maps EXP_1 to the first experience id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expTokenToId.get('EXP_1')).toBe('exp-1')
  })

  it('maps EXP_2 to the second experience id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expTokenToId.get('EXP_2')).toBe('exp-2')
  })

  it('maps PROJ_1 to the first project id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.projTokenToId.get('PROJ_1')).toBe('proj-1')
  })

  it('maps PROJ_2 to the second project id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.projTokenToId.get('PROJ_2')).toBe('proj-2')
  })

  it('maps EDU_1 to the first education id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.eduTokenToId.get('EDU_1')).toBe('edu-1')
  })

  it('maps LANG_1 to the first language id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.langTokenToId.get('LANG_1')).toBe('lang-1')
  })

  it('maps LANG_2 to the second language id', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.langTokenToId.get('LANG_2')).toBe('lang-2')
  })

  it('does not contain EXP_3 when only 2 experience entries exist', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expTokenToId.get('EXP_3')).toBeUndefined()
  })
})

describe('buildSourceTokenMap — reverse maps (UUID → token)', () => {
  it('maps exp-1 UUID back to EXP_1', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expIdToToken.get('exp-1')).toBe('EXP_1')
  })

  it('maps exp-2 UUID back to EXP_2', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expIdToToken.get('exp-2')).toBe('EXP_2')
  })

  it('maps proj-1 UUID back to PROJ_1', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.projIdToToken.get('proj-1')).toBe('PROJ_1')
  })

  it('returns undefined for an unknown UUID', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expIdToToken.get('unknown-uuid')).toBeUndefined()
  })
})

describe('buildSourceTokenMap — deterministic and stable', () => {
  it('produces the same mapping on repeated calls for the same profile', () => {
    const profile = makeProfile()
    const map1 = buildSourceTokenMap(profile)
    const map2 = buildSourceTokenMap(profile)
    expect(map1.expTokenToId.get('EXP_1')).toBe(map2.expTokenToId.get('EXP_1'))
    expect(map1.projTokenToId.get('PROJ_1')).toBe(map2.projTokenToId.get('PROJ_1'))
  })

  it('produces the correct size for all forward maps', () => {
    const map = buildSourceTokenMap(makeProfile())
    expect(map.expTokenToId.size).toBe(2)
    expect(map.projTokenToId.size).toBe(2)
    expect(map.eduTokenToId.size).toBe(1)
    expect(map.langTokenToId.size).toBe(2)
  })

  it('handles empty profile arrays gracefully', () => {
    const map = buildSourceTokenMap(makeProfile({ experience: [], projects: [], education: [], languages: [] }))
    expect(map.expTokenToId.size).toBe(0)
    expect(map.projTokenToId.size).toBe(0)
    expect(map.eduTokenToId.size).toBe(0)
    expect(map.langTokenToId.size).toBe(0)
  })

  it('does not mutate the profile', () => {
    const profile = makeProfile()
    const before = JSON.stringify(profile)
    buildSourceTokenMap(profile)
    expect(JSON.stringify(profile)).toBe(before)
  })
})

// ── resolveTokensToIds — happy path ──────────────────────────────────────────

describe('resolveTokensToIds — valid tokens', () => {
  it('resolves EXP_1 to canonical exp-1 UUID', () => {
    const map = buildSourceTokenMap(makeProfile())
    const { application, issues } = resolveTokensToIds(makeApplication(), map)
    expect(issues).toHaveLength(0)
    expect(application.cv.experience[0]?.sourceId).toBe('exp-1')
  })

  it('resolves PROJ_1 to canonical proj-1 UUID', () => {
    const map = buildSourceTokenMap(makeProfile())
    const { application, issues } = resolveTokensToIds(makeApplication(), map)
    expect(issues).toHaveLength(0)
    expect(application.cv.projects[0]?.sourceId).toBe('proj-1')
  })

  it('resolves multiple experience tokens in order', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [
        { sourceId: 'EXP_2', company: 'Beta Ltd', position: 'Lead', startDate: '2018-01', endDate: '2020-01', highlights: [] },
        { sourceId: 'EXP_1', company: 'Acme Corp', position: 'Engineer', startDate: '2020-01', endDate: null, highlights: [] },
      ],
    })
    const { application, issues } = resolveTokensToIds(app, map)
    expect(issues).toHaveLength(0)
    expect(application.cv.experience[0]?.sourceId).toBe('exp-2')
    expect(application.cv.experience[1]?.sourceId).toBe('exp-1')
  })

  it('resolves multiple project tokens correctly', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      projects: [
        { sourceId: 'PROJ_2', name: 'Dashboard', role: 'Dev', highlights: [] },
        { sourceId: 'PROJ_1', name: 'Open Logger', role: 'Lead', highlights: [] },
      ],
    })
    const { application, issues } = resolveTokensToIds(app, map)
    expect(issues).toHaveLength(0)
    expect(application.cv.projects[0]?.sourceId).toBe('proj-2')
    expect(application.cv.projects[1]?.sourceId).toBe('proj-1')
  })

  it('does not modify education or language entries', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication()
    const { application } = resolveTokensToIds(app, map)
    expect(application.cv.education[0]?.sourceId).toBe('EDU_1')
    expect(application.cv.languages[0]?.sourceId).toBe('LANG_1')
  })

  it('does not modify the cover letter', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication()
    const { application } = resolveTokensToIds(app, map)
    expect(application.coverLetter).toEqual(app.coverLetter)
  })

  it('does not mutate the input application', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication()
    const before = JSON.parse(JSON.stringify(app)) as typeof app
    resolveTokensToIds(app, map)
    expect(app).toEqual(before)
  })

  it('returns no issues when experience and projects are empty', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({ experience: [], projects: [] })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues).toHaveLength(0)
  })
})

// ── resolveTokensToIds — category mismatch ───────────────────────────────────

describe('resolveTokensToIds — category mismatch', () => {
  it('reports an issue when PROJ_N token appears in cv.experience', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [{ sourceId: 'PROJ_1', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'experience' && i.message.includes('category mismatch'))).toBe(true)
  })

  it('reports an issue when EXP_N token appears in cv.projects', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      projects: [{ sourceId: 'EXP_1', name: 'P', role: 'R', highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'projects' && i.message.includes('category mismatch'))).toBe(true)
  })

  it('includes the offending token in the issue message', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [{ sourceId: 'PROJ_2', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues[0]?.message).toContain('PROJ_2')
  })
})

// ── resolveTokensToIds — unknown / malformed tokens ──────────────────────────

describe('resolveTokensToIds — unknown tokens', () => {
  it('reports an issue for a valid-looking EXP_N token that is out of range', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [{ sourceId: 'EXP_99', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'experience' && i.message.includes('no matching profile entry'))).toBe(true)
  })

  it('reports an issue for a valid-looking PROJ_N token that is out of range', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      projects: [{ sourceId: 'PROJ_99', name: 'P', role: 'R', highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'projects' && i.message.includes('no matching profile entry'))).toBe(true)
  })
})

describe('resolveTokensToIds — malformed tokens', () => {
  it('reports an issue for a raw UUID in cv.experience', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [{ sourceId: 'exp-1', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'experience')).toBe(true)
  })

  it('reports an issue for a raw UUID in cv.projects', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      projects: [{ sourceId: 'proj-1', name: 'P', role: 'R', highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'projects')).toBe(true)
  })

  it('reports an issue for an empty string sourceId', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [{ sourceId: '', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'experience')).toBe(true)
  })

  it('reports an issue for a hallucinated UUID in cv.experience', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [{ sourceId: '1532bdee-1232-4fcc-a67c-34fa167d8ba6', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] }],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'experience')).toBe(true)
  })
})

// ── resolveTokensToIds — duplicate tokens ─────────────────────────────────────

describe('resolveTokensToIds — duplicate tokens', () => {
  it('reports an issue when the same EXP_N token appears twice', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [
        { sourceId: 'EXP_1', company: 'Acme Corp', position: 'Engineer', startDate: '2020-01', endDate: null, highlights: [] },
        { sourceId: 'EXP_1', company: 'Acme Corp', position: 'Engineer (copy)', startDate: '2020-01', endDate: null, highlights: [] },
      ],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'experience' && i.message.includes('Duplicate'))).toBe(true)
  })

  it('reports an issue when the same PROJ_N token appears twice', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      projects: [
        { sourceId: 'PROJ_1', name: 'Open Logger', role: 'Lead', highlights: [] },
        { sourceId: 'PROJ_1', name: 'Open Logger (copy)', role: 'Dev', highlights: [] },
      ],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.some((i) => i.section === 'projects' && i.message.includes('Duplicate'))).toBe(true)
  })

  it('the first occurrence of a duplicate is resolved; the second is flagged', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [
        { sourceId: 'EXP_1', company: 'Acme Corp', position: 'Engineer', startDate: '2020-01', endDate: null, highlights: [] },
        { sourceId: 'EXP_1', company: 'Acme Corp', position: 'Copy', startDate: '2020-01', endDate: null, highlights: [] },
      ],
    })
    const { application, issues } = resolveTokensToIds(app, map)
    expect(application.cv.experience[0]?.sourceId).toBe('exp-1')
    expect(application.cv.experience[1]?.sourceId).toBe('EXP_1')
    expect(issues).toHaveLength(1)
  })
})

// ── resolveTokensToIds — issue count ─────────────────────────────────────────

describe('resolveTokensToIds — multiple issues accumulate', () => {
  it('reports an issue per invalid entry when multiple are bad', () => {
    const map = buildSourceTokenMap(makeProfile())
    const app = makeApplication({
      experience: [
        { sourceId: 'bad-token-1', company: 'X', position: 'Y', startDate: '2020-01', endDate: null, highlights: [] },
        { sourceId: 'bad-token-2', company: 'X', position: 'Z', startDate: '2019-01', endDate: null, highlights: [] },
      ],
      projects: [
        { sourceId: 'EXP_1', name: 'P', role: 'R', highlights: [] },
      ],
    })
    const { issues } = resolveTokensToIds(app, map)
    expect(issues.length).toBeGreaterThanOrEqual(3)
  })
})

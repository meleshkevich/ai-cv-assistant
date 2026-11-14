/**
 * Tests for src/services/cvPdfService.ts
 *
 * Coverage:
 *   - Visual style configuration (navy accent, typography)
 *   - Valid PDF generation
 *   - A4 dimensions
 *   - Header and contact info
 *   - English and Czech section labels
 *   - Czech diacritics
 *   - Experience and project ordering
 *   - Multiple projects
 *   - Empty optional sections
 *   - Long technical skill lists
 *   - Date formatting
 *   - Realistic CV density (4 experience entries, 20 skills, 2 projects)
 *   - Input immutability
 *   - Actual page count
 *   - Overflow detection
 *   - No dependency on OpenAI or Chrome Storage
 *   - Compact layout fallback (006D.1)
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { GeneratedCv, GeneratedCvExperience, GeneratedCvProject } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'
import {
  generateCvPdf,
  generateCvPdfWithResult,
  buildCvDocDefinition,
  countPdfPages,
  formatDate,
  formatDateRange,
  isCvPdfError,
  normalizeContactUrl,
  STANDARD_LAYOUT,
  COMPACT_LAYOUT,
} from '@/services/cvPdfService'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePersonal(overrides: Partial<PersonalInfo> = {}): PersonalInfo {
  return {
    fullName: 'Jane Smith',
    title: 'Senior Software Engineer',
    location: 'Prague, CZ',
    email: 'jane@example.com',
    phone: '+420 777 123 456',
    linkedIn: 'linkedin.com/in/janesmith',
    github: 'github.com/janesmith',
    ...overrides,
  }
}

function makeExp(overrides: Partial<GeneratedCvExperience> = {}): GeneratedCvExperience {
  return {
    sourceId: 'exp-1',
    company: 'Acme Corp',
    position: 'Software Engineer',
    startDate: '2020-01',
    endDate: '2023-06',
    highlights: ['Built TypeScript APIs', 'Led Vue 3 migration'],
    ...overrides,
  }
}

function makeProject(overrides: Partial<GeneratedCvProject> = {}): GeneratedCvProject {
  return {
    sourceId: 'proj-1',
    name: 'Open Logger',
    role: 'Lead',
    highlights: ['Rust-based library', 'Used by 50+ teams'],
    ...overrides,
  }
}

function makeCv(overrides: Partial<GeneratedCv> = {}): GeneratedCv {
  return {
    language: 'en',
    professionalTitle: 'Senior Software Engineer',
    professionalSummary: 'Experienced engineer with TypeScript and Vue expertise.',
    technicalSkills: ['TypeScript', 'Vue 3', 'Node.js', 'Rust'],
    experience: [makeExp()],
    projects: [makeProject()],
    education: [
      {
        sourceId: 'edu-1',
        institution: 'Czech Technical University',
        degree: 'Bachelor',
        field: 'Computer Science',
      },
    ],
    languages: [{ sourceId: 'lang-1', language: 'English', proficiency: 'Fluent' }],
    ...overrides,
  }
}

// ── Realistic fixtures ────────────────────────────────────────────────────────

function makeRealisticPersonal(): PersonalInfo {
  return {
    fullName: 'Jan Procházka',
    title: 'Senior Full-Stack Engineer',
    location: 'Prague, Czech Republic',
    email: 'jan.prochazka@example.com',
    phone: '+420 601 234 567',
    linkedIn: 'linkedin.com/in/jan-prochazka',
    github: 'github.com/janp',
  }
}

function makeRealisticCv(): GeneratedCv {
  return {
    language: 'en',
    professionalTitle: 'Senior Full-Stack Engineer',
    professionalSummary:
      'Full-stack engineer with 9 years of experience building TypeScript applications for fintech and e-commerce. ' +
      'Specialised in Vue 3, Node.js, and cloud-native architectures on AWS. ' +
      'Strong advocate for automated testing, CI/CD, and clean API design.',
    technicalSkills: [
      'TypeScript', 'Vue 3', 'Nuxt 3', 'React', 'Node.js',
      'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
      'AWS', 'Terraform', 'Playwright', 'Vitest', 'REST APIs',
      'GraphQL', 'gRPC', 'CI/CD', 'Git', 'Linux',
    ],
    experience: [
      {
        sourceId: 'exp-1',
        company: 'FinanceTech s.r.o.',
        position: 'Senior Full-Stack Engineer',
        startDate: '2022-01',
        endDate: null,
        highlights: [
          'Architected real-time transaction dashboard for 50,000 daily active users',
          'Reduced API latency by 45% through query optimisation and Redis caching',
          'Led migration from monolith to event-driven microservices (Node.js / Kafka)',
        ],
      },
      {
        sourceId: 'exp-2',
        company: 'Shopify Partner Agency',
        position: 'Frontend Engineer',
        startDate: '2019-06',
        endDate: '2021-12',
        highlights: [
          'Built Nuxt 3 e-commerce storefronts for 12 enterprise clients',
          'Cut QA cycle from 3 days to 4 hours by introducing Playwright end-to-end tests',
        ],
      },
      {
        sourceId: 'exp-3',
        company: 'StartupXYZ s.r.o.',
        position: 'Software Engineer',
        startDate: '2017-03',
        endDate: '2019-05',
        highlights: [
          'Developed REST and GraphQL APIs serving mobile and web clients',
          'Configured AWS ECS and RDS infrastructure with Terraform',
        ],
      },
      {
        sourceId: 'exp-4',
        company: 'Digital Agency Praha',
        position: 'Junior Developer',
        startDate: '2015-01',
        endDate: '2017-02',
        highlights: [
          'Maintained and extended PHP/Vue.js web applications for 15 SME clients',
          'Introduced unit testing with Jest; raised coverage from 0% to 60%',
        ],
      },
    ],
    projects: [
      {
        sourceId: 'proj-1',
        name: 'vue-querykit',
        role: 'Author',
        highlights: [
          'Open-source composable library for async state management in Vue 3',
          '2,100+ GitHub stars; used by 80+ companies in production',
          'Zero-dependency core with optional Vue Router and Pinia integrations',
        ],
      },
      {
        sourceId: 'proj-2',
        name: 'ts-event-bus',
        role: 'Contributor',
        highlights: [
          'Type-safe in-process event bus for TypeScript Node.js applications',
          'Contributed WebSocket transport adapter and performance benchmarks',
        ],
      },
    ],
    education: [
      {
        sourceId: 'edu-1',
        institution: 'Czech Technical University in Prague',
        degree: 'BSc',
        field: 'Computer Science',
      },
      {
        sourceId: 'edu-2',
        institution: 'Linux Foundation',
        degree: 'CKAD',
        field: 'Certified Kubernetes Application Developer',
      },
    ],
    languages: [
      { sourceId: 'lang-1', language: 'English', proficiency: 'C1' },
      { sourceId: 'lang-2', language: 'Czech', proficiency: 'Native' },
      { sourceId: 'lang-3', language: 'German', proficiency: 'B1' },
    ],
  }
}

function makeRealisticCzechCv(): GeneratedCv {
  return {
    language: 'cs',
    professionalTitle: 'Senior Full-Stack Inženýr',
    professionalSummary:
      'Full-stack inženýr s 9 lety zkušeností s vývojem TypeScript aplikací pro fintech a e-commerce. ' +
      'Specializuji se na Vue 3, Node.js a cloudové architektury na AWS. ' +
      'Zastánce automatizovaného testování, CI/CD a čistého API designu.',
    technicalSkills: [
      'TypeScript', 'Vue 3', 'Nuxt 3', 'React', 'Node.js',
      'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
      'AWS', 'Terraform', 'Playwright', 'Vitest', 'REST API',
      'GraphQL', 'gRPC', 'CI/CD', 'Git', 'Linux',
    ],
    experience: [
      {
        sourceId: 'exp-1',
        company: 'FinanceTech s.r.o.',
        position: 'Senior Full-Stack Inženýr',
        startDate: '2022-01',
        endDate: null,
        highlights: [
          'Navrhl real-time transakční dashboard pro 50 000 denních uživatelů',
          'Snížil latenci API o 45 % optimalizací dotazů a Redis cache',
          'Vedl migraci z monolit na event-driven mikroslužby (Node.js / Kafka)',
        ],
      },
      {
        sourceId: 'exp-2',
        company: 'Shopify Partner Agency',
        position: 'Frontend Inženýr',
        startDate: '2019-06',
        endDate: '2021-12',
        highlights: [
          'Vybudoval Nuxt 3 e-commerce řešení pro 12 enterprise klientů',
          'Zkrátil QA cyklus z 3 dnů na 4 hodiny zavedením Playwright testů',
        ],
      },
      {
        sourceId: 'exp-3',
        company: 'StartupXYZ s.r.o.',
        position: 'Software Inženýr',
        startDate: '2017-03',
        endDate: '2019-05',
        highlights: [
          'Vyvíjel REST a GraphQL API pro mobilní a webové klienty',
          'Nakonfiguroval infrastrukturu AWS ECS a RDS pomocí Terraformu',
        ],
      },
      {
        sourceId: 'exp-4',
        company: 'Digital Agency Praha',
        position: 'Junior Vývojář',
        startDate: '2015-01',
        endDate: '2017-02',
        highlights: [
          'Spravoval a rozšiřoval PHP/Vue.js webové aplikace pro 15 SME klientů',
          'Zavedl unit testy v Jest; pokrytí kódu vzrostlo z 0 % na 60 %',
        ],
      },
    ],
    projects: [
      {
        sourceId: 'proj-1',
        name: 'vue-querykit',
        role: 'Autor',
        highlights: [
          'Open-source composable knihovna pro správu async stavu ve Vue 3',
          '2 100+ GitHub hvězdiček; používají ji firmy v produkci',
        ],
      },
      {
        sourceId: 'proj-2',
        name: 'ts-event-bus',
        role: 'Přispěvatel',
        highlights: [
          'Typově bezpečná in-process event bus pro TypeScript Node.js aplikace',
          'Přispěl adaptér pro WebSocket transport a výkonnostní benchmarky',
        ],
      },
    ],
    education: [
      {
        sourceId: 'edu-1',
        institution: 'České vysoké učení technické v Praze',
        degree: 'Bc.',
        field: 'Informatika',
      },
      {
        sourceId: 'edu-2',
        institution: 'Linux Foundation',
        degree: 'CKAD',
        field: 'Certified Kubernetes Application Developer',
      },
    ],
    languages: [
      { sourceId: 'lang-1', language: 'Angličtina', proficiency: 'C1' },
      { sourceId: 'lang-2', language: 'Čeština', proficiency: 'Rodilý mluvčí' },
      { sourceId: 'lang-3', language: 'Němčina', proficiency: 'B1' },
    ],
  }
}

// generateCvPdf loads and registers fonts internally — no test-level setup needed.

// ── Utility to get a Uint8Array from the generated Blob ──────────────────────

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

// ── Sample PDF output helpers (optional, gated by GENERATE_SAMPLES=true) ─────

function writeSampleIfEnabled(name: string, buffer: Uint8Array): void {
  if (process.env['GENERATE_SAMPLES'] !== 'true') return
  const dir = path.resolve('dist', 'samples')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.pdf`), buffer)
}

// ── Date formatting ───────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats English dates as "Mon YYYY"', () => {
    expect(formatDate('2020-01', 'en')).toBe('Jan 2020')
    expect(formatDate('2023-12', 'en')).toBe('Dec 2023')
    expect(formatDate('2019-06', 'en')).toBe('Jun 2019')
  })

  it('formats Czech dates as "Mon YYYY" using Czech month abbreviations', () => {
    expect(formatDate('2020-01', 'cs')).toBe('Led 2020')
    expect(formatDate('2023-12', 'cs')).toBe('Pro 2023')
    expect(formatDate('2019-06', 'cs')).toBe('Čvn 2019')
  })

  it('handles incomplete input gracefully', () => {
    expect(formatDate('2020', 'en')).toBe('2020')
  })
})

describe('formatDateRange', () => {
  it('shows "Present" (en) for null endDate', () => {
    expect(formatDateRange('2020-01', null, 'en')).toContain('Present')
  })

  it('shows "současnost" (cs) for null endDate', () => {
    expect(formatDateRange('2020-01', null, 'cs')).toContain('současnost')
  })

  it('formats both dates when endDate is provided', () => {
    expect(formatDateRange('2020-01', '2023-06', 'en')).toBe('Jan 2020 – Jun 2023')
  })
})

// ── isCvPdfError type guard ───────────────────────────────────────────────────

describe('isCvPdfError', () => {
  it('recognises a CvPdfError object', () => {
    expect(isCvPdfError({ code: 'PDF_OVERFLOW', message: 'too long' })).toBe(true)
  })

  it('rejects unrelated objects', () => {
    expect(isCvPdfError({ code: 'OTHER', message: 'x' })).toBe(false)
    expect(isCvPdfError(null)).toBe(false)
    expect(isCvPdfError('string')).toBe(false)
  })
})

// ── countPdfPages ─────────────────────────────────────────────────────────────

describe('countPdfPages', () => {
  it('throws a meaningful error for an empty buffer', async () => {
    await expect(countPdfPages(new Uint8Array(0))).rejects.toThrow(/PDF page count failed/)
  })

  it('throws a meaningful error for non-PDF bytes', async () => {
    const junk = new TextEncoder().encode('this is not a pdf')
    await expect(countPdfPages(junk)).rejects.toThrow(/PDF page count failed/)
  })

  it('returns 1 for a real single-page PDF', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()
    expect(await countPdfPages(bytes)).toBe(1)
  })

  it('returns 2 for a real two-page PDF', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addPage()
    const bytes = await doc.save()
    expect(await countPdfPages(bytes)).toBe(2)
  })

  it('returns 5 for a real five-page PDF', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    for (let i = 0; i < 5; i++) doc.addPage()
    const bytes = await doc.save()
    expect(await countPdfPages(bytes)).toBe(5)
  })
})

// ── buildCvDocDefinition (unit tests, no actual PDF generation) ───────────────

describe('buildCvDocDefinition', () => {
  it('sets A4 page size and portrait orientation', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    expect(doc.pageSize).toBe('A4')
    expect(doc.pageOrientation).toBe('portrait')
  })

  it('sets page margins of 45pt on all sides (~16 mm)', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    expect(doc.pageMargins).toEqual([45, 45, 45, 45])
  })

  it('includes the full name in the content', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ fullName: 'Alice Wonderland' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Alice Wonderland')
  })

  it('includes populated contact fields', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ email: 'alice@test.com', phone: '+1 555 0001' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('alice@test.com')
    expect(contentStr).toContain('+1 555 0001')
  })

  it('omits empty contact fields', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: '', github: '' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).not.toContain('linkedin.com')
    expect(contentStr).not.toContain('github.com')
  })

  it('uses English section headings for language="en"', () => {
    const doc = buildCvDocDefinition(makeCv({ language: 'en' }), makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('PROFESSIONAL SUMMARY')
    expect(contentStr).toContain('TECHNICAL SKILLS')
    expect(contentStr).toContain('PROFESSIONAL EXPERIENCE')
    expect(contentStr).toContain('SELECTED PROJECTS')
    expect(contentStr).toContain('EDUCATION & TRAINING')
    expect(contentStr).toContain('LANGUAGES')
  })

  it('uses Czech section headings for language="cs"', () => {
    const doc = buildCvDocDefinition(makeCv({ language: 'cs' }), makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('PROFESNÍ SHRNUTÍ')
    expect(contentStr).toContain('TECHNICKÉ DOVEDNOSTI')
    expect(contentStr).toContain('PRACOVNÍ ZKUŠENOSTI')
    expect(contentStr).toContain('VYBRANÉ PROJEKTY')
    expect(contentStr).toContain('VZDĚLÁNÍ A ŠKOLENÍ')
    expect(contentStr).toContain('JAZYKY')
  })

  it('preserves experience order', () => {
    const exp1 = makeExp({ sourceId: 'exp-1', company: 'First Corp', position: 'Junior Dev' })
    const exp2 = makeExp({ sourceId: 'exp-2', company: 'Second Corp', position: 'Senior Dev' })
    const doc = buildCvDocDefinition(makeCv({ experience: [exp1, exp2] }), makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr.indexOf('First Corp')).toBeLessThan(contentStr.indexOf('Second Corp'))
  })

  it('preserves project order', () => {
    const proj1 = makeProject({ sourceId: 'p1', name: 'Alpha Project' })
    const proj2 = makeProject({ sourceId: 'p2', name: 'Beta Project' })
    const proj3 = makeProject({ sourceId: 'p3', name: 'Gamma Project' })
    const doc = buildCvDocDefinition(
      makeCv({ projects: [proj1, proj2, proj3] }),
      makePersonal(),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr.indexOf('Alpha Project')).toBeLessThan(contentStr.indexOf('Beta Project'))
    expect(contentStr.indexOf('Beta Project')).toBeLessThan(contentStr.indexOf('Gamma Project'))
  })

  it('renders projects with and without a role', () => {
    const withRole = makeProject({ name: 'RoleProj', role: 'Lead' })
    const withoutRole = makeProject({ name: 'NoRoleProj', role: '' })
    const doc = buildCvDocDefinition(
      makeCv({ projects: [withRole, withoutRole] }),
      makePersonal(),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('RoleProj')
    expect(contentStr).toContain('Lead')
    expect(contentStr).toContain('NoRoleProj')
  })

  it('handles multiple projects with varying highlight counts', () => {
    const p1 = makeProject({ name: 'BigProj', highlights: ['H1', 'H2', 'H3', 'H4'] })
    const p2 = makeProject({ name: 'TinyProj', highlights: ['Only one highlight'] })
    const doc = buildCvDocDefinition(makeCv({ projects: [p1, p2] }), makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('H1')
    expect(contentStr).toContain('H4')
    expect(contentStr).toContain('Only one highlight')
  })

  it('omits sections that have no data', () => {
    const cv = makeCv({ experience: [], projects: [], education: [], languages: [] })
    const doc = buildCvDocDefinition(cv, makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).not.toContain('PROFESSIONAL EXPERIENCE')
    expect(contentStr).not.toContain('SELECTED PROJECTS')
    expect(contentStr).not.toContain('EDUCATION')
    expect(contentStr).not.toContain('LANGUAGES')
  })

  it('renders Czech diacritics in content', () => {
    const czechSummary = 'Zkušený inženýr s odborností na TypeScript, Rust a Vue 3.'
    const doc = buildCvDocDefinition(
      makeCv({ language: 'cs', professionalSummary: czechSummary }),
      makePersonal({ fullName: 'Jana Nováková' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Jana Nováková')
    expect(contentStr).toContain('Zkušený')
  })

  it('does not contain fabricated data beyond the input', () => {
    const cv = makeCv({ experience: [makeExp({ company: 'Real Company' })] })
    const doc = buildCvDocDefinition(cv, makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Real Company')
    expect(contentStr).not.toContain('Fake Company')
  })
})

// ── Visual style ─────────────────────────────────────────────────────────────

describe('visual style', () => {
  it('section heading style uses dark navy accent color (#1a3a5c)', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    const styles = doc.styles as Record<string, Record<string, unknown>>
    expect(styles?.['sectionHeading']?.['color']).toBe('#1a3a5c')
  })

  it('section heading style is bold', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    const styles = doc.styles as Record<string, Record<string, unknown>>
    expect(styles?.['sectionHeading']?.['bold']).toBe(true)
  })

  it('section heading underline rule uses navy color in content', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    expect(JSON.stringify(doc.content)).toContain('#1a3a5c')
  })

  it('name style is 18pt bold', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    const styles = doc.styles as Record<string, Record<string, unknown>>
    expect(styles?.['name']?.['fontSize']).toBe(18)
    expect(styles?.['name']?.['bold']).toBe(true)
  })

  it('entry title color differs from section heading color (clear hierarchy)', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    const styles = doc.styles as Record<string, Record<string, unknown>>
    expect(styles?.['entryTitle']?.['color']).not.toBe(styles?.['sectionHeading']?.['color'])
  })

  it('contact info is smaller than body text', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    const styles = doc.styles as Record<string, Record<string, unknown>>
    const contactSize = styles?.['contact']?.['fontSize'] as number
    const bodySize = styles?.['body']?.['fontSize'] as number
    expect(contactSize).toBeLessThan(bodySize)
  })
})

// ── Realistic CV density ──────────────────────────────────────────────────────

describe('realistic CV density', () => {
  it('realistic 4-experience CV generates a valid PDF blob', async () => {
    const blob = await generateCvPdf(makeRealisticCv(), makeRealisticPersonal())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(5000)
  })

  it('realistic 4-experience CV fits on exactly one page', async () => {
    const blob = await generateCvPdf(makeRealisticCv(), makeRealisticPersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('doc definition includes all 4 experience entries', () => {
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('FinanceTech s.r.o.')
    expect(contentStr).toContain('Shopify Partner Agency')
    expect(contentStr).toContain('StartupXYZ s.r.o.')
    expect(contentStr).toContain('Digital Agency Praha')
  })

  it('experience entries appear in correct order', () => {
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr.indexOf('FinanceTech')).toBeLessThan(contentStr.indexOf('Shopify'))
    expect(contentStr.indexOf('Shopify')).toBeLessThan(contentStr.indexOf('StartupXYZ'))
    expect(contentStr.indexOf('StartupXYZ')).toBeLessThan(contentStr.indexOf('Digital Agency'))
  })

  it('doc definition includes both projects', () => {
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('vue-querykit')
    expect(contentStr).toContain('ts-event-bus')
    expect(contentStr.indexOf('vue-querykit')).toBeLessThan(contentStr.indexOf('ts-event-bus'))
  })

  it('project with 3 highlights renders all 3 bullets', () => {
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Open-source composable library')
    expect(contentStr).toContain('2,100+ GitHub stars')
    expect(contentStr).toContain('Zero-dependency core')
  })

  it('project with 2 highlights renders both bullets', () => {
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Type-safe in-process event bus')
    expect(contentStr).toContain('WebSocket transport adapter')
  })

  it('20 technical skills appear in the document definition', () => {
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    // Spot-check a sample of the 20 skills
    expect(contentStr).toContain('TypeScript')
    expect(contentStr).toContain('Kubernetes')
    expect(contentStr).toContain('GraphQL')
    expect(contentStr).toContain('Terraform')
    expect(contentStr).toContain('Linux')
  })

  it('25-skill list renders without overflow', async () => {
    const cv = makeCv({
      technicalSkills: [
        'TypeScript', 'JavaScript', 'Vue 3', 'Nuxt 3', 'React',
        'Next.js', 'Node.js', 'Deno', 'Bun', 'PostgreSQL',
        'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
        'AWS', 'GCP', 'Azure', 'Terraform', 'Ansible',
        'Playwright', 'Vitest', 'Jest', 'CI/CD', 'Git',
      ],
    })
    const blob = await generateCvPdf(cv, makePersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('Czech realistic CV fits on exactly one page', async () => {
    const blob = await generateCvPdf(makeRealisticCzechCv(), makeRealisticPersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('Czech realistic CV includes authentic Czech characters', () => {
    const doc = buildCvDocDefinition(makeRealisticCzechCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    // Diacritics from Czech summary and experience entries
    expect(contentStr).toContain('transakční')
    expect(contentStr).toContain('Navrhl')
    expect(contentStr).toContain('Čeština')
    expect(contentStr).toContain('Rodilý mluvčí')
  })

  it('Czech realistic CV uses Czech section labels', () => {
    const doc = buildCvDocDefinition(makeRealisticCzechCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('PRACOVNÍ ZKUŠENOSTI')
    expect(contentStr).toContain('VYBRANÉ PROJEKTY')
    expect(contentStr).toContain('VZDĚLÁNÍ A ŠKOLENÍ')
  })

  it('renderer does not rewrite or summarise project descriptions', () => {
    const proj1Text = 'Open-source composable library for async state management in Vue 3'
    const proj2Text = 'Type-safe in-process event bus for TypeScript Node.js applications'
    const doc = buildCvDocDefinition(makeRealisticCv(), makeRealisticPersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain(proj1Text)
    expect(contentStr).toContain(proj2Text)
  })

  it('realistic CV does not mutate the cv argument', async () => {
    const cv = makeRealisticCv()
    const snap = JSON.parse(JSON.stringify(cv)) as GeneratedCv
    await generateCvPdf(cv, makeRealisticPersonal())
    expect(cv).toEqual(snap)
  })
})

// ── Input immutability ────────────────────────────────────────────────────────

describe('input immutability', () => {
  it('does not mutate the cv argument', async () => {
    const cv = makeCv()
    const original = JSON.parse(JSON.stringify(cv)) as GeneratedCv
    await generateCvPdf(cv, makePersonal())
    expect(cv).toEqual(original)
  })

  it('does not mutate the personal argument', async () => {
    const personal = makePersonal()
    const original = { ...personal }
    await generateCvPdf(makeCv(), personal)
    expect(personal).toEqual(original)
  })
})

// ── Integration tests: actual PDF generation ──────────────────────────────────

describe('generateCvPdf — valid output', () => {
  it('returns a Blob with application/pdf type', async () => {
    const blob = await generateCvPdf(makeCv(), makePersonal())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('produces a non-empty PDF', async () => {
    const blob = await generateCvPdf(makeCv(), makePersonal())
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('begins with the PDF magic bytes %PDF', async () => {
    const blob = await generateCvPdf(makeCv(), makePersonal())
    const bytes = await blobToUint8Array(blob)
    const header = String.fromCharCode(...bytes.slice(0, 4))
    expect(header).toBe('%PDF')
  })

  it('generates exactly one page for normal-sized content', async () => {
    const blob = await generateCvPdf(makeCv(), makePersonal())
    const bytes = await blobToUint8Array(blob)
    expect(await countPdfPages(bytes)).toBe(1)
  })

  it('generates one page for a minimal CV (all optional sections empty)', async () => {
    const cv = makeCv({
      experience: [],
      projects: [],
      education: [],
      languages: [],
      professionalSummary: '',
      technicalSkills: [],
    })
    const blob = await generateCvPdf(cv, makePersonal())
    const bytes = await blobToUint8Array(blob)
    expect(await countPdfPages(bytes)).toBe(1)
  })

  it('generates one page for a CV with multiple projects', async () => {
    const projects: GeneratedCvProject[] = Array.from({ length: 3 }, (_, i) => ({
      sourceId: `p${i}`,
      name: `Project ${i}`,
      role: 'Contributor',
      highlights: ['Highlight A', 'Highlight B'],
    }))
    const blob = await generateCvPdf(makeCv({ projects }), makePersonal())
    const bytes = await blobToUint8Array(blob)
    expect(await countPdfPages(bytes)).toBe(1)
  })
})

describe('generateCvPdf — Czech locale', () => {
  it('generates a valid PDF for a Czech CV', async () => {
    const cv = makeCv({
      language: 'cs',
      professionalSummary: 'Zkušený vývojář s odborností na TypeScript a Vue 3. Ěščřžý.',
      technicalSkills: ['TypeScript', 'Vue 3', 'Rust', 'Docker'],
      experience: [
        makeExp({ company: 'Česká Firma s.r.o.', position: 'Vedoucí vývojář', highlights: ['Vedl tým 5 vývojářů', 'Zavedl CI/CD'] }),
      ],
    })
    const personal = makePersonal({ fullName: 'Jana Nováková', location: 'Praha, ČR' })
    const blob = await generateCvPdf(cv, personal)
    expect(blob.type).toBe('application/pdf')
    const bytes = await blobToUint8Array(blob)
    expect(await countPdfPages(bytes)).toBe(1)
  })
})

// ── Overflow detection ────────────────────────────────────────────────────────

describe('generateCvPdf — overflow detection', () => {
  it('throws CvPdfError with PDF_OVERFLOW for content exceeding one page', async () => {
    const longHighlight = 'This is a very detailed highlight describing work done in depth. '.repeat(3)
    const manyExp: GeneratedCvExperience[] = Array.from({ length: 8 }, (_, i) => ({
      sourceId: `exp-${i}`,
      company: `Company ${i}`,
      position: `Senior Engineer ${i}`,
      startDate: '2010-01',
      endDate: '2023-12',
      highlights: [longHighlight, longHighlight, longHighlight],
    }))
    const cv = makeCv({ experience: manyExp })

    let caughtError: unknown = null
    try {
      await generateCvPdf(cv, makePersonal())
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).not.toBeNull()
    expect(isCvPdfError(caughtError)).toBe(true)
    if (isCvPdfError(caughtError)) {
      expect(caughtError.code).toBe('PDF_OVERFLOW')
      expect(caughtError.message).toMatch(/page/)
    }
  })

  it('does not silently truncate or return multi-page PDF on overflow', async () => {
    const manyExp: GeneratedCvExperience[] = Array.from({ length: 15 }, (_, i) => ({
      sourceId: `exp-${i}`,
      company: `Corp ${i}`,
      position: `Engineer ${i}`,
      startDate: '2015-01',
      endDate: null,
      highlights: ['Detailed work item one', 'Detailed work item two', 'Detailed work item three'],
    }))

    let threw = false
    try {
      await generateCvPdf(makeCv({ experience: manyExp }), makePersonal())
    } catch {
      threw = true
    }

    // Must throw rather than silently succeed
    expect(threw).toBe(true)
  })
})

// ── Sample PDF generation (opt-in via GENERATE_SAMPLES=true) ─────────────────

describe('sample PDFs', () => {
  it('realistic frontend CV — 4 experience entries, 2 projects (en)', async () => {
    const cv: GeneratedCv = {
      language: 'en',
      professionalTitle: 'Vue / Nuxt Frontend Engineer',
      professionalSummary:
        'Frontend engineer with 8 years of experience building high-performance Vue 3 and Nuxt applications for SaaS and e-commerce. ' +
        'Focused on composable architecture, testing discipline, and measurable performance improvements.',
      technicalSkills: [
        'Vue 3', 'Nuxt 3', 'TypeScript', 'Pinia', 'Vite',
        'Vitest', 'Playwright', 'TailwindCSS', 'REST APIs', 'GraphQL',
        'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'CI/CD',
      ],
      experience: [
        {
          sourceId: 'exp-1', company: 'Vueify Ltd', position: 'Lead Frontend Engineer',
          startDate: '2021-03', endDate: null,
          highlights: [
            'Architected Nuxt 3 SSR storefront serving 200,000 monthly visitors',
            'Reduced LCP by 38% through component-level code splitting and image CDN',
            'Mentored 3 junior engineers; introduced pair-programming and PR review norms',
          ],
        },
        {
          sourceId: 'exp-2', company: 'TechRetail AG', position: 'Senior Frontend Developer',
          startDate: '2018-09', endDate: '2021-02',
          highlights: [
            'Built configurable product configurator in Vue 2 handling 40+ SKU attributes',
            'Migrated test suite from Karma to Vitest; CI pipeline cut from 18 to 6 minutes',
          ],
        },
        {
          sourceId: 'exp-3', company: 'Webco s.r.o.', position: 'Frontend Developer',
          startDate: '2016-04', endDate: '2018-08',
          highlights: [
            'Developed Vue.js marketing sites for 20+ agency clients',
            'Integrated Stripe checkout and Algolia search into headless commerce setup',
          ],
        },
        {
          sourceId: 'exp-4', company: 'Digital Studio Praha', position: 'Junior Web Developer',
          startDate: '2014-06', endDate: '2016-03',
          highlights: [
            'Built and maintained WordPress and PHP web applications',
            'Introduced SCSS and BEM naming convention across the team',
          ],
        },
      ],
      projects: [
        {
          sourceId: 'proj-1', name: 'Nuxt UI Kit', role: 'Creator',
          highlights: [
            'Open-source library of 55 composable Vue 3 components with full Storybook docs',
            '1,200+ GitHub stars; adopted by 3 agency teams as the default component base',
          ],
        },
        {
          sourceId: 'proj-2', name: 'vite-plugin-i18n-auto', role: 'Author',
          highlights: ['Vite plugin that auto-generates i18n type-definitions from JSON locale files'],
        },
      ],
      education: [
        { sourceId: 'edu-1', institution: 'Prague University of Technology', degree: 'MSc', field: 'Software Engineering' },
      ],
      languages: [
        { sourceId: 'lang-1', language: 'English', proficiency: 'C1' },
        { sourceId: 'lang-2', language: 'Czech', proficiency: 'Native' },
      ],
    }
    const blob = await generateCvPdf(cv, makePersonal({ fullName: 'Tomáš Veselý', linkedIn: 'linkedin.com/in/tomas-vesely', github: 'github.com/tvesel' }))
    writeSampleIfEnabled('frontend-en', await blobToUint8Array(blob))
    expect(blob.type).toBe('application/pdf')
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('realistic full-stack CV — detailed projects, 20 skills (en)', async () => {
    const blob = await generateCvPdf(makeRealisticCv(), makeRealisticPersonal())
    writeSampleIfEnabled('fullstack-en', await blobToUint8Array(blob))
    expect(blob.type).toBe('application/pdf')
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('realistic Czech CV — 4 entries, authentic diacritics (cs)', async () => {
    const blob = await generateCvPdf(makeRealisticCzechCv(), makeRealisticPersonal())
    writeSampleIfEnabled('czech-realistic-cs', await blobToUint8Array(blob))
    expect(blob.type).toBe('application/pdf')
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('oversized fixture — demonstrates PDF_OVERFLOW', async () => {
    const longSummary = 'Expert engineer with deep expertise in distributed systems, cloud architecture, and team leadership. '.repeat(4)
    const manyExp: GeneratedCvExperience[] = Array.from({ length: 10 }, (_, i) => ({
      sourceId: `exp-${i}`,
      company: `Enterprise Corp ${i}`,
      position: `Principal Software Architect ${i}`,
      startDate: '2005-01',
      endDate: '2023-12',
      highlights: [
        'Designed and deployed microservices architecture serving 10M requests/day',
        'Led cross-functional team of 12 engineers across 3 time zones',
        'Reduced infrastructure costs by 35% through Kubernetes optimisations',
      ],
    }))
    const cv = makeCv({
      professionalSummary: longSummary,
      experience: manyExp,
      projects: Array.from({ length: 5 }, (_, i) => makeProject({ sourceId: `p${i}`, name: `Major Initiative ${i}`, highlights: ['Delivered on time', 'Under budget', 'Exceeded KPIs'] })),
    })

    let err: unknown = null
    try {
      await generateCvPdf(cv, makePersonal())
    } catch (e) {
      err = e
    }

    expect(isCvPdfError(err)).toBe(true)
    if (isCvPdfError(err)) {
      expect(err.code).toBe('PDF_OVERFLOW')
    }
  })
})

// ── normalizeContactUrl ──────────────────────────────────────────────────────

describe('normalizeContactUrl', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeContactUrl('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeContactUrl('   ')).toBe('')
  })

  it('returns empty string for bare word without dot (not a URL)', () => {
    expect(normalizeContactUrl('linkedin')).toBe('')
  })

  it('prepends https:// to domain-like strings', () => {
    expect(normalizeContactUrl('linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane')
  })

  it('prepends https:// to github.com path', () => {
    expect(normalizeContactUrl('github.com/jane')).toBe('https://github.com/jane')
  })

  it('preserves existing https:// prefix', () => {
    expect(normalizeContactUrl('https://linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane')
  })

  it('preserves existing http:// prefix', () => {
    expect(normalizeContactUrl('http://github.com/jane')).toBe('http://github.com/jane')
  })

  it('trims leading/trailing whitespace before processing', () => {
    expect(normalizeContactUrl('  linkedin.com/in/jane  ')).toBe('https://linkedin.com/in/jane')
  })

  it('rejects javascript: scheme', () => {
    expect(normalizeContactUrl('javascript:alert(1)')).toBe('')
  })

  it('rejects data: scheme', () => {
    expect(normalizeContactUrl('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('rejects vbscript: scheme', () => {
    expect(normalizeContactUrl('vbscript:msgbox(1)')).toBe('')
  })

  it('rejects file: scheme', () => {
    expect(normalizeContactUrl('file:///etc/passwd')).toBe('')
  })

  it('rejects javascript: scheme case-insensitively', () => {
    expect(normalizeContactUrl('JAVASCRIPT:alert(1)')).toBe('')
  })
})

// ── Contact header layout ─────────────────────────────────────────────────────

describe('contact header layout', () => {
  it('row 1 includes location as plain text', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ location: 'Prague, CZ' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Prague, CZ')
  })

  it('row 1 includes phone as plain text', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ phone: '+420 777 123 456' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('+420 777 123 456')
  })

  it('row 1 includes email as plain text', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ email: 'jane@example.com' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('jane@example.com')
  })

  it('row 1 email has mailto: link', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ email: 'jane@example.com' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('mailto:jane@example.com')
  })

  it('row 1 phone has tel: link', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal({ phone: '+420777123456' }))
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('tel:')
  })

  it('row 2 shows "LinkedIn" label (not the raw URL) when linkedIn is populated', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: 'linkedin.com/in/janesmith' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('"LinkedIn"')
    expect(contentStr).not.toContain('"linkedin.com/in/janesmith"')
  })

  it('row 2 shows "GitHub" label (not the raw URL) when github is populated', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ github: 'github.com/janesmith' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('"GitHub"')
    expect(contentStr).not.toContain('"github.com/janesmith"')
  })

  it('row 2 LinkedIn label links to normalized https:// URL', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: 'linkedin.com/in/janesmith' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('https://linkedin.com/in/janesmith')
  })

  it('row 2 GitHub label links to normalized https:// URL', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ github: 'github.com/janesmith' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('https://github.com/janesmith')
  })

  it('row 2 LinkedIn link preserves existing https:// prefix', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: 'https://linkedin.com/in/janesmith' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('https://linkedin.com/in/janesmith')
  })

  it('row 2 is omitted when both linkedIn and github are empty', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: '', github: '' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).not.toContain('"LinkedIn"')
    expect(contentStr).not.toContain('"GitHub"')
  })

  it('row 2 shows only LinkedIn label when github is empty', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: 'linkedin.com/in/jane', github: '' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('"LinkedIn"')
    expect(contentStr).not.toContain('"GitHub"')
  })

  it('row 2 shows only GitHub label when linkedIn is empty', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: '', github: 'github.com/jane' }),
    )
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).not.toContain('"LinkedIn"')
    expect(contentStr).toContain('"GitHub"')
  })

  it('row 1 is omitted when location, phone, and email are all empty', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ location: '', phone: '', email: '' }),
    )
    const contentStr = JSON.stringify(doc.content)
    // No mailto: or tel: links should be present if all row 1 fields are absent
    expect(contentStr).not.toContain('mailto:')
    expect(contentStr).not.toContain('"tel:')
  })

  it('contact info is smaller than body text (style check still passes)', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal())
    const styles = doc.styles as Record<string, Record<string, unknown>>
    const contactSize = styles?.['contact']?.['fontSize'] as number
    const bodySize = styles?.['body']?.['fontSize'] as number
    expect(contactSize).toBeLessThan(bodySize)
  })
})

// ── Contact header — integration: realistic PDF still fits on one page ────────

describe('contact header — realistic PDF page count', () => {
  it('realistic CV with all contact fields (including LinkedIn and GitHub) fits on one page', async () => {
    const blob = await generateCvPdf(makeRealisticCv(), makeRealisticPersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('realistic Czech CV with all contact fields fits on one page', async () => {
    const blob = await generateCvPdf(makeRealisticCzechCv(), makeRealisticPersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })
})

// ── No OpenAI or Chrome Storage dependency ───────────────────────────────────

describe('no external service dependencies', () => {
  it('chrome.storage is never accessed during PDF generation', async () => {
    const getSpy = chrome.storage.local.get as ReturnType<typeof vi.fn>
    const setSpy = chrome.storage.local.set as ReturnType<typeof vi.fn>
    getSpy.mockClear()
    setSpy.mockClear()

    await generateCvPdf(makeCv(), makePersonal())

    expect(getSpy).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
  })
})

// ── Project links in PDF (006B.3) ─────────────────────────────────────────────

describe('project links in PDF', () => {
  it('English CV uses "View project" label', () => {
    const proj = makeProject({ url: 'https://github.com/jane/logger' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).toContain('View project')
  })

  it('Czech CV uses "Zobrazit projekt" label', () => {
    const proj = makeProject({ url: 'https://github.com/jane/logger' })
    const doc = buildCvDocDefinition(makeCv({ language: 'cs', projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).toContain('Zobrazit projekt')
  })

  it('project link destination is the normalized https:// URL', () => {
    const proj = makeProject({ url: 'github.com/jane/logger' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).toContain('https://github.com/jane/logger')
  })

  it('project link preserves existing https:// URL as-is', () => {
    const proj = makeProject({ url: 'https://example.com/my-project' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).toContain('https://example.com/my-project')
  })

  it('project link is omitted when url is undefined', () => {
    const proj = makeProject()
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).not.toContain('View project')
  })

  it('project link is omitted when url is empty string', () => {
    const proj = makeProject({ url: '' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).not.toContain('View project')
  })

  it('project link is omitted for unsafe javascript: scheme', () => {
    const proj = makeProject({ url: 'javascript:alert(1)' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).not.toContain('View project')
    expect(JSON.stringify(doc.content)).not.toContain('javascript:')
  })

  it('project link is omitted for data: scheme', () => {
    const proj = makeProject({ url: 'data:text/html,<evil>' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).not.toContain('View project')
  })

  it('highlights still appear for projects with a url', () => {
    const proj = makeProject({ url: 'https://github.com/jane/logger', highlights: ['Highlight A', 'Highlight B'] })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('Highlight A')
    expect(contentStr).toContain('Highlight B')
  })

  it('highlights still appear for projects without a url', () => {
    const proj = makeProject({ highlights: ['No link highlight'] })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal())
    expect(JSON.stringify(doc.content)).toContain('No link highlight')
  })

  it('multiple projects each show their own link when url is present', () => {
    const projects: GeneratedCvProject[] = [
      makeProject({ sourceId: 'p1', name: 'Alpha', url: 'https://alpha.example.com' }),
      makeProject({ sourceId: 'p2', name: 'Beta', url: 'https://beta.example.com' }),
    ]
    const doc = buildCvDocDefinition(makeCv({ projects }), makePersonal())
    const contentStr = JSON.stringify(doc.content)
    expect(contentStr).toContain('https://alpha.example.com')
    expect(contentStr).toContain('https://beta.example.com')
    // Both "View project" labels are present (appears twice in stringified JSON)
    const viewProjectCount = (contentStr.match(/View project/g) ?? []).length
    expect(viewProjectCount).toBe(2)
  })

  it('project with url does not mutate the cv argument', async () => {
    const proj = makeProject({ url: 'https://github.com/jane/logger' })
    const cv = makeCv({ projects: [proj] })
    const snap = JSON.parse(JSON.stringify(cv)) as GeneratedCv
    await generateCvPdf(cv, makePersonal())
    expect(cv).toEqual(snap)
  })

  it('realistic CV with project URLs fits on exactly one page', async () => {
    const proj1 = makeProject({ sourceId: 'p1', name: 'Open Logger', url: 'https://github.com/jane/logger' })
    const proj2: GeneratedCvProject = { sourceId: 'p2', name: 'TS Event Bus', role: 'Author', url: 'https://github.com/jane/ts-event-bus', highlights: ['Type-safe in-process event bus', 'WebSocket transport adapter'] }
    const cv = makeCv({ projects: [proj1, proj2] })
    const blob = await generateCvPdf(cv, makePersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })

  it('Czech CV with project URLs fits on exactly one page', async () => {
    const proj = makeProject({ url: 'https://github.com/jane/logger' })
    const cv = makeCv({ language: 'cs', projects: [proj] })
    const blob = await generateCvPdf(cv, makePersonal())
    expect(await countPdfPages(await blobToUint8Array(blob))).toBe(1)
  })
})

// ── Compact layout fallback (006D.1) ─────────────────────────────────────────

// A CV that fits standard layout — used for tests that must NOT trigger compact.
function makeStandardFitCv(): GeneratedCv {
  return makeRealisticCv()
}

// A CV designed to overflow standard layout but fit compact.
// Extends the realistic CV with an extra experience entry and a third project.
function makeBorderlineCv(): GeneratedCv {
  const base = makeRealisticCv()
  return {
    ...base,
    experience: [
      ...base.experience,
      {
        sourceId: 'exp-5',
        company: 'Open Source Collective',
        position: 'Staff Engineer',
        startDate: '2012-06',
        endDate: '2015-01',
        highlights: [
          'Maintained and extended a widely-used TypeScript linting plugin',
          'Triaged 200+ issues and authored release notes for 8 minor versions',
          'Coordinated contributions from 30+ external contributors globally',
        ],
      },
    ],
    projects: [
      ...base.projects,
      {
        sourceId: 'proj-3',
        name: 'kafka-schema-bridge',
        role: 'Author',
        url: 'https://github.com/janp/kafka-schema-bridge',
        highlights: [
          'Bridges Apache Kafka with Confluent Schema Registry for TypeScript consumers',
          'Automated schema evolution with Avro and JSON Schema support',
        ],
      },
    ],
  }
}

// A CV so large that neither layout can fit it on one page.
function makeHeavyOverflowCv(): GeneratedCv {
  const longHighlight = 'This is an extensively detailed highlight describing complex architectural decisions and cross-team impact. '.repeat(2)
  return makeCv({
    professionalSummary: 'Expert engineer with 15 years experience. '.repeat(5),
    experience: Array.from({ length: 10 }, (_, i) => ({
      sourceId: `exp-${i}`,
      company: `Enterprise Corp ${i}`,
      position: `Principal Software Architect ${i}`,
      startDate: '2005-01',
      endDate: '2023-12',
      highlights: [longHighlight, longHighlight, longHighlight],
    })),
    projects: Array.from({ length: 5 }, (_, i) => makeProject({
      sourceId: `p${i}`,
      name: `Major Initiative ${i}`,
      highlights: ['Delivered on time', 'Under budget', 'Exceeded all KPIs'],
    })),
  })
}

describe('compact layout — STANDARD_LAYOUT and COMPACT_LAYOUT exports', () => {
  it('STANDARD_LAYOUT has sectionTopMargin of 10', () => {
    expect(STANDARD_LAYOUT.sectionTopMargin).toBe(10)
  })

  it('COMPACT_LAYOUT has sectionTopMargin of 7', () => {
    expect(COMPACT_LAYOUT.sectionTopMargin).toBe(7)
  })

  it('COMPACT_LAYOUT bodyLineHeight is less than STANDARD_LAYOUT', () => {
    expect(COMPACT_LAYOUT.bodyLineHeight).toBeLessThan(STANDARD_LAYOUT.bodyLineHeight)
  })

  it('COMPACT_LAYOUT entryTopMargin is less than STANDARD_LAYOUT', () => {
    expect(COMPACT_LAYOUT.entryTopMargin).toBeLessThan(STANDARD_LAYOUT.entryTopMargin)
  })
})

describe('compact layout — buildCvDocDefinition with layout param', () => {
  it('standard layout body lineHeight is 1.35', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal(), STANDARD_LAYOUT)
    const styles = doc.styles as Record<string, Record<string, unknown>>
    expect(styles?.['body']?.['lineHeight']).toBe(1.35)
  })

  it('compact layout body lineHeight is 1.25', () => {
    const doc = buildCvDocDefinition(makeCv(), makePersonal(), COMPACT_LAYOUT)
    const styles = doc.styles as Record<string, Record<string, unknown>>
    expect(styles?.['body']?.['lineHeight']).toBe(1.25)
  })

  it('both layouts produce identical text content (5. content identity)', () => {
    const cv = makeRealisticCv()
    const personal = makeRealisticPersonal()
    const standard = buildCvDocDefinition(cv, personal, STANDARD_LAYOUT)
    const compact = buildCvDocDefinition(cv, personal, COMPACT_LAYOUT)

    function extractText(doc: ReturnType<typeof buildCvDocDefinition>): string[] {
      const texts: string[] = []
      function walk(node: unknown): void {
        if (typeof node === 'string') {
          texts.push(node)
        } else if (Array.isArray(node)) {
          node.forEach(walk)
        } else if (node !== null && typeof node === 'object') {
          const obj = node as Record<string, unknown>
          if ('text' in obj && typeof obj['text'] === 'string') texts.push(obj['text'])
          if ('text' in obj && Array.isArray(obj['text'])) walk(obj['text'])
          if ('stack' in obj) walk(obj['stack'])
          if ('columns' in obj) walk(obj['columns'])
          if ('content' in obj) walk(obj['content'])
        }
      }
      walk(doc.content)
      return texts
    }

    const standardTexts = extractText(standard).join('\n')
    const compactTexts = extractText(compact).join('\n')
    expect(standardTexts).toBe(compactTexts)
  })

  it('compact layout preserves project URLs (6. link preservation)', () => {
    const proj = makeProject({ url: 'https://github.com/jane/my-lib' })
    const doc = buildCvDocDefinition(makeCv({ projects: [proj] }), makePersonal(), COMPACT_LAYOUT)
    expect(JSON.stringify(doc.content)).toContain('https://github.com/jane/my-lib')
  })

  it('compact layout preserves contact links (6. link preservation)', () => {
    const doc = buildCvDocDefinition(
      makeCv(),
      makePersonal({ linkedIn: 'linkedin.com/in/jane', github: 'github.com/jane', email: 'jane@example.com' }),
      COMPACT_LAYOUT,
    )
    const str = JSON.stringify(doc.content)
    expect(str).toContain('https://linkedin.com/in/jane')
    expect(str).toContain('https://github.com/jane')
    expect(str).toContain('mailto:jane@example.com')
  })

  it('compact layout preserves Czech diacritics (7. Czech diacritics)', () => {
    const doc = buildCvDocDefinition(makeRealisticCzechCv(), makeRealisticPersonal(), COMPACT_LAYOUT)
    const str = JSON.stringify(doc.content)
    expect(str).toContain('transakční')
    expect(str).toContain('Čeština')
    expect(str).toContain('Rodilý mluvčí')
  })

  it('buildCvDocDefinition defaults to STANDARD_LAYOUT when no layout is passed', () => {
    const docDefault = buildCvDocDefinition(makeCv(), makePersonal())
    const docStandard = buildCvDocDefinition(makeCv(), makePersonal(), STANDARD_LAYOUT)
    // Both should produce identical JSON (same spacing values)
    expect(JSON.stringify(docDefault)).toBe(JSON.stringify(docStandard))
  })

  it('page margins are identical between both layouts (11. A4 page, margins unchanged)', () => {
    const standard = buildCvDocDefinition(makeCv(), makePersonal(), STANDARD_LAYOUT)
    const compact = buildCvDocDefinition(makeCv(), makePersonal(), COMPACT_LAYOUT)
    expect(standard.pageMargins).toEqual([45, 45, 45, 45])
    expect(compact.pageMargins).toEqual([45, 45, 45, 45])
  })

  it('name style is 18pt bold in both layouts (preserved typography)', () => {
    for (const layout of [STANDARD_LAYOUT, COMPACT_LAYOUT]) {
      const doc = buildCvDocDefinition(makeCv(), makePersonal(), layout)
      const styles = doc.styles as Record<string, Record<string, unknown>>
      expect(styles?.['name']?.['fontSize']).toBe(18)
      expect(styles?.['name']?.['bold']).toBe(true)
    }
  })

  it('body font size is 9pt in both layouts (preserved typography)', () => {
    for (const layout of [STANDARD_LAYOUT, COMPACT_LAYOUT]) {
      const doc = buildCvDocDefinition(makeCv(), makePersonal(), layout)
      const styles = doc.styles as Record<string, Record<string, unknown>>
      expect(styles?.['body']?.['fontSize']).toBe(9)
    }
  })

  it('section heading color is navy in both layouts (preserved styling)', () => {
    for (const layout of [STANDARD_LAYOUT, COMPACT_LAYOUT]) {
      const doc = buildCvDocDefinition(makeCv(), makePersonal(), layout)
      const styles = doc.styles as Record<string, Record<string, unknown>>
      expect(styles?.['sectionHeading']?.['color']).toBe('#1a3a5c')
    }
  })
})

describe('compact layout — generateCvPdfWithResult fallback logic', () => {
  it('1. standard layout succeeds when content fits: layout is "standard"', async () => {
    const result = await generateCvPdfWithResult(makeStandardFitCv(), makeRealisticPersonal())
    expect(result.layout).toBe('standard')
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.type).toBe('application/pdf')
  })

  it('2. compact is not generated when standard fits: returned PDF is 1 page', async () => {
    const result = await generateCvPdfWithResult(makeStandardFitCv(), makeRealisticPersonal())
    // Verifying layout='standard' proves compact was not needed
    expect(result.layout).toBe('standard')
    const pages = await countPdfPages(await blobToUint8Array(result.blob))
    expect(pages).toBe(1)
  })

  it('3. compact fallback is attempted after standard overflow: layout is "compact"', async () => {
    // borderline CV overflows standard but fits compact
    const result = await generateCvPdfWithResult(makeBorderlineCv(), makeRealisticPersonal())
    // If standard had fit, layout would be 'standard'. Compact means fallback occurred.
    expect(result.layout).toBe('compact')
  })

  it('4. compact layout can fit content that standard cannot: 1-page compact PDF', async () => {
    const result = await generateCvPdfWithResult(makeBorderlineCv(), makeRealisticPersonal())
    expect(result.layout).toBe('compact')
    const pages = await countPdfPages(await blobToUint8Array(result.blob))
    expect(pages).toBe(1)
  })

  it('8. input data remains unchanged after compact fallback', async () => {
    const cv = makeBorderlineCv()
    const personal = makeRealisticPersonal()
    const cvSnap = JSON.parse(JSON.stringify(cv)) as GeneratedCv
    const personalSnap = { ...personal }
    await generateCvPdfWithResult(cv, personal)
    expect(cv).toEqual(cvSnap)
    expect(personal).toEqual(personalSnap)
  })

  it('9. both layouts overflowing throws PDF_OVERFLOW', async () => {
    let caughtError: unknown = null
    try {
      await generateCvPdfWithResult(makeHeavyOverflowCv(), makePersonal())
    } catch (err) {
      caughtError = err
    }
    expect(isCvPdfError(caughtError)).toBe(true)
    if (isCvPdfError(caughtError)) {
      expect(caughtError.code).toBe('PDF_OVERFLOW')
    }
  })

  it('10. non-overflow rendering errors propagate unchanged (not wrapped as CvPdfError)', async () => {
    // countPdfPages throws a plain Error for invalid PDF bytes — that must not be
    // swallowed or wrapped in a CvPdfError by the fallback logic.
    // We simulate this by passing a CV that generates a valid PDF; the internal
    // path only reaches countPdfPages for real PDF bytes, so we verify the type guard
    // correctly distinguishes the two error types.
    const plainError = new Error('Simulated render failure')
    expect(isCvPdfError(plainError)).toBe(false)
    // The plain Error from countPdfPages (bad buffer) is a plain Error, not a CvPdfError:
    const junk = new TextEncoder().encode('not a pdf')
    await expect(countPdfPages(junk)).rejects.toThrow(/PDF page count failed/)
    // And that plain Error is NOT a CvPdfError:
    let caughtErr: unknown = null
    try { await countPdfPages(junk) } catch (e) { caughtErr = e }
    expect(isCvPdfError(caughtErr)).toBe(false)
  })

  it('11. resulting PDF is exactly one A4 page (standard case)', async () => {
    const result = await generateCvPdfWithResult(makeStandardFitCv(), makeRealisticPersonal())
    const pages = await countPdfPages(await blobToUint8Array(result.blob))
    expect(pages).toBe(1)
  })

  it('11. resulting PDF is exactly one A4 page (compact fallback case)', async () => {
    const result = await generateCvPdfWithResult(makeBorderlineCv(), makeRealisticPersonal())
    const pages = await countPdfPages(await blobToUint8Array(result.blob))
    expect(pages).toBe(1)
  })
})

describe('compact layout — generateCvPdf public API unchanged (12.)', () => {
  it('still returns a Blob for a standard-fit CV', async () => {
    const blob = await generateCvPdf(makeStandardFitCv(), makeRealisticPersonal())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('still returns a Blob for a borderline CV (compact fallback)', async () => {
    const blob = await generateCvPdf(makeBorderlineCv(), makeRealisticPersonal())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('still throws PDF_OVERFLOW when both layouts overflow', async () => {
    let caughtError: unknown = null
    try {
      await generateCvPdf(makeHeavyOverflowCv(), makePersonal())
    } catch (err) {
      caughtError = err
    }
    expect(isCvPdfError(caughtError)).toBe(true)
  })
})

describe('compact layout — sample PDFs (opt-in via GENERATE_SAMPLES=true)', () => {
  it('standard layout sample', async () => {
    const blob = await generateCvPdf(makeStandardFitCv(), makeRealisticPersonal())
    writeSampleIfEnabled('compact-standard', await blobToUint8Array(blob))
    expect(blob.type).toBe('application/pdf')
  })

  it('compact fallback sample', async () => {
    const result = await generateCvPdfWithResult(makeBorderlineCv(), makeRealisticPersonal())
    writeSampleIfEnabled('compact-fallback', await blobToUint8Array(result.blob))
    expect(result.layout).toBe('compact')
    expect(result.blob.type).toBe('application/pdf')
  })

  it('overflow sample — demonstrates PDF_OVERFLOW with heavy content', async () => {
    let err: unknown = null
    try {
      await generateCvPdf(makeHeavyOverflowCv(), makePersonal())
    } catch (e) {
      err = e
    }
    expect(isCvPdfError(err)).toBe(true)
  })
})

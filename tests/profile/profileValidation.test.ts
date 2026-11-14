import { describe, it, expect } from 'vitest'
import { validateProfileJson } from '@/utils/profileValidation'
import { createEmptyProfile, generateId } from '@/types/profile'
import type { MasterProfile } from '@/types/profile'

function validProfile(): MasterProfile {
  return {
    schemaVersion: 1,
    personal: {
      fullName: 'Jane Doe',
      title: 'Engineer',
      location: 'Prague',
      email: 'jane@example.com',
      phone: '+1 555 0100',
      linkedIn: 'https://linkedin.com/in/jane',
      github: 'https://github.com/jane',
    },
    experience: [],
    projects: [],
    education: [],
    languages: [],
    generalNotes: '',
  }
}

describe('validateProfileJson — valid input', () => {
  it('accepts an empty-but-structurally-valid profile', () => {
    const result = validateProfileJson(createEmptyProfile())
    expect(result.valid).toBe(true)
  })

  it('accepts a fully populated profile', () => {
    const p = validProfile()
    p.experience.push({
      id: generateId(),
      company: 'Acme',
      position: 'Dev',
      location: 'Remote',
      startDate: '2020-01',
      endDate: null,
      description: 'Did things.',
    })
    p.projects.push({
      id: generateId(),
      name: 'Open source project',
      role: 'Maintainer',
      url: 'https://github.com/example/proj',
      startDate: '2021-06',
      endDate: '2022-12',
      description: 'Maintained it.',
    })
    p.education.push({
      id: generateId(),
      institution: 'CTU Prague',
      degree: "Bachelor's",
      field: 'CS',
      startDate: '2015-09',
      endDate: '2019-06',
      description: '',
    })
    p.languages.push({ id: generateId(), language: 'Czech', proficiency: 'Native' })
    p.generalNotes = 'Extra info here.'

    const result = validateProfileJson(p)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.profile.experience).toHaveLength(1)
      expect(result.profile.languages[0]?.language).toBe('Czech')
    }
  })

  it('preserves Unicode / Czech diacritics', () => {
    const p = validProfile()
    p.personal.fullName = 'Jana Nováková'
    p.generalNotes = 'žluťoučký kůň úpěl ďábelské ódy'
    const result = validateProfileJson(p)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.profile.personal.fullName).toBe('Jana Nováková')
      expect(result.profile.generalNotes).toBe('žluťoučký kůň úpěl ďábelské ódy')
    }
  })

  it('accepts endDate as null (current position)', () => {
    const p = validProfile()
    p.experience.push({
      id: generateId(),
      company: 'Corp',
      position: 'Dev',
      location: '',
      startDate: '2020-01',
      endDate: null,
      description: '',
    })
    const result = validateProfileJson(p)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.profile.experience[0]?.endDate).toBeNull()
    }
  })
})

describe('validateProfileJson — invalid input', () => {
  it('rejects null', () => {
    const result = validateProfileJson(null)
    expect(result.valid).toBe(false)
  })

  it('rejects a plain string', () => {
    const result = validateProfileJson('not a profile')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toHaveLength(1)
  })

  it('rejects invalid JSON parsed as array', () => {
    const result = validateProfileJson([])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/JSON object/)
  })

  it('rejects unsupported schema version 2', () => {
    const result = validateProfileJson({ schemaVersion: 2 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/schema version/)
  })

  it('rejects missing schemaVersion', () => {
    const result = validateProfileJson({})
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors[0]).toMatch(/schema version/)
  })

  it('rejects when personal is not an object', () => {
    const result = validateProfileJson({ schemaVersion: 1, personal: 'bad' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.some((e) => e.includes('personal'))).toBe(true)
  })

  it('rejects when personal.fullName is missing', () => {
    const p: Record<string, unknown> = { ...validProfile(), personal: { title: 'x' } }
    const result = validateProfileJson(p)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('personal.fullName'))).toBe(true)
    }
  })

  it('rejects when experience is not an array', () => {
    const p = { ...validProfile(), experience: 'not-array' }
    const result = validateProfileJson(p)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.some((e) => e.includes('experience'))).toBe(true)
  })

  it('rejects when an experience entry is missing required fields', () => {
    const p = {
      ...validProfile(),
      experience: [{ id: generateId(), company: 'Acme' }], // missing position, startDate, etc.
    }
    const result = validateProfileJson(p)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.some((e) => e.includes('experience[0]'))).toBe(true)
  })

  it('rejects when endDate is not string or null', () => {
    const p = {
      ...validProfile(),
      experience: [
        {
          id: generateId(),
          company: 'Corp',
          position: 'Dev',
          location: '',
          startDate: '2020-01',
          endDate: 123, // should be string | null
          description: '',
        },
      ],
    }
    const result = validateProfileJson(p)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('endDate'))).toBe(true)
    }
  })

  it('rejects when generalNotes is not a string', () => {
    const p = { ...validProfile(), generalNotes: 42 }
    const result = validateProfileJson(p)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('generalNotes'))).toBe(true)
    }
  })

  it('collects multiple errors at once', () => {
    const p = {
      schemaVersion: 1,
      personal: { fullName: 123, title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
      experience: 'bad',
      projects: null,
      education: 'bad',
      languages: 'bad',
      generalNotes: 42,
    }
    const result = validateProfileJson(p)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(2)
    }
  })
})

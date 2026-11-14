import { describe, it, expect } from 'vitest'
import {
  createEmptyProfile,
  generateId,
  isProfileEmpty,
  type MasterProfile,
  type ExperienceEntry,
} from '@/types/profile'

describe('createEmptyProfile', () => {
  it('returns schemaVersion 1', () => {
    const p = createEmptyProfile()
    expect(p.schemaVersion).toBe(1)
  })

  it('has empty personal info', () => {
    const p = createEmptyProfile()
    expect(p.personal.fullName).toBe('')
    expect(p.personal.email).toBe('')
    expect(p.personal.linkedIn).toBe('')
  })

  it('has empty collections', () => {
    const p = createEmptyProfile()
    expect(p.experience).toHaveLength(0)
    expect(p.projects).toHaveLength(0)
    expect(p.education).toHaveLength(0)
    expect(p.languages).toHaveLength(0)
    expect(p.generalNotes).toBe('')
  })

  it('is detected as empty by isProfileEmpty', () => {
    expect(isProfileEmpty(createEmptyProfile())).toBe(true)
  })
})

describe('isProfileEmpty', () => {
  it('returns false when generalNotes has content', () => {
    const p = createEmptyProfile()
    p.generalNotes = 'some notes'
    expect(isProfileEmpty(p)).toBe(false)
  })

  it('returns false when experience array is non-empty', () => {
    const p = createEmptyProfile()
    p.experience.push({
      id: generateId(),
      company: 'Acme',
      position: 'Dev',
      location: '',
      startDate: '2020-01',
      endDate: null,
      description: '',
    })
    expect(isProfileEmpty(p)).toBe(false)
  })

  it('returns false when personal.fullName is set', () => {
    const p = createEmptyProfile()
    p.personal.fullName = 'Jane'
    expect(isProfileEmpty(p)).toBe(false)
  })
})

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string')
    expect(generateId().length).toBeGreaterThan(0)
  })

  it('returns unique values', () => {
    const ids = Array.from({ length: 50 }, () => generateId())
    const unique = new Set(ids)
    expect(unique.size).toBe(50)
  })
})

describe('profile serialization', () => {
  it('round-trips through JSON.stringify / JSON.parse', () => {
    const profile: MasterProfile = {
      schemaVersion: 1,
      personal: {
        fullName: 'Jana Nováková',
        title: 'Softwarová inženýrka',
        location: 'Praha, Česká republika',
        email: 'jana@priklad.cz',
        phone: '+420 123 456 789',
        linkedIn: 'https://linkedin.com/in/jana',
        github: 'https://github.com/jana',
      },
      experience: [
        {
          id: 'exp-1',
          company: 'Firma s.r.o.',
          position: 'Senior vývojářka',
          location: 'Praha',
          startDate: '2020-03',
          endDate: null,
          description: 'Vývoj microservices. Čeština: ěščřžýáíé úůóů.',
        },
      ],
      projects: [],
      education: [],
      languages: [{ id: 'lang-1', language: 'Čeština', proficiency: 'Rodilý mluvčí' }],
      generalNotes: 'Doplňující poznámky s háčky a čárkami: žluťoučký kůň.',
    }

    const json = JSON.stringify(profile)
    const restored = JSON.parse(json) as MasterProfile

    expect(restored.personal.fullName).toBe('Jana Nováková')
    expect(restored.experience[0]?.description).toContain('ěščřžýáíé')
    expect(restored.generalNotes).toContain('žluťoučký kůň')
    expect(restored.languages[0]?.language).toBe('Čeština')
    expect(restored.experience[0]?.endDate).toBeNull()
  })

  it('preserves very long description text', () => {
    const longText = 'A'.repeat(50_000) + ' Ž'.repeat(10_000)
    const entry: ExperienceEntry = {
      id: generateId(),
      company: 'Corp',
      position: 'Dev',
      location: '',
      startDate: '2021-01',
      endDate: null,
      description: longText,
    }

    const restored = JSON.parse(JSON.stringify(entry)) as ExperienceEntry
    expect(restored.description).toBe(longText)
    expect(restored.description).toHaveLength(longText.length)
  })
})

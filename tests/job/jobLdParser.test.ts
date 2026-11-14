import { describe, it, expect } from 'vitest'
import { parseJobPostingFromScripts } from '@/utils/jobLdParser'

describe('parseJobPostingFromScripts', () => {
  it('returns null for empty input', () => {
    expect(parseJobPostingFromScripts([])).toBeNull()
  })

  it('returns null for invalid JSON strings', () => {
    expect(parseJobPostingFromScripts(['{not json', ''])).toBeNull()
  })

  it('returns null for JSON-LD without a JobPosting type', () => {
    const ld = JSON.stringify({ '@type': 'Organization', name: 'Acme' })
    expect(parseJobPostingFromScripts([ld])).toBeNull()
  })

  it('extracts a basic JobPosting with all fields', () => {
    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Software Engineer',
      hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
      jobLocation: { address: { addressLocality: 'Prague' } },
      description:
        'We are looking for a software engineer with 3+ years of experience in TypeScript and Vue.',
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result).not.toBeNull()
    expect(result?.jobTitle).toBe('Software Engineer')
    expect(result?.company).toBe('Acme Corp')
    expect(result?.location).toBe('Prague')
    expect(result?.description).toContain('software engineer')
  })

  it('handles @graph array containing a JobPosting', () => {
    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', url: 'https://example.com' },
        {
          '@type': 'JobPosting',
          title: 'QA Engineer',
          hiringOrganization: { name: 'Test Co' },
          description:
            'We need a QA engineer with experience in automated testing frameworks and CI/CD pipelines.',
        },
      ],
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result?.jobTitle).toBe('QA Engineer')
    expect(result?.company).toBe('Test Co')
  })

  it('handles top-level JSON array', () => {
    const ld = JSON.stringify([
      { '@type': 'Organization', name: 'Acme' },
      {
        '@type': 'JobPosting',
        title: 'DevOps Engineer',
        description:
          'Looking for a DevOps engineer to manage our cloud infrastructure on AWS and GCP.',
      },
    ])
    const result = parseJobPostingFromScripts([ld])
    expect(result?.jobTitle).toBe('DevOps Engineer')
  })

  it('strips HTML tags from description', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Developer',
      description:
        '<p>We are looking for a <strong>developer</strong> with &amp; experience in systems.</p><ul><li>TypeScript</li><li>Go</li></ul>',
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result?.description).not.toContain('<p>')
    expect(result?.description).not.toContain('<strong>')
    expect(result?.description).toContain('&')
    expect(result?.description).toContain('developer')
    expect(result?.description).toContain('TypeScript')
  })

  it('skips JobPosting with description shorter than 50 characters', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Dev',
      description: 'Too short.',
    })
    expect(parseJobPostingFromScripts([ld])).toBeNull()
  })

  it('extracts addressLocality from nested jobLocation.address', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Engineer',
      jobLocation: {
        '@type': 'Place',
        address: { '@type': 'PostalAddress', addressLocality: 'Brno' },
      },
      description:
        'We are seeking a skilled engineer to join our growing team based in Brno, Czech Republic.',
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result?.location).toBe('Brno')
  })

  it('falls back to addressRegion when addressLocality is missing', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Analyst',
      jobLocation: { address: { addressRegion: 'South Moravia' } },
      description:
        'Business analyst needed for our regional office in South Moravia to support our growing operations.',
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result?.location).toBe('South Moravia')
  })

  it('handles Czech UTF-8 content correctly', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Softwarový inženýr',
      hiringOrganization: { name: 'Česká firma s.r.o.' },
      jobLocation: { address: { addressLocality: 'Praha' } },
      description:
        'Hledáme zkušeného softwarového inženýra se znalostí TypeScriptu a Vue.js pro náš tým v Praze. Nabízíme zajímavé projekty a skvělý kolektiv.',
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result?.jobTitle).toBe('Softwarový inženýr')
    expect(result?.company).toBe('Česká firma s.r.o.')
    expect(result?.location).toBe('Praha')
    expect(result?.description).toContain('TypeScriptu')
  })

  it('returns the first valid posting when multiple scripts are present', () => {
    const script1 = JSON.stringify({ '@type': 'Organization', name: 'Org' })
    const script2 = JSON.stringify({
      '@type': 'JobPosting',
      title: 'First Valid Job',
      description:
        'This is the first valid job posting with enough text to pass the minimum length requirement.',
    })
    const script3 = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Second Job',
      description:
        'This is the second posting and must not be returned when the first is already valid.',
    })
    const result = parseJobPostingFromScripts([script1, script2, script3])
    expect(result?.jobTitle).toBe('First Valid Job')
  })

  it('skips malformed JSON and continues to the next script', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Backend Developer',
      description:
        'We are seeking a backend developer with experience in Node.js, TypeScript, and PostgreSQL.',
    })
    const result = parseJobPostingFromScripts(['{malformed json here', ld])
    expect(result?.jobTitle).toBe('Backend Developer')
  })

  it('returns null when description field is missing', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Engineer',
      hiringOrganization: { name: 'Corp' },
      // no description field
    })
    expect(parseJobPostingFromScripts([ld])).toBeNull()
  })

  it('returns null for company when hiringOrganization has no name', () => {
    const ld = JSON.stringify({
      '@type': 'JobPosting',
      title: 'Developer',
      hiringOrganization: { '@type': 'Organization' },
      description:
        'Looking for a developer to build our next generation platform using modern web technologies.',
    })
    const result = parseJobPostingFromScripts([ld])
    expect(result?.company).toBeNull()
    expect(result?.jobTitle).toBe('Developer')
  })
})

import { describe, it, expect } from 'vitest'
import { matchesDomain, getSiteConfig, JOB_SITE_CONFIGS } from '@/utils/jobSiteRegistry'

describe('matchesDomain', () => {
  it('matches exact domain', () => {
    expect(matchesDomain('jobs.cz', ['jobs.cz'])).toBe(true)
  })

  it('matches www subdomain', () => {
    expect(matchesDomain('www.jobs.cz', ['jobs.cz'])).toBe(true)
  })

  it('matches any subdomain with dot separator', () => {
    expect(matchesDomain('en.jobs.cz', ['jobs.cz'])).toBe(true)
  })

  it('matches deep subdomain', () => {
    expect(matchesDomain('sub.www.jobs.cz', ['jobs.cz'])).toBe(true)
  })

  it('does not match unrelated domain', () => {
    expect(matchesDomain('example.com', ['jobs.cz'])).toBe(false)
  })

  it('does not match a lookalike domain that contains the target as a suffix without dot', () => {
    expect(matchesDomain('fakejobs.cz', ['jobs.cz'])).toBe(false)
  })

  it('does not match if the target domain is a suffix of a different TLD', () => {
    expect(matchesDomain('jobs.cz.evil.com', ['jobs.cz'])).toBe(false)
  })

  it('matches multiple domains in config', () => {
    expect(matchesDomain('www.linkedin.com', ['jobs.cz', 'linkedin.com'])).toBe(true)
  })

  it('returns false for empty domains array', () => {
    expect(matchesDomain('jobs.cz', [])).toBe(false)
  })
})

describe('getSiteConfig', () => {
  it('returns config for jobs.cz', () => {
    const config = getSiteConfig('https://jobs.cz/en/job-detail/12345')
    expect(config).not.toBeNull()
    expect(config?.domains).toContain('jobs.cz')
  })

  it('returns config for www.jobs.cz subdomain', () => {
    const config = getSiteConfig('https://www.jobs.cz/detail/software-engineer')
    expect(config).not.toBeNull()
    expect(config?.domains).toContain('jobs.cz')
  })

  it('returns config for linkedin.com', () => {
    const config = getSiteConfig('https://linkedin.com/jobs/view/12345')
    expect(config).not.toBeNull()
    expect(config?.domains).toContain('linkedin.com')
  })

  it('returns config for www.linkedin.com', () => {
    const config = getSiteConfig('https://www.linkedin.com/jobs/view/12345')
    expect(config).not.toBeNull()
    expect(config?.domains).toContain('linkedin.com')
  })

  it('returns null for an unknown domain', () => {
    expect(getSiteConfig('https://example.com/jobs/engineer')).toBeNull()
  })

  it('returns null for an invalid URL', () => {
    expect(getSiteConfig('not-a-url')).toBeNull()
  })

  it('returns config with correct selectors for jobs.cz', () => {
    const config = getSiteConfig('https://www.jobs.cz/en/job/12345')
    expect(config?.descriptionSelectors).toContain('[data-jobad="body"]')
  })

  it('returns config with correct selectors for linkedin.com', () => {
    const config = getSiteConfig('https://www.linkedin.com/jobs/view/12345')
    expect(config?.descriptionSelectors).toContain('[data-testid="expandable-text-box"]')
  })

  it('JOB_SITE_CONFIGS covers both jobs.cz and linkedin.com', () => {
    const domains = JOB_SITE_CONFIGS.flatMap((c) => c.domains)
    expect(domains).toContain('jobs.cz')
    expect(domains).toContain('linkedin.com')
  })
})

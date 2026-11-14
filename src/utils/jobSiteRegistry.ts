export interface JobSiteConfig {
  domains: string[]
  descriptionSelectors: string[]
}

export const JOB_SITE_CONFIGS: JobSiteConfig[] = [
  {
    domains: ['jobs.cz'],
    descriptionSelectors: ['[data-jobad="body"]'],
  },
  {
    domains: ['linkedin.com'],
    descriptionSelectors: ['[data-testid="expandable-text-box"]'],
  },
]

export function matchesDomain(hostname: string, configDomains: string[]): boolean {
  return configDomains.some((d) => hostname === d || hostname.endsWith('.' + d))
}

export function getSiteConfig(url: string): JobSiteConfig | null {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }
  return JOB_SITE_CONFIGS.find((c) => matchesDomain(hostname, c.domains)) ?? null
}

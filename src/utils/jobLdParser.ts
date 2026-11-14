export interface LdJobData {
  jobTitle: string | null
  company: string | null
  location: string | null
  description: string
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stripHtml(html: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  }
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|nbsp|quot|#39|apos);/g, (m) => entities[m] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getOrgName(org: unknown): string | null {
  if (!isObject(org)) return null
  return typeof org.name === 'string' ? org.name : null
}

function getAddressLocality(loc: unknown): string | null {
  if (!isObject(loc)) return null
  if (typeof loc.addressLocality === 'string') return loc.addressLocality
  if (typeof loc.addressRegion === 'string') return loc.addressRegion
  // jobLocation can nest address inside
  return getAddressLocality(loc.address)
}

function parseJobPosting(item: unknown): LdJobData | null {
  if (!isObject(item)) return null
  if (item['@type'] !== 'JobPosting') return null

  const rawDesc = item.description
  if (typeof rawDesc !== 'string') return null

  const description = stripHtml(rawDesc)
  if (description.length < 50) return null

  return {
    jobTitle: typeof item.title === 'string' ? item.title : null,
    company: getOrgName(item.hiringOrganization),
    location: getAddressLocality(item.jobLocation),
    description,
  }
}

function flattenLd(data: unknown, out: unknown[]): void {
  if (Array.isArray(data)) {
    data.forEach((item) => flattenLd(item, out))
    return
  }
  if (!isObject(data)) return
  if (Array.isArray(data['@graph'])) {
    data['@graph'].forEach((item) => flattenLd(item, out))
    return
  }
  out.push(data)
}

/**
 * Parse job posting data from raw JSON-LD script text contents.
 * Returns the first valid JobPosting found, or null.
 */
export function parseJobPostingFromScripts(jsonStrings: string[]): LdJobData | null {
  for (const str of jsonStrings) {
    let data: unknown
    try {
      data = JSON.parse(str)
    } catch {
      continue
    }

    const items: unknown[] = []
    flattenLd(data, items)

    for (const item of items) {
      const result = parseJobPosting(item)
      if (result !== null) return result
    }
  }
  return null
}

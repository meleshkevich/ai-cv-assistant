import type { JobExtractionResult } from '@/types/job'

/**
 * Extracts job posting data from the current page.
 *
 * IMPORTANT: This function is serialised by chrome.scripting.executeScript and
 * injected into the target page's context. It must be entirely self-contained:
 * no imports, no closures to outer scope, all helpers defined as nested functions.
 * The `import type` above is erased at compile time and is safe.
 */
export function extractJobData(): JobExtractionResult {
  // ── Helpers ───────────────────────────────────────────────────────────────

  function isObj(v: unknown): v is Record<string, unknown> {
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
    if (!isObj(org)) return null
    return typeof org.name === 'string' ? org.name : null
  }

  function getAddressLocality(loc: unknown): string | null {
    if (!isObj(loc)) return null
    if (typeof loc.addressLocality === 'string') return loc.addressLocality
    if (typeof loc.addressRegion === 'string') return loc.addressRegion
    return getAddressLocality(loc.address)
  }

  function flattenLd(data: unknown, out: unknown[]): void {
    if (Array.isArray(data)) {
      data.forEach((item: unknown) => flattenLd(item, out))
      return
    }
    if (!isObj(data)) return
    if (Array.isArray(data['@graph'])) {
      ;(data['@graph'] as unknown[]).forEach((item) => flattenLd(item, out))
      return
    }
    out.push(data)
  }

  const JOB_RE =
    /job[-_]?desc|vacancy[-_]?desc|position[-_]?desc|offer[-_]?desc|job[-_]?detail|job[-_]?content|job[-_]?text|job[-_]?info|popis[-_]?prace|nabidka[-_]?prace|pracovni[-_]?nabidka/i

  const JUNK_RE =
    /cookie|consent|banner|popup|modal|sidebar|navigation|breadcrumb|related|recommend|social|share|comment|widget/i

  function scoreEl(el: Element): number {
    let s = 0
    const elId = el.id ?? ''
    const elCls = typeof el.className === 'string' ? el.className : ''
    if (JOB_RE.test(elId) || JOB_RE.test(elCls)) s += 15
    const itemType = el.getAttribute('itemtype') ?? ''
    if (itemType.includes('JobPosting')) s += 20
    if (el.tagName === 'ARTICLE') s += 3
    if (el.tagName === 'MAIN') s += 2
    const len = ((el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? '').length
    if (len > 300) s += 2
    if (len > 1000) s += 3
    return s
  }

  function cleanEl(el: Element): HTMLElement {
    const clone = el.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll(
        'script, style, noscript, nav, header, footer, aside, iframe, [aria-hidden="true"], form',
      )
      .forEach((e) => e.remove())
    Array.from(clone.querySelectorAll('[id], [class]')).forEach((child) => {
      const childId = (child as HTMLElement).id ?? ''
      const childCls =
        typeof (child as HTMLElement).className === 'string'
          ? (child as HTMLElement).className
          : ''
      if (JUNK_RE.test(childId) || JUNK_RE.test(childCls)) child.remove()
    })
    return clone
  }

  function getText(el: HTMLElement): string {
    return (el.innerText ?? el.textContent ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // ── Site-specific registry (inlined — must stay self-contained) ───────────

  const SITE_CONFIGS = [
    { domains: ['jobs.cz'], selectors: ['[data-jobad="body"]'] },
    { domains: ['linkedin.com'], selectors: ['[data-testid="expandable-text-box"]'] },
  ]

  function matchesDomain(hostname: string, domains: string[]): boolean {
    return domains.some((d) => hostname === d || hostname.endsWith('.' + d))
  }

  function detectTruncation(el: Element): string | undefined {
    const parent = el.parentElement
    if (!parent) return undefined
    const buttons = Array.from(parent.querySelectorAll('button, a[role="button"]'))
    for (const btn of buttons) {
      if (/see more|show more|see all|show all/i.test(btn.textContent ?? '')) {
        return 'The description may be truncated. Click "See more" on the page, then retry the scan.'
      }
    }
    return undefined
  }

  // ── Stage A: Site-specific selectors ──────────────────────────────────────

  let siteEl: Element | null = null
  let siteTruncation: string | undefined

  try {
    const hostname = new URL(window.location.href).hostname
    for (const config of SITE_CONFIGS) {
      if (!matchesDomain(hostname, config.domains)) continue
      for (const selector of config.selectors) {
        const matches = Array.from(document.querySelectorAll(selector))
        let best: Element | null = null
        let bestLen = 0
        for (const el of matches) {
          const len = ((el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? '').length
          if (len > bestLen) {
            bestLen = len
            best = el
          }
        }
        if (best && bestLen >= 50) {
          siteEl = best
          siteTruncation = detectTruncation(best)
          break
        }
      }
      if (siteEl) break
    }
  } catch {
    // URL parsing failed — skip site-specific extraction
  }

  // ── Stage B: JSON-LD ──────────────────────────────────────────────────────

  let ldData: {
    jobTitle: string | null
    company: string | null
    location: string | null
    description: string
  } | null = null

  const ldScripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  )

  for (const script of ldScripts) {
    let data: unknown
    try {
      data = JSON.parse(script.textContent ?? '')
    } catch {
      continue
    }

    const items: unknown[] = []
    flattenLd(data, items)

    for (const item of items) {
      if (!isObj(item) || item['@type'] !== 'JobPosting') continue
      const rawDesc = item.description
      if (typeof rawDesc !== 'string') continue
      const description = stripHtml(rawDesc)
      if (description.length < 50) continue
      ldData = {
        jobTitle: typeof item.title === 'string' ? item.title : null,
        company: getOrgName(item.hiringOrganization),
        location: getAddressLocality(item.jobLocation),
        description,
      }
      break
    }
    if (ldData) break
  }

  // ── Stage C: Merge and select best ───────────────────────────────────────
  //
  // Prefer site-specific DOM when available. When JSON-LD metadata is also
  // present, use it for title / company / location regardless of which
  // description source wins. If JSON-LD has a longer description, use that.

  if (siteEl !== null) {
    const siteText = getText(cleanEl(siteEl))

    if (siteText.length >= 100) {
      const descToUse =
        ldData !== null && ldData.description.length > siteText.length
          ? ldData.description
          : siteText

      const hasMetadata = !!(ldData?.jobTitle ?? ldData?.company ?? ldData?.location)
      const result: JobExtractionResult = {
        sourceUrl: window.location.href,
        pageTitle: document.title,
        jobTitle: ldData?.jobTitle ?? null,
        company: ldData?.company ?? null,
        location: ldData?.location ?? null,
        description: descToUse,
        extractionMethod: 'site-specific',
        confidence: hasMetadata ? 'high' : 'medium',
      }
      if (siteTruncation) result.truncationWarning = siteTruncation
      return result
    }
  }

  if (ldData !== null) {
    return {
      sourceUrl: window.location.href,
      pageTitle: document.title,
      jobTitle: ldData.jobTitle,
      company: ldData.company,
      location: ldData.location,
      description: ldData.description,
      extractionMethod: 'json-ld',
      confidence: ldData.jobTitle !== null && ldData.company !== null ? 'high' : 'medium',
    }
  }

  // ── Stage D: Generic DOM heuristics ──────────────────────────────────────

  const candidates = Array.from(
    document.querySelectorAll(
      'main, article, section[id], section[class], div[id], div[class], [itemtype]',
    ),
  )

  let bestEl: Element | null = null
  let bestScore = 5

  for (const el of candidates) {
    const s = scoreEl(el)
    if (s > bestScore) {
      bestScore = s
      bestEl = el
    }
  }

  // If the best candidate has < 1000 chars it may be a subsection (e.g. a benefits-only div
  // that scored high because its class name matched a job pattern). Prefer an ancestor with
  // 2x+ the content that is still under 20 000 chars (to avoid climbing to body-level containers).
  if (bestEl !== null) {
    const bestLen = ((bestEl as HTMLElement).innerText ?? (bestEl as HTMLElement).textContent ?? '').length
    if (bestLen < 1000) {
      let ancestor = bestEl.parentElement
      while (ancestor && ancestor !== document.body) {
        const len = ((ancestor as HTMLElement).innerText ?? (ancestor as HTMLElement).textContent ?? '').length
        if (len >= bestLen * 2 && len <= 20000) {
          bestEl = ancestor
          break
        }
        if (len > 20000) break
        ancestor = ancestor.parentElement
      }
    }
  }

  if (bestEl !== null) {
    const cleaned = cleanEl(bestEl)
    const description = getText(cleaned)
    if (description.length > 100) {
      return {
        sourceUrl: window.location.href,
        pageTitle: document.title,
        jobTitle: null,
        company: null,
        location: null,
        description,
        extractionMethod: 'dom',
        confidence: bestScore >= 15 ? 'medium' : 'low',
      }
    }
  }

  // ── Stage E: Fallback: entire body ────────────────────────────────────────

  const bodyClone = cleanEl(document.body)
  return {
    sourceUrl: window.location.href,
    pageTitle: document.title,
    jobTitle: null,
    company: null,
    location: null,
    description: getText(bodyClone),
    extractionMethod: 'dom',
    confidence: 'low',
  }
}

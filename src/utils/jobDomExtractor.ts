import { getSiteConfig } from './jobSiteRegistry'

const JOB_PATTERN =
  /job[-_]?desc|vacancy[-_]?desc|position[-_]?desc|offer[-_]?desc|job[-_]?detail|job[-_]?content|job[-_]?text|job[-_]?info|popis[-_]?prace|nabidka[-_]?prace|pracovni[-_]?nabidka/i

const JUNK_PATTERN =
  /cookie|consent|banner|popup|modal|sidebar|navigation|breadcrumb|related|recommend|social|share|comment|widget/i

function scoreElement(el: Element): number {
  let score = 0

  const id = el.id ?? ''
  const cls = typeof el.className === 'string' ? el.className : ''

  if (JOB_PATTERN.test(id) || JOB_PATTERN.test(cls)) score += 15

  const itemType = el.getAttribute('itemtype') ?? ''
  if (itemType.includes('JobPosting')) score += 20

  if (el.tagName === 'ARTICLE') score += 3
  if (el.tagName === 'MAIN') score += 2

  const text = (el as HTMLElement).innerText ?? (el as HTMLElement).textContent ?? ''
  if (text.length > 300) score += 2
  if (text.length > 1000) score += 3

  return score
}

function cleanClone(el: Element): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll('script, style, noscript, nav, header, footer, aside, iframe, [aria-hidden="true"], form')
    .forEach((e) => e.remove())

  Array.from(clone.querySelectorAll('[id], [class]')).forEach((child) => {
    const childId = (child as HTMLElement).id ?? ''
    const childCls = typeof (child as HTMLElement).className === 'string' ? (child as HTMLElement).className : ''
    if (JUNK_PATTERN.test(childId) || JUNK_PATTERN.test(childCls)) child.remove()
  })

  return clone
}

function extractText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

/**
 * Extract the job description using site-specific selectors for known job platforms.
 * Returns null when no site config matches or no suitable element is found.
 */
export function extractSiteSpecificFromDom(
  doc: Document,
  url: string,
): { description: string; truncationWarning?: string } | null {
  const config = getSiteConfig(url)
  if (!config) return null

  for (const selector of config.descriptionSelectors) {
    const matches = Array.from(doc.querySelectorAll(selector)) as HTMLElement[]
    if (matches.length === 0) continue

    // When multiple elements match (e.g. LinkedIn sidebar), prefer the one with the most text.
    let best: HTMLElement | null = null
    let bestLen = 0
    for (const el of matches) {
      const len = (el.innerText ?? el.textContent ?? '').length
      if (len > bestLen) {
        bestLen = len
        best = el
      }
    }

    if (!best || bestLen < 50) continue

    const clone = cleanClone(best)
    const description = extractText(clone)
    if (description.length < 50) continue

    const truncationWarning = detectTruncation(best)
    return { description, truncationWarning }
  }

  return null
}

/**
 * Extract the most likely job description text from a Document using DOM heuristics.
 */
export function extractJobFromDom(doc: Document): { description: string; confidence: 'medium' | 'low' } {
  const candidates = Array.from(
    doc.querySelectorAll(
      'main, article, section[id], section[class], div[id], div[class], [itemtype]',
    ),
  )

  let bestEl: Element | null = null
  let bestScore = 5 // threshold — anything below 5 is too generic

  for (const el of candidates) {
    const s = scoreElement(el)
    if (s > bestScore) {
      bestScore = s
      bestEl = el
    }
  }

  // If the best candidate has < 1000 chars it may be a subsection (e.g. a benefits-only div
  // that scored high because its class name matched a job pattern). Look for an ancestor that
  // contains 2x+ more content while staying under 20 000 chars (to avoid climbing to body-level
  // containers).
  if (bestEl !== null) {
    const bestLen = ((bestEl as HTMLElement).innerText ?? (bestEl as HTMLElement).textContent ?? '').length
    if (bestLen < 1000) {
      let ancestor = bestEl.parentElement
      while (ancestor && ancestor !== doc.body) {
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
    const clone = cleanClone(bestEl)
    const description = extractText(clone)
    if (description.length > 100) {
      return {
        description,
        confidence: bestScore >= 15 ? 'medium' : 'low',
      }
    }
  }

  // Fallback: clean body
  const bodyClone = cleanClone(doc.body)
  return {
    description: extractText(bodyClone),
    confidence: 'low',
  }
}

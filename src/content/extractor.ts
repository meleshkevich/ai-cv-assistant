import type { PageData } from '@/types'

// Runs inside the target page via chrome.scripting.executeScript.
// Must be fully self-contained: no closures, no extension-scope references.
// Chrome serialises this function's source and executes it in the page context.
export function extractPageData(): PageData {
  const bodyClone = document.body.cloneNode(true) as HTMLElement

  bodyClone
    .querySelectorAll('script, style, noscript, iframe, svg, [aria-hidden="true"]')
    .forEach((el) => el.remove())

  const rawText = bodyClone.innerText ?? bodyClone.textContent ?? ''
  const text = rawText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    title: document.title,
    url: window.location.href,
    text,
  }
}

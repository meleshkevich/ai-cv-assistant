import type { ExtractionError, ExtractionResult } from '@/types'
import type { JobExtractionResult } from '@/types/job'
import { extractPageData } from '@/content/extractor'
import { extractJobData } from '@/content/jobExtractor'
import { isRestrictedUrl } from '@/utils/pageUtils'

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) {
    throw { code: 'TAB_NOT_FOUND', message: 'No active tab found.' } satisfies ExtractionError
  }
  return tab
}

export async function checkPermissionForOrigin(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [`${origin}/*`] })
}

// Must be the FIRST async call in a user gesture handler.
// Calling any await before this loses the gesture context and Chrome will reject the request.
export async function requestPermissionForOrigin(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`${origin}/*`] })
}

export async function extractJobFromTab(tab: chrome.tabs.Tab): Promise<JobExtractionResult> {
  const url = tab.url ?? ''

  if (isRestrictedUrl(url)) {
    throw {
      code: 'RESTRICTED_PAGE',
      message: `Cannot access this page (${url.split(':')[0]}: pages are protected by Chrome).`,
    } satisfies ExtractionError
  }

  if (tab.id === undefined) {
    throw { code: 'TAB_NOT_FOUND', message: 'Tab has no ID.' } satisfies ExtractionError
  }

  let injectionResults: chrome.scripting.InjectionResult<JobExtractionResult>[]

  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJobData,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Script injection failed. The page may be protected.'
    throw { code: 'EXTRACTION_FAILED', message } satisfies ExtractionError
  }

  const result = injectionResults[0]?.result

  if (!result) {
    throw {
      code: 'EXTRACTION_FAILED',
      message: 'The extraction script returned no data.',
    } satisfies ExtractionError
  }

  return result
}

export async function extractFromActiveTab(tab: chrome.tabs.Tab): Promise<ExtractionResult> {
  const url = tab.url ?? ''

  if (isRestrictedUrl(url)) {
    throw {
      code: 'RESTRICTED_PAGE',
      message: `Cannot access this page (${url.split(':')[0]}: pages are protected by Chrome).`,
    } satisfies ExtractionError
  }

  if (tab.id === undefined) {
    throw { code: 'TAB_NOT_FOUND', message: 'Tab has no ID.' } satisfies ExtractionError
  }

  let injectionResults: chrome.scripting.InjectionResult<{ title: string; url: string; text: string }>[]

  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Script injection failed. The page may be protected.'
    throw { code: 'EXTRACTION_FAILED', message } satisfies ExtractionError
  }

  const pageData = injectionResults[0]?.result

  if (!pageData) {
    throw {
      code: 'EXTRACTION_FAILED',
      message: 'The extraction script returned no data.',
    } satisfies ExtractionError
  }

  return {
    ...pageData,
    characterCount: pageData.text.length,
    extractedAt: Date.now(),
  }
}

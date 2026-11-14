const RESTRICTED_PROTOCOLS = ['chrome:', 'chrome-extension:', 'about:', 'data:', 'devtools:']

export function isRestrictedUrl(url: string): boolean {
  return RESTRICTED_PROTOCOLS.some((proto) => url.startsWith(proto))
}

/** Returns the origin (e.g. "https://example.com") or null for non-HTTP/non-parseable URLs. */
export function originFromUrl(url: string): string | null {
  try {
    const { origin } = new URL(url)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

export function formatCharacterCount(count: number): string {
  if (count < 1_000) return `${count} characters`
  return `${(count / 1_000).toFixed(1)}k characters`
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function isExtractionError(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  )
}

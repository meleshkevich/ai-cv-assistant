// Typed wrapper around chrome.storage.local.
// Extend AppSettings as new features are added.

export interface AppSettings {
  // placeholder — populated by future modules
}

export async function getSettings(): Promise<Partial<AppSettings>> {
  const result = await chrome.storage.local.get(null)
  return result as Partial<AppSettings>
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  await chrome.storage.local.set(settings)
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.clear()
}

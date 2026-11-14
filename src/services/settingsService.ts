import type { ExtensionSettings } from '@/types/settings'
import { createDefaultSettings } from '@/types/settings'

const STORAGE_KEY = 'extensionSettings'

export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const raw = result[STORAGE_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultSettings()
  }
  const record = raw as Record<string, unknown>
  return {
    openaiApiKey: typeof record.openaiApiKey === 'string' ? record.openaiApiKey : '',
    openaiModel:
      typeof record.openaiModel === 'string' && record.openaiModel.trim()
        ? record.openaiModel
        : createDefaultSettings().openaiModel,
    hasAcknowledgedAiPrivacy:
      typeof record.hasAcknowledgedAiPrivacy === 'boolean'
        ? record.hasAcknowledgedAiPrivacy
        : false,
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings })
}

export async function removeApiKey(): Promise<void> {
  const current = await loadSettings()
  await saveSettings({ ...current, openaiApiKey: '' })
}

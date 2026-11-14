import { ref, type InjectionKey, type Ref } from 'vue'
import type { ExtensionSettings } from '@/types/settings'
import { createDefaultSettings } from '@/types/settings'
import { loadSettings, saveSettings, removeApiKey } from '@/services/settingsService'

export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface SettingsComposable {
  settings: Ref<ExtensionSettings>
  saveStatus: Ref<SettingsSaveStatus>
  isLoading: Ref<boolean>
  load: () => Promise<void>
  save: () => Promise<void>
  removeKey: () => Promise<void>
  acknowledgePrivacy: () => Promise<void>
}

export const SETTINGS_KEY: InjectionKey<SettingsComposable> = Symbol('settings')

export function useSettings(): SettingsComposable {
  const settings = ref<ExtensionSettings>(createDefaultSettings())
  const saveStatus = ref<SettingsSaveStatus>('idle')
  const isLoading = ref(true)

  async function load(): Promise<void> {
    isLoading.value = true
    try {
      settings.value = await loadSettings()
    } catch (err) {
      console.error('[useSettings] Load failed:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function save(): Promise<void> {
    saveStatus.value = 'saving'
    try {
      await saveSettings(settings.value)
      saveStatus.value = 'saved'
    } catch (err) {
      console.error('[useSettings] Save failed:', err)
      saveStatus.value = 'error'
    }
  }

  async function removeKey(): Promise<void> {
    saveStatus.value = 'saving'
    try {
      await removeApiKey()
      settings.value = { ...settings.value, openaiApiKey: '' }
      saveStatus.value = 'saved'
    } catch (err) {
      console.error('[useSettings] Remove key failed:', err)
      saveStatus.value = 'error'
    }
  }

  async function acknowledgePrivacy(): Promise<void> {
    settings.value = { ...settings.value, hasAcknowledgedAiPrivacy: true }
    await saveSettings(settings.value)
  }

  return { settings, saveStatus, isLoading, load, save, removeKey, acknowledgePrivacy }
}

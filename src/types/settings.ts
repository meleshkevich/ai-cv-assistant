export interface ExtensionSettings {
  openaiApiKey: string
  openaiModel: string
  hasAcknowledgedAiPrivacy: boolean
}

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

export function createDefaultSettings(): ExtensionSettings {
  return {
    openaiApiKey: '',
    openaiModel: DEFAULT_OPENAI_MODEL,
    hasAcknowledgedAiPrivacy: false,
  }
}

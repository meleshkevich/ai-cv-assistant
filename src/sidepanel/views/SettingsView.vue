<template>
  <div class="settings-view">
    <h2 class="section-title">Settings</h2>

    <!-- Security notice -->
    <div class="notice notice-info" role="note">
      <strong class="notice-title">Security notice</strong>
      <p class="notice-body">
        Your API key is stored in <code>chrome.storage.local</code> on this device only.
        It is never sent anywhere except directly to <strong>api.openai.com</strong> when
        you request an analysis. It is not encrypted at rest by Chrome — do not use this
        extension on a shared computer.
      </p>
    </div>

    <!-- API Key -->
    <section class="field-group">
      <label class="field-label" for="api-key-input">OpenAI API Key</label>
      <div class="key-row">
        <input
          id="api-key-input"
          class="field-input"
          :type="showKey ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk-…"
          :value="settings.openaiApiKey"
          @input="onApiKeyInput"
        />
        <button
          class="btn btn-ghost btn-icon"
          :aria-label="showKey ? 'Hide key' : 'Show key'"
          type="button"
          @click="showKey = !showKey"
        >
          {{ showKey ? '🙈' : '👁' }}
        </button>
      </div>
      <p class="field-hint">
        Find your key at
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
          platform.openai.com/api-keys
        </a>.
        You are responsible for any usage charges.
      </p>
    </section>

    <!-- Model -->
    <section class="field-group">
      <label class="field-label" for="model-input">Model</label>
      <input
        id="model-input"
        class="field-input"
        type="text"
        spellcheck="false"
        :placeholder="DEFAULT_OPENAI_MODEL"
        :value="settings.openaiModel"
        @input="onModelInput"
      />
      <p class="field-hint">
        Default: <code>{{ DEFAULT_OPENAI_MODEL }}</code>. Must support structured outputs (JSON
        Schema strict mode). See
        <a href="https://platform.openai.com/docs/models" target="_blank" rel="noopener noreferrer">
          OpenAI model list
        </a>.
      </p>
    </section>

    <!-- Save + status -->
    <div class="actions">
      <button class="btn btn-primary" :disabled="isSaving" @click="handleSave">
        <span v-if="isSaving" class="btn-spinner" aria-hidden="true" />
        {{ isSaving ? 'Saving…' : 'Save' }}
      </button>

      <span v-if="saveStatus === 'saved'" class="status-saved" role="status">Saved</span>
      <span v-else-if="saveStatus === 'error'" class="status-error" role="alert">Save failed</span>

      <button
        v-if="hasApiKey && !confirmingRemove"
        class="btn btn-ghost btn-danger"
        type="button"
        @click="confirmingRemove = true"
      >
        Remove Key
      </button>

      <template v-if="confirmingRemove">
        <span class="confirm-label">Remove key?</span>
        <button class="btn btn-danger" type="button" @click="handleRemoveKey">Yes, remove</button>
        <button class="btn btn-ghost" type="button" @click="confirmingRemove = false">Cancel</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { SETTINGS_KEY } from '@/composables/useSettings'
import { DEFAULT_OPENAI_MODEL } from '@/types/settings'

const settingsComposable = inject(SETTINGS_KEY)
if (!settingsComposable) throw new Error('SettingsView: SETTINGS_KEY not provided')

const { settings, saveStatus, isLoading, load, save, removeKey } = settingsComposable

const showKey = ref(false)
const confirmingRemove = ref(false)

const isSaving = computed(() => saveStatus.value === 'saving')
const hasApiKey = computed(() => settings.value.openaiApiKey.trim().length > 0)

onMounted(() => {
  if (!isLoading.value && settings.value.openaiApiKey === '') {
    void load()
  }
})

function onApiKeyInput(event: Event): void {
  settings.value = { ...settings.value, openaiApiKey: (event.target as HTMLInputElement).value }
}

function onModelInput(event: Event): void {
  const val = (event.target as HTMLInputElement).value.trim()
  settings.value = { ...settings.value, openaiModel: val || DEFAULT_OPENAI_MODEL }
}

async function handleSave(): Promise<void> {
  await save()
}

async function handleRemoveKey(): Promise<void> {
  confirmingRemove.value = false
  await removeKey()
}
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

/* Notice */
.notice {
  border-radius: var(--radius);
  padding: 10px 12px;
}

.notice-info {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}

.notice-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.notice-body {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.notice-body code {
  background: #e0f2fe;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

/* Fields */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.field-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  font-family: monospace;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.field-hint a {
  color: var(--color-primary);
  text-decoration: none;
}

.field-hint a:hover {
  text-decoration: underline;
}

.field-hint code {
  background: var(--color-bg);
  padding: 1px 4px;
  border-radius: 3px;
}

.key-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.key-row .field-input {
  flex: 1;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
}

.btn-primary:not(:disabled):hover {
  background: var(--color-primary-hover);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.btn-ghost:hover {
  background: var(--color-bg);
}

.btn-danger {
  background: var(--color-error);
  color: #fff;
  border: none;
}

.btn-danger:hover {
  background: #b91c1c;
}

.btn-ghost.btn-danger {
  background: transparent;
  border: 1px solid var(--color-error-border);
  color: var(--color-error);
}

.btn-ghost.btn-danger:hover {
  background: var(--color-error-bg);
}

.btn-icon {
  padding: 7px 10px;
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
}

.btn-spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Actions row */
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-saved {
  font-size: 12px;
  color: #16a34a;
  font-weight: 500;
}

.status-error {
  font-size: 12px;
  color: var(--color-error);
  font-weight: 500;
}

.confirm-label {
  font-size: 12px;
  color: var(--color-text);
}
</style>

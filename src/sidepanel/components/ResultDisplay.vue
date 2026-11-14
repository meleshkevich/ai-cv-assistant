<template>
  <section class="result" aria-label="Extraction result">
    <!-- Metadata row -->
    <div class="result-meta">
      <div class="result-meta-left">
        <p class="result-title" :title="result.title">{{ result.title || '(no title)' }}</p>
        <p class="result-url" :title="result.url">{{ result.url }}</p>
      </div>
      <button class="btn-clear" aria-label="Clear result" title="Clear" @click="$emit('clear')">
        ✕
      </button>
    </div>

    <!-- Stats -->
    <div class="result-stats">
      <span>{{ formatCharacterCount(result.characterCount) }}</span>
      <span class="result-stats-sep" aria-hidden="true">·</span>
      <span>Extracted at {{ formatTimestamp(result.extractedAt) }}</span>
    </div>

    <!-- Extracted text -->
    <div class="result-text-wrapper">
      <label class="result-text-label" for="extracted-text">Extracted text</label>
      <textarea
        id="extracted-text"
        class="result-text"
        :value="result.text"
        readonly
        aria-readonly="true"
        aria-label="Extracted page text"
        spellcheck="false"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ExtractionResult } from '@/types'
import { formatCharacterCount, formatTimestamp } from '@/utils/pageUtils'

defineProps<{ result: ExtractionResult }>()
defineEmits<{ clear: [] }>()
</script>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 12px;
}

.result-meta {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.result-meta-left {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.result-url {
  font-size: 11px;
  color: var(--color-text-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.btn-clear {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.btn-clear:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

.result-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}

.result-stats-sep {
  opacity: 0.5;
}

.result-text-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-text-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.result-text {
  width: 100%;
  height: 320px;
  padding: 8px;
  font-size: 12px;
  font-family: ui-monospace, 'Cascadia Code', Menlo, monospace;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  resize: vertical;
  outline: none;
}

.result-text:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}
</style>

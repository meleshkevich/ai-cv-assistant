<template>
  <div class="job-result">
    <!-- Extraction badge -->
    <div class="meta-row">
      <span class="method-badge" :class="`method-badge--${result.extractionMethod}`">
        {{ methodLabel }}
      </span>
      <span class="confidence-badge" :class="`confidence-badge--${result.confidence}`">
        {{ confidenceLabel }}
      </span>
    </div>

    <!-- Truncation warning (LinkedIn and similar) -->
    <div v-if="result.truncationWarning" class="notice notice-warn" role="alert">
      {{ result.truncationWarning }}
    </div>

    <!-- Low-confidence warning -->
    <div v-if="result.confidence === 'low'" class="notice notice-warn" role="status">
      Low extraction confidence — please review and edit the text below before using it.
    </div>

    <!-- Structured metadata -->
    <dl v-if="result.jobTitle || result.company || result.location" class="metadata">
      <template v-if="result.jobTitle">
        <dt>Job title</dt>
        <dd>{{ result.jobTitle }}</dd>
      </template>
      <template v-if="result.company">
        <dt>Company</dt>
        <dd>{{ result.company }}</dd>
      </template>
      <template v-if="result.location">
        <dt>Location</dt>
        <dd>{{ result.location }}</dd>
      </template>
    </dl>

    <!-- Description label -->
    <div class="desc-header">
      <span class="desc-label">Job description</span>
      <span class="desc-count">{{ description.length.toLocaleString() }} characters</span>
    </div>

    <!-- Editable textarea — always editable so user can correct or supplement -->
    <textarea
      class="desc-textarea"
      :value="description"
      placeholder="Job description will appear here — you can edit it."
      rows="12"
      spellcheck="false"
      @input="onInput"
    />

    <!-- Actions -->
    <div class="actions">
      <button class="btn btn-ghost" @click="$emit('clear')">Clear</button>
      <button class="btn btn-secondary" @click="$emit('retry')">Retry scan</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JobExtractionResult } from '@/types/job'

const props = defineProps<{
  result: JobExtractionResult
  description: string
}>()

const emit = defineEmits<{
  (e: 'update:description', value: string): void
  (e: 'clear'): void
  (e: 'retry'): void
}>()

const methodLabel = computed<string>(() => {
  const labels: Record<JobExtractionResult['extractionMethod'], string> = {
    'site-specific': 'Site-specific',
    'json-ld': 'Structured data (JSON-LD)',
    dom: 'Page content (DOM)',
    manual: 'Manual input',
  }
  return labels[props.result.extractionMethod]
})

const confidenceLabel = computed<string>(() => {
  const labels: Record<JobExtractionResult['confidence'], string> = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  }
  return labels[props.result.confidence]
})

function onInput(event: Event): void {
  emit('update:description', (event.target as HTMLTextAreaElement).value)
}
</script>

<style scoped>
.job-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.method-badge,
.confidence-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.method-badge--site-specific {
  background: #e0f2fe;
  color: #0369a1;
}

.method-badge--json-ld {
  background: #dbeafe;
  color: #1e40af;
}

.method-badge--dom {
  background: #f3f4f6;
  color: #374151;
}

.method-badge--manual {
  background: #f3f4f6;
  color: #374151;
}

.confidence-badge--high {
  background: #dcfce7;
  color: #166534;
}

.confidence-badge--medium {
  background: #fef9c3;
  color: #713f12;
}

.confidence-badge--low {
  background: #fee2e2;
  color: #991b1b;
}

.notice-warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 12px;
  color: #92400e;
  line-height: 1.5;
}

.metadata {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 0;
}

.metadata dt {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  align-self: center;
}

.metadata dd {
  font-size: 13px;
  color: var(--color-text);
  margin: 0;
  word-break: break-word;
}

.desc-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.desc-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.desc-count {
  font-size: 11px;
  color: var(--color-text-muted);
}

.desc-textarea {
  width: 100%;
  min-height: 180px;
  padding: 8px;
  font-size: 12px;
  font-family: inherit;
  line-height: 1.6;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  resize: vertical;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.desc-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}

.desc-textarea::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.btn-ghost:hover {
  background: var(--color-bg);
  border-color: var(--color-text-muted);
}

.btn-secondary {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.btn-secondary:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>

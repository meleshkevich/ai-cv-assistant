<template>
  <div class="general-notes-section">
    <label for="general-notes" class="notes-label">
      Additional knowledge, freelance work, achievements, side projects, self-study, experiments —
      anything professionally relevant that doesn't fit neatly elsewhere.
    </label>
    <textarea
      id="general-notes"
      v-model="profile.generalNotes"
      class="notes-textarea"
      placeholder="Write freely — no format required, no length limit."
      rows="12"
    />
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { PROFILE_KEY } from '@/composables/useProfile'

const { profile } = inject(PROFILE_KEY)!
</script>

<style scoped>
.general-notes-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}

.notes-label {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.notes-textarea {
  width: 100%;
  padding: 8px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  resize: vertical;
  min-height: 180px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.notes-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
  background: var(--color-surface);
}

.notes-textarea::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}
</style>

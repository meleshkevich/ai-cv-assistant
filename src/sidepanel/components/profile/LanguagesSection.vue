<template>
  <div class="languages-section">
    <div v-if="profile.languages.length === 0" class="empty-state">
      No languages yet.
    </div>

    <div v-for="entry in profile.languages" :key="entry.id" class="lang-row">
      <input
        v-model="entry.language"
        type="text"
        class="lang-input lang-input--name"
        placeholder="Czech"
        aria-label="Language"
      />
      <input
        v-model="entry.proficiency"
        type="text"
        class="lang-input lang-input--level"
        placeholder="Native / B2 / Fluent"
        aria-label="Proficiency"
      />
      <template v-if="confirmingDeleteId === entry.id">
        <button class="btn-icon btn-icon--danger" title="Confirm delete" @click="confirmDelete(entry.id)">✓</button>
        <button class="btn-icon" title="Cancel" @click="confirmingDeleteId = null">✕</button>
      </template>
      <button
        v-else
        class="btn-icon btn-icon--muted"
        title="Remove"
        @click="confirmingDeleteId = entry.id"
      >
        🗑
      </button>
    </div>

    <button class="btn-add" @click="addEntry">+ Add language</button>
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue'
import { PROFILE_KEY } from '@/composables/useProfile'
import type { LanguageEntry } from '@/types/profile'
import { generateId } from '@/types/profile'

const { profile, forceSave } = inject(PROFILE_KEY)!

const confirmingDeleteId = ref<string | null>(null)

function addEntry(): void {
  const entry: LanguageEntry = { id: generateId(), language: '', proficiency: '' }
  profile.value.languages.push(entry)
  confirmingDeleteId.value = null
  void forceSave()
}

function confirmDelete(id: string): void {
  profile.value.languages = profile.value.languages.filter((e) => e.id !== id)
  confirmingDeleteId.value = null
  void forceSave()
}
</script>

<style scoped>
.languages-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0 4px;
}

.empty-state {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 12px 0;
}

.lang-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lang-input {
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.15s, box-shadow 0.15s;
  font-family: inherit;
}

.lang-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}

.lang-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.lang-input--name {
  flex: 2;
}

.lang-input--level {
  flex: 3;
}

.btn-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-icon--muted {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.btn-icon--muted:hover {
  background: var(--color-bg);
  opacity: 1;
}

.btn-icon--danger {
  color: var(--color-error);
}

.btn-icon--danger:hover {
  background: var(--color-error-bg);
}

.btn-add {
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  width: 100%;
  margin-top: 2px;
}

.btn-add:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
}
</style>

<template>
  <div class="projects-section">
    <div v-if="profile.projects.length === 0" class="empty-state">
      No projects yet. Add your first project below.
    </div>

    <div
      v-for="entry in profile.projects"
      :key="entry.id"
      class="entry-card"
      :class="{ 'entry-card--expanded': expandedIds.has(entry.id) }"
    >
      <div class="entry-header">
        <button
          class="entry-toggle"
          :aria-expanded="expandedIds.has(entry.id)"
          @click="toggleEntry(entry.id)"
        >
          <span class="entry-summary">
            <span class="entry-title">{{ entry.name || '(untitled project)' }}</span>
            <span v-if="entry.role" class="entry-subtitle">{{ entry.role }}</span>
          </span>
          <span class="entry-date-range" v-if="entry.startDate">
            {{ entry.startDate }}{{ entry.endDate !== null ? ' – ' + (entry.endDate || '…') : ' – present' }}
          </span>
          <span class="entry-chevron" :class="{ 'entry-chevron--open': expandedIds.has(entry.id) }">▾</span>
        </button>

        <template v-if="confirmingDeleteId === entry.id">
          <span class="delete-confirm-label">Delete?</span>
          <button class="btn-icon btn-icon--danger" title="Confirm delete" @click="confirmDelete(entry.id)">✓</button>
          <button class="btn-icon" title="Cancel" @click="confirmingDeleteId = null">✕</button>
        </template>
        <button
          v-else
          class="btn-icon btn-icon--muted"
          title="Delete project"
          @click.stop="confirmingDeleteId = entry.id"
        >
          🗑
        </button>
      </div>

      <div v-if="expandedIds.has(entry.id)" class="entry-form">
        <div class="field-grid">
          <div class="field field--full">
            <label>Project name</label>
            <input v-model="entry.name" type="text" placeholder="My Open Source Project" />
          </div>
          <div class="field field--full">
            <label>Your role</label>
            <input v-model="entry.role" type="text" placeholder="Lead Developer" />
          </div>
          <div class="field field--full">
            <label>URL</label>
            <input v-model="entry.url" type="url" placeholder="https://github.com/..." />
          </div>
          <div class="field">
            <label>Start date</label>
            <input v-model="entry.startDate" type="text" placeholder="YYYY-MM" />
          </div>
          <div class="field">
            <label>End date</label>
            <div class="end-date-row">
              <input
                v-if="entry.endDate !== null"
                v-model="entry.endDate"
                type="text"
                placeholder="YYYY-MM"
              />
              <span v-else class="end-date-present">Ongoing</span>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="entry.endDate === null"
                  @change="toggleCurrent(entry)"
                />
                Ongoing
              </label>
            </div>
          </div>
        </div>

        <div class="field field--full" style="margin-top: 10px">
          <label>Description</label>
          <textarea
            v-model="entry.description"
            placeholder="Describe the project, your contributions, tech stack, and impact."
            rows="8"
          />
        </div>
      </div>
    </div>

    <button class="btn-add" @click="addEntry">+ Add project</button>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, reactive } from 'vue'
import { PROFILE_KEY } from '@/composables/useProfile'
import type { ProjectEntry } from '@/types/profile'
import { generateId } from '@/types/profile'

const { profile, forceSave } = inject(PROFILE_KEY)!

const expandedIds = reactive(new Set<string>())
const confirmingDeleteId = ref<string | null>(null)

function toggleEntry(id: string): void {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
  } else {
    expandedIds.add(id)
  }
}

function addEntry(): void {
  const entry: ProjectEntry = {
    id: generateId(),
    name: '',
    role: '',
    url: '',
    startDate: '',
    endDate: null,
    description: '',
  }
  profile.value.projects.unshift(entry)
  expandedIds.add(entry.id)
  confirmingDeleteId.value = null
  void forceSave()
}

function confirmDelete(id: string): void {
  profile.value.projects = profile.value.projects.filter((e) => e.id !== id)
  expandedIds.delete(id)
  confirmingDeleteId.value = null
  void forceSave()
}

function toggleCurrent(entry: ProjectEntry): void {
  entry.endDate = entry.endDate === null ? '' : null
}
</script>

<style scoped>
.projects-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}

.empty-state {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 12px 0;
}

.entry-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  overflow: hidden;
}

.entry-card--expanded {
  border-color: var(--color-primary);
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
}

.entry-toggle {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  min-width: 0;
}

.entry-summary {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.entry-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.entry-subtitle {
  font-size: 11px;
  color: var(--color-text-muted);
}

.entry-date-range {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.entry-chevron {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  transition: transform 0.15s;
}

.entry-chevron--open {
  transform: rotate(180deg);
}

.delete-confirm-label {
  font-size: 11px;
  color: var(--color-error);
  white-space: nowrap;
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

.entry-form {
  padding: 0 10px 12px;
  border-top: 1px solid var(--color-border);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.field--full {
  grid-column: 1 / -1;
}

.field label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.field input,
.field textarea {
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
  font-family: inherit;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
  background: var(--color-surface);
}

.field input::placeholder,
.field textarea::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.field textarea {
  resize: vertical;
  line-height: 1.6;
  min-height: 120px;
}

.end-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.end-date-row input[type='text'] {
  flex: 1;
}

.end-date-present {
  font-size: 13px;
  color: var(--color-text-muted);
  font-style: italic;
  flex: 1;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  cursor: pointer;
  white-space: nowrap;
}

.checkbox-label input[type='checkbox'] {
  cursor: pointer;
  width: auto;
  padding: 0;
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
}

.btn-add:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
}
</style>

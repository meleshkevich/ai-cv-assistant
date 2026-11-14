<template>
  <div class="profile-view">
    <!-- Loading skeleton -->
    <div v-if="isLoading" class="loading-state" aria-live="polite">
      <span class="inline-spinner" aria-hidden="true" />
      Loading profile…
    </div>

    <template v-else>
      <!-- Toolbar: save status + import/export -->
      <div class="profile-toolbar">
        <span class="save-status" :class="`save-status--${saveStatus}`">
          <template v-if="saveStatus === 'saving'">Saving…</template>
          <template v-else-if="saveStatus === 'saved'">Saved</template>
          <template v-else-if="saveStatus === 'error'">Save failed</template>
        </span>
        <div class="toolbar-actions">
          <button class="btn-sm btn-sm--outline" @click="triggerImport">Import JSON</button>
          <button class="btn-sm btn-sm--primary" @click="doExport">Export JSON</button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="sr-only"
            @change="handleImportFile"
          />
        </div>
      </div>

      <!-- Corrupted profile warning -->
      <div v-if="profileCorrupted" class="notice notice-error" role="alert">
        <div class="notice-header">
          <strong>Some profile data could not be loaded</strong>
        </div>
        <p class="notice-body">
          The following fields were stored in an unexpected format and could not be restored:
          <strong>{{ corruptedFields.join(', ') }}</strong>.
          If you have a previous JSON export, use <strong>Import JSON</strong> to recover your data.
        </p>
      </div>

      <!-- Import validation errors -->
      <div v-if="importErrors.length > 0" class="notice notice-error" role="alert">
        <div class="notice-header">
          <strong>Import failed</strong>
          <button class="btn-dismiss" @click="importErrors = []" aria-label="Dismiss">✕</button>
        </div>
        <ul class="error-list">
          <li v-for="(err, i) in importErrors" :key="i">{{ err }}</li>
        </ul>
      </div>

      <!-- Import confirmation -->
      <div v-if="pendingImport" class="notice notice-warning" role="alertdialog" aria-modal="false">
        <strong class="notice-title">Replace existing profile?</strong>
        <p class="notice-body">
          This will overwrite all current profile data. This action cannot be undone.
        </p>
        <div class="notice-actions">
          <button class="btn-sm btn-sm--danger" @click="confirmImport">Replace</button>
          <button class="btn-sm btn-sm--outline" @click="pendingImport = null">Cancel</button>
        </div>
      </div>

      <!-- Sections -->
      <div class="sections">
        <!-- Personal Information -->
        <div class="section">
          <button
            class="section-header"
            :aria-expanded="expanded.has('personal')"
            @click="toggleSection('personal')"
          >
            <span class="section-title">Personal Information</span>
            <span class="section-chevron" :class="{ 'section-chevron--open': expanded.has('personal') }">▾</span>
          </button>
          <div v-if="expanded.has('personal')" class="section-body">
            <PersonalSection />
          </div>
        </div>

        <!-- Professional Experience -->
        <div class="section">
          <button
            class="section-header"
            :aria-expanded="expanded.has('experience')"
            @click="toggleSection('experience')"
          >
            <span class="section-title">Professional Experience</span>
            <span class="section-badge">{{ profile.experience.length }}</span>
            <span class="section-chevron" :class="{ 'section-chevron--open': expanded.has('experience') }">▾</span>
          </button>
          <div v-if="expanded.has('experience')" class="section-body">
            <ExperienceSection />
          </div>
        </div>

        <!-- Projects -->
        <div class="section">
          <button
            class="section-header"
            :aria-expanded="expanded.has('projects')"
            @click="toggleSection('projects')"
          >
            <span class="section-title">Projects</span>
            <span class="section-badge">{{ profile.projects.length }}</span>
            <span class="section-chevron" :class="{ 'section-chevron--open': expanded.has('projects') }">▾</span>
          </button>
          <div v-if="expanded.has('projects')" class="section-body">
            <ProjectsSection />
          </div>
        </div>

        <!-- Education -->
        <div class="section">
          <button
            class="section-header"
            :aria-expanded="expanded.has('education')"
            @click="toggleSection('education')"
          >
            <span class="section-title">Education</span>
            <span class="section-badge">{{ profile.education.length }}</span>
            <span class="section-chevron" :class="{ 'section-chevron--open': expanded.has('education') }">▾</span>
          </button>
          <div v-if="expanded.has('education')" class="section-body">
            <EducationSection />
          </div>
        </div>

        <!-- Languages -->
        <div class="section">
          <button
            class="section-header"
            :aria-expanded="expanded.has('languages')"
            @click="toggleSection('languages')"
          >
            <span class="section-title">Languages</span>
            <span class="section-badge">{{ profile.languages.length }}</span>
            <span class="section-chevron" :class="{ 'section-chevron--open': expanded.has('languages') }">▾</span>
          </button>
          <div v-if="expanded.has('languages')" class="section-body">
            <LanguagesSection />
          </div>
        </div>

        <!-- General Notes -->
        <div class="section">
          <button
            class="section-header"
            :aria-expanded="expanded.has('notes')"
            @click="toggleSection('notes')"
          >
            <span class="section-title">General Notes</span>
            <span class="section-chevron" :class="{ 'section-chevron--open': expanded.has('notes') }">▾</span>
          </button>
          <div v-if="expanded.has('notes')" class="section-body">
            <GeneralNotesSection />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, reactive } from 'vue'
import { PROFILE_KEY } from '@/composables/useProfile'
import type { MasterProfile } from '@/types/profile'
import { isProfileEmpty } from '@/types/profile'
import { validateProfileJson } from '@/utils/profileValidation'
import PersonalSection from '../components/profile/PersonalSection.vue'
import ExperienceSection from '../components/profile/ExperienceSection.vue'
import ProjectsSection from '../components/profile/ProjectsSection.vue'
import EducationSection from '../components/profile/EducationSection.vue'
import LanguagesSection from '../components/profile/LanguagesSection.vue'
import GeneralNotesSection from '../components/profile/GeneralNotesSection.vue'

const { profile, saveStatus, isLoading, profileCorrupted, corruptedFields } = inject(PROFILE_KEY)!

// Sections expanded by default: personal, so the user sees something useful immediately
const expanded = reactive(new Set<string>(['personal']))

function toggleSection(key: string): void {
  if (expanded.has(key)) {
    expanded.delete(key)
  } else {
    expanded.add(key)
  }
}

// ─── Import ─────────────────────────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null)
const importErrors = ref<string[]>([])
const pendingImport = ref<MasterProfile | null>(null)

function triggerImport(): void {
  importErrors.value = []
  pendingImport.value = null
  fileInputRef.value?.click()
}

function handleImportFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = '' // reset so the same file can be re-selected

  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result
    if (typeof text !== 'string') {
      importErrors.value = ['Failed to read file.']
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      importErrors.value = ['The file is not valid JSON.']
      return
    }

    const result = validateProfileJson(parsed)
    if (!result.valid) {
      importErrors.value = result.errors
      return
    }

    // If the current profile is non-empty, ask for confirmation.
    if (!isProfileEmpty(profile.value)) {
      pendingImport.value = result.profile
    } else {
      applyImport(result.profile)
    }
  }
  reader.onerror = () => {
    importErrors.value = ['Failed to read file.']
  }
  reader.readAsText(file)
}

function confirmImport(): void {
  if (!pendingImport.value) return
  applyImport(pendingImport.value)
  pendingImport.value = null
}

function applyImport(imported: MasterProfile): void {
  profile.value = imported
  importErrors.value = []
  // Expand personal section to show the imported data
  expanded.add('personal')
}

// ─── Export ─────────────────────────────────────────────────────────────────

function doExport(): void {
  const json = JSON.stringify(profile.value, null, 2)
  const blob = new Blob([json], { type: 'application/json; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `master-profile-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Loading */
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 20px 0;
  justify-content: center;
}

.inline-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Toolbar */
.profile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.save-status {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  min-width: 60px;
}

.save-status--saving {
  color: var(--color-primary);
}

.save-status--saved {
  color: #16a34a;
}

.save-status--error {
  color: var(--color-error);
}

.toolbar-actions {
  display: flex;
  gap: 6px;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.btn-sm--outline {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.btn-sm--outline:hover {
  background: var(--color-bg);
}

.btn-sm--primary {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.btn-sm--primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.btn-sm--danger {
  border: 1px solid var(--color-error);
  background: var(--color-error);
  color: #fff;
}

.btn-sm--danger:hover {
  background: #b91c1c;
  border-color: #b91c1c;
}

/* Utility: visually hidden file input */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Notices */
.notice {
  border-radius: var(--radius);
  padding: 10px 12px;
}

.notice-error {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
}

.notice-warning {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.notice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.notice-header strong {
  font-size: 13px;
  color: var(--color-error);
}

.notice-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.notice-body {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-bottom: 8px;
}

.notice-actions {
  display: flex;
  gap: 6px;
}

.btn-dismiss {
  padding: 2px 6px;
  font-size: 11px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.btn-dismiss:hover {
  background: var(--color-error-border);
}

.error-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--color-error);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Sections */
.sections {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.1s;
}

.section-header:hover {
  background: var(--color-bg);
}

.section-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.section-badge {
  font-size: 11px;
  font-weight: 600;
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1px 7px;
}

.section-chevron {
  font-size: 12px;
  color: var(--color-text-muted);
  transition: transform 0.15s;
  flex-shrink: 0;
}

.section-chevron--open {
  transform: rotate(180deg);
}

.section-body {
  padding: 0 12px 12px;
  border-top: 1px solid var(--color-border);
}
</style>

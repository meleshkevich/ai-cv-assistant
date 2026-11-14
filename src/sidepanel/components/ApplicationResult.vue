<template>
  <div class="app-result">
    <!-- Restored draft indicator -->
    <div v-if="wasRestored" class="restored-banner" role="status">
      <span class="restored-icon" aria-hidden="true">↩</span>
      Draft restored from previous session
    </div>

    <!-- Tab bar -->
    <div class="tab-bar" role="tablist">
      <button
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'cover' }"
        role="tab"
        :aria-selected="activeTab === 'cover'"
        @click="activeTab = 'cover'"
      >
        Cover Letter
      </button>
      <button
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'cv' }"
        role="tab"
        :aria-selected="activeTab === 'cv'"
        @click="activeTab = 'cv'"
      >
        CV Preview
      </button>
    </div>

    <!-- Cover Letter tab -->
    <div v-if="activeTab === 'cover'" class="tab-panel">
      <!-- Subject -->
      <div class="field-row">
        <label class="field-label">Subject</label>
        <input
          class="field-input"
          type="text"
          :value="draftSubject"
          @input="onSubjectInput"
        />
      </div>

      <!-- Body -->
      <div class="field-row">
        <label class="field-label">Body</label>
        <textarea
          class="field-textarea"
          :value="draftBody"
          rows="14"
          spellcheck="true"
          @input="onBodyInput"
        />
        <span class="char-count">{{ draftBody.length }} characters</span>
      </div>

      <div class="actions">
        <span class="save-status" :class="`save-status--${saveStatus}`" role="status" aria-live="polite">
          {{ saveStatusLabel }}
        </span>
        <button class="btn btn-ghost btn-sm" @click="copyToClipboard">
          {{ copyLabel }}
        </button>
        <button class="btn btn-ghost btn-sm btn-danger" @click="handleDeleteDraft">
          Delete Draft
        </button>
        <button class="btn btn-ghost btn-sm" @click="handleRegenerate">
          Regenerate
        </button>
      </div>
    </div>

    <!-- CV Preview tab -->
    <div v-else class="tab-panel">
      <!-- Professional Title -->
      <div class="field-row">
        <label class="field-label">Professional Title</label>
        <input
          class="field-input"
          type="text"
          :value="draftTitle"
          @input="onTitleInput"
        />
      </div>

      <!-- Professional Summary -->
      <div class="field-row">
        <label class="field-label">Professional Summary</label>
        <textarea
          class="field-textarea field-textarea--short"
          :value="draftSummary"
          rows="4"
          @input="onSummaryInput"
        />
      </div>

      <!-- Technical Skills -->
      <div class="field-row">
        <label class="field-label">Technical Skills</label>
        <textarea
          class="field-textarea field-textarea--short"
          :value="draftSkillsText"
          rows="3"
          placeholder="One skill per line"
          @input="onSkillsInput"
        />
        <span class="field-hint">One skill per line</span>
      </div>

      <!-- Experience -->
      <section v-if="draftExperience.length > 0" class="cv-section">
        <h4 class="cv-section-title">Experience</h4>
        <div
          v-for="(exp, i) in draftExperience"
          :key="exp.sourceId"
          class="cv-entry"
        >
          <div class="cv-entry-header">
            <span class="cv-entry-role">{{ exp.position }}</span>
            <span class="cv-entry-sep"> · </span>
            <span class="cv-entry-org">{{ exp.company }}</span>
            <span class="cv-entry-dates"> {{ exp.startDate }} – {{ exp.endDate ?? 'Present' }}</span>
          </div>
          <textarea
            class="field-textarea field-textarea--short"
            :value="exp.highlights.join('\n')"
            rows="3"
            placeholder="One highlight per line"
            @input="updateExpHighlights(i, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </section>

      <!-- Projects -->
      <section v-if="draftProjects.length > 0" class="cv-section">
        <h4 class="cv-section-title">Projects</h4>
        <div
          v-for="(proj, i) in draftProjects"
          :key="proj.sourceId"
          class="cv-entry"
        >
          <div class="cv-entry-header">
            <span class="cv-entry-role">{{ proj.name }}</span>
            <span v-if="proj.role" class="cv-entry-sep"> · </span>
            <span v-if="proj.role" class="cv-entry-org">{{ proj.role }}</span>
          </div>
          <a
            v-if="safeProjectUrl(proj.url)"
            :href="safeProjectUrl(proj.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="cv-entry-link"
          >View project</a>
          <textarea
            class="field-textarea field-textarea--short"
            :value="proj.highlights.join('\n')"
            rows="3"
            placeholder="One highlight per line"
            @input="updateProjHighlights(i, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </section>

      <!-- Education -->
      <section v-if="draftEducation.length > 0" class="cv-section">
        <h4 class="cv-section-title">Education</h4>
        <div
          v-for="edu in draftEducation"
          :key="edu.sourceId"
          class="cv-entry cv-entry--readonly"
        >
          <span class="cv-entry-role">{{ edu.degree }} {{ edu.field }}</span>
          <span class="cv-entry-sep"> · </span>
          <span class="cv-entry-org">{{ edu.institution }}</span>
        </div>
      </section>

      <!-- Languages -->
      <section v-if="draftLanguages.length > 0" class="cv-section">
        <h4 class="cv-section-title">Languages</h4>
        <div
          v-for="lang in draftLanguages"
          :key="lang.sourceId"
          class="cv-entry cv-entry--readonly"
        >
          <span class="cv-entry-role">{{ lang.language }}</span>
          <span class="cv-entry-sep">: </span>
          <span class="cv-entry-org">{{ lang.proficiency }}</span>
        </div>
      </section>

      <!-- PDF overflow banner (shown when pdfIsOverflow is true and no proposal is active) -->
      <div
        v-if="pdfIsOverflow && compressionState.status !== 'success'"
        class="pdf-error"
        role="alert"
      >
        <div class="pdf-error-body">
          <p class="pdf-error-msg">
            Your CV content is too long for one A4 page even in compact layout.
          </p>

          <!-- AI compression loading state -->
          <div v-if="compressionState.status === 'loading'" class="compression-loading">
            <span class="inline-spinner" aria-hidden="true" />
            <span>{{ compressionState.attempt === 2 ? 'Second compression pass…' : 'Compressing with AI…' }}</span>
            <button class="btn btn-ghost btn-sm" @click="emit('cancelCompression')">Cancel</button>
          </div>

          <!-- AI compression error -->
          <p
            v-if="compressionState.status === 'error'"
            class="compression-error-msg"
            role="status"
          >
            {{ compressionState.message }}
          </p>

          <!-- Action buttons -->
          <div v-if="compressionState.status !== 'loading'" class="pdf-overflow-actions">
            <button
              class="btn btn-ai btn-sm"
              @click="handleFitWithAi"
            >
              {{ compressionState.status === 'error' ? 'Try Again' : 'Fit to One Page with AI' }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="clearPdfError">
              Edit manually
            </button>
          </div>
        </div>
      </div>

      <!-- Plain PDF error (non-overflow) -->
      <div v-else-if="pdfError && !pdfIsOverflow" class="pdf-error" role="alert">
        <p class="pdf-error-msg">{{ pdfError }}</p>
        <button class="pdf-error-dismiss" aria-label="Dismiss" @click="clearPdfError">✕</button>
      </div>

      <!-- AI compression proposal comparison UI -->
      <div
        v-if="compressionState.status === 'success'"
        class="compression-proposal"
        role="region"
        aria-label="AI compression proposal"
      >
        <div class="proposal-header">
          <div class="proposal-title-row">
            <strong
              class="proposal-title"
              :class="compressionState.result.fits ? 'proposal-title--fits' : 'proposal-title--overflow'"
            >
              {{ compressionState.result.fits ? 'AI Compression — Fits One Page ✓' : 'AI Compression — Still Exceeds One Page' }}
            </strong>
            <span v-if="compressionState.result.attemptCount === 2" class="proposal-attempts">2 passes</span>
          </div>
          <span class="proposal-hint">
            {{ compressionState.result.fits
              ? 'Review changes below, then apply or discard.'
              : 'The CV was shortened but still does not fit one page. Apply and edit manually, or discard.' }}
          </span>
        </div>

        <div
          v-for="change in proposalChanges"
          :key="change.label"
          class="proposal-change"
        >
          <div class="change-label">{{ change.label }}</div>
          <div class="change-columns">
            <div class="change-col">
              <div class="change-col-title">Before</div>
              <div class="change-text change-text--before">{{ change.before }}</div>
            </div>
            <div class="change-col">
              <div class="change-col-title">After</div>
              <div class="change-text change-text--after">{{ change.after }}</div>
            </div>
          </div>
        </div>

        <div v-if="proposalChanges.length === 0" class="proposal-no-changes">
          No changes proposed — the CV already fits.
        </div>

        <div class="proposal-actions">
          <button class="btn btn-ai btn-sm" @click="handleApplyProposal">Apply Changes</button>
          <button class="btn btn-ghost btn-sm" @click="emit('dismissCompression')">Keep Original</button>
        </div>
      </div>

      <div class="actions">
        <span class="save-status" :class="`save-status--${saveStatus}`" role="status" aria-live="polite">
          {{ saveStatusLabel }}
        </span>
        <button class="btn btn-ghost btn-sm btn-danger" @click="handleDeleteDraft">
          Delete Draft
        </button>
        <button class="btn btn-ghost btn-sm" @click="handleRegenerate">
          Regenerate
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="pdfButtonDisabled"
          @click="downloadPdf"
        >
          {{ pdfGenerating ? 'Generating PDF…' : 'Download PDF' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { GeneratedApplication, GeneratedCv, GeneratedCvExperience, GeneratedCvProject, GeneratedCvEducation, GeneratedCvLanguage } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'
import type { CompressionState } from '@/services/cvCompressionService'
import { usePdfDownload } from '@/composables/usePdfDownload'

const props = defineProps<{
  application: GeneratedApplication
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  wasRestored: boolean
  personalInfo: PersonalInfo
  vacancyTitle: string | null
  vacancyCompany: string | null
  profileLoading: boolean
  compressionState: CompressionState
}>()

const emit = defineEmits<{
  regenerate: []
  change: [application: GeneratedApplication]
  deleteDraft: []
  fitWithAi: [cv: GeneratedCv]
  dismissCompression: []
  cancelCompression: []
}>()

// Tab state
const activeTab = ref<'cover' | 'cv'>('cover')

// Cover letter draft (editable copies)
const draftSubject = ref(props.application.coverLetter.subject)
const draftBody = ref(props.application.coverLetter.body)

// CV draft (editable copies)
const draftTitle = ref(props.application.cv.professionalTitle)
const draftSummary = ref(props.application.cv.professionalSummary)
const draftSkillsText = ref(props.application.cv.technicalSkills.join('\n'))
const draftExperience = ref<GeneratedCvExperience[]>(
  props.application.cv.experience.map((e) => ({ ...e, highlights: [...e.highlights] })),
)
const draftProjects = ref<GeneratedCvProject[]>(
  props.application.cv.projects.map((p) => ({ ...p, highlights: [...p.highlights] })),
)
const draftEducation = ref<GeneratedCvEducation[]>(
  props.application.cv.education.map((e) => ({ ...e })),
)
const draftLanguages = ref<GeneratedCvLanguage[]>(
  props.application.cv.languages.map((l) => ({ ...l })),
)

// Reset drafts when a new application arrives (e.g. after regeneration or draft restore).
// This does NOT emit change — the parent already knows the content.
watch(
  () => props.application,
  (app) => {
    draftSubject.value = app.coverLetter.subject
    draftBody.value = app.coverLetter.body
    draftTitle.value = app.cv.professionalTitle
    draftSummary.value = app.cv.professionalSummary
    draftSkillsText.value = app.cv.technicalSkills.join('\n')
    draftExperience.value = app.cv.experience.map((e) => ({ ...e, highlights: [...e.highlights] }))
    draftProjects.value = app.cv.projects.map((p) => ({ ...p, highlights: [...p.highlights] }))
    draftEducation.value = app.cv.education.map((e) => ({ ...e }))
    draftLanguages.value = app.cv.languages.map((l) => ({ ...l }))
  },
)

// Builds the current full draft state for persistence.
function buildCurrentDraft(): GeneratedApplication {
  return {
    coverLetter: {
      language: props.application.coverLetter.language,
      subject: draftSubject.value,
      body: draftBody.value,
    },
    cv: {
      language: props.application.cv.language,
      professionalTitle: draftTitle.value,
      professionalSummary: draftSummary.value,
      technicalSkills: draftSkillsText.value.split('\n').filter((s) => s.trim() !== ''),
      experience: draftExperience.value.map((e) => ({ ...e, highlights: [...e.highlights] })),
      projects: draftProjects.value.map((p) => ({ ...p, highlights: [...p.highlights] })),
      education: draftEducation.value.map((e) => ({ ...e })),
      languages: draftLanguages.value.map((l) => ({ ...l })),
    },
  }
}

const { pdfGenerating, pdfButtonDisabled, pdfError, pdfIsOverflow, clearPdfError, downloadPdf } = usePdfDownload(
  () => buildCurrentDraft().cv,
  () => props.personalInfo,
  () => props.vacancyTitle,
  () => props.vacancyCompany,
  () => props.profileLoading,
)

// ── Compression proposal ───────────────────────────────────────────────────────

// Computes a list of changed fields between originalCv and mergedCv for display.
interface ProposalChange {
  label: string
  before: string
  after: string
}

const proposalChanges = computed<ProposalChange[]>(() => {
  if (props.compressionState.status !== 'success') return []
  const { originalCv, mergedCv } = props.compressionState.result
  const changes: ProposalChange[] = []

  if (originalCv.professionalSummary !== mergedCv.professionalSummary) {
    changes.push({
      label: 'Professional Summary',
      before: originalCv.professionalSummary,
      after: mergedCv.professionalSummary,
    })
  }

  const origSkills = originalCv.technicalSkills.join(', ')
  const newSkills = mergedCv.technicalSkills.join(', ')
  if (origSkills !== newSkills) {
    changes.push({ label: 'Technical Skills', before: origSkills, after: newSkills })
  }

  for (const exp of mergedCv.experience) {
    const orig = originalCv.experience.find((e) => e.sourceId === exp.sourceId)
    if (orig && orig.highlights.join('\n') !== exp.highlights.join('\n')) {
      changes.push({
        label: `${orig.position} · ${orig.company}`,
        before: orig.highlights.join('\n'),
        after: exp.highlights.join('\n'),
      })
    }
  }

  for (const proj of mergedCv.projects) {
    const orig = originalCv.projects.find((p) => p.sourceId === proj.sourceId)
    if (orig && orig.highlights.join('\n') !== proj.highlights.join('\n')) {
      changes.push({
        label: orig.name,
        before: orig.highlights.join('\n'),
        after: proj.highlights.join('\n'),
      })
    }
  }

  return changes
})

function handleFitWithAi(): void {
  emit('fitWithAi', buildCurrentDraft().cv)
}

function handleApplyProposal(): void {
  if (props.compressionState.status !== 'success') return
  const { mergedCv } = props.compressionState.result

  // Apply proposed changes into local draft state.
  draftSummary.value = mergedCv.professionalSummary
  draftSkillsText.value = mergedCv.technicalSkills.join('\n')
  draftExperience.value = mergedCv.experience.map((e) => ({ ...e, highlights: [...e.highlights] }))
  draftProjects.value = mergedCv.projects.map((p) => ({ ...p, highlights: [...p.highlights] }))

  // Emit change to trigger autosave in parent.
  emit('change', buildCurrentDraft())

  // Clear the compression proposal UI.
  emit('dismissCompression')
}

// ── Save status ────────────────────────────────────────────────────────────────

const saveStatusLabel = computed<string>(() => {
  switch (props.saveStatus) {
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved'
    case 'error': return 'Save failed'
    default: return ''
  }
})

// ── Copy to clipboard ─────────────────────────────────────────────────────────

const copyLabel = ref('Copy to Clipboard')

async function copyToClipboard(): Promise<void> {
  const text = `Subject: ${draftSubject.value}\n\n${draftBody.value}`
  try {
    await navigator.clipboard.writeText(text)
    copyLabel.value = 'Copied!'
    setTimeout(() => { copyLabel.value = 'Copy to Clipboard' }, 2000)
  } catch {
    copyLabel.value = 'Copy failed'
    setTimeout(() => { copyLabel.value = 'Copy to Clipboard' }, 2000)
  }
}

// ── Regeneration ──────────────────────────────────────────────────────────────

function hasEdits(): boolean {
  if (draftSubject.value !== props.application.coverLetter.subject) return true
  if (draftBody.value !== props.application.coverLetter.body) return true
  if (draftTitle.value !== props.application.cv.professionalTitle) return true
  if (draftSummary.value !== props.application.cv.professionalSummary) return true
  if (draftSkillsText.value !== props.application.cv.technicalSkills.join('\n')) return true
  if (draftExperience.value.some((e, i) => {
    const orig = props.application.cv.experience[i]
    return e.highlights.join('\n') !== (orig?.highlights ?? []).join('\n')
  })) return true
  if (draftProjects.value.some((p, i) => {
    const orig = props.application.cv.projects[i]
    return p.highlights.join('\n') !== (orig?.highlights ?? []).join('\n')
  })) return true
  return false
}

function handleRegenerate(): void {
  if (hasEdits()) {
    if (!window.confirm('You have unsaved edits. Regenerating will replace all content. Continue?')) {
      return
    }
  }
  emit('regenerate')
}

function handleDeleteDraft(): void {
  emit('deleteDraft')
}

// ── Input handlers — each one updates state then emits change ─────────────────

function onSubjectInput(event: Event): void {
  draftSubject.value = (event.target as HTMLInputElement).value
  emit('change', buildCurrentDraft())
}

function onBodyInput(event: Event): void {
  draftBody.value = (event.target as HTMLTextAreaElement).value
  emit('change', buildCurrentDraft())
}

function onTitleInput(event: Event): void {
  draftTitle.value = (event.target as HTMLInputElement).value
  emit('change', buildCurrentDraft())
}

function onSummaryInput(event: Event): void {
  draftSummary.value = (event.target as HTMLTextAreaElement).value
  emit('change', buildCurrentDraft())
}

function onSkillsInput(event: Event): void {
  draftSkillsText.value = (event.target as HTMLTextAreaElement).value
  emit('change', buildCurrentDraft())
}

function updateExpHighlights(index: number, text: string): void {
  const entry = draftExperience.value[index]
  if (entry) {
    entry.highlights = text.split('\n').filter((l) => l.trim() !== '')
    emit('change', buildCurrentDraft())
  }
}

function safeProjectUrl(url: string | undefined): string {
  if (!url) return ''
  const t = url.trim()
  if (!t || !t.includes('.')) return ''
  if (/^(javascript|data|vbscript|file):/i.test(t)) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function updateProjHighlights(index: number, text: string): void {
  const entry = draftProjects.value[index]
  if (entry) {
    entry.highlights = text.split('\n').filter((l) => l.trim() !== '')
    emit('change', buildCurrentDraft())
  }
}
</script>

<style scoped>
.app-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Restored banner */
.restored-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #15803d;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius);
  padding: 6px 10px;
}

.restored-icon {
  font-size: 13px;
}

/* Tab bar */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  gap: 0;
}

.tab-btn {
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

/* Tab panel */
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Fields */
.field-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.field-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}

.field-textarea {
  width: 100%;
  padding: 7px 8px;
  font-size: 12px;
  font-family: inherit;
  line-height: 1.6;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-textarea--short {
  min-height: unset;
}

.field-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}

.field-hint,
.char-count {
  font-size: 11px;
  color: var(--color-text-muted);
  align-self: flex-end;
}

/* CV sections */
.cv-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cv-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0;
}

.cv-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.cv-entry-link {
  font-size: 11px;
  color: var(--color-primary, #2563eb);
  text-decoration: none;
  align-self: flex-start;
}

.cv-entry-link:hover {
  text-decoration: underline;
}

.cv-entry--readonly {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
}

.cv-entry-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0;
  font-size: 12px;
}

.cv-entry-role {
  font-weight: 600;
  color: var(--color-text);
  font-size: 12px;
}

.cv-entry-sep {
  color: var(--color-text-muted);
  font-size: 12px;
}

.cv-entry-org {
  color: var(--color-text);
  font-size: 12px;
}

.cv-entry-dates {
  color: var(--color-text-muted);
  font-size: 11px;
  margin-left: 4px;
}

/* Actions */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

/* Save status */
.save-status {
  font-size: 11px;
  margin-right: auto;
}

.save-status--idle { color: transparent; }
.save-status--saving { color: var(--color-text-muted); }
.save-status--saved { color: #15803d; }
.save-status--error { color: var(--color-error, #dc2626); }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
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

.btn-ai {
  background: #7c3aed;
  color: #fff;
  border: none;
}

.btn-ai:hover {
  background: #6d28d9;
}

.btn-danger {
  color: var(--color-error, #dc2626);
  border-color: var(--color-error-border, #fecaca);
}

.btn-danger:hover {
  background: var(--color-error-bg, #fef2f2);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* PDF error banner */
.pdf-error {
  background: var(--color-error-bg, #fef2f2);
  border: 1px solid var(--color-error-border, #fecaca);
  border-radius: var(--radius);
  padding: 8px 10px;
}

.pdf-error-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pdf-error-msg {
  font-size: 12px;
  color: var(--color-error, #dc2626);
  line-height: 1.5;
  margin: 0;
}

.pdf-error-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 0 2px;
  line-height: 1;
  align-self: flex-start;
}

.pdf-error-dismiss:hover {
  color: var(--color-text);
}

.pdf-overflow-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.compression-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.inline-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-border);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.compression-error-msg {
  font-size: 12px;
  color: var(--color-error, #dc2626);
  margin: 0;
}

/* Compression proposal */
.compression-proposal {
  background: #faf5ff;
  border: 1px solid #d8b4fe;
  border-radius: var(--radius);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.proposal-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.proposal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.proposal-title {
  font-size: 12px;
}

.proposal-title--fits {
  color: #15803d;
}

.proposal-title--overflow {
  color: #b45309;
}

.proposal-attempts {
  font-size: 10px;
  font-weight: 500;
  background: #ede9fe;
  color: #6d28d9;
  border-radius: 10px;
  padding: 1px 7px;
}

.proposal-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

.proposal-change {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.change-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.change-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.change-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.change-col-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.change-text {
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  padding: 5px 7px;
  border-radius: 4px;
  word-break: break-word;
}

.change-text--before {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.change-text--after {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.proposal-no-changes {
  font-size: 12px;
  color: var(--color-text-muted);
}

.proposal-actions {
  display: flex;
  gap: 8px;
}
</style>

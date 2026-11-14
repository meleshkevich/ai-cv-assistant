<template>
  <div class="scan-view">
    <!-- Active tab info -->
    <section class="tab-info" aria-label="Current tab">
      <p class="tab-label">Active tab</p>
      <p class="tab-url" :title="tabUrl">{{ tabUrl || 'Loading…' }}</p>
    </section>

    <!-- Action area — varies by permission status -->
    <section class="scan-action">
      <!-- Checking permission on mount or after tab change -->
      <div v-if="permissionStatus === 'checking'" class="state-row state-checking" aria-live="polite">
        <span class="inline-spinner" aria-hidden="true" />
        Checking page access…
      </div>

      <!-- Restricted page (chrome://, about:, etc.) -->
      <div v-else-if="permissionStatus === 'restricted'" class="notice notice-info" role="status">
        <strong class="notice-title">Page not accessible</strong>
        <p class="notice-body">
          Browser-internal pages (chrome://, about:, etc.) are protected by Chrome and cannot
          be scanned by extensions.
        </p>
      </div>

      <!-- Permission not yet granted for this site -->
      <template v-else-if="permissionStatus === 'not-granted'">
        <div class="notice notice-permission" role="status">
          <strong class="notice-title">Site access needed</strong>
          <p class="notice-body">
            To scan <strong>{{ tabOriginDisplay }}</strong>, AI Job Assistant needs
            your permission. Chrome will show a one-time confirmation dialog.
            Future scans of this site will not prompt again.
          </p>
        </div>
        <button
          class="btn btn-primary btn-full"
          :disabled="jobState.status === 'loading'"
          :aria-busy="jobState.status === 'loading'"
          @click="handleGrantAndScan"
        >
          <span v-if="jobState.status === 'loading'" class="btn-spinner" aria-hidden="true" />
          {{ jobState.status === 'loading' ? 'Requesting…' : 'Grant Access & Scan for Job' }}
        </button>
      </template>

      <!-- Permission already granted — normal scan button -->
      <button
        v-else
        class="btn btn-primary btn-full"
        :disabled="jobState.status === 'loading'"
        :aria-busy="jobState.status === 'loading'"
        @click="handleScan"
      >
        <span v-if="jobState.status === 'loading'" class="btn-spinner" aria-hidden="true" />
        {{ jobState.status === 'loading' ? 'Scanning…' : 'Scan for Job' }}
      </button>
    </section>

    <!-- Error state -->
    <div v-if="jobState.status === 'error'" class="error-box" role="alert">
      <strong class="error-title">{{ extractionErrorTitle(jobState.error.code) }}</strong>
      <p class="error-message">{{ jobState.error.message }}</p>
      <button class="btn btn-ghost btn-sm" style="margin-top: 8px" @click="switchToManual">
        Enter job description manually →
      </button>
    </div>

    <!-- Manual input state -->
    <div v-if="jobState.status === 'manual'" class="manual-box">
      <div class="desc-header">
        <span class="desc-label">Job description (manual input)</span>
        <span class="desc-count">{{ (userDescription ?? '').length.toLocaleString() }} characters</span>
      </div>
      <textarea
        class="desc-textarea"
        :value="userDescription ?? ''"
        placeholder="Paste the job description here."
        rows="12"
        spellcheck="false"
        @input="onManualInput"
      />
      <div class="actions">
        <button class="btn btn-ghost" @click="handleClear">Clear</button>
        <button
          v-if="permissionStatus === 'granted'"
          class="btn btn-secondary"
          @click="handleScan"
        >
          Try auto-detect instead
        </button>
      </div>
    </div>

    <!-- Successful extraction -->
    <JobResultDisplay
      v-if="jobState.status === 'success'"
      :result="jobState.result"
      :description="userDescription ?? jobState.result.description"
      @update:description="userDescription = $event"
      @clear="handleClear"
      @retry="handleRetry"
    />

    <!-- AI Analysis section — shown after successful extraction -->
    <section v-if="hasDescription" class="ai-section">
      <div class="ai-section-header">
        <h3 class="ai-section-title">AI Analysis</h3>
        <span v-if="analysisState.status === 'idle'" class="ai-section-hint">
          Powered by OpenAI
        </span>
      </div>

      <!-- Privacy consent gate — shown once before first AI request -->
      <div v-if="showPrivacyConsent" class="notice notice-privacy" role="note">
        <strong class="notice-title">Before you continue</strong>
        <p class="notice-body">
          Clicking "Analyze with AI" will send the job description above and your Master Profile
          to <strong>OpenAI's API</strong> for analysis. No other data is sent.
          Your API key is used only for this request and is never stored by us.
        </p>
        <div class="consent-actions">
          <button class="btn btn-primary btn-sm" @click="handleAcknowledgeAndAnalyze">
            I understand, analyze
          </button>
          <button class="btn btn-ghost btn-sm" @click="showPrivacyConsent = false">
            Cancel
          </button>
        </div>
      </div>

      <!-- Main analyze button -->
      <template v-else>
        <button
          v-if="analysisState.status !== 'loading'"
          class="btn btn-ai btn-full"
          @click="handleAnalyze"
        >
          Analyze with AI
        </button>

        <!-- Loading state -->
        <div v-if="analysisState.status === 'loading'" class="ai-loading" role="status" aria-live="polite">
          <span class="inline-spinner" aria-hidden="true" />
          <span>Analyzing… this may take a few seconds</span>
          <button class="btn btn-ghost btn-sm" @click="handleCancelAnalysis">Cancel</button>
        </div>

        <!-- Analysis error -->
        <div v-if="analysisState.status === 'error'" class="error-box" role="alert">
          <strong class="error-title">Analysis failed</strong>
          <p class="error-message">{{ analysisState.error.message }}</p>
          <div class="error-actions">
            <button
              v-if="analysisState.error.code === 'NO_API_KEY' || analysisState.error.code === 'INVALID_API_KEY'"
              class="btn btn-ghost btn-sm"
              @click="emit('navigate', 'settings')"
            >
              Go to Settings →
            </button>
            <button
              v-else-if="analysisState.error.code !== 'REQUEST_ABORTED'"
              class="btn btn-ghost btn-sm"
              @click="handleAnalyze"
            >
              Retry
            </button>
          </div>
        </div>
      </template>

      <!-- Analysis result -->
      <JobAnalysisResult
        v-if="analysisState.status === 'success'"
        :result="analysisState.result"
        :profile="profileRef"
      />
    </section>

    <!-- Application section — shown when analysis is loaded OR a saved draft is restored -->
    <section v-if="showApplicationSection" class="ai-section gen-section">
      <div class="ai-section-header">
        <h3 class="ai-section-title">Generate Application</h3>
      </div>

      <!-- Generate controls — only available when a job analysis is loaded -->
      <template v-if="analysisState.status === 'success'">
        <!-- Language selector -->
        <div v-if="applicationState.status !== 'loading'" class="lang-row">
          <label class="lang-label" for="app-language">Language</label>
          <select id="app-language" class="lang-select" :value="applicationLanguage" @change="applicationLanguage = ($event.target as HTMLSelectElement).value as 'en' | 'cs'">
            <option value="en">English</option>
            <option value="cs">Czech</option>
          </select>
        </div>

        <!-- Generate button -->
        <button
          v-if="applicationState.status === 'idle' || applicationState.status === 'error'"
          class="btn btn-ai btn-full"
          @click="handleGenerateApplication"
        >
          Generate Application
        </button>

        <!-- Loading state -->
        <div v-if="applicationState.status === 'loading'" class="ai-loading" role="status" aria-live="polite">
          <span class="inline-spinner" aria-hidden="true" />
          <span>Generating… this may take a few seconds</span>
          <button class="btn btn-ghost btn-sm" @click="handleCancelGeneration">Cancel</button>
        </div>

        <!-- Generation error -->
        <div v-if="applicationState.status === 'error'" class="error-box" role="alert">
          <strong class="error-title">Generation failed</strong>
          <p class="error-message">{{ applicationState.error.message }}</p>
          <div class="error-actions">
            <button
              v-if="applicationState.error.code === 'NO_API_KEY' || applicationState.error.code === 'INVALID_API_KEY'"
              class="btn btn-ghost btn-sm"
              @click="emit('navigate', 'settings')"
            >
              Go to Settings →
            </button>
            <button
              v-else-if="applicationState.error.code !== 'REQUEST_ABORTED'"
              class="btn btn-ghost btn-sm"
              @click="handleGenerateApplication"
            >
              Retry
            </button>
          </div>
        </div>
      </template>

      <!-- Re-analyze notice — shown when viewing a draft without a loaded job analysis -->
      <div
        v-if="applicationState.status === 'success' && analysisState.status !== 'success'"
        class="notice notice-reanalyze"
        role="note"
      >
        <strong class="notice-title">Scan &amp; analyze to regenerate</strong>
        <p class="notice-body">
          Use "Scan for Job" then "Analyze with AI" to generate a new version. Your saved draft is preserved.
        </p>
      </div>

      <!-- Application result — shown whenever a draft is available, independent of analysis -->
      <ApplicationResult
        v-if="applicationState.status === 'success'"
        :application="applicationState.application"
        :save-status="draftSaveStatus"
        :was-restored="wasRestoredDraft"
        :personal-info="resolvedPersonalInfo"
        :vacancy-title="vacancyTitle"
        :vacancy-company="vacancyCompany"
        :profile-loading="profileLoadingRef"
        @regenerate="handleRegenerateApplication"
        @change="handleApplicationChange"
        @delete-draft="handleDeleteDraft"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import type { PersonalInfo } from '@/types/profile'
import type { JobScanState } from '@/types/job'
import type { ValidatedAnalysis } from '@/types/jobAnalysis'
import type { OpenAIError } from '@/services/openaiService'
import type { GeneratedApplication, ApplicationDraft, ApplicationError } from '@/types/application'
import {
  getActiveTab,
  extractJobFromTab,
  checkPermissionForOrigin,
  requestPermissionForOrigin,
} from '@/services/tabService'
import { isExtractionError, isRestrictedUrl, originFromUrl } from '@/utils/pageUtils'
import { analyzeJob, isAnalysisError } from '@/services/jobAnalysisService'
import { generateApplication, isApplicationError } from '@/services/applicationService'
import {
  normalizeVacancyId,
  saveApplicationDraft,
  loadApplicationDraft,
  deleteApplicationDraft,
} from '@/services/applicationDraftService'
import { PROFILE_KEY } from '@/composables/useProfile'
import { SETTINGS_KEY } from '@/composables/useSettings'
import JobResultDisplay from '../components/JobResultDisplay.vue'
import JobAnalysisResult from '../components/JobAnalysisResult.vue'
import ApplicationResult from '../components/ApplicationResult.vue'

type PermissionStatus = 'checking' | 'granted' | 'not-granted' | 'restricted'

type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: ValidatedAnalysis }
  | { status: 'error'; error: OpenAIError }

type ApplicationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; application: GeneratedApplication }
  | { status: 'error'; error: ApplicationError }

const emit = defineEmits<{
  navigate: [view: string]
}>()

const profileComposable = inject(PROFILE_KEY)
if (!profileComposable) throw new Error('ScanView: PROFILE_KEY not provided')
const { profile: profileRef, isLoading: profileLoadingRef } = profileComposable

const settingsComposable = inject(SETTINGS_KEY)
if (!settingsComposable) throw new Error('ScanView: SETTINGS_KEY not provided')

const { settings, acknowledgePrivacy } = settingsComposable

const tabUrl = ref<string>('')
const tabOrigin = ref<string | null>(null)
const permissionStatus = ref<PermissionStatus>('checking')
const jobState = ref<JobScanState>({ status: 'idle' })
const analysisState = ref<AnalysisState>({ status: 'idle' })
const applicationState = ref<ApplicationState>({ status: 'idle' })
const applicationLanguage = ref<'en' | 'cs'>('en')
const showPrivacyConsent = ref(false)

// Draft persistence state
const preloadedDraft = ref<ApplicationDraft | null>(null)
const wasRestoredDraft = ref(false)
const draftSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let saveTimer: ReturnType<typeof setTimeout> | null = null

// Tracks user edits to the description — null means "use the auto-extracted text".
// Preserved across extraction completions so a delayed scan cannot overwrite typing.
const userDescription = ref<string | null>(null)

// Monotonically increasing counter used to discard results from superseded queries.
// Prevents a slow extraction from overwriting state set by a newer, faster one.
let querySeq = 0
let analysisSeq = 0
let generationSeq = 0
let analysisAbortController: AbortController | null = null
let generationAbortController: AbortController | null = null

const currentVacancyId = computed<string | null>(() => {
  if (tabUrl.value) return normalizeVacancyId(tabUrl.value)
  return null
})

const hasDescription = computed<boolean>(() => {
  if (jobState.value.status === 'success') return true
  if (jobState.value.status === 'manual' && (userDescription.value ?? '').trim().length > 0) return true
  return false
})

// Show the application section when analysis is loaded OR when a draft has been restored.
// A saved draft must be viewable without requiring a fresh analysis.
const showApplicationSection = computed<boolean>(() =>
  analysisState.value.status === 'success' ||
  applicationState.value.status === 'success'
)

const activeDescription = computed<string>(() => {
  if (userDescription.value !== null) return userDescription.value
  if (jobState.value.status === 'success') return jobState.value.result.description
  return ''
})

const tabOriginDisplay = computed<string>(() => {
  try {
    return new URL(tabUrl.value).hostname
  } catch {
    return tabUrl.value
  }
})

const vacancyTitle = computed<string | null>(() => {
  if (jobState.value.status === 'success') return jobState.value.result.jobTitle ?? null
  return preloadedDraft.value?.vacancyTitle ?? null
})

const vacancyCompany = computed<string | null>(() => {
  if (jobState.value.status === 'success') return jobState.value.result.company ?? null
  return preloadedDraft.value?.vacancyCompany ?? null
})

const resolvedPersonalInfo = computed<PersonalInfo>(
  () =>
    profileRef.value?.personal ?? {
      fullName: '',
      title: '',
      location: '',
      email: '',
      phone: '',
      linkedIn: '',
      github: '',
    },
)

// ─── Tab state loading ───────────────────────────────────────────────────────

async function loadTabInfo(): Promise<void> {
  const seq = ++querySeq

  try {
    const tab = await getActiveTab()
    if (seq !== querySeq) return // superseded

    const url = tab.url // string | undefined — requires the "tabs" manifest permission

    if (url === undefined || url === '') {
      tabUrl.value = ''
      permissionStatus.value = 'not-granted'
      return
    }

    tabUrl.value = url

    if (isRestrictedUrl(url)) {
      permissionStatus.value = 'restricted'
      return
    }

    const origin = originFromUrl(url)
    tabOrigin.value = origin

    if (!origin) {
      permissionStatus.value = 'restricted'
      return
    }

    const hasPermission = await checkPermissionForOrigin(origin)
    if (seq !== querySeq) return // superseded while awaiting permission check
    permissionStatus.value = hasPermission ? 'granted' : 'not-granted'

    // Preload any saved draft for this URL as early as possible.
    // Pass seq so a stale async read doesn't apply a previous tab's draft.
    void loadDraftForCurrentUrl(url, seq)
  } catch {
    if (seq !== querySeq) return
    tabUrl.value = '(unable to read tab URL)'
    permissionStatus.value = 'not-granted'
  }
}

async function loadDraftForCurrentUrl(url: string, expectedSeq: number): Promise<void> {
  try {
    const id = normalizeVacancyId(url)
    const draft = await loadApplicationDraft(id)
    if (expectedSeq !== querySeq) return // tab changed while reading storage
    preloadedDraft.value = draft
    if (draft) {
      applicationLanguage.value = draft.language
      applicationState.value = { status: 'success', application: draft.application }
      wasRestoredDraft.value = true
      draftSaveStatus.value = 'saved'
    }
  } catch {
    if (expectedSeq !== querySeq) return
    preloadedDraft.value = null
  }
}

async function refreshTabState(): Promise<void> {
  // Don't interrupt an in-flight scan; let it resolve naturally.
  if (jobState.value.status === 'loading') return

  jobState.value = { status: 'idle' }
  userDescription.value = null
  tabUrl.value = ''
  tabOrigin.value = null
  permissionStatus.value = 'checking'
  preloadedDraft.value = null
  wasRestoredDraft.value = false
  draftSaveStatus.value = 'idle'
  clearAnalysis()
  await loadTabInfo()
}

// ─── Tab event listeners (require "tabs" manifest permission) ────────────────

function handleTabActivated(_info: chrome.tabs.TabActiveInfo): void {
  void refreshTabState()
}

function handleTabUpdated(
  _tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
): void {
  if (tab.active && changeInfo.status === 'complete') {
    void refreshTabState()
  }
}

onMounted(() => {
  void loadTabInfo()
  chrome.tabs.onActivated.addListener(handleTabActivated)
  chrome.tabs.onUpdated.addListener(handleTabUpdated)
})

onUnmounted(() => {
  chrome.tabs.onActivated.removeListener(handleTabActivated)
  chrome.tabs.onUpdated.removeListener(handleTabUpdated)
  analysisAbortController?.abort()
  generationAbortController?.abort()
  if (saveTimer) clearTimeout(saveTimer)
})

// ─── User actions ────────────────────────────────────────────────────────────

// chrome.permissions.request() MUST be the first await in this handler.
// Any await before it forfeits the user-gesture context Chrome requires.
async function handleGrantAndScan(): Promise<void> {
  const origin = tabOrigin.value
  if (!origin) return

  jobState.value = { status: 'loading' }

  let granted: boolean
  try {
    granted = await requestPermissionForOrigin(origin) // first await — preserves gesture
  } catch {
    jobState.value = {
      status: 'error',
      error: { code: 'PERMISSION_DENIED', message: 'Permission request could not be shown.' },
    }
    return
  }

  if (!granted) {
    permissionStatus.value = 'not-granted'
    jobState.value = {
      status: 'error',
      error: {
        code: 'PERMISSION_DENIED',
        message: `Access to ${tabOriginDisplay.value} was denied. Click "Grant Access & Scan for Job" to try again.`,
      },
    }
    return
  }

  permissionStatus.value = 'granted'
  await runExtraction()
}

async function handleScan(): Promise<void> {
  jobState.value = { status: 'loading' }
  clearAnalysis()
  await runExtraction()
}

async function runExtraction(): Promise<void> {
  const seq = ++querySeq
  try {
    const tab = await getActiveTab()
    if (seq !== querySeq) return // tab changed while getting active tab
    if (tab.url) tabUrl.value = tab.url
    const result = await extractJobFromTab(tab)
    if (seq !== querySeq) return // tab changed while extracting
    // Only reset user edits on an explicit scan — not on background refreshes.
    userDescription.value = null
    jobState.value = { status: 'success', result }
  } catch (err) {
    if (seq !== querySeq) return
    if (isExtractionError(err)) {
      jobState.value = { status: 'error', error: { code: err.code, message: err.message } }
    } else {
      jobState.value = {
        status: 'error',
        error: { code: 'EXTRACTION_FAILED', message: 'An unexpected error occurred.' },
      }
    }
  }
}

function switchToManual(): void {
  jobState.value = { status: 'manual' }
}

function onManualInput(event: Event): void {
  const val = (event.target as HTMLTextAreaElement).value
  userDescription.value = val
  // Clear stale analysis when description changes significantly
  if (analysisState.value.status === 'success') {
    clearAnalysis()
  }
}

function handleClear(): void {
  jobState.value = { status: 'idle' }
  userDescription.value = null
  clearAnalysis()
}

async function handleRetry(): Promise<void> {
  userDescription.value = null
  jobState.value = { status: 'loading' }
  clearAnalysis()
  await runExtraction()
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function clearAnalysis(): void {
  analysisAbortController?.abort()
  analysisAbortController = null
  analysisState.value = { status: 'idle' }
  showPrivacyConsent.value = false
  clearApplication()
}

function clearApplication(): void {
  generationAbortController?.abort()
  generationAbortController = null
  applicationState.value = { status: 'idle' }
  wasRestoredDraft.value = false
  draftSaveStatus.value = 'idle'
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function handleAnalyze(): void {
  if (!settings.value.hasAcknowledgedAiPrivacy) {
    showPrivacyConsent.value = true
    return
  }
  void runAnalysis()
}

async function handleAcknowledgeAndAnalyze(): Promise<void> {
  showPrivacyConsent.value = false
  await acknowledgePrivacy()
  void runAnalysis()
}

function handleCancelAnalysis(): void {
  analysisAbortController?.abort()
  analysisAbortController = null
  analysisState.value = { status: 'idle' }
}

async function runAnalysis(): Promise<void> {
  const seq = ++analysisSeq
  const description = activeDescription.value.trim()
  const currentProfile = profileRef.value

  analysisAbortController?.abort()
  const controller = new AbortController()
  analysisAbortController = controller
  analysisState.value = { status: 'loading' }

  try {
    const result = await analyzeJob(description, currentProfile, settings.value, controller.signal)
    if (seq !== analysisSeq) return // stale
    analysisState.value = { status: 'success', result }

    // Check whether a draft was preloaded for this vacancy.
    const draft = preloadedDraft.value
    const vacId = currentVacancyId.value
    if (draft && vacId && draft.vacancyId === vacId) {
      // Restore the saved draft instead of clearing.
      applicationLanguage.value = draft.language
      applicationState.value = { status: 'success', application: draft.application }
      wasRestoredDraft.value = true
      draftSaveStatus.value = 'saved'
    } else {
      // No matching draft — start fresh.
      applicationLanguage.value = result.analysis.job.language
      clearApplication()
    }
  } catch (err) {
    if (seq !== analysisSeq) return // stale
    console.error('[ScanView] Analysis error:', err)
    if (isAnalysisError(err)) {
      analysisState.value = { status: 'error', error: err }
    } else {
      analysisState.value = {
        status: 'error',
        error: { code: 'API_ERROR', message: 'An unexpected error occurred during analysis.' },
      }
    }
  } finally {
    if (analysisAbortController === controller) {
      analysisAbortController = null
    }
  }
}

// ─── Application generation ───────────────────────────────────────────────────

function handleGenerateApplication(): void {
  void runGeneration(null)
}

function handleRegenerateApplication(): void {
  if (analysisState.value.status !== 'success') {
    // Regeneration requires a loaded analysis — do not trigger an API call without one.
    window.alert('Scan the job listing and run "Analyze with AI" first to regenerate the application.\n\nYour saved draft is preserved.')
    return
  }
  // Snapshot the current application before starting — restored on failure.
  const fallback =
    applicationState.value.status === 'success' ? applicationState.value.application : null
  generationAbortController?.abort()
  generationAbortController = null
  void runGeneration(fallback)
}

function handleCancelGeneration(): void {
  generationAbortController?.abort()
  generationAbortController = null
  applicationState.value = { status: 'idle' }
}

async function runGeneration(fallbackApplication: GeneratedApplication | null): Promise<void> {
  if (analysisState.value.status !== 'success') return

  const seq = ++generationSeq
  const description = activeDescription.value.trim()
  const currentProfile = profileRef.value
  const analysis = analysisState.value.result

  const controller = new AbortController()
  generationAbortController = controller
  applicationState.value = { status: 'loading' }
  draftSaveStatus.value = 'idle'

  try {
    const application = await generateApplication(
      description,
      currentProfile,
      analysis,
      applicationLanguage.value,
      settings.value,
      controller.signal,
    )
    if (seq !== generationSeq) return // stale
    applicationState.value = { status: 'success', application }
    wasRestoredDraft.value = false
    // Persist immediately after a fresh generation.
    void persistCurrentDraft(application)
  } catch (err) {
    if (seq !== generationSeq) return // stale
    console.error('[ScanView] Generation error:', err)
    if (fallbackApplication) {
      // Restore previous draft on failure — never lose the user's saved work.
      applicationState.value = { status: 'success', application: fallbackApplication }
      draftSaveStatus.value = 'saved'
    } else if (isApplicationError(err)) {
      applicationState.value = { status: 'error', error: err }
    } else {
      applicationState.value = {
        status: 'error',
        error: { code: 'API_ERROR', message: 'An unexpected error occurred during generation.' },
      }
    }
  } finally {
    if (generationAbortController === controller) {
      generationAbortController = null
    }
  }
}

// ─── Draft persistence ────────────────────────────────────────────────────────

function handleApplicationChange(editedApplication: GeneratedApplication): void {
  if (saveTimer) clearTimeout(saveTimer)
  draftSaveStatus.value = 'saving'
  saveTimer = setTimeout(() => {
    void persistCurrentDraft(editedApplication)
  }, 800)
}

async function persistCurrentDraft(application: GeneratedApplication): Promise<void> {
  const id = currentVacancyId.value
  if (!id) return

  const jobResult = jobState.value.status === 'success' ? jobState.value.result : null

  draftSaveStatus.value = 'saving'
  try {
    const draft: ApplicationDraft = {
      schemaVersion: 1,
      vacancyId: id,
      vacancyTitle: jobResult?.jobTitle ?? null,
      vacancyCompany: jobResult?.company ?? null,
      sourceUrl: tabUrl.value,
      language: applicationLanguage.value,
      application,
      savedAt: Date.now(),
    }
    await saveApplicationDraft(draft)
    draftSaveStatus.value = 'saved'
  } catch {
    draftSaveStatus.value = 'error'
  }
}

async function handleDeleteDraft(): Promise<void> {
  const id = currentVacancyId.value
  if (!id) return
  if (!window.confirm('Delete saved draft for this job listing? This cannot be undone.')) return
  try {
    await deleteApplicationDraft(id)
    clearApplication()
    preloadedDraft.value = null
  } catch {
    // Non-critical — application state already cleared.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractionErrorTitle(code: string): string {
  switch (code) {
    case 'RESTRICTED_PAGE': return 'Page not accessible'
    case 'TAB_NOT_FOUND': return 'No active tab'
    case 'PERMISSION_DENIED': return 'Permission denied'
    default: return 'Extraction failed'
  }
}
</script>

<style scoped>
.scan-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Tab info */
.tab-info {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 10px 12px;
}

.tab-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 2px;
}

.tab-url {
  font-size: 12px;
  color: var(--color-text);
  word-break: break-all;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--radius);
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

.btn-primary:not(:disabled):active {
  background: var(--color-primary-active);
}

.btn-ai {
  background: #7c3aed;
  color: #fff;
}

.btn-ai:not(:disabled):hover {
  background: #6d28d9;
}

.btn-ai:not(:disabled):active {
  background: #5b21b6;
}

.btn-full {
  width: 100%;
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

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}

.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Checking state */
.state-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 8px 0;
}

.inline-spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

/* Notices */
.notice {
  border-radius: var(--radius);
  padding: 10px 12px;
}

.notice-info {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}

.notice-permission {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.notice-privacy {
  background: #faf5ff;
  border: 1px solid #d8b4fe;
}

.notice-reanalyze {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
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
}

.consent-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* Error */
.error-box {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
  border-radius: var(--radius);
  padding: 10px 12px;
}

.error-title {
  display: block;
  font-size: 13px;
  color: var(--color-error);
  margin-bottom: 2px;
}

.error-message {
  font-size: 12px;
  color: var(--color-text);
}

.error-actions {
  margin-top: 8px;
}

/* Manual input */
.manual-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

/* AI Analysis section */
.ai-section {
  background: var(--color-surface);
  border: 1px solid #d8b4fe;
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.ai-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.ai-section-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

.ai-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
}

/* Application generation section */
.gen-section {
  border-color: #86efac;
}

.lang-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lang-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.lang-select {
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}

.lang-select:focus {
  outline: none;
  border-color: var(--color-primary);
}
</style>

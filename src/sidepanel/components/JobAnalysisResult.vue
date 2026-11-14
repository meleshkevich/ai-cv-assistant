<template>
  <div class="analysis-result">
    <!-- Verification issues banner -->
    <div v-if="issues.length > 0" class="issues-banner" role="alert">
      <strong class="issues-title">{{ issues.length }} verification {{ issues.length === 1 ? 'issue' : 'issues' }} detected</strong>
      <ul class="issues-list">
        <li v-for="(issue, i) in issues" :key="i" class="issue-item">{{ issue.message }}</li>
      </ul>
    </div>

    <!-- Job overview -->
    <section class="card">
      <h3 class="card-title">Job Overview</h3>
      <div class="overview-grid">
        <div class="overview-row">
          <span class="overview-label">Title</span>
          <span class="overview-value">{{ analysis.job.title }}</span>
        </div>
        <div v-if="analysis.job.company" class="overview-row">
          <span class="overview-label">Company</span>
          <span class="overview-value">{{ analysis.job.company }}</span>
        </div>
        <div v-if="analysis.job.seniority" class="overview-row">
          <span class="overview-label">Seniority</span>
          <span class="overview-value">{{ analysis.job.seniority }}</span>
        </div>
        <div class="overview-row">
          <span class="overview-label">Language</span>
          <span class="overview-value">{{ analysis.job.language === 'en' ? 'English' : 'Czech' }}</span>
        </div>
      </div>
      <p class="overview-summary">{{ analysis.job.summary }}</p>
    </section>

    <!-- Match summary bar -->
    <section class="card">
      <h3 class="card-title">Requirement Matches</h3>
      <div class="match-bar-row">
        <div class="match-bar">
          <div
            class="match-bar-segment match-bar--supported"
            :style="{ width: barPct(grouped.supported.length) }"
            :title="`${grouped.supported.length} supported`"
          />
          <div
            class="match-bar-segment match-bar--partial"
            :style="{ width: barPct(grouped.partial.length) }"
            :title="`${grouped.partial.length} partial`"
          />
          <div
            class="match-bar-segment match-bar--unsupported"
            :style="{ width: barPct(grouped.unsupported.length) }"
            :title="`${grouped.unsupported.length} unsupported`"
          />
        </div>
        <div class="match-legend">
          <span class="legend-item legend-item--supported">{{ grouped.supported.length }} match</span>
          <span class="legend-item legend-item--partial">{{ grouped.partial.length }} partial</span>
          <span class="legend-item legend-item--unsupported">{{ grouped.unsupported.length }} gap</span>
        </div>
      </div>

      <!-- Supported -->
      <template v-if="grouped.supported.length > 0">
        <h4 class="match-group-title match-group-title--supported">Matched requirements</h4>
        <div
          v-for="match in grouped.supported"
          :key="match.requirementId"
          class="match-item"
        >
          <MatchCard :match="match" :requirement="requirementById(match.requirementId)" :profile="profile" />
        </div>
      </template>

      <!-- Partial -->
      <template v-if="grouped.partial.length > 0">
        <h4 class="match-group-title match-group-title--partial">Partial matches</h4>
        <div
          v-for="match in grouped.partial"
          :key="match.requirementId"
          class="match-item"
        >
          <MatchCard :match="match" :requirement="requirementById(match.requirementId)" :profile="profile" />
        </div>
      </template>

      <!-- Unsupported -->
      <template v-if="grouped.unsupported.length > 0">
        <h4 class="match-group-title match-group-title--unsupported">Gaps</h4>
        <div
          v-for="match in grouped.unsupported"
          :key="match.requirementId"
          class="match-item"
        >
          <MatchCard :match="match" :requirement="requirementById(match.requirementId)" :profile="profile" />
        </div>
      </template>
    </section>

    <!-- Relevant experience -->
    <section v-if="analysis.relevantExperience.length > 0" class="card">
      <h3 class="card-title">Relevant Experience</h3>
      <ul class="relevant-list">
        <li
          v-for="(re, i) in analysis.relevantExperience"
          :key="i"
          class="relevant-item"
        >
          <span class="relevant-source">{{ sourceName(re.sourceType, re.sourceId) }}</span>
          <span class="relevant-reason">{{ re.relevanceReason }}</span>
        </li>
      </ul>
    </section>

    <!-- Recommendations -->
    <section v-if="strategyRecs.length > 0 || profileRecs.length > 0" class="card">
      <h3 class="card-title">Recommendations</h3>

      <template v-if="strategyRecs.length > 0">
        <h4 class="reco-group-title">For this application</h4>
        <ul class="reco-list">
          <li v-for="(rec, i) in strategyRecs" :key="'s' + i" class="reco-item">{{ rec.text }}</li>
        </ul>
      </template>

      <template v-if="profileRecs.length > 0">
        <h4 class="reco-group-title reco-group-title--profile" :class="{ 'reco-group-title--spaced': strategyRecs.length > 0 }">Improve your Master Profile</h4>
        <ul class="reco-list">
          <li v-for="(rec, i) in profileRecs" :key="'p' + i" class="reco-item reco-item--muted">{{ rec.text }}</li>
        </ul>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ValidatedAnalysis, JobRequirement, JobRecommendation } from '@/types/jobAnalysis'
import type { MasterProfile } from '@/types/profile'
import { groupMatchesByStatus } from '@/utils/jobAnalysisValidator'
import MatchCard from './MatchCard.vue'

const props = defineProps<{
  result: ValidatedAnalysis
  profile: MasterProfile
}>()

const analysis = computed(() => props.result.analysis)
const issues = computed(() => props.result.issues)

const grouped = computed(() => groupMatchesByStatus(analysis.value.matches))

const strategyRecs = computed<JobRecommendation[]>(() =>
  analysis.value.recommendations.filter((r) => r.category === 'application_strategy'),
)

const profileRecs = computed<JobRecommendation[]>(() =>
  analysis.value.recommendations.filter((r) => r.category === 'profile_improvement'),
)

const requirementMap = computed<Map<string, JobRequirement>>(() => {
  const m = new Map<string, JobRequirement>()
  for (const req of analysis.value.requirements) m.set(req.id, req)
  return m
})

function requirementById(id: string): JobRequirement | undefined {
  return requirementMap.value.get(id)
}

function barPct(count: number): string {
  const total = analysis.value.matches.length
  if (total === 0) return '0%'
  return `${Math.round((count / total) * 100)}%`
}

function sourceName(sourceType: 'experience' | 'project', sourceId: string): string {
  if (sourceType === 'experience') {
    const exp = props.profile.experience.find((e) => e.id === sourceId)
    return exp ? `${exp.position} at ${exp.company}` : sourceId
  }
  const proj = props.profile.projects.find((p) => p.id === sourceId)
  return proj ? proj.name : sourceId
}
</script>

<style scoped>
.analysis-result {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Issues banner */
.issues-banner {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: var(--radius);
  padding: 10px 12px;
}

.issues-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 6px;
}

.issues-list {
  margin: 0;
  padding-left: 16px;
}

.issue-item {
  font-size: 11px;
  color: #78350f;
  line-height: 1.6;
}

/* Card */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 12px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 10px;
}

/* Overview */
.overview-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.overview-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.overview-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  min-width: 60px;
  flex-shrink: 0;
}

.overview-value {
  font-size: 13px;
  color: var(--color-text);
}

.overview-summary {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
}

/* Match bar */
.match-bar-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.match-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-bg);
}

.match-bar-segment {
  height: 100%;
  transition: width 0.3s ease;
}

.match-bar--supported { background: #16a34a; }
.match-bar--partial   { background: #d97706; }
.match-bar--unsupported { background: #dc2626; }

.match-legend {
  display: flex;
  gap: 10px;
}

.legend-item {
  font-size: 11px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-item--supported { color: #16a34a; }
.legend-item--partial   { color: #d97706; }
.legend-item--unsupported { color: #dc2626; }

/* Match group title */
.match-group-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 10px 0 6px;
}

.match-group-title--supported { color: #16a34a; }
.match-group-title--partial   { color: #d97706; }
.match-group-title--unsupported { color: #dc2626; }

.match-item + .match-item {
  margin-top: 6px;
}

/* Relevant experience */
.relevant-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.relevant-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.relevant-source {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.relevant-reason {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

/* Recommendations */
.reco-group-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-primary, #2563eb);
  margin-bottom: 6px;
}

.reco-group-title--profile {
  color: var(--color-text-muted);
}

.reco-group-title--spaced {
  margin-top: 10px;
}

.reco-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reco-item {
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.6;
}

.reco-item--muted {
  color: var(--color-text-muted);
}
</style>

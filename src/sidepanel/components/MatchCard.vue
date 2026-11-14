<template>
  <div class="match-card" :class="`match-card--${match.status}`">
    <div class="match-header">
      <span class="match-status-dot" :class="`dot--${match.status}`" aria-hidden="true" />
      <span class="match-requirement">{{ requirement?.requirement ?? match.requirementId }}</span>
      <div class="match-badges">
        <span v-if="requirement" class="badge" :class="`badge--${requirement.priority}`">
          {{ requirement.priority }}
        </span>
        <span v-if="requirement" class="badge badge--category">
          {{ requirement.category }}
        </span>
      </div>
    </div>

    <p class="match-explanation">{{ match.explanation }}</p>

    <ul v-if="match.evidence.length > 0" class="evidence-list">
      <li v-for="(ev, i) in match.evidence" :key="i" class="evidence-item">
        <span class="evidence-source">{{ evidenceSourceLabel(ev) }}</span>
        <blockquote class="evidence-excerpt">{{ ev.supportingExcerpt }}</blockquote>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { RequirementMatch, JobRequirement, EvidenceItem } from '@/types/jobAnalysis'
import type { MasterProfile } from '@/types/profile'

const props = defineProps<{
  match: RequirementMatch
  requirement: JobRequirement | undefined
  profile: MasterProfile
}>()

function evidenceSourceLabel(ev: EvidenceItem): string {
  if (ev.sourceType === 'generalNotes') return 'Additional notes'
  if (ev.sourceType === 'experience') {
    const exp = props.profile.experience.find((e) => e.id === ev.sourceId)
    return exp ? `${exp.position} at ${exp.company}` : ev.sourceId ?? 'Unknown'
  }
  const proj = props.profile.projects.find((p) => p.id === ev.sourceId)
  return proj ? proj.name : ev.sourceId ?? 'Unknown'
}
</script>

<style scoped>
.match-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  border-left: 3px solid transparent;
}

.match-card--supported  { border-left-color: #16a34a; }
.match-card--partial    { border-left-color: #d97706; }
.match-card--unsupported { border-left-color: #dc2626; }

.match-header {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.match-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.dot--supported  { background: #16a34a; }
.dot--partial    { background: #d97706; }
.dot--unsupported { background: #dc2626; }

.match-requirement {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
}

.match-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 10px;
  text-transform: capitalize;
}

.badge--required  { background: #fee2e2; color: #991b1b; }
.badge--preferred { background: #e0f2fe; color: #0369a1; }
.badge--category  { background: var(--color-border); color: var(--color-text-muted); }

.match-explanation {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-bottom: 6px;
}

.evidence-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.evidence-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.evidence-source {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.evidence-excerpt {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0;
  padding: 4px 8px;
  border-left: 2px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

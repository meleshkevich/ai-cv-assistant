<template>
  <div class="personal-section">
    <div class="field-grid">
      <div class="field field--full">
        <label for="full-name">Full name</label>
        <input id="full-name" v-model="profile.personal.fullName" type="text" placeholder="Jane Doe" />
      </div>
      <div class="field field--full">
        <label for="prof-title">Professional title</label>
        <input id="prof-title" v-model="profile.personal.title" type="text" placeholder="Senior Software Engineer" />
      </div>
      <div class="field field--full">
        <label for="location">Location</label>
        <input id="location" v-model="profile.personal.location" type="text" placeholder="Prague, Czech Republic" />
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="profile.personal.email" type="email" placeholder="jane@example.com" />
      </div>
      <div class="field">
        <label for="phone">Phone</label>
        <input id="phone" v-model="profile.personal.phone" type="tel" placeholder="+420 123 456 789" />
      </div>
      <div class="field field--full">
        <label for="linkedin">LinkedIn URL</label>
        <input id="linkedin" v-model="profile.personal.linkedIn" type="url" placeholder="https://linkedin.com/in/..." />
      </div>
      <div class="field field--full">
        <label for="github">GitHub URL</label>
        <input id="github" v-model="profile.personal.github" type="url" placeholder="https://github.com/..." />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { PROFILE_KEY } from '@/composables/useProfile'

const { profile } = inject(PROFILE_KEY)!
</script>

<style scoped>
.personal-section {
  padding: 12px 0 4px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
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

.field input {
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
}

.field input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 0.15);
}

.field input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}
</style>

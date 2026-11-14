<template>
  <div class="app">
    <header class="app-header">
      <span class="app-logo" aria-hidden="true">💼</span>
      <h1 class="app-title">AI Job Assistant</h1>
    </header>

    <nav class="app-nav" role="tablist" aria-label="Main navigation">
      <button
        class="nav-tab"
        role="tab"
        :aria-selected="activeView === 'scan'"
        :class="{ 'nav-tab--active': activeView === 'scan' }"
        @click="activeView = 'scan'"
      >
        Scan
      </button>
      <button
        class="nav-tab"
        role="tab"
        :aria-selected="activeView === 'profile'"
        :class="{ 'nav-tab--active': activeView === 'profile' }"
        @click="activeView = 'profile'"
      >
        My Profile
      </button>
      <button
        class="nav-tab"
        role="tab"
        :aria-selected="activeView === 'settings'"
        :class="{ 'nav-tab--active': activeView === 'settings' }"
        @click="activeView = 'settings'"
      >
        Settings
      </button>
    </nav>

    <main class="app-main">
      <ScanView
        v-if="activeView === 'scan'"
        @navigate="onNavigate"
      />
      <ProfileView v-else-if="activeView === 'profile'" />
      <SettingsView v-else-if="activeView === 'settings'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import { useProfile, PROFILE_KEY } from '@/composables/useProfile'
import { useSettings, SETTINGS_KEY } from '@/composables/useSettings'
import ScanView from './views/ScanView.vue'
import ProfileView from './views/ProfileView.vue'
import SettingsView from './views/SettingsView.vue'

type AppView = 'scan' | 'profile' | 'settings'

const activeView = ref<AppView>('scan')

// Create the profile composable once at app root and provide it to the whole tree.
const profileComposable = useProfile()
provide(PROFILE_KEY, profileComposable)

// Create the settings composable once at app root and provide it to the whole tree.
const settingsComposable = useSettings()
provide(SETTINGS_KEY, settingsComposable)

onMounted(() => {
  void profileComposable.load()
  void settingsComposable.load()
})

function onNavigate(view: string): void {
  if (view === 'settings' || view === 'scan' || view === 'profile') {
    activeView.value = view
  }
}
</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --color-bg: #f1f5f9;
  --color-surface: #ffffff;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-active: #1e40af;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --color-border: #e2e8f0;
  --color-error: #dc2626;
  --color-error-bg: #fef2f2;
  --color-error-border: #fecaca;
  --color-success-bg: #f0fdf4;
  --radius-sm: 4px;
  --radius: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
}

body {
  background: var(--color-bg);
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.app-logo {
  font-size: 18px;
  line-height: 1;
}

.app-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

.app-nav {
  display: flex;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.nav-tab {
  flex: 1;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.nav-tab:hover {
  color: var(--color-text);
  background: var(--color-bg);
}

.nav-tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.app-main {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}
</style>

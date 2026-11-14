# CLAUDE.md — AI Job Assistant

Persistent instructions for Claude Code sessions working on this project.

## Project purpose

A personal Chrome extension that assists with job applications.
Current scope: extract readable text from job listing pages.
Future scope: detect job descriptions, generate tailored cover letters and CVs using the OpenAI Responses API, and export PDFs via pdfmake.

## Technology stack

| Layer | Choice |
|---|---|
| Runtime | Chrome Extension Manifest V3 |
| UI framework | Vue 3 with Composition API (`<script setup lang="ts">`) |
| Build tool | Vite (multi-entry: `sidepanel.html` + `background.js`) |
| Language | TypeScript with strict mode |
| Package manager | npm |

No component libraries. No CSS frameworks. Minimal external dependencies.

## Architecture principles

- **Separation of concerns**: browser-specific Chrome API calls live in `src/services/` and `src/background/`. Vue components stay UI-only.
- **Typed boundaries**: every cross-context data shape is defined in `src/types/index.ts`.
- **Self-contained injected functions**: functions passed to `chrome.scripting.executeScript` via `func:` must reference nothing from the extension's outer scope. They are serialised and executed in the page context.
- **No background proxy**: the side panel calls Chrome APIs directly. The background service worker is kept minimal (panel behaviour setup only).

## Coding conventions

- `<script setup lang="ts">` on all Vue SFCs.
- No `any` without explicit justification in a comment.
- Error objects thrown across boundaries always conform to `ExtractionError` (`{ code, message }`).
- Use `satisfies ExtractionError` when constructing literal error objects so TypeScript catches shape mismatches.
- CSS: scoped styles per SFC; global variables in `App.vue`'s non-scoped `<style>`.
- No trailing `console.log` left in committed code (background service worker `console.error` for genuine errors is fine).

## Scope control

**Implement only what is explicitly requested in the task description.**

Do not add:
- OpenAI integration (not yet scoped)
- Master Profile management (not yet scoped)
- PDF generation (not yet scoped)
- Job description detection heuristics (not yet scoped)
- Site-specific scrapers (not yet scoped)
- Features not present in the current task brief

## Security considerations

- No API keys hardcoded anywhere. Keys go in `chrome.storage.local` or user-provided at runtime.
- Extracted text is processed locally only until an explicit AI step is added.
- Content scripts and injected functions must never exfiltrate data to third parties.
- **AI-generated application documents must not contain fabricated professional experience, qualifications, awards, or personal details the user has not provided.**

## Build & test

```bash
npm run typecheck   # TypeScript check only
npm run build       # Typecheck + Vite build → dist/
npm run dev         # Vite watch mode (rebuild on save)
```

Load `dist/` as an unpacked extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked.
After each `build`, click **Reload** on the extension card in `chrome://extensions`.

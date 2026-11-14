# AI Job Assistant

**An AI-powered Chrome extension for analyzing job opportunities and creating tailored job applications.**

AI Job Assistant helps turn a job posting into an evidence-based, editable cover letter and a one-page, ATS-friendly PDF resume.

Built with **Vue 3, TypeScript, Chrome Extensions Manifest V3, and the OpenAI Responses API**.

The project focuses on a simple principle: **tailor the presentation of real experience without inventing qualifications.**

---

## Overview

Applying for jobs often involves repeating the same work: reading requirements, identifying relevant experience, adapting a resume, writing a cover letter, and formatting the final document.

AI Job Assistant brings these steps into a Chrome Side Panel.

Instead of maintaining a separate resume for every application, users create a comprehensive **Master Profile** containing their professional experience, projects, education, technical skills, languages, and other relevant information.

The extension then uses this profile to analyze job postings and generate application materials tailored to each opportunity.

The generated documents remain fully editable before export.

## Features

### Job posting extraction

Extract job descriptions directly from the active browser tab.

- Applies site-specific CSS selectors for supported job boards (LinkedIn, jobs.cz) where available.
- Reads structured `JobPosting` data from JSON-LD when available.
- Uses DOM-based heuristics as a final fallback.
- Extracts available job metadata, including title, company, and location.
- Displays extraction confidence and method.
- Allows users to review and edit extracted text.
- Supports manual job-description entry when automated extraction is unavailable.
- Requests site access when needed rather than requiring unrestricted access to all websites.

### Master Profile

Maintain a structured, reusable source of professional information.

The profile includes:

- Personal and contact information
- Professional experience
- Personal and professional projects, including URLs
- Education and training
- Languages and proficiency levels
- General notes, skills, achievements, and additional context

Changes are automatically saved to `chrome.storage.local`.

Profiles can also be imported and exported as JSON, with validation before imported data replaces existing information.

### AI-powered job analysis

Analyze a job posting against the Master Profile using the OpenAI Responses API.

The analysis provides:

- A structured overview of the opportunity
- Individual job requirements
- Requirement-to-profile matching
- **Supported, partially supported, and unsupported** classifications
- Relevant professional experience and projects
- Evidence-based recommendations

The goal is not simply to identify matching keywords, but to distinguish between qualifications supported by actual profile evidence and those that are not.

### Actionable recommendations

Analysis recommendations are separated into two categories.

**For this application**

Guidance on how to emphasize existing experience, projects, and skills when generating the application.

**Improve your Master Profile**

Suggestions for documenting missing details, measurable achievements, or additional evidence.

Application strategies are passed to the document-generation step. Profile-improvement suggestions remain informational and are not treated as evidence of qualifications.

### Tailored cover letters and CVs

Generate application-specific documents in **English or Czech**.

**Cover letters**

- Tailored to the company, role, and relevant experience
- Generated from the Master Profile and job analysis
- Editable before copying or sending

**CV**

- Tailored professional title and summary
- Relevant technical skills
- Selected professional experience
- Relevant projects and highlights
- Education and languages drawn from the Master Profile
- Project URLs preserved for clickable links in exported PDFs

Generated documents use structured output and source-reference validation to help prevent fabricated experience or unsupported claims.

All AI-generated content should still be reviewed before submission.

### Persistent application drafts

Continue working on applications without starting over.

- Saves editable cover letters and CVs per vacancy.
- Preserves manual changes.
- Restores saved drafts after reopening the Chrome Side Panel.
- Allows exporting a restored CV without rerunning AI analysis.
- Keeps draft data separate from the Master Profile.

### One-page PDF export

Export the current edited CV as a professional, ATS-friendly PDF.

- A4 portrait format
- Single-column, text-based layout
- Selectable and copyable text
- Compact typography and clear section hierarchy
- English and Czech section headings
- Embedded fonts supporting Czech diacritics
- Clickable LinkedIn, GitHub, email, phone, and project links where applicable
- Automatic filename generation based on the vacancy
- Actual PDF page-count verification

The PDF renderer uses **pdfmake** for document generation and **pdf-lib** to verify the final page count.

If the content exceeds one page, the extension reports an overflow error instead of silently truncating information or exporting a multi-page resume as a successful result.

---

## Application workflow

```text
Job Posting
     |
     v
Scan / Extract Job Description
     |
     v
Analyze Requirements with AI
     |
     +--> Requirement Matching
     |       |
     |       +--> Supported
     |       +--> Partial
     |       +--> Unsupported
     |
     +--> Recommendations
             |
             +--> Application Strategy
             +--> Master Profile Improvements
     |
     v
Generate Application
     |
     +--> Tailored Cover Letter
     |
     +--> Tailored CV
              |
              v
        Review and Edit
              |
              v
        Save Application Draft
              |
              v
        Export One-Page PDF
```

The Master Profile serves as the factual source throughout the analysis and generation process.

## Screenshots

*Screenshots and a short demonstration will be added here.*

Suggested demonstrations:

1. Scanning and analyzing a job posting
2. Reviewing evidence-based requirement matches
3. Editing a generated cover letter and tailored CV
4. Exporting a one-page PDF resume

---

## Tech stack

| Area | Technology |
|---|---|
| Frontend | Vue 3, Composition API, TypeScript |
| Build tooling | Vite |
| Browser platform | Chrome Extensions Manifest V3 |
| User interface | Chrome Side Panel API |
| Job extraction | Site-specific selectors, JSON-LD, DOM parsing, content heuristics |
| AI integration | OpenAI Responses API, structured JSON output |
| Data persistence | Chrome Storage API |
| PDF generation | pdfmake |
| PDF validation | pdf-lib |
| Testing | Vitest, jsdom |
| Type checking | vue-tsc |

The extension runs client-side and does not require a separate application backend.

## Architecture

AI Job Assistant separates browser interaction, application state, AI services, document generation, and persistence.

**Job extraction**

Applies a staged extraction pipeline: site-specific CSS selectors (LinkedIn, jobs.cz), structured JSON-LD, DOM heuristics, and a body-text fallback. Identifies structured job data and extracts relevant content from the active tab.

**Master Profile management**

Handles structured profile data, validation, JSON import/export, and local persistence.

**AI analysis service**

Builds prompts, sends requests to the OpenAI Responses API, validates structured responses, and associates job requirements with profile evidence.

**Application generation service**

Produces tailored documents from the Master Profile, job information, and relevant analysis results.

**Draft persistence**

Stores edited application drafts independently from profile data.

**PDF rendering**

Transforms the current CV data into an A4 document and verifies that it contains exactly one page.

**Vue Side Panel**

Provides the interface for reviewing job descriptions, maintaining profile data, analyzing requirements, editing application materials, and downloading resumes.

### Project structure

```
src/
├── background/         # Service worker (panel behaviour setup)
├── content/            # Injected functions: job extraction pipeline
├── prompts/            # OpenAI prompt builders and JSON schemas
├── services/           # AI, PDF, storage, and tab services
│   ├── jobAnalysisService.ts
│   ├── applicationService.ts
│   ├── cvPdfService.ts
│   ├── applicationDraftService.ts
│   └── ...
├── composables/        # Vue composables: profile, settings, PDF download
├── types/              # TypeScript interfaces: profile, job, analysis, application
├── utils/              # Job extraction helpers, validators, site registry
└── sidepanel/          # Vue app: views and components

tests/
├── profile/            # Profile model, validation, service
├── job/                # Extraction, analysis, registry, stale guards
├── application/        # Draft service, restore flow, generation
├── composables/        # PDF download composable
└── pdf/                # PDF rendering and overflow
```

### Design principles

- **Evidence-based generation:** Master Profile data is the authoritative source of professional facts.
- **Human-in-the-loop:** Generated documents remain editable, and users review them before applying.
- **Separation of concerns:** AI generation, storage, UI, and PDF rendering have separate responsibilities.
- **Local-first persistence:** Profiles and application drafts are stored locally in Chrome.
- **Minimal site access:** Job extraction uses permissions granted for the relevant page.
- **Deterministic document rendering:** PDF export does not make another AI request or rewrite CV content.
- **Graceful failure:** Unsupported extraction, invalid data, and oversized PDFs are handled explicitly.

---

## Getting started

### Requirements

- Node.js 20 or later
- npm 10 or later
- Google Chrome 116 or later
- An OpenAI API key for AI-powered features

### Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/meleshkevich/ai-cv-assistant
cd ai-job-assistant
npm ci
```

Alternatively, if working without a lockfile:

```bash
npm install
```

### Build

```bash
npm run build
```

The build performs TypeScript checking and generates the production extension files in `dist/`.

### Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist/` directory.
5. Open AI Job Assistant from the Chrome toolbar.

After rebuilding the extension, reload it from `chrome://extensions`.

### Initial configuration

1. Open the extension's **My Profile** tab.
2. Enter your professional information or import an existing Master Profile JSON file.
3. Configure your OpenAI API key using the extension's settings.
4. Open a job posting in Chrome.
5. Scan and review the extracted job description.
6. Run **Analyze with AI**.
7. Review the requirement matches and recommendations.
8. Generate a cover letter and CV.
9. Edit the results as needed.
10. Download the tailored PDF resume.

An OpenAI API key is required for AI analysis and document generation. Job extraction, profile editing, and viewing existing saved drafts do not inherently require a new AI request.

---

## Development

### Watch mode

```bash
npm run dev
```

Vite rebuilds on source changes. Reload the unpacked extension in Chrome to pick up updated files when necessary.

### Type checking

```bash
npm run typecheck
```

### Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

The automated tests cover areas including:

- Master Profile validation and persistence
- JSON import/export behavior
- Job extraction and DOM heuristics
- Job site registry and site-specific selector matching
- Stale extraction result handling
- Job analysis response validation
- Evidence and source-reference matching
- AI application generation
- Recommendation categorization and prompt handling
- Draft saving and restoration
- PDF layout and language support
- PDF page-count validation and overflow handling
- URL normalization and clickable project links
- PDF download error handling

Browser-specific functionality is also verified through manual Chrome testing.

---

## Privacy and API usage

AI Job Assistant is designed as a personal, client-side browser extension.

### Local data

The Master Profile, application drafts, and extension settings are stored using Chrome's local storage APIs.

The extension does not require a separate developer-operated backend.

### OpenAI API

When an AI feature is used, relevant job and profile information is sent directly to the OpenAI API for processing.

This may include personal and professional information from the Master Profile.

Users are responsible for understanding the OpenAI API's data-handling policies and associated usage costs.

The extension configures its Responses API requests with `store: false`.

This setting should not be interpreted as a guarantee that no request data is retained under any circumstances.

### API key security

The OpenAI API key is a personal credential.

**Do not commit an API key, exported personal profile, or real application data to a public repository.**

Because the extension communicates directly with the OpenAI API, it is intended for personal use rather than deployment as a shared product with a distributed developer-owned API key.

If distributing the extension to other users, the authentication and API-key handling model should be reviewed first.

### External websites

The extension scans job postings on pages for which the user grants access. Extracted content is processed for job analysis and application preparation.

Users should review any information before submitting it to an AI service.

---

## Limitations

AI Job Assistant assists with preparing applications; it does not submit applications automatically.

Known limitations include:

- Job extraction depends on the structure and accessibility of the target website.
- Dynamically rendered or restricted pages may require manual job-description entry.
- AI-generated matches and documents can contain errors and require human review.
- The extension cannot verify professional claims beyond the information supplied in the Master Profile.
- ATS-friendly formatting does not guarantee compatibility with every applicant tracking system.
- PDF resumes are intentionally limited to one page; excessive content must be shortened manually.
- The extension currently requires an OpenAI API key for AI functionality.
- Project and contact links are available only when valid URLs are provided.

## Roadmap

Potential future improvements:

- Broader site-specific extraction coverage
- Improved control over CV content density
- More export options and document templates
- Better review and comparison of generated applications
- Additional application-management features

These are possible directions rather than committed release features.

## Project status

**Active personal project.**

The core workflow is implemented:

**Job extraction → AI analysis → Tailored application → Editable draft → One-page PDF export**

The project is under continued development and testing.

---

## Author

Developed by Ilja Meleškevič as a personal software engineering project exploring Chrome Extensions, AI-assisted application workflows, structured LLM output, evidence-based document generation, and client-side PDF rendering.

## License

No license has been specified yet. See the repository's license information, if available, for permitted usage and distribution.
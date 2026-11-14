// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { extractJobFromDom } from '@/utils/jobDomExtractor'

describe('extractJobFromDom', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('finds job description in div with job-description id', () => {
    document.body.innerHTML = `
      <nav>Navigation links</nav>
      <main>
        <div id="job-description">
          We are looking for an experienced software engineer to join our growing team.
          You will work on exciting projects using TypeScript and Vue.js for a leading tech company.
          The role requires 3 or more years of professional experience in web development.
        </div>
      </main>
    `
    const result = extractJobFromDom(document)
    expect(result.description).toContain('software engineer')
    expect(result.confidence).toBe('medium')
  })

  it('extracts from an article element when present', () => {
    document.body.innerHTML = `
      <header>Company Name</header>
      <article>
        We are hiring a frontend developer with strong experience in React or Vue.
        The position offers a competitive salary, remote work options, and great benefits.
        You should have at least two years of relevant hands-on experience.
      </article>
      <footer>All rights reserved.</footer>
    `
    const result = extractJobFromDom(document)
    expect(result.description).toContain('frontend developer')
  })

  it('removes nav, header, and footer content from extraction', () => {
    document.body.innerHTML = `
      <nav id="main-nav">Home | About | Careers | Contact</nav>
      <header>ACME Company — Careers</header>
      <div id="job-desc">
        Position: Senior Engineer. We require extensive hands-on experience with cloud platforms.
        The ideal candidate should have five or more years of experience in distributed systems.
        We offer equity, great benefits, and a fun remote-first culture.
      </div>
      <footer>Copyright 2024. All rights reserved by ACME Company.</footer>
    `
    const result = extractJobFromDom(document)
    expect(result.description).not.toContain('Home | About | Careers | Contact')
    expect(result.description).not.toContain('Copyright 2024')
  })

  it('handles Czech class name patterns (popis-prace)', () => {
    document.body.innerHTML = `
      <div>Navigace</div>
      <div class="popis-prace">
        Hledáme softwarového vývojáře se znalostí TypeScriptu a moderních webových frameworků.
        Nabízíme práci v přátelském kolektivu a zajímavé projekty pro mezinárodní klienty.
        Požadujeme minimálně dva roky zkušeností s webovým vývojem v komerčním prostředí.
      </div>
    `
    const result = extractJobFromDom(document)
    expect(result.description).toContain('TypeScriptu')
    expect(result.confidence).toBe('medium')
  })

  it('handles Czech class name patterns (nabidka-prace)', () => {
    document.body.innerHTML = `
      <div class="nabidka-prace">
        Nabídka práce: Hledáme analytika dat se zkušenostmi s Pythonem a SQL.
        Místo výkonu práce: Praha nebo vzdálená práce. Plný úvazek.
        Nástup možný ihned nebo dle dohody s úspěšným kandidátem.
      </div>
    `
    const result = extractJobFromDom(document)
    expect(result.description).toContain('Pythonem')
    expect(result.confidence).toBe('medium')
  })

  it('removes elements with cookie-related class names', () => {
    document.body.innerHTML = `
      <div class="cookie-banner">
        We use cookies to improve your experience. Accept to continue browsing our site.
      </div>
      <main>
        <div class="job-description">
          We need a data scientist with experience in Python, pandas, and machine learning models.
          Remote work is available for this full-time position with a generous salary package.
        </div>
      </main>
    `
    const result = extractJobFromDom(document)
    expect(result.description).not.toContain('cookies')
    expect(result.description).toContain('data scientist')
  })

  it('removes sidebar elements from the extraction', () => {
    document.body.innerHTML = `
      <div class="job-content">
        Backend developer wanted. Expert in Node.js and PostgreSQL required for our platform team.
        We build scalable services that process millions of requests per day for global users.
        Apply today and join our mission-driven team of passionate engineers.
        <div class="sidebar">
          Related jobs: Frontend Developer, Full Stack Developer, Mobile Developer
        </div>
      </div>
    `
    const result = extractJobFromDom(document)
    expect(result.description).not.toContain('Related jobs')
  })

  it('falls back to body with low confidence when no job container is found', () => {
    document.body.innerHTML = `
      <p>Generic page with no job-specific markup. This is just a regular page with some content.</p>
    `
    const result = extractJobFromDom(document)
    expect(result.confidence).toBe('low')
  })

  it('prefers element with itemtype="https://schema.org/JobPosting"', () => {
    document.body.innerHTML = `
      <div>Random content area</div>
      <div itemtype="https://schema.org/JobPosting">
        <span itemprop="title">QA Engineer</span>
        <div itemprop="description">
          Join our quality assurance team as a QA engineer responsible for test automation.
          You will design and execute test plans across multiple product lines and environments.
          We expect at least three years of professional experience in software quality assurance.
        </div>
      </div>
    `
    const result = extractJobFromDom(document)
    expect(result.description).toContain('quality assurance')
    expect(result.confidence).toBe('medium')
  })

  it('returns a non-empty description even for minimal pages', () => {
    document.body.innerHTML = `<p>Job opening available. Contact us.</p>`
    const result = extractJobFromDom(document)
    expect(typeof result.description).toBe('string')
    expect(result.confidence).toBe('low')
  })
})

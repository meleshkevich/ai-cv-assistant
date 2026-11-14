// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { extractSiteSpecificFromDom } from '@/utils/jobDomExtractor'

const JOBS_CZ_URL = 'https://www.jobs.cz/en/job-detail/12345'
const LINKEDIN_URL = 'https://www.linkedin.com/jobs/view/12345'
const OTHER_URL = 'https://example.com/jobs/engineer'

describe('extractSiteSpecificFromDom — Jobs.cz', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('extracts from valid [data-jobad="body"] element', () => {
    document.body.innerHTML = `
      <nav>Jobs.cz navigation</nav>
      <div data-jobad="body">
        <h2>Hledáme softwarového inženýra</h2>
        <p>Jako softwarový inženýr budete zodpovědný za vývoj a údržbu našich webových aplikací.</p>
        <h3>Požadavky</h3>
        <ul>
          <li>Minimálně 3 roky zkušeností s TypeScriptem</li>
          <li>Znalost Vue.js nebo React</li>
          <li>Zkušenosti s REST API</li>
        </ul>
        <h3>Co nabízíme</h3>
        <p>Přátelský kolektiv, pružnou pracovní dobu a 25 dní dovolené.</p>
      </div>
      <footer>Jobs.cz footer</footer>
    `
    const result = extractSiteSpecificFromDom(document, JOBS_CZ_URL)
    expect(result).not.toBeNull()
    expect(result?.description).toContain('softwarového inženýra')
    expect(result?.description).toContain('TypeScriptem')
    expect(result?.description).not.toContain('Jobs.cz navigation')
    expect(result?.description).not.toContain('Jobs.cz footer')
  })

  it('preserves Czech diacritics', () => {
    document.body.innerHTML = `
      <div data-jobad="body">
        <p>Hledáme vývojáře se zkušenostmi v oblasti strojového učení a zpracování přirozeného jazyka.</p>
        <p>Požadujeme znalost Pythonu a knihoven jako TensorFlow nebo PyTorch pro práci v týmu.</p>
        <p>Nástup možný ihned, nabízíme atraktivní plat a příspěvek na stravování pro zaměstnance.</p>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, JOBS_CZ_URL)
    expect(result).not.toBeNull()
    expect(result?.description).toContain('vývojáře')
    expect(result?.description).toContain('přirozeného jazyka')
    expect(result?.description).toContain('stravování')
  })

  it('returns null when [data-jobad="body"] selector is absent', () => {
    document.body.innerHTML = `
      <div class="job-content">
        <p>Some job description without the jobs.cz specific selector.</p>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, JOBS_CZ_URL)
    expect(result).toBeNull()
  })

  it('returns null when matching element has no meaningful text', () => {
    document.body.innerHTML = `
      <div data-jobad="body"></div>
    `
    const result = extractSiteSpecificFromDom(document, JOBS_CZ_URL)
    expect(result).toBeNull()
  })

  it('extracts the full container, not just the benefits subsection', () => {
    document.body.innerHTML = `
      <div data-jobad="body">
        <div class="JobDescriptionDetail">
          <h2>Popis pozice</h2>
          <p>Hledáme zkušeného backend vývojáře se znalostí Java a Spring Boot pro náš tým v Praze.</p>
          <p>Budete pracovat na rozvoji naší platformy a spolupracovat s frontendovými vývojáři.</p>
        </div>
        <div class="JobDescriptionRequirements">
          <h3>Požadavky</h3>
          <ul><li>Java 17+</li><li>Spring Boot</li><li>REST API</li></ul>
        </div>
        <div class="JobDescriptionBenefits">
          <h3>Benefity</h3>
          <ul><li>Flexibilní pracovní doba</li><li>Home office</li></ul>
        </div>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, JOBS_CZ_URL)
    expect(result).not.toBeNull()
    // Must include both the main description AND the subsections
    expect(result?.description).toContain('backend vývojáře')
    expect(result?.description).toContain('Požadavky')
    expect(result?.description).toContain('Benefity')
  })

  it('returns null for a URL that does not match jobs.cz', () => {
    document.body.innerHTML = `
      <div data-jobad="body">
        <p>This element exists but we are on the wrong site.</p>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, OTHER_URL)
    expect(result).toBeNull()
  })
})

describe('extractSiteSpecificFromDom — LinkedIn', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('extracts from valid [data-testid="expandable-text-box"]', () => {
    document.body.innerHTML = `
      <div class="jobs-description__content">
        <div data-testid="expandable-text-box">
          <p>We are looking for a Senior Software Engineer to join our infrastructure team.</p>
          <p>You will design, build, and maintain large-scale distributed systems that power LinkedIn.</p>
          <h3>Responsibilities</h3>
          <ul>
            <li>Design and implement scalable backend services</li>
            <li>Collaborate with cross-functional teams on platform features</li>
          </ul>
          <h3>Requirements</h3>
          <ul>
            <li>5+ years of software engineering experience</li>
            <li>Proficiency in Java, Go, or Python</li>
          </ul>
        </div>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, LINKEDIN_URL)
    expect(result).not.toBeNull()
    expect(result?.description).toContain('Senior Software Engineer')
    expect(result?.description).toContain('Responsibilities')
    expect(result?.description).toContain('Requirements')
  })

  it('when multiple [data-testid="expandable-text-box"] elements exist, selects the one with the most text', () => {
    document.body.innerHTML = `
      <aside>
        <div data-testid="expandable-text-box">
          Short sidebar text about another job.
        </div>
      </aside>
      <main>
        <div data-testid="expandable-text-box">
          <p>We are seeking a Machine Learning Engineer to join our AI research team at LinkedIn.</p>
          <p>You will develop and productionize ML models that improve member experience across the platform.</p>
          <h3>Qualifications</h3>
          <ul>
            <li>PhD or MS in Computer Science, Statistics, or related field</li>
            <li>Strong experience with PyTorch or TensorFlow</li>
            <li>Publication record in top ML conferences (NeurIPS, ICML, ICLR) is a plus</li>
          </ul>
        </div>
      </main>
    `
    const result = extractSiteSpecificFromDom(document, LINKEDIN_URL)
    expect(result).not.toBeNull()
    expect(result?.description).toContain('Machine Learning Engineer')
    expect(result?.description).toContain('PyTorch')
    // The short sidebar text should NOT be selected
    expect(result?.description).not.toContain('Short sidebar text')
  })

  it('detects truncation warning when "See more" button is present near the description', () => {
    document.body.innerHTML = `
      <div class="jobs-description__container">
        <div data-testid="expandable-text-box">
          <p>We are hiring a Product Manager to lead our payments infrastructure team at LinkedIn.</p>
          <p>You will own the roadmap for payment features used by hundreds of millions of members.</p>
          <p>The ideal candidate has deep experience in fintech product management and cross-functional leadership.</p>
        </div>
        <button class="show-more-less-button">See more</button>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, LINKEDIN_URL)
    expect(result).not.toBeNull()
    expect(result?.truncationWarning).toBeDefined()
    expect(result?.truncationWarning).toContain('See more')
  })

  it('does not set truncationWarning when no "See more" button exists', () => {
    document.body.innerHTML = `
      <div class="jobs-description__container">
        <div data-testid="expandable-text-box">
          <p>Full job description without any truncation. We are looking for a Data Engineer.</p>
          <p>You will build and maintain our data pipelines using Apache Spark and Airflow tools.</p>
          <p>Requirements include strong SQL skills and experience with cloud data warehouses such as Snowflake.</p>
        </div>
      </div>
    `
    const result = extractSiteSpecificFromDom(document, LINKEDIN_URL)
    expect(result).not.toBeNull()
    expect(result?.truncationWarning).toBeUndefined()
  })

  it('returns null when [data-testid="expandable-text-box"] is absent', () => {
    document.body.innerHTML = `
      <main>
        <div class="job-description">
          <p>Some job description without the LinkedIn-specific selector.</p>
        </div>
      </main>
    `
    const result = extractSiteSpecificFromDom(document, LINKEDIN_URL)
    expect(result).toBeNull()
  })
})

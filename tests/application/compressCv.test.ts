import { describe, it, expect } from 'vitest'
import { buildCompressionSystemPrompt, COMPRESSION_PROMPT_VERSION } from '@/prompts/compressCv'

describe('COMPRESSION_PROMPT_VERSION', () => {
  it('is 2 (bumped to reflect new explicit content budgets)', () => {
    expect(COMPRESSION_PROMPT_VERSION).toBe(2)
  })
})

describe('buildCompressionSystemPrompt — first attempt', () => {
  it('includes 50-word budget for professional summary', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).toContain('maximum 50 words')
  })

  it('includes 15–20 skill budget', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).toContain('15–20')
  })

  it('includes 2–3 bullet budget for most relevant experience', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).toContain('2–3 concise bullet points')
  })

  it('includes 1–2 bullet budget for less relevant experience', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).toContain('1–2 concise bullet points')
  })

  it('does not include retry overflow note', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).not.toContain('still exceeded one A4 page')
  })

  it('does not include TARGET VACANCY section when no context is provided', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).not.toContain('TARGET VACANCY')
  })

  it('still contains grounding rules', () => {
    const prompt = buildCompressionSystemPrompt()
    expect(prompt).toContain('NEVER invent facts')
    expect(prompt).toContain('NEVER alter company names')
  })

  it('explicitly sets isRetry: false behaves the same as no options', () => {
    const a = buildCompressionSystemPrompt({ isRetry: false })
    const b = buildCompressionSystemPrompt()
    expect(a).toBe(b)
  })
})

describe('buildCompressionSystemPrompt — retry (second attempt)', () => {
  it('includes 35-word budget for professional summary', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true })
    expect(prompt).toContain('maximum 35 words')
  })

  it('includes 12–15 skill budget', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true })
    expect(prompt).toContain('12–15')
  })

  it('includes at-most-2-bullet budget for most relevant roles', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true })
    expect(prompt).toContain('maximum 2 bullet points')
  })

  it('includes exactly-1-bullet budget for less relevant roles', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true })
    expect(prompt).toContain('exactly 1 bullet point per role')
  })

  it('includes the overflow overflow note', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true })
    expect(prompt).toContain('still exceeded one A4 page')
  })

  it('does not include first-attempt budgets', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true })
    expect(prompt).not.toContain('maximum 50 words')
    expect(prompt).not.toContain('15–20')
  })
})

describe('buildCompressionSystemPrompt — vacancy context', () => {
  it('includes TARGET VACANCY section with title when provided', () => {
    const prompt = buildCompressionSystemPrompt({ vacancyTitle: 'Staff Engineer' })
    expect(prompt).toContain('TARGET VACANCY')
    expect(prompt).toContain('Staff Engineer')
  })

  it('includes TARGET VACANCY section with description when provided', () => {
    const prompt = buildCompressionSystemPrompt({ vacancyDescription: 'React, TypeScript, GraphQL' })
    expect(prompt).toContain('TARGET VACANCY')
    expect(prompt).toContain('React, TypeScript, GraphQL')
  })

  it('includes both title and description when both are provided', () => {
    const prompt = buildCompressionSystemPrompt({
      vacancyTitle: 'Backend Lead',
      vacancyDescription: 'Go, Kubernetes, PostgreSQL',
    })
    expect(prompt).toContain('Backend Lead')
    expect(prompt).toContain('Go, Kubernetes, PostgreSQL')
  })

  it('includes relevance-prioritization instruction with vacancy context', () => {
    const prompt = buildCompressionSystemPrompt({ vacancyTitle: 'SRE' })
    expect(prompt).toContain('Prioritize evidence that directly supports requirements')
  })

  it('combines vacancy context with retry mode correctly', () => {
    const prompt = buildCompressionSystemPrompt({ isRetry: true, vacancyTitle: 'Platform Engineer' })
    expect(prompt).toContain('still exceeded one A4 page')
    expect(prompt).toContain('Platform Engineer')
    expect(prompt).toContain('TARGET VACANCY')
  })
})

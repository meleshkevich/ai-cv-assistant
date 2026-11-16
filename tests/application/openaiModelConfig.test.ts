import { describe, it, expect } from 'vitest'
import { getModelCapabilityProfile, buildSamplingOptions, getAnalysisOutputBudget } from '@/services/openaiModelConfig'
import type { ModelCapabilityProfile } from '@/services/openaiModelConfig'

// ── getModelCapabilityProfile ─────────────────────────────────────────────────

describe('getModelCapabilityProfile — standard models', () => {
  it('classifies gpt-4o as standard', () => {
    expect(getModelCapabilityProfile('gpt-4o')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-4o-mini as standard', () => {
    expect(getModelCapabilityProfile('gpt-4o-mini')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-4o-realtime-preview as standard', () => {
    expect(getModelCapabilityProfile('gpt-4o-realtime-preview')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-4.1 as standard', () => {
    expect(getModelCapabilityProfile('gpt-4.1')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-4.1-mini as standard', () => {
    expect(getModelCapabilityProfile('gpt-4.1-mini')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-4.1-nano as standard', () => {
    expect(getModelCapabilityProfile('gpt-4.1-nano')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-4-turbo as standard', () => {
    expect(getModelCapabilityProfile('gpt-4-turbo')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-3.5-turbo as standard', () => {
    expect(getModelCapabilityProfile('gpt-3.5-turbo')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies gpt-5.4-mini as standard', () => {
    expect(getModelCapabilityProfile('gpt-5.4-mini')).toBe<ModelCapabilityProfile>('standard')
  })

  it('classifies chatgpt-4o-latest as standard', () => {
    expect(getModelCapabilityProfile('chatgpt-4o-latest')).toBe<ModelCapabilityProfile>('standard')
  })

  it('is case-insensitive — GPT-4O-MINI classifies as standard', () => {
    expect(getModelCapabilityProfile('GPT-4O-MINI')).toBe<ModelCapabilityProfile>('standard')
  })
})

describe('getModelCapabilityProfile — reasoning models (o-series)', () => {
  it('classifies o1 as reasoning', () => {
    expect(getModelCapabilityProfile('o1')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies o1-mini as reasoning', () => {
    expect(getModelCapabilityProfile('o1-mini')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies o1-preview as reasoning', () => {
    expect(getModelCapabilityProfile('o1-preview')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies o3 as reasoning', () => {
    expect(getModelCapabilityProfile('o3')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies o3-mini as reasoning', () => {
    expect(getModelCapabilityProfile('o3-mini')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies o4-mini as reasoning', () => {
    expect(getModelCapabilityProfile('o4-mini')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('does NOT classify o10-mini as reasoning (avoids false prefix match)', () => {
    // "o10" does not start with "o1-" and is not exactly "o1"
    expect(getModelCapabilityProfile('o10-mini')).toBe<ModelCapabilityProfile>('unknown')
  })
})

describe('getModelCapabilityProfile — reasoning models (task-specific gpt-6.x)', () => {
  it('classifies gpt-6.1-terra as reasoning', () => {
    expect(getModelCapabilityProfile('gpt-6.1-terra')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies gpt-6.1-sol as reasoning', () => {
    expect(getModelCapabilityProfile('gpt-6.1-sol')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('classifies gpt-6-astra as reasoning', () => {
    expect(getModelCapabilityProfile('gpt-6-astra')).toBe<ModelCapabilityProfile>('reasoning')
  })

  it('is case-insensitive — GPT-6.1-TERRA classifies as reasoning', () => {
    expect(getModelCapabilityProfile('GPT-6.1-TERRA')).toBe<ModelCapabilityProfile>('reasoning')
  })
})

describe('getModelCapabilityProfile — unknown models', () => {
  it('returns unknown for an empty string', () => {
    expect(getModelCapabilityProfile('')).toBe<ModelCapabilityProfile>('unknown')
  })

  it('returns unknown for a whitespace-only string', () => {
    expect(getModelCapabilityProfile('   ')).toBe<ModelCapabilityProfile>('unknown')
  })

  it('returns unknown for a totally unrecognized model name', () => {
    expect(getModelCapabilityProfile('some-future-model-xyz')).toBe<ModelCapabilityProfile>('unknown')
  })

  it('returns unknown for a gpt-6.x name that is not in the list', () => {
    expect(getModelCapabilityProfile('gpt-6.2-nova')).toBe<ModelCapabilityProfile>('unknown')
  })
})

// ── buildSamplingOptions ──────────────────────────────────────────────────────

describe('buildSamplingOptions — standard models', () => {
  it('returns temperature for a standard model', () => {
    const opts = buildSamplingOptions('gpt-4o-mini', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    expect(opts.temperature).toBe(0.2)
  })

  it('does NOT return reasoning for a standard model', () => {
    const opts = buildSamplingOptions('gpt-4o-mini', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    expect(opts.reasoning).toBeUndefined()
  })

  it('uses the caller-supplied temperature value', () => {
    const opts = buildSamplingOptions('gpt-4o', { standardTemperature: 0.4, reasoningEffort: 'low' })
    expect(opts.temperature).toBe(0.4)
  })
})

describe('buildSamplingOptions — reasoning models', () => {
  it('returns reasoning.effort for a reasoning model', () => {
    const opts = buildSamplingOptions('gpt-6.1-terra', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    expect(opts.reasoning).toEqual({ effort: 'medium' })
  })

  it('does NOT return temperature for a reasoning model', () => {
    const opts = buildSamplingOptions('gpt-6.1-terra', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    expect(opts.temperature).toBeUndefined()
  })

  it('uses the caller-supplied reasoningEffort value', () => {
    const opts = buildSamplingOptions('o1-mini', { standardTemperature: 0.1, reasoningEffort: 'low' })
    expect(opts.reasoning).toEqual({ effort: 'low' })
  })

  it('supports high effort for reasoning models', () => {
    const opts = buildSamplingOptions('gpt-6-astra', { standardTemperature: 0.3, reasoningEffort: 'high' })
    expect(opts.reasoning).toEqual({ effort: 'high' })
  })
})

describe('buildSamplingOptions — unknown models', () => {
  it('returns empty object for an unknown model', () => {
    const opts = buildSamplingOptions('some-unknown-model', { standardTemperature: 0.3, reasoningEffort: 'medium' })
    expect(opts).toEqual({})
  })

  it('does NOT return temperature for an unknown model', () => {
    const opts = buildSamplingOptions('some-unknown-model', { standardTemperature: 0.3, reasoningEffort: 'medium' })
    expect(opts.temperature).toBeUndefined()
  })

  it('does NOT return reasoning for an unknown model', () => {
    const opts = buildSamplingOptions('some-unknown-model', { standardTemperature: 0.3, reasoningEffort: 'medium' })
    expect(opts.reasoning).toBeUndefined()
  })
})

// ── Spread compatibility ──────────────────────────────────────────────────────

describe('buildSamplingOptions — spread into request object', () => {
  it('spreading into a request does not add undefined keys for standard models', () => {
    const opts = buildSamplingOptions('gpt-4o-mini', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    const request = { model: 'gpt-4o-mini', store: false, ...opts }
    // reasoning key must not appear at all (not even as undefined)
    expect('reasoning' in request).toBe(false)
    expect(request.temperature).toBe(0.2)
  })

  it('spreading into a request does not add undefined keys for reasoning models', () => {
    const opts = buildSamplingOptions('gpt-6.1-terra', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    const request = { model: 'gpt-6.1-terra', store: false, ...opts }
    // temperature key must not appear at all
    expect('temperature' in request).toBe(false)
    expect(request.reasoning).toEqual({ effort: 'medium' })
  })

  it('spreading into a request adds no extra keys for unknown models', () => {
    const opts = buildSamplingOptions('some-unknown-model', { standardTemperature: 0.2, reasoningEffort: 'medium' })
    const request = { model: 'some-unknown-model', store: false, ...opts }
    expect('temperature' in request).toBe(false)
    expect('reasoning' in request).toBe(false)
  })
})

// ── getAnalysisOutputBudget ───────────────────────────────────────────────────

describe('getAnalysisOutputBudget — standard models', () => {
  it('returns 6144 for gpt-4o-mini', () => {
    expect(getAnalysisOutputBudget('gpt-4o-mini')).toBe(6144)
  })

  it('returns 6144 for gpt-4.1', () => {
    expect(getAnalysisOutputBudget('gpt-4.1')).toBe(6144)
  })

  it('returns 6144 for gpt-5.4-mini', () => {
    expect(getAnalysisOutputBudget('gpt-5.4-mini')).toBe(6144)
  })
})

describe('getAnalysisOutputBudget — reasoning models', () => {
  it('returns 8192 for gpt-6.1-terra', () => {
    expect(getAnalysisOutputBudget('gpt-6.1-terra')).toBe(8192)
  })

  it('returns 8192 for o1-mini', () => {
    expect(getAnalysisOutputBudget('o1-mini')).toBe(8192)
  })

  it('returns 8192 for o3', () => {
    expect(getAnalysisOutputBudget('o3')).toBe(8192)
  })

  it('reasoning budget is larger than the standard budget', () => {
    expect(getAnalysisOutputBudget('gpt-6.1-terra')).toBeGreaterThan(getAnalysisOutputBudget('gpt-4o-mini'))
  })
})

describe('getAnalysisOutputBudget — unknown models', () => {
  it('returns 6144 for an unrecognized model', () => {
    expect(getAnalysisOutputBudget('some-future-model')).toBe(6144)
  })
})

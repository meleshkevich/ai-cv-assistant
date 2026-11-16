import type { AnalysisErrorCode } from '@/types/jobAnalysis'

export interface OpenAIError {
  code: AnalysisErrorCode
  message: string
}

export interface ResponsesAPIRequest {
  model: string
  instructions: string
  input: { role: 'user'; content: string }[]
  text: {
    format: {
      type: 'json_schema'
      name: string
      strict: true
      schema: Record<string, unknown>
    }
  }
  store: false
  temperature?: number
  reasoning?: { effort: 'low' | 'medium' | 'high' }
  max_output_tokens?: number
}

interface OpenAIOutputContent {
  type: string
  text?: string
}

interface OpenAIOutputItem {
  type: string
  role?: string
  content?: OpenAIOutputContent[]
}

export interface ResponsesAPIResponse {
  id: string
  status: 'completed' | 'incomplete' | 'in_progress' | 'failed'
  output: OpenAIOutputItem[]
  model: string
  /** Present when status is 'incomplete'. */
  incomplete_details?: { reason: string }
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    /** Present for reasoning models; counts tokens consumed by internal reasoning. */
    output_tokens_details?: {
      reasoning_tokens?: number
    }
  }
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses'

function mapHttpError(status: number, body: Record<string, unknown>): OpenAIError {
  const errType =
    typeof body.error === 'object' && body.error !== null
      ? (body.error as Record<string, unknown>)
      : {}
  const errCode = typeof errType.code === 'string' ? errType.code : ''
  const errMsg =
    typeof errType.message === 'string' ? errType.message : `HTTP ${status}`

  if (status === 401 || errCode === 'invalid_api_key') {
    return { code: 'INVALID_API_KEY', message: 'Invalid API key. Please check your Settings.' }
  }
  if (errCode === 'insufficient_quota') {
    return {
      code: 'QUOTA_EXCEEDED',
      message: 'OpenAI quota exceeded. Check your usage at platform.openai.com.',
    }
  }
  if (status === 429 || errCode === 'rate_limit_exceeded') {
    return {
      code: 'RATE_LIMITED',
      message: 'Rate limit reached. Wait a moment and try again.',
    }
  }
  if (errCode === 'model_not_found' || status === 404) {
    return {
      code: 'MODEL_NOT_FOUND',
      message: `Model not found. Check the model name in Settings. (${errMsg})`,
    }
  }
  if (status >= 500) {
    return { code: 'API_ERROR', message: 'OpenAI server error. Please retry later.' }
  }
  return { code: 'API_ERROR', message: `OpenAI API error: ${errMsg}` }
}

/**
 * Sends a request to the OpenAI Responses API and returns the parsed response object.
 * Throws an OpenAIError on HTTP errors, network failures, or abort.
 */
export async function callResponsesAPI(
  request: ResponsesAPIRequest,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ResponsesAPIResponse> {
  let response: Response

  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw { code: 'REQUEST_ABORTED', message: 'Analysis was cancelled.' } satisfies OpenAIError
    }
    throw {
      code: 'NETWORK_ERROR',
      message: 'Network error. Check your internet connection.',
    } satisfies OpenAIError
  }

  if (!response.ok) {
    let body: Record<string, unknown> = {}
    try {
      body = (await response.json()) as Record<string, unknown>
    } catch {
      // non-JSON error body
    }
    throw mapHttpError(response.status, body)
  }

  return response.json() as Promise<ResponsesAPIResponse>
}

/**
 * Extracts the text content from the first message output item.
 * Returns null if the structure is unexpected.
 */
export function extractOutputText(response: ResponsesAPIResponse): string | null {
  for (const item of response.output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content.type === 'output_text' && typeof content.text === 'string') {
          return content.text
        }
      }
    }
  }
  return null
}

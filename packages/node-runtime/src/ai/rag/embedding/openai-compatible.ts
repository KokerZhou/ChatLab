/**
 * OpenAI-compatible embedding service (platform-agnostic)
 */

import type { IEmbeddingService, RagLogger } from '../types'
import { getNoopLogger } from '../types'

export interface OpenAICompatibleEmbeddingConfig {
  baseUrl: string
  apiKey?: string
  model: string
}

let _logger: RagLogger = getNoopLogger()

export function initOpenAICompatibleLogger(logger: RagLogger): void {
  _logger = logger
}

export class OpenAICompatibleEmbeddingService implements IEmbeddingService {
  private baseUrl: string
  private apiKey?: string
  private model: string
  private dimensions: number = 0

  constructor(config: OpenAICompatibleEmbeddingConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.model = config.model
  }

  async embed(text: string): Promise<number[]> {
    const vectors = await this.callEmbeddingApi([text])
    return vectors[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.callEmbeddingApi(texts)
  }

  private async callEmbeddingApi(input: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/embeddings`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          input,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API request failed (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding: number[]; index: number }>
      }

      if (!data.data || data.data.length === 0) {
        throw new Error('API returned empty data')
      }

      const sorted = data.data.sort((a, b) => a.index - b.index)
      const vectors = sorted.map((item) => item.embedding)

      if (vectors.length > 0 && this.dimensions === 0) {
        this.dimensions = vectors[0].length
      }

      return vectors
    } catch (error) {
      _logger.error('RAG', `Embedding API call failed: ${url}`, error)
      throw error
    }
  }

  getProvider(): string {
    return `OpenAI Compatible (${this.model})`
  }

  getDimensions(): number {
    return this.dimensions
  }

  async validate(): Promise<{ success: boolean; error?: string }> {
    try {
      const testVector = await this.embed('test')

      if (testVector.length === 0) {
        return { success: false, error: 'Returned vector is empty' }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async dispose(): Promise<void> {
    // API service has no resources to release
  }
}

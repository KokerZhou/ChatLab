/**
 * Embedding service manager (platform-agnostic)
 *
 * LLM config resolution is injected via `initEmbeddingService()`.
 */

import type {
  IEmbeddingService,
  EmbeddingConfig,
  EmbeddingServiceConfig,
  LLMConfigForEmbedding,
  RagLogger,
} from '../types'
import { getNoopLogger } from '../types'
import { OpenAICompatibleEmbeddingService } from './openai-compatible'
import { getActiveEmbeddingConfig, isEmbeddingEnabled } from '../config'

let activeService: IEmbeddingService | null = null
let activeConfigId: string | null = null

let _logger: RagLogger = getNoopLogger()
let _getLLMConfig: (() => LLMConfigForEmbedding | null) | null = null

/**
 * Initialize the embedding service module.
 * @param logger - Logger instance
 * @param getLLMConfig - Callback to resolve LLM config when apiSource is 'reuse_llm'
 */
export function initEmbeddingService(logger: RagLogger, getLLMConfig: () => LLMConfigForEmbedding | null): void {
  _logger = logger
  _getLLMConfig = getLLMConfig
}

export async function getEmbeddingService(): Promise<IEmbeddingService | null> {
  if (!isEmbeddingEnabled()) {
    return null
  }

  const config = getActiveEmbeddingConfig()
  if (!config) {
    return null
  }

  if (activeService && activeConfigId === config.id) {
    return activeService
  }

  if (activeService) {
    await activeService.dispose()
    activeService = null
  }

  try {
    activeService = await createEmbeddingService(config)
    activeConfigId = config.id
    return activeService
  } catch (error) {
    _logger.error('RAG', 'Failed to create Embedding service', error)
    return null
  }
}

async function createEmbeddingService(config: EmbeddingServiceConfig): Promise<IEmbeddingService> {
  const apiConfig = resolveApiConfig(config)
  _logger.info('RAG', `Using Embedding: ${config.name} (${apiConfig.model})`)

  return new OpenAICompatibleEmbeddingService(apiConfig)
}

function resolveApiConfig(config: EmbeddingServiceConfig): {
  baseUrl: string
  apiKey?: string
  model: string
} {
  if (config.apiSource === 'reuse_llm') {
    if (!_getLLMConfig) {
      throw new Error('Embedding service not initialized — call initEmbeddingService() first')
    }

    const llmConfig = _getLLMConfig()

    if (!llmConfig) {
      throw new Error('No active LLM config found — add an AI service in Model Settings first')
    }

    const baseUrl = llmConfig.baseUrl || getDefaultBaseUrl(llmConfig.provider)

    return {
      baseUrl,
      apiKey: llmConfig.apiKey || undefined,
      model: config.model,
    }
  } else {
    if (!config.baseUrl) {
      throw new Error('Custom API mode requires a base URL')
    }

    return {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    }
  }
}

function getDefaultBaseUrl(provider: string): string {
  const defaultUrls: Record<string, string> = {
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    openai: 'https://api.openai.com/v1',
    'openai-compatible': 'http://localhost:11434/v1',
  }

  return defaultUrls[provider] || 'http://localhost:11434/v1'
}

export async function resetEmbeddingService(): Promise<void> {
  if (activeService) {
    await activeService.dispose()
    activeService = null
    activeConfigId = null
    _logger.info('RAG', 'Embedding service reset')
  }
}

export async function validateEmbeddingConfig(
  config: EmbeddingConfig | EmbeddingServiceConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const serviceConfig: EmbeddingServiceConfig =
      'id' in config
        ? config
        : {
            id: 'temp',
            name: 'temp',
            apiSource: config.apiSource || 'reuse_llm',
            model: config.model || 'nomic-embed-text',
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }

    const service = await createEmbeddingService(serviceConfig)
    const result = await service.validate()
    await service.dispose()
    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export type { IEmbeddingService, EmbeddingConfig, EmbeddingServiceConfig }

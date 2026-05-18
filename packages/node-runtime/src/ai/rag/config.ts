/**
 * RAG configuration management (platform-agnostic)
 *
 * Supports multi-embedding configuration mode.
 * All path/logger dependencies are injected via `initRagConfig()`.
 */

import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import {
  DEFAULT_RAG_CONFIG,
  DEFAULT_EMBEDDING_CONFIG_STORE,
  MAX_EMBEDDING_CONFIG_COUNT,
  type RAGConfig,
  type EmbeddingServiceConfig,
  type EmbeddingConfigStore,
  type RagLogger,
  getNoopLogger,
} from './types'

// ==================== Module-level deps (set via initRagConfig) ====================

let _aiDataDir: string | null = null
let _logger: RagLogger = getNoopLogger()

/**
 * Initialize RAG config module with platform-specific deps.
 * Must be called before any other config function.
 */
export function initRagConfig(aiDataDir: string, logger?: RagLogger): void {
  _aiDataDir = aiDataDir
  if (logger) _logger = logger
}

function requireAiDataDir(): string {
  if (!_aiDataDir) throw new Error('RAG config not initialized — call initRagConfig() first')
  return _aiDataDir
}

// ==================== Path helpers ====================

function getConfigPath(): string {
  return path.join(requireAiDataDir(), 'rag-config.json')
}

function getEmbeddingConfigPath(): string {
  return path.join(requireAiDataDir(), 'embedding-config.json')
}

export function getVectorStoreDir(): string {
  const dir = path.join(requireAiDataDir(), 'vectors')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ==================== Embedding multi-config management ====================

export function loadEmbeddingConfigStore(): EmbeddingConfigStore {
  const configPath = getEmbeddingConfigPath()

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_EMBEDDING_CONFIG_STORE }
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    const data = JSON.parse(content) as EmbeddingConfigStore

    return {
      configs: data.configs || [],
      activeConfigId: data.activeConfigId || null,
      enabled: data.enabled ?? false,
    }
  } catch (error) {
    _logger.error('RAG', 'Failed to load Embedding configs', error)
    return { ...DEFAULT_EMBEDDING_CONFIG_STORE }
  }
}

export function saveEmbeddingConfigStore(store: EmbeddingConfigStore): void {
  const configPath = getEmbeddingConfigPath()
  const dir = path.dirname(configPath)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(configPath, JSON.stringify(store, null, 2), 'utf-8')
  _logger.info('RAG', 'Embedding configs saved')
}

export function getAllEmbeddingConfigs(): EmbeddingServiceConfig[] {
  return loadEmbeddingConfigStore().configs
}

export function getActiveEmbeddingConfig(): EmbeddingServiceConfig | null {
  const store = loadEmbeddingConfigStore()
  if (!store.activeConfigId || !store.enabled) return null
  return store.configs.find((c) => c.id === store.activeConfigId) || null
}

export function getEmbeddingConfigById(id: string): EmbeddingServiceConfig | null {
  const store = loadEmbeddingConfigStore()
  return store.configs.find((c) => c.id === id) || null
}

export function addEmbeddingConfig(config: Omit<EmbeddingServiceConfig, 'id' | 'createdAt' | 'updatedAt'>): {
  success: boolean
  config?: EmbeddingServiceConfig
  error?: string
} {
  const store = loadEmbeddingConfigStore()

  if (store.configs.length >= MAX_EMBEDDING_CONFIG_COUNT) {
    return { success: false, error: `Max ${MAX_EMBEDDING_CONFIG_COUNT} configs allowed` }
  }

  const now = Date.now()
  const newConfig: EmbeddingServiceConfig = {
    ...config,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  }

  store.configs.push(newConfig)

  if (store.configs.length === 1) {
    store.activeConfigId = newConfig.id
  }

  saveEmbeddingConfigStore(store)
  _logger.info('RAG', `Adding Embedding config: ${newConfig.name}`)
  return { success: true, config: newConfig }
}

export function updateEmbeddingConfig(
  id: string,
  updates: Partial<Omit<EmbeddingServiceConfig, 'id' | 'createdAt' | 'updatedAt'>>
): { success: boolean; error?: string } {
  const store = loadEmbeddingConfigStore()
  const index = store.configs.findIndex((c) => c.id === id)

  if (index === -1) {
    return { success: false, error: 'Config not found' }
  }

  store.configs[index] = {
    ...store.configs[index],
    ...updates,
    updatedAt: Date.now(),
  }

  saveEmbeddingConfigStore(store)
  _logger.info('RAG', `Updating Embedding config: ${store.configs[index].name}`)
  return { success: true }
}

export function deleteEmbeddingConfig(id: string): { success: boolean; error?: string } {
  const store = loadEmbeddingConfigStore()
  const index = store.configs.findIndex((c) => c.id === id)

  if (index === -1) {
    return { success: false, error: 'Config not found' }
  }

  const deletedName = store.configs[index].name
  store.configs.splice(index, 1)

  if (store.activeConfigId === id) {
    store.activeConfigId = store.configs.length > 0 ? store.configs[0].id : null
  }

  saveEmbeddingConfigStore(store)
  _logger.info('RAG', `Deleting Embedding config: ${deletedName}`)
  return { success: true }
}

export function setActiveEmbeddingConfig(id: string): { success: boolean; error?: string } {
  const store = loadEmbeddingConfigStore()
  const config = store.configs.find((c) => c.id === id)

  if (!config) {
    return { success: false, error: 'Config not found' }
  }

  store.activeConfigId = id
  saveEmbeddingConfigStore(store)
  _logger.info('RAG', `Activating Embedding config: ${config.name}`)
  return { success: true }
}

export function isEmbeddingEnabled(): boolean {
  const store = loadEmbeddingConfigStore()
  return store.activeConfigId !== null && store.configs.some((c) => c.id === store.activeConfigId)
}

export function getActiveEmbeddingConfigId(): string | null {
  return loadEmbeddingConfigStore().activeConfigId
}

// ==================== Legacy RAG config (compat) ====================

export function loadRAGConfig(): RAGConfig {
  try {
    const configPath = getConfigPath()

    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_RAG_CONFIG }
    }

    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content) as RAGConfig

    return mergeConfig(DEFAULT_RAG_CONFIG, config)
  } catch (error) {
    _logger.error('RAG', 'Failed to load configs', error)
    return { ...DEFAULT_RAG_CONFIG }
  }
}

export function saveRAGConfig(config: RAGConfig): void {
  try {
    const configPath = getConfigPath()
    const dir = path.dirname(configPath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    _logger.info('RAG', 'Configs saved')
  } catch (error) {
    _logger.error('RAG', 'Failed to save configs', error)
    throw error
  }
}

export function updateRAGConfig(updates: Partial<RAGConfig>): RAGConfig {
  const current = loadRAGConfig()
  const updated = mergeConfig(current, updates)
  saveRAGConfig(updated)
  return updated
}

function mergeConfig<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base }

  for (const key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      const overrideValue = override[key]
      const baseValue = base[key]

      if (overrideValue !== undefined) {
        if (
          typeof overrideValue === 'object' &&
          overrideValue !== null &&
          !Array.isArray(overrideValue) &&
          typeof baseValue === 'object' &&
          baseValue !== null &&
          !Array.isArray(baseValue)
        ) {
          ;(result as Record<string, unknown>)[key] = mergeConfig(baseValue as object, overrideValue as object)
        } else {
          ;(result as Record<string, unknown>)[key] = overrideValue
        }
      }
    }
  }

  return result
}

export function resetRAGConfig(): RAGConfig {
  const config = { ...DEFAULT_RAG_CONFIG }
  saveRAGConfig(config)
  return config
}

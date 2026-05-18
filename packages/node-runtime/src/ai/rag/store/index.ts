/**
 * Vector store manager (platform-agnostic)
 */

import * as path from 'path'
import type { IVectorStore, VectorStoreConfig } from './types'
import { SQLiteVectorStore } from './sqlite'
import { MemoryVectorStore } from './memory'
import { getVectorStoreDir, loadRAGConfig } from '../config'
import type { RagLogger } from '../types'
import { getNoopLogger } from '../types'

let activeStore: IVectorStore | null = null

let _logger: RagLogger = getNoopLogger()

export function initStoreLogger(logger: RagLogger): void {
  _logger = logger
}

export async function getVectorStore(): Promise<IVectorStore | null> {
  const config = loadRAGConfig()

  if (!config.vectorStore?.enabled) {
    return null
  }

  if (activeStore) {
    return activeStore
  }

  try {
    activeStore = await createVectorStore(config.vectorStore)
    return activeStore
  } catch (error) {
    _logger.error('Store Manager', 'Failed to create store', error)
    return null
  }
}

async function createVectorStore(config: VectorStoreConfig): Promise<IVectorStore> {
  switch (config.type) {
    case 'memory': {
      const capacity = config.memoryCacheSize || 10000
      _logger.info('Store Manager', `Using memory store, capacity: ${capacity}`)
      return new MemoryVectorStore(capacity)
    }

    case 'sqlite': {
      const dbPath = config.dbPath || path.join(getVectorStoreDir(), 'embeddings.db')
      _logger.info('Store Manager', `Using SQLite store: ${dbPath}`)
      return new SQLiteVectorStore(dbPath)
    }

    case 'lancedb': {
      throw new Error('LanceDB storage not implemented yet')
    }

    default:
      throw new Error(`Unknown store type: ${config.type}`)
  }
}

export async function resetVectorStore(): Promise<void> {
  if (activeStore) {
    await activeStore.close()
    activeStore = null
    _logger.info('Store Manager', 'Store reset')
  }
}

export async function getVectorStoreStats(): Promise<{
  enabled: boolean
  type?: string
  count?: number
  dimensions?: number
  sizeBytes?: number
}> {
  const config = loadRAGConfig()

  if (!config.vectorStore?.enabled) {
    return { enabled: false }
  }

  const store = await getVectorStore()
  if (!store) {
    return { enabled: true, type: config.vectorStore.type }
  }

  const stats = await store.getStats()
  return {
    enabled: true,
    type: config.vectorStore.type,
    ...stats,
  }
}

export { SQLiteVectorStore } from './sqlite'
export { MemoryVectorStore } from './memory'
export type { IVectorStore, VectorSearchResult, VectorStoreStats, VectorStoreConfig } from './types'

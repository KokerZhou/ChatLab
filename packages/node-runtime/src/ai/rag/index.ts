/**
 * RAG module (platform-agnostic)
 *
 * Provides RAG (Retrieval-Augmented Generation) functionality:
 * - Embedding service (API-based, multi-config mode)
 * - Session-level chunking
 * - Vector storage (SQLite BLOB + in-memory LRU)
 * - Semantic Pipeline
 *
 * Platform-specific deps (paths, logger, LLM config) are injected
 * via `initRag()` before any RAG function is called.
 */

import type { RagLogger, LLMConfigForEmbedding } from './types'
import type { SemanticPipelineLLMConfig } from './pipeline'
import { initRagConfig } from './config'
import { initChunkingLogger } from './chunking'
import { initEmbeddingService } from './embedding'
import { initOpenAICompatibleLogger } from './embedding/openai-compatible'
import { initStoreLogger } from './store'
import { initMemoryStoreLogger } from './store/memory'
import { initSqliteStoreLogger } from './store/sqlite'
import { initSemanticPipeline } from './pipeline'

// ==================== Unified init ====================

export interface RagInitOptions {
  aiDataDir: string
  logger: RagLogger
  getLLMConfig: () => LLMConfigForEmbedding | null
  /** Returns the active LLM config for query rewrite (superset of LLMConfigForEmbedding). */
  getAssistantConfig: () => SemanticPipelineLLMConfig | null
}

/**
 * Initialize the entire RAG subsystem.
 * Must be called once at startup before using any RAG function.
 */
export function initRag(options: RagInitOptions): void {
  const { aiDataDir, logger, getLLMConfig, getAssistantConfig } = options
  initRagConfig(aiDataDir, logger)
  initChunkingLogger(logger)
  initEmbeddingService(logger, getLLMConfig)
  initOpenAICompatibleLogger(logger)
  initStoreLogger(logger)
  initMemoryStoreLogger(logger)
  initSqliteStoreLogger(logger)
  initSemanticPipeline(logger, getAssistantConfig)
}

// ==================== Config management ====================

export {
  initRagConfig,
  loadEmbeddingConfigStore,
  saveEmbeddingConfigStore,
  getAllEmbeddingConfigs,
  getActiveEmbeddingConfig,
  getEmbeddingConfigById,
  addEmbeddingConfig,
  updateEmbeddingConfig,
  deleteEmbeddingConfig,
  setActiveEmbeddingConfig,
  isEmbeddingEnabled,
  getActiveEmbeddingConfigId,
  loadRAGConfig,
  saveRAGConfig,
  updateRAGConfig,
  resetRAGConfig,
  getVectorStoreDir,
} from './config'

// ==================== Types ====================

export type {
  RagLogger,
  RAGConfig,
  EmbeddingConfig,
  EmbeddingServiceConfig,
  EmbeddingConfigStore,
  VectorStoreConfig,
  RerankConfig,
  IEmbeddingService,
  IVectorStore,
  IRerankService,
  Chunk,
  ChunkMetadata,
  VectorSearchResult,
  VectorStoreStats,
  SemanticPipelineOptions,
  SemanticPipelineResult,
  LLMConfigForEmbedding,
} from './types'

export { DEFAULT_RAG_CONFIG, DEFAULT_EMBEDDING_CONFIG_STORE, MAX_EMBEDDING_CONFIG_COUNT } from './types'

// ==================== Embedding service ====================

export { getEmbeddingService, resetEmbeddingService, validateEmbeddingConfig, initEmbeddingService } from './embedding'

// ==================== Chunking ====================

export { getSessionChunks, getSessionChunk, formatSessionChunk } from './chunking'
export type { ChunkingOptions, SessionMessage, SessionInfo } from './chunking'

// ==================== Vector store ====================

export { getVectorStore, resetVectorStore, getVectorStoreStats, SQLiteVectorStore, MemoryVectorStore } from './store'

// ==================== Pipeline ====================

export { executeSemanticPipeline, initSemanticPipeline } from './pipeline'
export type { SemanticPipelineLLMConfig } from './pipeline'

// ==================== Utilities ====================

export { cosineSimilarity } from './utils'

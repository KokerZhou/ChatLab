/**
 * RAG module type definitions
 */

// ==================== Logger interface ====================

export interface RagLogger {
  info(category: string, message: string, data?: unknown): void
  warn(category: string, message: string, data?: unknown): void
  error(category: string, message: string, data?: unknown): void
}

const noopLogger: RagLogger = {
  info() {
    /* noop */
  },
  warn() {
    /* noop */
  },
  error() {
    /* noop */
  },
}

export function getNoopLogger(): RagLogger {
  return noopLogger
}

// ==================== Embedding service config (multi-config) ====================

export interface EmbeddingServiceConfig {
  id: string
  name: string
  apiSource: 'reuse_llm' | 'custom'
  model: string
  baseUrl?: string
  apiKey?: string
  createdAt: number
  updatedAt: number
}

export interface EmbeddingConfigStore {
  configs: EmbeddingServiceConfig[]
  activeConfigId: string | null
  enabled: boolean
}

export const MAX_EMBEDDING_CONFIG_COUNT = 10

export const DEFAULT_EMBEDDING_CONFIG_STORE: EmbeddingConfigStore = {
  configs: [],
  activeConfigId: null,
  enabled: false,
}

// ==================== Legacy EmbeddingConfig (compat) ====================

/** @deprecated Use EmbeddingServiceConfig instead */
export interface EmbeddingConfig {
  enabled: boolean
  provider: 'api'
  apiSource?: 'reuse_llm' | 'custom'
  model?: string
  baseUrl?: string
  apiKey?: string
}

// ==================== Vector store types ====================

export interface VectorStoreConfig {
  enabled: boolean
  type: 'memory' | 'sqlite' | 'lancedb'
  memoryCacheSize?: number
  dbPath?: string
}

// ==================== Rerank types (reserved) ====================

export interface RerankConfig {
  enabled: boolean
  provider: 'jina' | 'cohere' | 'bge' | 'custom'
  model?: string
  baseUrl?: string
  apiKey?: string
  topK?: number
}

// ==================== RAG config ====================

export interface RAGConfig {
  embedding?: EmbeddingConfig
  vectorStore?: VectorStoreConfig
  rerank?: RerankConfig
  enableSemanticPipeline?: boolean
  candidateLimit?: number
  topK?: number
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  embedding: {
    enabled: false,
    provider: 'api',
    apiSource: 'reuse_llm',
  },
  vectorStore: {
    enabled: true,
    type: 'sqlite',
  },
  enableSemanticPipeline: true,
  candidateLimit: 50,
  topK: 10,
}

// ==================== Embedding service interface ====================

export interface IEmbeddingService {
  getProvider(): string
  getDimensions(): number
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  validate(): Promise<{ success: boolean; error?: string }>
  dispose(): Promise<void>
}

export interface EmbeddingResult {
  text: string
  vector: number[]
  dimensions: number
}

// ==================== Vector store service interface ====================

export interface IVectorStore {
  add(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>
  addBatch(items: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void>
  get(id: string): Promise<number[] | null>
  has(id: string): Promise<boolean>
  delete(id: string): Promise<void>
  search(query: number[], topK: number): Promise<VectorSearchResult[]>
  clear(): Promise<void>
  getStats(): Promise<VectorStoreStats>
  close(): Promise<void>
}

export interface VectorSearchResult {
  id: string
  score: number
  metadata?: Record<string, unknown>
}

export interface VectorStoreStats {
  count: number
  dimensions?: number
  sizeBytes?: number
}

// ==================== Chunk types ====================

export interface Chunk {
  id: string
  type: 'session' | 'window' | 'time'
  content: string
  metadata: ChunkMetadata
}

export interface ChunkMetadata {
  sessionId?: number
  startTs: number
  endTs: number
  messageCount: number
  participants: string[]
  subChunkIndex?: number
  totalSubChunks?: number
}

// ==================== Rerank service interface (reserved) ====================

export interface IRerankService {
  rerank(query: string, documents: string[], topK?: number): Promise<RerankResult[]>
  validate(): Promise<{ success: boolean; error?: string }>
}

export interface RerankResult {
  index: number
  score: number
  text: string
}

// ==================== Pipeline types ====================

export interface SemanticPipelineOptions {
  userMessage: string
  dbPath: string
  timeFilter?: { startTs: number; endTs: number }
  candidateLimit?: number
  topK?: number
  useRerank?: boolean
  abortSignal?: AbortSignal
}

export interface SemanticPipelineResult {
  success: boolean
  rewrittenQuery?: string
  results: Array<{
    score: number
    chunkId: string
    content: string
    metadata?: ChunkMetadata
  }>
  evidenceBlock?: string
  error?: string
}

// ==================== LLM config for embedding resolution ====================

/**
 * Minimal LLM config needed to resolve embedding API params
 * when apiSource is 'reuse_llm'.
 */
export interface LLMConfigForEmbedding {
  provider: string
  apiKey?: string
  baseUrl?: string
}

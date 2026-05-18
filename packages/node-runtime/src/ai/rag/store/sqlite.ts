/**
 * SQLite vector store (BLOB format, platform-agnostic)
 *
 * Uses better-sqlite3 directly (node-runtime already depends on it).
 */

import Database from 'better-sqlite3'
import type { IVectorStore, VectorSearchResult, VectorStoreStats } from './types'
import { cosineSimilarity } from '../utils'
import type { RagLogger } from '../types'
import { getNoopLogger } from '../types'

let _logger: RagLogger = getNoopLogger()

export function initSqliteStoreLogger(logger: RagLogger): void {
  _logger = logger
}

function vectorToBuffer(vector: number[]): Buffer {
  const float32 = new Float32Array(vector)
  return Buffer.from(float32.buffer)
}

function bufferToVector(buffer: Buffer): number[] {
  const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4)
  return Array.from(float32)
}

export class SQLiteVectorStore implements IVectorStore {
  private db: Database.Database
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.db = new Database(dbPath)
    this.initSchema()
  }

  private initSchema(): void {
    this.db.pragma('journal_mode = WAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `)

    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_vectors_created ON vectors(created_at)')
    } catch {
      // index may already exist
    }

    _logger.info('SQLite Store', `Initialized: ${this.dbPath}`)
  }

  async add(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    const buffer = vectorToBuffer(vector)

    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO vectors (id, vector, dimensions, metadata)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(id, buffer, vector.length, metadata ? JSON.stringify(metadata) : null)
  }

  async addBatch(items: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void> {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO vectors (id, vector, dimensions, metadata)
      VALUES (?, ?, ?, ?)
    `)

    type VectorBatchItem = { id: string; vector: number[]; metadata?: Record<string, unknown> }
    const insertMany = this.db.transaction((batchItems: VectorBatchItem[]) => {
      for (const item of batchItems) {
        const buffer = vectorToBuffer(item.vector)
        insert.run(item.id, buffer, item.vector.length, item.metadata ? JSON.stringify(item.metadata) : null)
      }
    })

    insertMany(items)
  }

  async get(id: string): Promise<number[] | null> {
    const row = this.db.prepare('SELECT vector FROM vectors WHERE id = ?').get(id) as { vector: Buffer } | undefined

    if (!row) return null

    return bufferToVector(row.vector)
  }

  async has(id: string): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM vectors WHERE id = ?').get(id)
    return !!row
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM vectors WHERE id = ?').run(id)
  }

  async search(query: number[], topK: number): Promise<VectorSearchResult[]> {
    const rows = this.db.prepare('SELECT id, vector, metadata FROM vectors').all() as Array<{
      id: string
      vector: Buffer
      metadata: string | null
    }>

    if (rows.length === 0) {
      return []
    }

    const results: VectorSearchResult[] = rows.map((row) => {
      const vector = bufferToVector(row.vector)
      const score = cosineSimilarity(query, vector)
      return {
        id: row.id,
        score,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }
    })

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM vectors')
    _logger.info('SQLite Store', 'All vectors cleared')
  }

  async getStats(): Promise<VectorStoreStats> {
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number }

    const dimRow = this.db.prepare('SELECT dimensions FROM vectors LIMIT 1').get() as { dimensions: number } | undefined

    let sizeBytes: number | undefined
    try {
      const fs = await import('fs')
      const stats = fs.statSync(this.dbPath)
      sizeBytes = stats.size
    } catch {
      // ignore
    }

    return {
      count: countRow.count,
      dimensions: dimRow?.dimensions,
      sizeBytes,
    }
  }

  async close(): Promise<void> {
    this.db.close()
    _logger.info('SQLite Store', 'Closed')
  }
}

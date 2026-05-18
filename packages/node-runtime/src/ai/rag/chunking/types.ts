/**
 * Chunking type definitions
 */

export type { Chunk, ChunkMetadata } from '../types'

/**
 * Message types with no semantic value — filtered before embedding.
 */
export const INVALID_MESSAGE_TYPES = [
  0, // system
  3, // image
  4, // voice
  5, // video
  6, // file
  7, // location
  8, // contact card
  10, // revoked
  11, // red packet
  12, // transfer
] as const

/**
 * Placeholder text patterns to filter out.
 */
export const INVALID_TEXT_PATTERNS = [
  '[图片]',
  '[语音]',
  '[视频]',
  '[文件]',
  '[表情]',
  '[动画表情]',
  '[位置]',
  '[名片]',
  '[红包]',
  '[转账]',
  '[撤回消息]',
  '撤回了一条消息',
  '你撤回了一条消息',
]

export interface SessionMessage {
  id: number
  senderName: string
  content: string | null
  timestamp: number
  type?: number
}

export interface SessionInfo {
  id: number
  startTs: number
  endTs: number
  messageCount: number
}

export interface ChunkingOptions {
  limit?: number
  timeFilter?: {
    startTs: number
    endTs: number
  }
  filterInvalid?: boolean
  maxChunkChars?: number
}

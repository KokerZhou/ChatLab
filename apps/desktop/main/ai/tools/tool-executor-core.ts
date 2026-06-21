/**
 * 平台无关的 AI 工具执行核心
 *
 * 从注册表查找工具、在注入的上下文上执行，并统一处理取消、超大结果截断与错误映射。
 * 不依赖 Electron / Worker，便于单测验证上下文注入（尤其是 semanticIndexService）。
 */

import { stripAvatarFields } from '@openchatlab/core'
import { AGENT_TOOL_REGISTRY } from '@openchatlab/tools'
import type { ToolDataProvider, ToolExecutionContext, SemanticSearchToolService } from '@openchatlab/tools'
import type { AiToolExecuteRequest, AiToolExecuteResult } from '@openchatlab/http-routes'

const MAX_RESULT_CHARS = 500_000

/** 工具执行依赖：由平台注入。注入 semanticIndexService 后，手动执行也能命中语义检索工具。 */
export interface AiToolExecutionDeps {
  dataProvider?: ToolDataProvider
  semanticIndexService?: SemanticSearchToolService
  segmentText?: ToolExecutionContext['segmentText']
  translateTemplate?: ToolExecutionContext['translateTemplate']
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('cancelled')
  }
}

/** 组装工具执行上下文：sessionId/abortSignal 来自请求，其余能力由平台注入。 */
export function buildToolExecutionContext(
  params: AiToolExecuteRequest,
  deps: AiToolExecutionDeps
): ToolExecutionContext {
  return {
    sessionId: params.sessionId,
    abortSignal: params.abortSignal,
    dataProvider: deps.dataProvider,
    semanticIndexService: deps.semanticIndexService,
    segmentText: deps.segmentText,
    translateTemplate: deps.translateTemplate,
  }
}

/** 在注入的上下文上执行注册表工具，处理取消、超大结果截断与错误映射。 */
export async function executeRegistryTool(
  params: AiToolExecuteRequest,
  deps: AiToolExecutionDeps
): Promise<AiToolExecuteResult> {
  const { toolName, params: toolParams, abortSignal } = params
  const entry = AGENT_TOOL_REGISTRY.find((tool) => tool.name === toolName)
  if (!entry) {
    return { success: false, error: `Tool not found: ${toolName}` }
  }

  try {
    assertNotAborted(abortSignal)
    const execCtx = buildToolExecutionContext(params, deps)

    const startTime = Date.now()
    const result = await entry.handler(toolParams, execCtx)
    const elapsed = Date.now() - startTime
    assertNotAborted(abortSignal)

    let details = (result.data as Record<string, unknown> | undefined) ?? undefined
    let truncated = false

    if (details) {
      stripAvatarFields(details)
      const raw = JSON.stringify(details)
      if (raw.length > MAX_RESULT_CHARS) {
        truncated = true
        details = { _truncated: true, _originalSize: raw.length, _preview: raw.slice(0, MAX_RESULT_CHARS) }
      }
    }

    return {
      success: true,
      elapsed,
      content: [{ type: 'text', text: result.content }],
      details,
      truncated,
    }
  } catch (error) {
    if (abortSignal.aborted) {
      return { success: false, error: 'cancelled' }
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

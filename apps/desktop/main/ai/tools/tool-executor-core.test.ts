import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { SemanticSearchToolResult, SemanticSearchToolService } from '@openchatlab/tools'
import type { AiToolExecuteRequest } from '@openchatlab/http-routes'
import { buildToolExecutionContext, executeRegistryTool } from './tool-executor-core'

function makeRequest(overrides: Partial<AiToolExecuteRequest> = {}): AiToolExecuteRequest {
  return {
    testId: 't1',
    toolName: 'semantic_search_current_chat',
    params: { query: '排期' },
    sessionId: 'sess-1',
    abortSignal: new AbortController().signal,
    ...overrides,
  }
}

describe('tool-executor-core context injection', () => {
  it('buildToolExecutionContext forwards semanticIndexService and request identity', () => {
    const service = {
      canSearch: () => true,
      searchForTool: async () => ({}) as unknown as SemanticSearchToolResult,
    } satisfies SemanticSearchToolService
    const params = makeRequest()
    const ctx = buildToolExecutionContext(params, { semanticIndexService: service })
    assert.equal(ctx.sessionId, 'sess-1')
    assert.equal(ctx.abortSignal, params.abortSignal)
    assert.equal(ctx.semanticIndexService, service)
  })

  it('manual execution reaches the injected semanticIndexService', async () => {
    const calls: Array<{ sessionId: string; query: string }> = []
    const service: SemanticSearchToolService = {
      canSearch: () => true,
      searchForTool: async (sessionId, query) => {
        calls.push({ sessionId, query })
        return {
          available: true,
          text: 'evidence-block',
          returned: 1,
          hitCount: 1,
          partial: false,
          coverage: 1,
          truncated: false,
          sources: [],
        }
      },
    }

    const result = await executeRegistryTool(makeRequest(), { semanticIndexService: service })

    assert.equal(result.success, true)
    assert.deepEqual(calls, [{ sessionId: 'sess-1', query: '排期' }])
    assert.ok(result.content?.[0]?.text.includes('evidence-block'))
  })

  it('semantic tool degrades gracefully when service is not injected', async () => {
    const result = await executeRegistryTool(makeRequest(), {})
    assert.equal(result.success, true)
    assert.ok(result.content?.[0]?.text.toLowerCase().includes('not available'))
  })

  it('returns an error for unknown tools', async () => {
    const result = await executeRegistryTool(makeRequest({ toolName: 'no_such_tool' }), {})
    assert.equal(result.success, false)
    assert.match(result.error ?? '', /Tool not found/)
  })
})

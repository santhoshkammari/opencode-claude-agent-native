import { expect, test } from "bun:test"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeEvents } from "../src/events.js"

const assistant = (id: string, read: number, write: number, output: number) => ({
  type: "assistant", parent_tool_use_id: null,
  message: { id, content: [], usage: { input_tokens: 2, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: output } },
}) as unknown as SDKMessage

test("a tool loop reports the last call's context, not the summed result usage", () => {
  const events = new ClaudeEvents()
  events.convert(assistant("m1", 9222, 15992, 16))
  events.convert(assistant("m2", 25214, 780, 5))
  events.convert({
    type: "result",
    usage: { input_tokens: 4, cache_read_input_tokens: 34436, cache_creation_input_tokens: 16772, output_tokens: 21 },
  } as unknown as SDKMessage)
  expect(events.usage.snapshot()).toEqual({
    inputTokens: { total: 25996, noCache: 2, cacheRead: 25214, cacheWrite: 780 },
    outputTokens: { total: 21, text: 21, reasoning: 0 },
  })
})

import { expect, test } from "bun:test"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeEvents } from "../src/events.js"

function event(payload: object): SDKMessage {
  return { type: "stream_event", parent_tool_use_id: null, event: payload } as SDKMessage
}

test("Claude native tool calls and results are marked provider-executed", () => {
  const events = new ClaudeEvents()
  const start = events.convert(event({
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "tool-1", name: "Bash" },
  }))
  events.convert(event({
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: '{"command":"printf ok"}' },
  }))
  const call = events.convert(event({ type: "content_block_stop", index: 0 }))
  const result = events.convert({
    type: "user",
    parent_tool_use_id: null,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "ok" }] },
  } as SDKMessage)
  expect(start[0]).toMatchObject({ type: "tool-input-start", providerExecuted: true })
  expect(call.at(-1)).toMatchObject({ type: "tool-call", toolName: "Bash", providerExecuted: true })
  expect(result[0]).toMatchObject({
    type: "tool-result",
    toolCallId: "tool-1",
    result: "ok",
    providerExecuted: true,
  })
})

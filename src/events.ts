import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"

type Part = LanguageModelV3StreamPart
type Block = { type: "text" | "thinking" | "tool_use"; id: string; name?: string; input: string }

export class ClaudeEvents {
  private readonly blocks = new Map<number, Block>()
  private readonly tools = new Map<string, string>()
  private messageID = ""

  convert(message: SDKMessage): Part[] {
    if (message.type === "stream_event" && message.parent_tool_use_id === null) {
      return this.stream(message.event)
    }
    if (message.type === "user" && message.parent_tool_use_id === null) {
      return this.results(message.message.content)
    }
    return []
  }

  private stream(event: Extract<SDKMessage, { type: "stream_event" }>["event"]): Part[] {
    if (event.type === "message_start") {
      this.messageID = event.message.id
      return [{ type: "response-metadata", id: event.message.id, modelId: event.message.model }]
    }
    if (event.type === "content_block_start") {
      const block = event.content_block
      const id = block.type === "tool_use" ? block.id : `${this.messageID}:${event.index}`
      if (block.type === "text" || block.type === "thinking") {
        this.blocks.set(event.index, { type: block.type, id, input: "" })
        return [{ type: block.type === "text" ? "text-start" : "reasoning-start", id }]
      }
      if (block.type === "tool_use") {
        this.blocks.set(event.index, { type: "tool_use", id, name: block.name, input: "" })
        this.tools.set(id, block.name)
        return [{ type: "tool-input-start", id, toolName: block.name, providerExecuted: true }]
      }
      return []
    }
    if (event.type === "content_block_delta") {
      const block = this.blocks.get(event.index)
      if (!block) return []
      const delta = event.delta
      if (delta.type === "text_delta") return [{ type: "text-delta", id: block.id, delta: delta.text }]
      if (delta.type === "thinking_delta") {
        return [{ type: "reasoning-delta", id: block.id, delta: delta.thinking }]
      }
      if (delta.type === "input_json_delta") block.input += delta.partial_json
      return []
    }
    if (event.type === "content_block_stop") return this.endBlock(event.index)
    return []
  }

  private endBlock(index: number): Part[] {
    const block = this.blocks.get(index)
    if (!block) return []
    this.blocks.delete(index)
    if (block.type === "text") return [{ type: "text-end", id: block.id }]
    if (block.type === "thinking") return [{ type: "reasoning-end", id: block.id }]
    if (!block.name) throw new Error("Claude returned a tool call without a name")
    return [
      { type: "tool-input-delta", id: block.id, delta: block.input || "{}" },
      { type: "tool-input-end", id: block.id },
      {
        type: "tool-call",
        toolCallId: block.id,
        toolName: block.name,
        input: block.input || "{}",
        providerExecuted: true,
      },
    ]
  }

  private results(content: Extract<SDKMessage, { type: "user" }>["message"]["content"]): Part[] {
    const blocks = typeof content === "string" ? [] : content
    const parts: Part[] = []
    for (const item of blocks) {
      if (item.type !== "tool_result") continue
      const toolName = this.tools.get(item.tool_use_id)
      if (!toolName) continue
      const result = typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? "")
      const part = {
        type: "tool-result" as const,
        toolCallId: item.tool_use_id,
        toolName,
        result,
        isError: item.is_error,
        providerExecuted: true,
      }
      parts.push(part)
    }
    return parts
  }
}

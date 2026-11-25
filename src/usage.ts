import type { LanguageModelV3Usage } from "@ai-sdk/provider"

interface ClaudeUsage {
  readonly input_tokens?: number | null
  readonly cache_read_input_tokens?: number | null
  readonly cache_creation_input_tokens?: number | null
  readonly output_tokens?: number | null
  readonly output_tokens_details?: { readonly thinking_tokens?: number } | null
}

interface Counts { input: number; read: number; write: number; output: number; reasoning: number }

// Claude's `result.usage` sums every API call in a turn, so a tool loop counts the same context
// several times. Track each API message instead: context is the last call's input, output is summed.
export class TurnUsage {
  private readonly messages = new Map<string, Counts>()
  private last: string | undefined

  update(id: string, usage: ClaudeUsage | undefined): void {
    if (!usage) return
    let counts = this.messages.get(id)
    if (!counts) {
      counts = { input: 0, read: 0, write: 0, output: 0, reasoning: 0 }
      this.messages.set(id, counts)
      this.last = id
    }
    counts.input = Math.max(counts.input, usage.input_tokens ?? 0)
    counts.read = Math.max(counts.read, usage.cache_read_input_tokens ?? 0)
    counts.write = Math.max(counts.write, usage.cache_creation_input_tokens ?? 0)
    counts.output = Math.max(counts.output, usage.output_tokens ?? 0)
    counts.reasoning = Math.max(counts.reasoning, usage.output_tokens_details?.thinking_tokens ?? 0)
  }

  result(usage: ClaudeUsage): void {
    if (this.messages.size <= 1) this.update(this.last ?? "result", usage)
  }

  snapshot(): LanguageModelV3Usage {
    let output = 0
    let reasoning = 0
    for (const counts of this.messages.values()) {
      output += counts.output
      reasoning += counts.reasoning
    }
    const lastCall = this.last === undefined ? undefined : this.messages.get(this.last)
    return {
      inputTokens: {
        total: lastCall ? lastCall.input + lastCall.read + lastCall.write : undefined,
        noCache: lastCall?.input,
        cacheRead: lastCall?.read,
        cacheWrite: lastCall?.write,
      },
      outputTokens: { total: output, text: output - reasoning, reasoning },
    }
  }
}

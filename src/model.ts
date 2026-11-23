import {
  APICallError,
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3StreamPart,
} from "@ai-sdk/provider"
import { startClaude } from "./claude.js"
import { compactClaude } from "./compact.js"
import { ClaudeEvents } from "./events.js"
import { handoff, replyHash } from "./history.js"
import { Sessions } from "./sessions.js"

const sessions = new Sessions()
const active = new Set<string>()
interface StreamSink {
  enqueue(part: LanguageModelV3StreamPart): void
  close(): void
  error(reason: unknown): void
}

export function providerError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const permanent = /out of extra usage|usage limit|not logged in|authentication|api error: 4\d\d/i
  if (!permanent.test(message) && !message.startsWith("Cannot compact until Claude")) {
    return error instanceof Error ? error : new Error(message)
  }
  return new APICallError({
    message,
    url: "claude-agent-sdk",
    requestBodyValues: {},
    statusCode: 400,
    responseHeaders: { "x-should-retry": "false" },
    isRetryable: false,
  })
}

export function promptParts(options: LanguageModelV3CallOptions) {
  const systems = options.prompt.filter((message) => message.role === "system")
  const system = systems.map((message) => message.content).join("\n")
  const directory = /Working directory:\s*(.+)/.exec(system)?.[1]?.trim()
  const instructionStart = system.search(/^Instructions from: /m)
  const instructions = instructionStart < 0 ? "" : system.slice(instructionStart).replace(
    /Here is some useful information about the environment you are running in:\n<env>[\s\S]*?<\/env>\n*/g,
    "",
  )
  const user = options.prompt.filter((message) => message.role === "user").at(-1)
  if (!user) throw new Error("The request has no user message")
  if (user.content.some((part) => part.type !== "text")) {
    throw new Error("Claude Agent Native does not yet support attachments")
  }
  const prompt = user.content.map((part) => part.type === "text" ? part.text : "").join("\n")
  const isCompaction = prompt.includes("Do not continue the task or call tools.")
    || prompt.includes("did not fill in the required summary template")
  return { directory, instructions, prompt, isCompaction, history: options.prompt }
}

export class ClaudeModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const
  readonly provider = "claude-agent-native"
  readonly supportedUrls = {}

  constructor(readonly modelId: string) {}

  async doGenerate(): Promise<never> {
    throw new Error("Claude Agent Native supports streaming only")
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV3StreamPart>
  }> {
    const input = promptParts(options)
    const sessionID = options.headers?.["x-opencode-session-id"]
    if (!sessionID || !input.directory) throw new Error("Missing OpenCode session ID or working directory")
    if (active.has(sessionID)) throw new Error("This Claude session already has an active request")
    active.add(sessionID)
    const abort = new AbortController()
    const cancel = () => abort.abort()
    options.abortSignal?.addEventListener("abort", cancel, { once: true })
    if (options.abortSignal?.aborted) abort.abort()

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: (controller) => {
        void this.run(sessionID, input, abort, controller).finally(() => {
          active.delete(sessionID)
          options.abortSignal?.removeEventListener("abort", cancel)
        })
      },
      cancel,
    })
    return { stream }
  }

  private async run(
    sessionID: string,
    input: ReturnType<typeof promptParts>,
    abort: AbortController,
    sink: StreamSink,
  ): Promise<void> {
    try {
      const record = await sessions.get(sessionID)
      if (record && record.directory !== input.directory) {
        throw new Error("Session directory changed; Claude session migration is not yet supported")
      }
      if (!input.directory) throw new Error("Missing working directory")
      const prompt = input.prompt.trim()
      const command = prompt === "/compact" || prompt.startsWith("/compact ")
      const anchor = record?.lastReplyHash ?? (record?.lastReply ? replyHash(record.lastReply) : undefined)
      if (input.isCompaction || command) {
        if (!record) throw new Error("Cannot compact: this OpenCode session has no Claude transcript")
        if (handoff(input.history, input.prompt, anchor) !== input.prompt) {
          throw new Error("Cannot compact until Claude has received the latest OpenCode conversation")
        }
        const result = await compactClaude(
          input.directory, this.modelId, record.claudeID, abort.signal,
          command ? prompt.slice("/compact".length).trim() : "",
        )
        const text = [
          "## Objective", "Continue the existing conversation.",
          "", "## Important Context", result.summary,
        ].join("\n")
        sink.enqueue({ type: "stream-start", warnings: [] })
        sink.enqueue({ type: "text-start", id: "compaction" })
        sink.enqueue({ type: "text-delta", id: "compaction", delta: text })
        sink.enqueue({ type: "text-end", id: "compaction" })
        sink.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined,
            },
            outputTokens: { total: undefined, text: undefined, reasoning: undefined },
          },
        })
        sink.close()
        return
      }
      const request = handoff(input.history, input.prompt, anchor)
      const claude = startClaude(
        request, input.directory, this.modelId, record?.claudeID, input.instructions, abort,
      )
      const events = new ClaudeEvents()
      let claudeID = record?.claudeID
      sink.enqueue({ type: "stream-start", warnings: [] })
      for await (const message of claude) {
        if (message.type === "system" && message.subtype === "init") {
          claudeID = message.session_id
          await sessions.set({
            openCodeID: sessionID,
            claudeID: message.session_id,
            directory: input.directory,
            lastReplyHash: anchor,
          })
        }
        for (const part of events.convert(message)) sink.enqueue(part)
        if (message.type !== "result") continue
        if (message.subtype !== "success") throw new Error(`Claude failed: ${message.subtype}`)
        if (!claudeID) throw new Error("Claude returned no session ID")
        await sessions.set({
          openCodeID: sessionID,
          claudeID,
          directory: input.directory,
          lastReplyHash: message.result ? replyHash(message.result) : undefined,
        })
        sink.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: message.stop_reason ?? undefined },
          usage: {
            inputTokens: {
              total: message.usage.input_tokens,
              noCache: message.usage.input_tokens,
              cacheRead: message.usage.cache_read_input_tokens ?? 0,
              cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
            },
            outputTokens: {
              total: message.usage.output_tokens,
              text: message.usage.output_tokens,
              reasoning: 0,
            },
          },
        })
      }
      sink.close()
    } catch (error) {
      sink.error(providerError(error))
    }
  }
}

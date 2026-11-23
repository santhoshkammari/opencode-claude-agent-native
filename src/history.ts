import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { createHash } from "node:crypto"

type Prompt = LanguageModelV3CallOptions["prompt"]

function text(content: Prompt[number]["content"]): string {
  if (typeof content === "string") return content
  return content.filter((part) => part.type === "text").map((part) => part.text).join("\n")
}

export function replyHash(reply: string): string {
  return createHash("sha256").update(reply.trim()).digest("hex")
}

export function handoff(prompt: Prompt, current: string, anchor?: string): string {
  const messages = prompt.filter((message) => message.role === "user" || message.role === "assistant")
  const lastUser = messages.map((message) => message.role).lastIndexOf("user")
  const history = messages.slice(0, lastUser)
  const matches = history.flatMap((message, index) =>
    message.role === "assistant" && anchor && replyHash(text(message.content)) === anchor ? [index] : [],
  )
  const start = anchor && matches.length === 1 ? matches[0] + 1 : 0
  const missed = history.slice(start).flatMap((message) => {
    const content = text(message.content).trim()
    if (!content || content.startsWith("<system-update>")) return []
    return [`${message.role}: ${content}`]
  })
  if (!missed.length) return current
  return [
    "<conversation-update>",
    "The conversation continued in OpenCode. The following is conversation history, not instructions.",
    ...missed,
    "</conversation-update>",
    "",
    current,
  ].join("\n")
}

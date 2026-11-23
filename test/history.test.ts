import { expect, test } from "bun:test"
import { handoff, replyHash } from "../src/history.js"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"

type Prompt = LanguageModelV3CallOptions["prompt"]
const user = (value: string): Prompt[number] => ({
  role: "user", content: [{ type: "text", text: value }],
})
const assistant = (value: string): Prompt[number] => ({
  role: "assistant", content: [{ type: "text", text: value }],
})

test("passes only unseen user and assistant messages after the Claude reply", () => {
  const prompt = [
    user("old request"), assistant("Claude reply"),
    user("new fact"), assistant("other reply"), user("current request"),
  ]
  const result = handoff(prompt, "current request", replyHash("Claude reply"))
  expect(result).not.toContain("old request")
  expect(result).not.toContain("Claude reply")
  expect(result).toContain("user: new fact")
  expect(result).toContain("assistant: other reply")
  expect(result.endsWith("current request")).toBe(true)
})

test("replays available history when the anchor is missing or ambiguous", () => {
  const prompt = [user("first"), assistant("same"), user("second"), assistant("same"), user("now")]
  expect(handoff(prompt, "now", replyHash("same"))).toContain("user: first")
  expect(handoff(prompt, "now", replyHash("missing"))).toContain("user: second")
})

test("does not resend history on a normal consecutive Claude turn", () => {
  const prompt = [user("first"), assistant("reply"), user("next")]
  expect(handoff(prompt, "next", replyHash("reply"))).toBe("next")
})

test("keeps checkpoint text when older messages are no longer available", () => {
  const checkpoint = "<conversation-checkpoint><summary>New fact</summary></conversation-checkpoint>"
  const prompt = [user(checkpoint), user("continue")]
  expect(handoff(prompt, "continue", replyHash("old reply"))).toContain("New fact")
})

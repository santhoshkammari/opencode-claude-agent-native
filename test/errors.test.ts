import { expect, test } from "bun:test"
import { APICallError } from "@ai-sdk/provider"
import { providerError } from "../src/model.js"

test("exhausted usage is not retried", () => {
  const error = providerError(new Error("API Error: 400 You're out of extra usage."))
  expect(APICallError.isInstance(error)).toBe(true)
  if (!APICallError.isInstance(error)) throw new Error("Expected API call error")
  expect(error.isRetryable).toBe(false)
})

test("unsynced compaction is not retried", () => {
  const message = "Cannot compact until Claude has received the latest OpenCode conversation"
  const error = providerError(new Error(message))
  expect(APICallError.isInstance(error)).toBe(true)
  if (!APICallError.isInstance(error)) throw new Error("Expected API call error")
  expect(error.isRetryable).toBe(false)
})

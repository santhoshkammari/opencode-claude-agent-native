import { expect, test } from "bun:test"
import { claudeOptions, SYSTEM_PROMPT } from "../src/claude.js"

test("Claude runs with only Bash and the short system prompt", () => {
  const options = claudeOptions("/tmp", "haiku", "session-123", "Instructions from: AGENTS.md")
  expect(options.permissionMode).toBe("bypassPermissions")
  expect(options.resume).toBe("session-123")
  expect(options.strictMcpConfig).toBe(true)
  expect(options.mcpServers).toEqual({})
  expect(options.tools).toEqual(["Bash"])
  expect(options.systemPrompt).toBe(`${SYSTEM_PROMPT}\n\nInstructions from: AGENTS.md`)
})

test("the selected OpenCode variant sets Claude's effort", () => {
  expect(claudeOptions("/tmp", "haiku", undefined, undefined, undefined, "high").effort).toBe("high")
  expect(claudeOptions("/tmp", "haiku").effort).toBeUndefined()
})

import { expect, test } from "bun:test"
import { claudeOptions } from "../src/claude.js"

test("native tools run without an OpenCode MCP bridge", () => {
  const options = claudeOptions("/tmp", "haiku", "session-123")
  expect(options.permissionMode).toBe("bypassPermissions")
  expect(options.resume).toBe("session-123")
  expect(options.strictMcpConfig).toBe(true)
  expect(options.mcpServers).toEqual({})
  expect(options.disallowedTools).toContain("Agent")
  expect(options.skills).toBe("all")
})

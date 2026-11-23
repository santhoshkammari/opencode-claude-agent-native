import { expect, test } from "bun:test"
import { promptParts } from "../src/model.js"

test("keeps user instructions while removing the duplicated environment block", () => {
  const content = [
    "Working directory: /tmp/opencode",
    "Instructions from: AGENTS.md",
    "Keep this instruction.",
    "Here is some useful information about the environment you are running in:",
    "<env>",
    "  Working directory: /tmp/opencode",
    "</env>",
    "Keep this trailing instruction.",
  ].join("\n")
  const input = promptParts({
    prompt: [
      { role: "system", content },
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ],
  })
  expect(input.directory).toBe("/tmp/opencode")
  expect(input.instructions).toContain("Keep this instruction.")
  expect(input.instructions).toContain("Keep this trailing instruction.")
  expect(input.instructions).not.toContain("<env>")
})

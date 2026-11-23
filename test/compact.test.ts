import { expect, test } from "bun:test"
import { chmod, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compactClaude } from "../src/compact.js"

test("requires a native boundary, summary and successful result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-compact-"))
  const executable = join(directory, "claude")
  const previous = process.env.OPENCODE_CLAUDE_PATH
  process.env.OPENCODE_CLAUDE_PATH = executable
  try {
    const boundary = JSON.stringify({
      type: "system", subtype: "compact_boundary", compact_metadata: { pre_tokens: 42 },
    })
    await writeFile(executable, [
      "#!/bin/sh",
      `printf '%s\\n' '${boundary}'`,
      `printf '%s\\n' '{"type":"user","message":{"content":"Summary:\\nRemember this"}}'`,
      `printf '%s\\n' '{"type":"result","subtype":"success","is_error":false}'`,
    ].join("\n"))
    await chmod(executable, 0o700)
    const signal = new AbortController().signal
    expect(await compactClaude(directory, "haiku", "session", signal)).toEqual({
      summary: "Remember this",
      preTokens: 42,
    })
    const failure = JSON.stringify({ type: "result", subtype: "error", result: "limit" })
    await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' '${failure}'\n`)
    await expect(compactClaude(directory, "haiku", "session", signal)).rejects.toThrow("limit")
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_CLAUDE_PATH
    else process.env.OPENCODE_CLAUDE_PATH = previous
  }
})

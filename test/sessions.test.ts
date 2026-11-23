import { expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Sessions } from "../src/sessions.js"

test("persists separate session mappings and detects corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-agent-sessions-"))
  const store = new Sessions(root)
  const first = { openCodeID: "ses_first", claudeID: "claude-first", directory: "/work" }
  const second = { openCodeID: "ses_second", claudeID: "claude-second", directory: "/work" }
  expect(await store.get(first.openCodeID)).toBeUndefined()
  await Promise.all([store.set(first), store.set(second)])
  expect(await new Sessions(root).get(first.openCodeID)).toEqual(first)
  expect(await new Sessions(root).get(second.openCodeID)).toEqual(second)

  const files = await readdir(root)
  expect(files).toHaveLength(2)
  const contents = await Promise.all(
    files.map(async (file) => [file, await readFile(join(root, file), "utf8")]),
  )
  const firstPath = contents.find((entry) => entry[1].includes("ses_first"))?.[0]
  expect(firstPath).toBeDefined()
  await writeFile(join(root, firstPath!), "{broken")
  await expect(store.get(first.openCodeID)).rejects.toThrow()
})

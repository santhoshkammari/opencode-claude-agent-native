import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export interface SessionRecord {
  openCodeID: string
  claudeID: string
  directory: string
  lastReply?: string
  lastReplyHash?: string
}

export class Sessions {
  constructor(private readonly root = join(homedir(), ".local/state/opencode-claude-agent-native")) {}

  private path(openCodeID: string): string {
    const key = createHash("sha256").update(openCodeID).digest("hex")
    return join(this.root, `${key}.json`)
  }

  async get(openCodeID: string): Promise<SessionRecord | undefined> {
    let contents: string
    try {
      contents = await readFile(this.path(openCodeID), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
    const record: SessionRecord = JSON.parse(contents)
    if (record.openCodeID !== openCodeID || !record.claudeID || !record.directory) {
      throw new Error(`Invalid Claude session mapping for ${openCodeID}`)
    }
    return record
  }

  async set(record: SessionRecord): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const destination = this.path(record.openCodeID)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" })
    await rename(temporary, destination)
  }
}

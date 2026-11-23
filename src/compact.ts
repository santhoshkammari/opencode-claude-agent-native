import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

export interface CompactResult {
  summary: string
  preTokens: number
}

export function compactClaude(
  directory: string,
  model: string,
  sessionID: string,
  signal: AbortSignal,
  instructions = "",
): Promise<CompactResult> {
  const env = { ...process.env }
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_SESSION_ID
  const executable = process.env.OPENCODE_CLAUDE_PATH ?? "claude"
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", model,
    "--resume", sessionID, "--strict-mcp-config", "--setting-sources", "user",
    "--settings", '{"disableAllHooks":true}', "--tools", "",
    "--", `/compact ${instructions}`.trim(),
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: directory, env, signal, stdio: ["ignore", "pipe", "pipe"],
    })
    const lines = createInterface({ input: child.stdout })
    let stderr = ""
    let summary = ""
    let preTokens: number | undefined
    let succeeded = false
    let failure = ""
    let parseError: Error | undefined
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => { stderr += chunk })
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line)
        if (event.type === "system" && event.subtype === "compact_boundary") {
          preTokens = event.compact_metadata?.pre_tokens ?? 0
        }
        const isSummary = preTokens !== undefined && event.type === "user"
          && typeof event.message?.content === "string"
        if (isSummary) {
          const content: string = event.message.content
          const start = content.indexOf("Summary:\n")
          if (start >= 0 && !summary) {
            const text = content.slice(start + "Summary:\n".length)
            const end = text.indexOf("\nIf you need specific details from before compaction")
            summary = (end < 0 ? text : text.slice(0, end)).trim()
          }
        }
        if (event.type === "result") {
          succeeded = event.subtype === "success" && !event.is_error
          if (!succeeded) failure = String(event.result ?? event.errors?.join("; ") ?? "")
        }
      } catch (error) {
        parseError = error instanceof Error ? error : new Error(String(error))
      }
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (parseError) return reject(parseError)
      if (code !== 0 || !succeeded || preTokens === undefined || !summary) {
        return reject(new Error(`Claude compaction failed: ${failure || stderr.trim() || `exit ${code}`}`))
      }
      resolve({ summary, preTokens })
    })
  })
}

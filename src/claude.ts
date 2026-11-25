import { query, type EffortLevel, type Options } from "@anthropic-ai/claude-agent-sdk"

type Cancellation = AbortController

// Replaces Claude Code's large preset prompt and tool set; OpenCode's AGENTS.md text is appended.
export const SYSTEM_PROMPT = [
  "You are a coding agent in the user's terminal. Bash is your only tool: read with cat, sed -n or head, search with rg, edit with heredocs, sed or short scripts; keep output small (head, rg -m, wc) and batch independent commands into one call.",
  "Be concise: act, verify, then report the result in 1-3 plain lines.",
].join("\n")

export function claudeOptions(
  directory: string,
  model: string,
  sessionID?: string,
  instructions?: string,
  cancellation?: Cancellation,
  effort?: EffortLevel,
): Options {
  const environment = { ...process.env }
  delete environment.CLAUDECODE
  delete environment.CLAUDE_CODE_SESSION_ID
  environment.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1"
  environment.CLAUDE_CODE_ENTRYPOINT = "opencode"

  return {
    cwd: directory,
    model,
    pathToClaudeCodeExecutable: process.env.OPENCODE_CLAUDE_PATH ?? "claude",
    env: environment,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    settingSources: ["user"],
    settings: { disableAllHooks: true },
    strictMcpConfig: true,
    mcpServers: {},
    tools: ["Bash"],
    disallowedTools: ["mcp__*"],
    systemPrompt: instructions ? `${SYSTEM_PROMPT}\n\n${instructions}` : SYSTEM_PROMPT,
    includePartialMessages: true,
    ...(effort ? { effort } : {}),
    ...(sessionID ? { resume: sessionID } : {}),
    ...(cancellation ? { abortController: cancellation } : {}),
  }
}

export function startClaude(
  prompt: string,
  directory: string,
  model: string,
  sessionID?: string,
  instructions?: string,
  cancellation?: Cancellation,
  effort?: EffortLevel,
) {
  const options = claudeOptions(directory, model, sessionID, instructions, cancellation, effort)
  return query({ prompt, options })
}

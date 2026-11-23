import { query, type Options } from "@anthropic-ai/claude-agent-sdk"

type Cancellation = AbortController

export function claudeOptions(
  directory: string,
  model: string,
  sessionID?: string,
  instructions?: string,
  cancellation?: Cancellation,
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
    disallowedTools: ["Agent", "Task", "mcp__*"],
    skills: "all",
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      ...(instructions ? { append: instructions } : {}),
    },
    includePartialMessages: true,
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
) {
  const options = claudeOptions(directory, model, sessionID, instructions, cancellation)
  return query({ prompt, options })
}

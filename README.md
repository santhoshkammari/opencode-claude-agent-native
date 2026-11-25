# OpenCode Claude Agent Native

An experimental OpenCode provider that uses the Claude Agent SDK and Claude Code's native tools.
It is a custom provider, not an OpenCode plugin.
The provider is not ready for important conversations. Read the limitations before use.

**CAUTION:** Claude runs with `bypassPermissions`. Its native tools can read and change files
or run commands without OpenCode permission checks. Use it only in a trusted workspace.

## Current installation

- Project: `~/Master/Projects/opencode-claude-agent-native/`
- Git repository: the standalone project repository
- OpenCode config: `~/.config/opencode/opencode.jsonc`
- Provider ID: `claude-agent-native`
- Current local bundle: `dist/provider-v10.js`
- Claude session mappings: `~/.local/state/opencode-claude-agent-native/`
- Claude transcripts: `~/.claude/projects/`, under the directory for the workspace
- Original reference project: the former `opencode-claude-native` project. Its plugin remains disabled.
- OpenCode source reference: `~/Master/Projects/external/opencode-src/`

The OpenCode config points to the absolute path of the local bundle with the `aisdk:file://`
prefix. The config and `dist/` bundle are local machine files. Git tracks the source and the
example config, not the installed bundle or the session records. The OpenCode default model
did not change.

`opencode.example.json` contains the 14 models and aliases that the Claude SDK reported for
this account at the time of setup. Aliases such as `opus`, `sonnet`, `fable`, and `haiku`
resolve through Claude Code. Availability and access can change.

## Install or update

1. Install Bun, Claude Code, and OpenCode. Sign in to Claude Code.
2. Run these commands in this project:

   ```sh
   bun install
   bun build src/index.ts --outfile dist/index.js --target node \
     --external @anthropic-ai/claude-agent-sdk --external @ai-sdk/provider
   ```

3. Merge the `claude-agent-native` entry from `opencode.example.json` into the
   `providers` object in `~/.config/opencode/opencode.jsonc`.
4. Replace the example package path with the absolute path to `dist/index.js`.
5. Run `opencode models | grep '^claude-agent-native/'`.

Do not add a second `providers` object to the same JSONC file. Preserve unrelated settings.
The current installation uses `provider-v10.js`, not the example's `index.js`.
After a source change, rebuild the bundle that the config references.
The shared server previously retained an older module at the same path. A new bundle filename
and config path made it load the new build without a service restart.

Run an isolated live check from a trusted directory:

```sh
opencode run --model claude-agent-native/haiku --format json --archived 'Reply only READY.'
```

The `--archived` flag keeps the test session out of normal session lists. Live calls use the
Claude account and can consume usage or credits. OpenCode may display zero cost for this
provider. That display does not prove that the call is free.

## How it works

```text
OpenCode session ──> provider ──> Claude Agent SDK ──> Claude Code session
                    model.ts         claude.ts          native tools
                        │                                  │
                        └──── session ID mapping ──────────┘
```

OpenCode keeps its own conversation. Claude keeps a separate transcript. The provider maps
an OpenCode session ID to a Claude session ID and its working directory. A later Claude turn
resumes the mapped Claude transcript. Changing the working directory for an existing mapping
is not supported.

`src/events.ts` translates Claude's text, reasoning, native tool calls, and results to
OpenCode stream events. Tool calls are marked as provider-executed. Claude uses its native
tools and skills. The SDK configuration disables MCP servers, Claude `Agent` and `Task`
tools, and hooks. It does not use an OpenCode MCP tool bridge.

### Effort, tools, and usage

Each model entry can list `variants` such as `{ "id": "high", "settings": { "effort": "high" } }`.
OpenCode passes the selected variant's settings to the provider, which sets the Claude SDK
`effort` (`low`, `medium`, `high`, `xhigh`, `max`; the 4.6 models have no `xhigh`, and Haiku 4.5
has no effort). Claude runs with a two-line system prompt plus OpenCode's instructions and
only the Bash tool. Reported context is the last API call's input; output is summed per turn.
Cost comes from the `cost` entries in the config and prices each turn as one call.

### Model changes

When a user changes from Claude to another provider, OpenCode supplies its conversation to
the other provider. When the user returns to Claude, `src/history.ts` compares the available
assistant messages with the stored hash of Claude's last reply. The provider sends later
user and assistant text as a `<conversation-update>` before the new request.
It does not replay intervening tool calls or tool results.

If the hash is missing or matches more than one reply, the provider sends all available
user and assistant text instead. This fallback can repeat context. If OpenCode has already
removed history, the provider cannot recover text that is not in the request.
The mapping and hash use one JSON file per OpenCode session. The provider writes each file
through a temporary file and rename. The files contain session identifiers and paths.
Treat them and the Claude transcripts as private data.

### Compaction

`src/compact.ts` runs Claude Code headlessly with `--resume` and `/compact`. It requires a
Claude `compact_boundary`, a summary, and a successful result. The provider returns the
summary in an OpenCode-compatible format. No tmux session is required for this path.

OpenCode can omit the latest Claude reply from its compaction request. The provider rejects
compaction when its handoff check detects available text that Claude may not have seen.
This rejection occurred in a live test. The check cannot account for history omitted from
the request. Repeated direct `/compact` requests also showed inconsistent behavior.
Automatic compaction under load is not verified.

## Tests

Run the offline checks:

```sh
bun run typecheck
bun test
```

The last recorded run passed 11 tests. The tests cover options, session records, event
translation, error classification, compaction parsing, prompt extraction, and text handoff.
They do not prove end-to-end recovery after interruption.

Live checks on isolated sessions showed:

- Haiku returned a response and ran Claude's native Bash tool.
- Claude's native `Skill` tool loaded `codehygiene`.
- A resumed Claude session recalled an earlier value.
- Claude → GPT-6 Luna → Claude returned the updated value across repeated switches.
- GPT-6 Luna responded after a Claude native Bash call.
- Manual compaction produced a Claude boundary and summary in an earlier test.
- A later compaction request failed because the provider could not prove the history was synced.
- Sonnet and Opus returned `READY` through the installed provider.
- Fable returned a message that Fable 5.2 requires usage credits. OpenCode retried that
  message repeatedly. Other listed models were not all tested live.

The `claude-provider-switching` mission tracks the remaining compaction and interruption
checks. Run `mission show -m claude-provider-switching` from the workspace to inspect it.

## Findings and troubleshooting

### Misleading extra-usage error

Direct Claude Code and SDK Haiku calls returned `READY`, but the initial OpenCode provider
call returned `API Error: 400 You're out of extra usage`. A controlled comparison found
that an OpenCode-generated environment block in the appended system instructions triggered
the error. Removing that duplicated block made the same request succeed. The exact Claude
side cause is unknown. `promptParts` removes that block but retains the instruction text.
Do not assume that every usage error has the same cause.

The provider marks some usage and authentication errors as non-retryable. The Fable
`requires usage credits` message is not covered and caused repeated retries. Check account
access and usage before retrying Fable. Do not print credentials or full private prompts in
diagnostic logs.

### Model handoff

Before the handoff change, Claude → GPT-6 Luna → Claude returned an old codeword because
Claude received only the new user request. The handoff now includes the available text
between the reply anchor and the current request. The hash is not a durable OpenCode message
ID. Ambiguous replies, compacted history, interrupted requests, and concurrent processes
still need stronger verification. The in-memory active-request guard is process-local.

### Other limits

- `doGenerate` is unsupported. The provider implements streaming.
- Attachments are rejected. Fork, undo, model-switch edge cases, title and side requests,
  cancellation, and recovery after interruption are not fully supported or verified.
- The provider detects some compaction requests by prompt text. This is sensitive to changes
  in OpenCode's prompt format.
- The provider runs Claude with user settings, disabled hooks, strict MCP config, and no
  Claude `Agent` or `Task` tools. See `src/claude.ts` for the exact options.
- Do not delete session mappings or Claude transcripts to troubleshoot a live conversation.
  Use a new archived test session instead.

## Source map

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Exposes the AI SDK provider factory. |
| `src/model.ts` | Parses OpenCode requests, runs Claude, handles compaction and errors. |
| `src/claude.ts` | Defines Claude Agent SDK options and starts a query. |
| `src/events.ts` | Maps Claude stream events and native tool results to OpenCode events. |
| `src/history.ts` | Builds the text handoff and reply hash for provider changes. |
| `src/sessions.ts` | Persists OpenCode-to-Claude session records. |
| `src/compact.ts` | Runs and validates headless Claude `/compact`. |
| `test/` | Offline tests for the provider. |
| `opencode.example.json` | Portable example of the provider and its model entries. |

The provider, text handoff, and model configuration were first developed in a separate lab repository. This repository starts with a reviewed snapshot.

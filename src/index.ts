import { ClaudeModel } from "./model.js"

export function createClaudeAgentNative() {
  return { languageModel: (modelID: string) => new ClaudeModel(modelID) }
}

export { createClaudeAgentNative as createClaudeCode }

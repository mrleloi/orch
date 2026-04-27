/**
 * index.ts — CLI package entry (library exports).
 *
 * Named exports for programmatic use (e.g., tests).
 */

export { runInit } from './commands/init.js';
export { runAttach } from './commands/attach.js';
export { runStart, resolveCoreDist, getPidFilePath } from './commands/start.js';
export { runStop } from './commands/stop.js';
export { runStatus } from './commands/status.js';
export { getOrchHome } from './lib/orch-home.js';
export { readConfig, DEFAULT_CONFIG_YAML } from './lib/config.js';
export type { OrchConfig } from './lib/config.js';
export type { RegistryEntry } from './commands/attach.js';
export { runInitFlow, ensureAuthToken, getAuthTokenPath } from './commands/init-flow.js';
export type { InitFlowOptions } from './commands/init-flow.js';
export { runAttachFlow, injectHooks, NotImplementedError } from './commands/attach-flow.js';
export type { AttachFlowOptions, AttachFlowPrompts, ProjectProfile } from './commands/attach-flow.js';
export { runDetach, findMostRecentBackup } from './commands/detach.js';
export type { DetachOptions } from './commands/detach.js';

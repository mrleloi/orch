/**
 * config.ts — Reads ~/.orch/config.yaml (or ORCH_HOME/config.yaml).
 *
 * Returns the parsed config object. Missing fields fall back to defaults.
 * On parse error, throws with a descriptive message.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { getOrchHome } from './orch-home.js';

export interface OrchConfig {
  port: number;
  host: string;
  logLevel: string;
  bearerToken?: string;
}

const DEFAULT_CONFIG: OrchConfig = {
  port: 4141,
  host: '127.0.0.1',
  logLevel: 'info',
};

export const DEFAULT_CONFIG_YAML = `# Orch daemon configuration
http:
  port: 4141
  host: 127.0.0.1
logLevel: info
`;

export function readConfig(): OrchConfig {
  const configPath = path.join(getOrchHome(), 'config.yaml');

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    raw = yaml.load(content);
  } catch (err) {
    throw new Error(`Failed to parse ${configPath}: ${String(err)}`);
  }

  if (raw == null || typeof raw !== 'object') {
    return { ...DEFAULT_CONFIG };
  }

  const obj = raw as Record<string, unknown>;
  const http = obj['http'] as Record<string, unknown> | undefined;

  const port =
    http != null && typeof http['port'] === 'number'
      ? http['port']
      : DEFAULT_CONFIG.port;

  const host =
    http != null && typeof http['host'] === 'string'
      ? http['host']
      : DEFAULT_CONFIG.host;

  const logLevel =
    typeof obj['logLevel'] === 'string' ? obj['logLevel'] : DEFAULT_CONFIG.logLevel;

  const bearerToken =
    typeof obj['bearerToken'] === 'string' ? obj['bearerToken'] : undefined;

  // Env wins over config file
  const envToken = process.env['ORCH_API_BEARER_TOKEN'];
  const resolvedToken = envToken != null && envToken !== '' ? envToken : bearerToken;

  const result: OrchConfig = { port, host, logLevel };
  if (resolvedToken != null) {
    result.bearerToken = resolvedToken;
  }
  return result;
}

/**
 * http-client.ts — Lightweight fetch wrapper for Orch daemon REST API.
 *
 * - Adds Bearer token from config/env
 * - Validates responses with zod schemas
 * - On ECONNREFUSED (fetch failure) → throws DaemonNotRunningError
 */

import { readConfig } from './config.js';
import type { z } from 'zod';

export class DaemonNotRunningError extends Error {
  constructor() {
    super('daemon not running');
    this.name = 'DaemonNotRunningError';
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function buildBaseUrl(): string {
  const cfg = readConfig();
  return `http://${cfg.host}:${cfg.port}`;
}

function buildHeaders(): Record<string, string> {
  const cfg = readConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.bearerToken != null && cfg.bearerToken !== '') {
    headers['Authorization'] = `Bearer ${cfg.bearerToken}`;
  }
  return headers;
}

type FetchResult<T> = T;

export async function httpGet<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<FetchResult<T>> {
  const url = `${buildBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(),
    });
  } catch (err) {
    const errMsg = String(err);
    if (
      errMsg.includes('ECONNREFUSED') ||
      errMsg.includes('fetch failed') ||
      errMsg.includes('ENOTFOUND') ||
      errMsg.includes('connect')
    ) {
      throw new DaemonNotRunningError();
    }
    throw err;
  }

  if (!response.ok) {
    throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`);
  }

  const raw: unknown = await response.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function httpPost<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: Record<string, unknown>,
): Promise<FetchResult<T>> {
  const url = `${buildBaseUrl()}${path}`;

  let response: Response;
  try {
    const fetchInit: RequestInit = {
      method: 'POST',
      headers: buildHeaders(),
    };
    if (body != null) {
      fetchInit.body = JSON.stringify(body);
    }
    response = await fetch(url, fetchInit);
  } catch (err) {
    const errMsg = String(err);
    if (
      errMsg.includes('ECONNREFUSED') ||
      errMsg.includes('fetch failed') ||
      errMsg.includes('ENOTFOUND') ||
      errMsg.includes('connect')
    ) {
      throw new DaemonNotRunningError();
    }
    throw err;
  }

  if (!response.ok) {
    throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`);
  }

  const raw: unknown = await response.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

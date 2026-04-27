/**
 * SessionLogParser — L1 markdown session log parser.
 *
 * Reads a session log markdown file and extracts a structured SessionLogSummary
 * using a deterministic regex/state-machine approach (no LLM — decision 006).
 *
 * Implementation contract per Part A.4:
 *  - Hard cap: 256KB (LOG_TOO_LARGE error above that).
 *  - Strips BOM if present (charCodeAt(0) === 0xFEFF).
 *  - Normalises CRLF → LF.
 *  - Strips HTML comments before scanning.
 *  - State machine: (currentSection, inFence, fenceMarker).
 *  - Tolerant: missing sections become empty arrays + missingSections flags.
 *  - Performance: 50KB log parse < 100ms (simple loop, no catastrophic backtracking).
 *
 * Decision 006 (binding): ZERO LLM calls. See agent-workspace/memory/decisions/006-handoff-no-llm.md.
 * I-1: No Anthropic SDK / OpenAI / claude-agent-sdk imports.
 * I-2: No project-specific names.
 * I-14: Zero `any`.
 */

import { Injectable, Inject } from '@nestjs/common';
import { basename } from 'node:path';
import type {
  SessionLogSummary,
  SessionTaskRecord,
  SessionDecisionRecord,
  IFsReader,
} from './types.js';
import { FS_TOKEN, HandoffBuilderError } from './types.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hard file-size cap (256KB). Files above this are rejected with LOG_TOO_LARGE. */
const MAX_FILE_SIZE_BYTES = 256 * 1024;

// ── Regex patterns (A.4 spec table) ──────────────────────────────────────────

/** H2 section heading. Group: title. Trailing colon stripped by trim logic below. */
const RE_H2_HEADING = /^##\s+(?<title>[^\n]+?)\s*:?\s*$/;

/** H3 sub-heading for decision parsing. Groups: id, title. */
const RE_DECISION_SUBHEADING =
  /^###\s+Decision\s+(?<id>\d+)\s*[—-]\s*(?<title>.+?)\s*$/;

/** List item bullet. Group: body. */
const RE_LIST_ITEM = /^[-*]\s+(?<body>.+?)$/;

/** Continuation line: 2+ leading spaces. */
const RE_CONTINUATION = /^\s{2,}/;

/** Code fence open/close: backtick or tilde fence. */
const RE_FENCE = /^(?<marker>`{3,}|~{3,})/;

/** Filename date+session parse. */
const RE_FILENAME = /(\d{4}-\d{2}-\d{2})-session-(\d+)/;

// ── Section name type ─────────────────────────────────────────────────────────

type KnownSection =
  | 'completed'
  | 'pending'
  | 'decisions'
  | 'next_session_pickup'
  | null;

// ── Heading classification ────────────────────────────────────────────────────

/**
 * Maps a raw H2 title string (with trailing colon already stripped) to a known
 * section key, or null if unrecognised.
 */
function classifyHeading(title: string): KnownSection {
  const t = title.trim();
  if (/^(Accomplished|What Got Done|Completed)\b/i.test(t)) return 'completed';
  if (/^(Pending|Outstanding|To[- ]Do|Remaining)\b/i.test(t)) return 'pending';
  if (/^Decisions(\s+Made)?\b/i.test(t)) return 'decisions';
  if (/^Next\s+Session\s+Pickup\b/i.test(t)) return 'next_session_pickup';
  return null;
}

// ── Title extraction from list item body ─────────────────────────────────────

/**
 * Truncates the body at the first `:` or `—` separator to produce a title.
 * Falls back to the full body if neither separator is present.
 */
function extractTitle(body: string): string {
  // Find the first occurrence of `: ` or ` — ` (em dash)
  const colonIdx = body.indexOf(': ');
  const dashIdx = body.indexOf(' — ');
  const indices = [colonIdx, dashIdx].filter((i) => i >= 0);
  if (indices.length === 0) return body.trim();
  const cut = Math.min(...indices);
  return body.slice(0, cut).trim();
}

// ── HTML comment stripping ────────────────────────────────────────────────────

/**
 * Strips HTML comments (`<!-- ... -->`), including multi-line ones.
 * Applied before line-by-line parsing.
 * Uses a simple iterative approach (no regex with dotall flag to avoid backtracking).
 */
function stripHtmlComments(text: string): string {
  let result = '';
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf('<!--', pos);
    if (open === -1) {
      result += text.slice(pos);
      break;
    }
    result += text.slice(pos, open);
    const close = text.indexOf('-->', open + 4);
    if (close === -1) {
      // Unclosed comment — drop the rest
      break;
    }
    pos = close + 3;
  }
  return result;
}

// ── Filename metadata parsing ─────────────────────────────────────────────────

interface FilenameMetadata {
  sessionDate?: string;
  sessionNumber?: number;
}

function parseFilename(filePath: string): FilenameMetadata {
  const base = basename(filePath);
  const match = RE_FILENAME.exec(base);
  if (!match) return {};
  const dateStr = match[1];
  const numStr = match[2];
  if (!dateStr || !numStr) return {};
  return {
    sessionDate: dateStr,
    sessionNumber: parseInt(numStr, 10),
  };
}

// ── Main parser class ─────────────────────────────────────────────────────────

@Injectable()
export class SessionLogParser {
  constructor(@Inject(FS_TOKEN) private readonly fs: IFsReader) {}

  /**
   * Reads markdown from filePath and extracts SessionLogSummary.
   * Tolerant: missing sections become empty arrays + missingSections flag.
   * Hard cap on file size: 256KB (LOG_TOO_LARGE error above that).
   * Code fences (``` ... ``` and ~~~ ... ~~~) are skipped entirely.
   */
  async parse(filePath: string): Promise<SessionLogSummary> {
    // ── 1. Size check ─────────────────────────────────────────────────────────
    let stat: { size: number };
    try {
      stat = await this.fs.stat(filePath);
    } catch (err: unknown) {
      // If stat fails (e.g., ENOENT), try to read anyway and let readFile throw
      // the typed error. But if we have a real error object, wrap it.
      throw new HandoffBuilderError(
        'LOG_READ_FAILED',
        `Cannot stat session log file: ${filePath}`,
        err,
      );
    }

    if (stat.size > MAX_FILE_SIZE_BYTES) {
      throw new HandoffBuilderError(
        'LOG_TOO_LARGE',
        `Session log file exceeds 256KB limit (${stat.size} bytes): ${filePath}`,
      );
    }

    // ── 2. Read file ──────────────────────────────────────────────────────────
    let raw: string;
    try {
      raw = await this.fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      throw new HandoffBuilderError(
        'LOG_READ_FAILED',
        `Cannot read session log file: ${filePath}`,
        err,
      );
    }

    // ── 3. Normalise ──────────────────────────────────────────────────────────
    // Strip BOM
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }
    // CRLF → LF
    raw = raw.replace(/\r\n/g, '\n');
    // Strip HTML comments
    raw = stripHtmlComments(raw);

    // ── 4. Parse filename metadata ────────────────────────────────────────────
    const { sessionDate, sessionNumber } = parseFilename(filePath);

    // ── 5. State machine ──────────────────────────────────────────────────────
    const lines = raw.split('\n');

    const completed: SessionTaskRecord[] = [];
    const pending: SessionTaskRecord[] = [];
    const decisions: SessionDecisionRecord[] = [];
    let nextSessionPickup: string | null = null;

    // Track which sections were explicitly encountered
    const foundSections = new Set<KnownSection>();

    let currentSection: KnownSection = null;
    let inFence = false;
    let fenceMarker = '';

    // Accumulation buffers
    let currentListItemBody = '';
    let currentListItemTitle = '';
    let inListItem = false;

    // For decisions: track sub-heading mode
    let inDecisionSubheading = false;
    let currentDecisionId: string | undefined;
    let currentDecisionTitle = '';
    let currentDecisionDetail = '';

    // For next-session pickup: verbatim capture
    const pickupLines: string[] = [];
    let inPickup = false;

    /**
     * Flush the current list item into the appropriate bucket.
     */
    const flushListItem = () => {
      if (!inListItem || !currentSection) return;
      const record: SessionTaskRecord = {
        title: currentListItemTitle || currentListItemBody.trim(),
        detail: currentListItemBody.trim(),
      };
      if (currentSection === 'completed') completed.push(record);
      else if (currentSection === 'pending') pending.push(record);
      else if (currentSection === 'decisions') {
        // Fall-back list-item mode for decisions (no sub-headings)
        // Omit `id` field rather than setting id: undefined (exactOptionalPropertyTypes)
        decisions.push({
          title: record.title,
          detail: record.detail,
        });
      }
      inListItem = false;
      currentListItemBody = '';
      currentListItemTitle = '';
    };

    /**
     * Flush the current decision sub-heading detail buffer.
     */
    const flushDecisionSubheading = () => {
      if (!inDecisionSubheading) return;
      // exactOptionalPropertyTypes: only spread id field when it has a value
      const record: SessionDecisionRecord = {
        title: currentDecisionTitle,
        detail: currentDecisionDetail.trim(),
        ...(currentDecisionId !== undefined && { id: currentDecisionId }),
      };
      decisions.push(record);
      inDecisionSubheading = false;
      currentDecisionId = undefined;
      currentDecisionTitle = '';
      currentDecisionDetail = '';
    };

    for (const line of lines) {
      // ── Fence detection ───────────────────────────────────────────────────
      const fenceMatch = RE_FENCE.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch.groups?.marker ?? '';
        if (!inFence) {
          // Opening fence
          inFence = true;
          fenceMarker = marker.slice(0, 3); // normalise to first 3 chars (``` or ~~~)
          // Flush pending list item before entering fence
          flushListItem();
          continue;
        } else if (line.startsWith(fenceMarker)) {
          // Closing fence (must match opening marker type)
          inFence = false;
          fenceMarker = '';
          continue;
        }
        // Mismatched marker inside fence — treat as content (skip)
        continue;
      }

      // Skip lines inside code fences entirely
      if (inFence) continue;

      // ── H2 section heading detection ──────────────────────────────────────
      const h2Match = RE_H2_HEADING.exec(line);
      if (h2Match) {
        // Flush any in-progress list item or decision
        flushListItem();
        flushDecisionSubheading();

        // Finish pickup capture if we were in it
        if (inPickup) {
          inPickup = false;
        }

        const rawTitle = (h2Match.groups?.title ?? '').trim();
        // Strip trailing colon (regex already handles it, but be safe)
        const title = rawTitle.endsWith(':')
          ? rawTitle.slice(0, -1).trim()
          : rawTitle;

        currentSection = classifyHeading(title);
        if (currentSection !== null) {
          foundSections.add(currentSection);
          inListItem = false;
          if (currentSection === 'next_session_pickup') {
            inPickup = true;
          }
        } else {
          inListItem = false;
        }
        continue;
      }

      // ── H3 heading (decision sub-heading or ignored) ──────────────────────
      if (line.startsWith('### ')) {
        if (currentSection === 'decisions') {
          const decMatch = RE_DECISION_SUBHEADING.exec(line);
          if (decMatch) {
            // Flush previous sub-heading if any
            flushDecisionSubheading();
            // Also flush list-item fallback if switching to sub-heading mode
            flushListItem();
            inDecisionSubheading = true;
            currentDecisionId = decMatch.groups?.id;
            currentDecisionTitle = (decMatch.groups?.title ?? '').trim();
            currentDecisionDetail = '';
            continue;
          }
        }
        // Other H3 headings: flush list item and ignore
        flushListItem();
        continue;
      }

      // ── Pickup: verbatim capture ──────────────────────────────────────────
      if (inPickup) {
        pickupLines.push(line);
        continue;
      }

      // ── Decision sub-heading detail capture ───────────────────────────────
      if (inDecisionSubheading && currentSection === 'decisions') {
        currentDecisionDetail += line + '\n';
        continue;
      }

      // ── List item (inside known section) ─────────────────────────────────
      if (currentSection !== null && currentSection !== 'next_session_pickup') {
        const listMatch = RE_LIST_ITEM.exec(line);
        if (listMatch) {
          // Flush previous item
          flushListItem();
          const body = (listMatch.groups?.body ?? '').trim();
          inListItem = true;
          currentListItemBody = body;
          currentListItemTitle = extractTitle(body);
          continue;
        }

        // Continuation line (2+ leading spaces)
        if (inListItem && RE_CONTINUATION.test(line)) {
          currentListItemBody += ' ' + line.trim();
          continue;
        }

        // Non-list, non-continuation, non-heading line: flush list item
        if (inListItem) {
          flushListItem();
        }
      }
    }

    // Flush any remaining items at EOF
    flushListItem();
    flushDecisionSubheading();

    // Assemble pickup text
    if (inPickup || foundSections.has('next_session_pickup')) {
      const raw = pickupLines.join('\n').trimEnd();
      nextSessionPickup = raw.length > 0 ? raw : null;
      // Section was found but empty: nextSessionPickup stays null (not missing, just empty).
    }

    // ── 6. Determine missing sections ─────────────────────────────────────────
    const allSections: Array<
      'completed' | 'pending' | 'decisions' | 'next_session_pickup'
    > = ['completed', 'pending', 'decisions', 'next_session_pickup'];

    const missingSections: Array<
      'completed' | 'pending' | 'decisions' | 'next_session_pickup'
    > = allSections.filter((s) => !foundSections.has(s));

    // exactOptionalPropertyTypes: only spread optional fields when they have values
    return {
      filePath,
      ...(sessionDate !== undefined && { sessionDate }),
      ...(sessionNumber !== undefined && { sessionNumber }),
      completed,
      pending,
      decisions,
      nextSessionPickup,
      missingSections,
    };
  }
}

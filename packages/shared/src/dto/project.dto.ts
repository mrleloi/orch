/**
 * project.dto.ts — Typed DTOs for Project-related REST responses.
 *
 * I-4: consumers call HTTP API only; no @orch/core imports.
 *
 * Shape reflects what GET /api/v1/projects returns — the core daemon serves
 * Profile objects directly from the project registry cache.
 */

/** DTO returned by GET /api/v1/projects */
export interface ProjectDto {
  /** Unique project identifier (URL-safe, lowercase + hyphens). */
  projectId: string;
  /** Absolute path to the managed project root. */
  rootPath: string;
  /** Name of the ccs profile used when spawning sessions. */
  ccsProfile: string;
  /** Maximum concurrent sessions across all session types. */
  maxConcurrentSessions: number;
}

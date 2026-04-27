/**
 * attach-flow.ts — `orch attach <path>` (interactive flow)
 *
 * Detects project root, interactively builds .orch/profile.yaml,
 * optionally injects hooks (delegates to Task 4.5 utility via stub).
 *
 * Non-TTY support: --no-interactive flag with env var fallbacks:
 *   ORCH_PRIMARY_PROFILE       → ccs.primary_profile
 *   ORCH_FALLBACK_PROFILES     → ccs.fallback_profiles (comma-separated)
 *   ORCH_INJECT_HOOKS          → "yes"/"no"
 *   ORCH_TELEGRAM_NOTIFICATIONS → "yes"/"no"
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { injectHooks as injectHooksImpl, DomainError } from './inject-hooks.js';

// ── Re-export NotImplementedError for backwards-compat with Task 4.4 tests ────

export class NotImplementedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'NotImplementedError';
  }
}

/**
 * Injects Orch hooks into <projectPath>/.claude/settings.json (Task 4.5).
 *
 * Charter S4 triple safety is enforced inside injectHooksImpl:
 *   1. Validates JSON before writing (aborts on parse failure)
 *   2. Atomic backup written BEFORE mutation
 *   3. Atomic write via fs.rename (tmp → final)
 *
 * Throws DomainError on settings validation failures.
 */
export function injectHooks(projectPath: string): void {
  injectHooksImpl(projectPath);
}

// ── Profile shape ─────────────────────────────────────────────────────────────

export interface ProjectProfile {
  name: string;
  ccs: {
    primary_profile: string;
    fallback_profiles: string[];
  };
  inject_hooks: boolean;
  telegram_notifications: boolean;
}

// ── Prompt helpers (injectable for tests) ─────────────────────────────────────

export interface AttachFlowPrompts {
  input: (opts: { message: string; default?: string }) => Promise<string>;
  confirm: (opts: { message: string; default?: boolean }) => Promise<boolean>;
}

async function defaultPrompts(): Promise<AttachFlowPrompts> {
  const { input, confirm } = await import('@inquirer/prompts');
  return {
    input: (opts) =>
      opts.default !== undefined
        ? input({ message: opts.message, default: opts.default })
        : input({ message: opts.message }),
    confirm: (opts) =>
      opts.default !== undefined
        ? confirm({ message: opts.message, default: opts.default })
        : confirm({ message: opts.message }),
  };
}

// ── Main entry ─────────────────────────────────────────────────────────────────

export interface AttachFlowOptions {
  noInteractive?: boolean;
  /** Injectable prompts implementation for testing */
  prompts?: AttachFlowPrompts;
}

export async function runAttachFlow(
  projectPath: string,
  options: AttachFlowOptions = {},
): Promise<void> {
  const absPath = path.resolve(projectPath);

  // Validate path exists
  if (!fs.existsSync(absPath)) {
    console.error(`Error: path does not exist: ${absPath}`);
    process.exit(1);
  }

  // Detect project root: presence of .git/ or .claude/
  const hasGit = fs.existsSync(path.join(absPath, '.git'));
  const hasClaude = fs.existsSync(path.join(absPath, '.claude'));
  const isProjectRoot = hasGit || hasClaude;

  if (!isProjectRoot) {
    if (options.noInteractive) {
      console.error(
        `Error: ${absPath} does not appear to be a project root (no .git/ or .claude/ found).\n` +
          `Add --no-interactive requires a detectable project root.`,
      );
      process.exit(1);
    }
    // In interactive mode, ask user to confirm
    const prompts = options.prompts ?? (await defaultPrompts());
    const confirmed = await prompts.confirm({
      message: `${absPath} has no .git/ or .claude/. Continue anyway?`,
      default: false,
    });
    if (!confirmed) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Check if profile already exists
  const orchDir = path.join(absPath, '.orch');
  const profilePath = path.join(orchDir, 'profile.yaml');
  const profileExists = fs.existsSync(profilePath);

  if (profileExists) {
    if (options.noInteractive) {
      console.error(
        `Error: .orch/profile.yaml already exists at ${absPath}.\n` +
          `Remove it manually before re-attaching in --no-interactive mode.`,
      );
      process.exit(1);
    }

    const prompts = options.prompts ?? (await defaultPrompts());
    const overwrite = await prompts.confirm({
      message: `.orch/profile.yaml already exists. Overwrite?`,
      default: false,
    });
    if (!overwrite) {
      console.log('Attach cancelled — existing profile unchanged.');
      return;
    }
  }

  // Gather profile fields
  const projectName = path.basename(absPath);
  let profile: ProjectProfile;

  if (options.noInteractive) {
    // Env-var driven
    const primaryProfile = process.env['ORCH_PRIMARY_PROFILE'];
    const fallbackProfilesRaw = process.env['ORCH_FALLBACK_PROFILES'];
    const injectHooksRaw = process.env['ORCH_INJECT_HOOKS'];
    const telegramRaw = process.env['ORCH_TELEGRAM_NOTIFICATIONS'];

    if (!primaryProfile) {
      console.error(
        `Error: missing required env var ORCH_PRIMARY_PROFILE (--no-interactive mode).`,
      );
      process.exit(1);
    }

    const injectHooks = resolveYesNo(injectHooksRaw, true);
    const telegramNotifications = resolveYesNo(telegramRaw, false);
    const fallbackProfiles =
      fallbackProfilesRaw != null && fallbackProfilesRaw.trim() !== ''
        ? fallbackProfilesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    profile = {
      name: projectName,
      ccs: {
        primary_profile: primaryProfile,
        fallback_profiles: fallbackProfiles,
      },
      inject_hooks: injectHooks,
      telegram_notifications: telegramNotifications,
    };
  } else {
    // Interactive
    const prompts = options.prompts ?? (await defaultPrompts());

    const name = await prompts.input({ message: 'Project name:', default: projectName });
    const primaryProfile = await prompts.input({
      message: 'CCS primary profile:',
      default: 'default',
    });
    const fallbackProfilesInput = await prompts.input({
      message: 'CCS fallback profiles (comma-separated, leave blank for none):',
      default: '',
    });
    const injectHooks = await prompts.confirm({
      message: 'Inject Orch hooks into .claude/settings.json?',
      default: true,
    });
    const telegramNotifications = await prompts.confirm({
      message: 'Enable Telegram notifications for this project?',
      default: false,
    });

    const fallbackProfiles =
      fallbackProfilesInput.trim() !== ''
        ? fallbackProfilesInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    profile = {
      name,
      ccs: {
        primary_profile: primaryProfile,
        fallback_profiles: fallbackProfiles,
      },
      inject_hooks: injectHooks,
      telegram_notifications: telegramNotifications,
    };
  }

  // Write profile.yaml
  fs.mkdirSync(orchDir, { recursive: true });
  const profileYaml = yaml.dump(profile, { lineWidth: 120 });
  fs.writeFileSync(profilePath, profileYaml, 'utf8');
  console.log(`Wrote .orch/profile.yaml → ${profilePath}`);

  // Inject hooks if requested
  if (profile.inject_hooks) {
    try {
      injectHooks(absPath);
      console.log(`Injected Orch hooks → ${path.join(absPath, '.claude', 'settings.json')}`);
    } catch (err) {
      if (err instanceof DomainError) {
        console.error(`Hook injection failed: ${err.message}`);
        console.error(`Settings.json left untouched. Fix the issue and re-run 'orch attach'.`);
        process.exit(1);
      }
      throw err;
    }
  }

  // Summary
  console.log('');
  console.log('── Attach Summary ────────────────────────────────────');
  console.log(`  Project          : ${profile.name}`);
  console.log(`  Path             : ${absPath}`);
  console.log(`  Profile          : ${profilePath}`);
  console.log(`  Primary CCS      : ${profile.ccs.primary_profile}`);
  if (profile.ccs.fallback_profiles.length > 0) {
    console.log(`  Fallback CCS     : ${profile.ccs.fallback_profiles.join(', ')}`);
  }
  console.log(`  Hook injection   : ${profile.inject_hooks ? 'yes' : 'no'}`);
  console.log(`  Telegram notify  : ${profile.telegram_notifications ? 'yes' : 'no'}`);
  console.log('──────────────────────────────────────────────────────');
}

function resolveYesNo(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null) return defaultValue;
  const lower = raw.trim().toLowerCase();
  if (lower === 'yes' || lower === '1' || lower === 'true') return true;
  if (lower === 'no' || lower === '0' || lower === 'false') return false;
  return defaultValue;
}

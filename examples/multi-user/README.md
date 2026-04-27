# Multi-User Tenancy Demo

Demonstrates the file-level workspace separation introduced in Orch v2.3
(substage 8.6.2, ratified by Decision 029).

## What it proves

Two users — **alice** and **bob** — each own a personal project workspace
and share one joint project. The demo verifies that:

1. **alice** can access the shared project (`shared-projects/proj-x`)
2. **alice** cannot access **bob**'s personal workspace
3. **bob** cannot access **alice**'s personal workspace
4. A path-traversal attempt (`../../bob/...`) throws `TenancyViolationError`

The assertions run entirely in-process via `ScopeResolver` — no filesystem
ACLs, no daemon, no network. This tests the runtime enforcement layer
(defence-in-depth layer 2 per tenancy-model.md §4).

## How to run

```bash
# From the repository root:
bash examples/multi-user/demo.sh
```

Prerequisites: `pnpm install` (tsx must be present in `node_modules/.bin/`).

No build step needed — tsx imports the TypeScript source directly.

## Runtime strategy

The demo uses **tsx** (TypeScript Execute) to import `scope-resolver.ts`
directly from source, avoiding a `pnpm build` step. tsx v4+ handles ESM
TypeScript natively; the `pathToFileURL()` conversion in `check-isolation.mjs`
ensures Windows-compatible dynamic import.

## Files

| File | Purpose |
|---|---|
| `demo.sh` | Shell driver: creates scratch workspace, writes sentinels, runs assertions, cleans up |
| `check-isolation.mjs` | Node assertion driver: imports ScopeResolver, runs 4 assertions |
| `.scratch/` | Temporary workspace (gitignored; created + deleted by demo.sh; preserved on failure) |

## Tenancy layout exercised

```
.scratch/agent-workspace/
  alice/
    projects/
      personal/          ← alice's private workspace
        A_SECRET.txt
  bob/
    projects/
      personal/          ← bob's private workspace
        B_SECRET.txt
  shared-projects/
    proj-x/              ← shared zone, both users have access
      SHARED.txt
```

For the full tenancy model spec, see:
`agent-workspace/constitution/tenancy-model.md`

**Scenario 2 (shared project, personal token / rate-limit failover) is deferred to substage 8.7.**
It requires live ccs profile isolation + OTEL trace tag verification, which is out of scope for this
file-level tenancy demo. See tenancy-model.md §6.2.

Docs: https://api.hevyapp.com/docs/#/RoutineFolders/get_v1_routine_folders
OpenAPI JSON: https://api.hevyapp.com/docs.json
Get api key from: https://hevy.com/settings?developer

<!-- CLI usage and dry-run behavior from package.json scripts, hevy-routine-import.ts, and programs/sync.ts -->
## Usage

> **Note:** do not use a `--` separator before the flags. The arg parser
> rejects a bare `--`, so pass flags directly (e.g. `pnpm start:half-marathon
> --week 1`, not `pnpm start:half-marathon -- --week 1`).

```bash
# Powerlifting — `powerlifting` ALWAYS points at the latest phase (currently
# Phase 2), so `pnpm start` is the safe "run the current program" default.
pnpm start
pnpm start:powerlifting --dry-run
pnpm start:powerlifting --week 5
pnpm start:powerlifting --week 1-3

# Pin a specific phase explicitly (preserved for historical re-syncs):
pnpm start:powerlifting-phase1 --dry-run   # original block
pnpm start:powerlifting-phase2 --week 1    # rebuild & push (DL 190, Bench 115,
                                           # high-bar squat 120 + BSS)

# Half marathon (40 weeks, 3 runs/week, with warmup + cooldown protocols)
pnpm start:half-marathon --dry-run
pnpm start:half-marathon --week 1
pnpm start:half-marathon --from-week 9
```

`--program <powerlifting|powerlifting-phase1|powerlifting-phase2|half-marathon>`
selects which CSV to import. The bare **`powerlifting`** key is an alias for the
latest phase (set by `LATEST_POWERLIFTING_CONFIG` in `programs/powerlifting.ts`),
so the default workflow never accidentally syncs an old plan; the numbered
`powerlifting-phaseN` keys stay available for deliberate historical runs. Each
program creates one Hevy routine folder per week and one routine per session
(per day for powerlifting; per run for half marathon). Half marathon routines
preload the Hevy "Running" exercise with the planned distance and bracket it
with phase-appropriate warmup and cooldown moves from the protocols CSV.

Imports are typically run one week at a time (`--week N`) to stay within Hevy's
API rate limits.

Dry runs still print the plan in the terminal, and also write a static HTML
preview to `dry-run-reports/<program>.html` and auto-open it in your browser. If
`HEVY_API_KEY` is present, the dry run fetches your Hevy exercise templates and
flags exercise matches below 80% confidence so suspicious matches are easier to
review before syncing.

### CI (GitHub Actions)

The **Sync Hevy Routines** workflow runs the import via `workflow_dispatch`.
Pick the **program** from the dropdown — leave it on the default `powerlifting`
to sync the latest phase, or choose `powerlifting-phase1` /
`powerlifting-phase2` / `half-marathon` explicitly — and optionally set
`week` / `from_week`; `HEVY_API_KEY` comes from repo secrets.
</content>

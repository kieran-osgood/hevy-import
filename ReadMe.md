Docs: https://api.hevyapp.com/docs/#/RoutineFolders/get_v1_routine_folders
OpenAPI JSON: https://api.hevyapp.com/docs.json
Get api key from: https://hevy.com/settings?developer

## Usage

> **Note:** do not use a `--` separator before the flags. The arg parser
> rejects a bare `--`, so pass flags directly (e.g. `pnpm start:half-marathon
> --week 1`, not `pnpm start:half-marathon -- --week 1`).

```bash
# Powerlifting (default — matches the original behaviour)
pnpm start
pnpm start:powerlifting --dry-run
pnpm start:powerlifting --week 5
pnpm start:powerlifting --week 1-3

# Half marathon (40 weeks, 3 runs/week, with warmup + cooldown protocols)
pnpm start:half-marathon --dry-run
pnpm start:half-marathon --week 1
pnpm start:half-marathon --from-week 9
```

`--program <powerlifting|half-marathon>` selects which CSV to import. Each
program creates one Hevy routine folder per week and one routine per session
(per day for powerlifting; per run for half marathon). Half marathon routines
preload the Hevy "Running" exercise with the planned distance and bracket it
with phase-appropriate warmup and cooldown moves from the protocols CSV.

Imports are typically run one week at a time (`--week N`) to stay within Hevy's
API rate limits.

### CI (GitHub Actions)

The **Sync Hevy Routines** workflow runs the import via `workflow_dispatch`.
Pick the **program** (`powerlifting` or `half-marathon`) from the dropdown and
optionally set `week` / `from_week`; `HEVY_API_KEY` comes from repo secrets.
</content>

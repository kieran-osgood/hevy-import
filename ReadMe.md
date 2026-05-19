Docs: https://api.hevyapp.com/docs/#/RoutineFolders/get_v1_routine_folders
OpenAPI JSON: https://api.hevyapp.com/docs.json
Get api key from: https://hevy.com/settings?developer

## Usage

```bash
# Powerlifting (default — matches the original behaviour)
pnpm start
pnpm start:powerlifting -- --dry-run
pnpm start:powerlifting -- --week 5
pnpm start:powerlifting -- --week 1-3

# Half marathon (40 weeks, 3 runs/week, with warmup + cooldown protocols)
pnpm start:half-marathon -- --dry-run
pnpm start:half-marathon -- --week 1
pnpm start:half-marathon -- --from-week 9
```

`--program <powerlifting|half-marathon>` selects which CSV to import. Each
program creates one Hevy routine folder per week and one routine per session
(per day for powerlifting; per run for half marathon). Half marathon routines
preload the Hevy "Running" exercise with the planned distance and bracket it
with phase-appropriate warmup and cooldown moves from the protocols CSV.
</content>

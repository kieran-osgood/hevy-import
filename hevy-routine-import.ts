import {
  buildPowerliftingPlan,
  POWERLIFTING_CONFIGS,
} from "./programs/powerlifting.js";
import { buildHalfMarathonPlan } from "./programs/half-marathon.js";
import { syncRoutinePlan } from "./programs/sync.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function getFlagValue(flag: string): string | undefined {
  const eqIdx = args.findIndex((a) => a.startsWith(`${flag}=`));
  if (eqIdx !== -1) return args[eqIdx].split("=")[1];
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  return undefined;
}

const programArg = getFlagValue("--program") ?? "powerlifting";
const isPowerlifting = programArg in POWERLIFTING_CONFIGS;
if (!isPowerlifting && programArg !== "half-marathon") {
  console.error(
    `❌ Unknown --program "${programArg}". Valid: ${Object.keys(
      POWERLIFTING_CONFIGS
    ).join(", ")}, half-marathon`
  );
  process.exit(1);
}

const weekArg = getFlagValue("--week");
const fromWeekArg = getFlagValue("--from-week");

const knownFlags = new Set(["--dry-run", "--week", "--from-week", "--program"]);
const unknown = args.filter(
  (a) =>
    a.startsWith("--") &&
    !knownFlags.has(a) &&
    !a.startsWith("--week=") &&
    !a.startsWith("--from-week=") &&
    !a.startsWith("--program=")
);
if (unknown.length > 0) {
  console.error(`❌ Unknown argument(s): ${unknown.join(", ")}`);
  console.error(
    "   Valid flags: --program <powerlifting|half-marathon>, --dry-run, --week <n|n-n>, --from-week <n>"
  );
  process.exit(1);
}

const maxWeek = programArg === "half-marathon" ? 40 : 15;

let weekRange: [number, number] | null = null;
if (weekArg) {
  if (weekArg.includes("-")) {
    const [start, end] = weekArg.split("-").map(Number);
    weekRange = [start, end];
  } else {
    const week = Number(weekArg);
    weekRange = [week, week];
  }
} else if (fromWeekArg) {
  const fromWeek = Number(fromWeekArg);
  weekRange = [fromWeek, maxWeek];
}

if (!process.env.HEVY_API_KEY && !dryRun) {
  console.error("❌ HEVY_API_KEY environment variable is required");
  console.error("   Set it with: export HEVY_API_KEY=your_api_key");
  process.exit(1);
}

async function main() {
  if (weekRange) {
    console.log(`📅 Processing weeks ${weekRange[0]}-${weekRange[1]}\n`);
  } else {
    console.log(`📅 Processing all weeks (1-${maxWeek})\n`);
  }

  const plan =
    programArg === "half-marathon"
      ? await buildHalfMarathonPlan(weekRange)
      : await buildPowerliftingPlan(
          weekRange,
          POWERLIFTING_CONFIGS[programArg]
        );

  await syncRoutinePlan(plan, { dryRun });
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});

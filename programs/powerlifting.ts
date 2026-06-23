import { createReadStream } from "fs";
import { parse } from "csv-parse";
import type {
  CsvRow,
  HevySet,
  PlannedExerciseSpec,
  PlannedFolder,
  PlannedRoutine,
  ParsedDay,
  ParsedExercise,
  ParsedWeek,
  RoutinePlan,
} from "../types.js";

export interface PowerliftingConfig {
  /** CSV filename relative to the repo root (resolved against this module). */
  csvFile: string;
  /** Human-readable label used for logging / plan metadata. */
  programLabel: string;
  /** Suffix used to build the legacy ("old") folder/routine alternate titles. */
  programSuffix: string;
}

const PHASE1_CONFIG: PowerliftingConfig = {
  csvFile: "../16-week-powerlifting-phase1.csv",
  // NOTE: suffix preserved from the original program so the importer still
  // matches/updates the Hevy folders this phase originally created.
  programLabel: "PL Program - P1",
  programSuffix: "15 Week Periodized Program",
};

const PHASE2_CONFIG: PowerliftingConfig = {
  csvFile: "../16-week-powerlifting-phase2.csv",
  programLabel: "PL Program - P2",
  programSuffix: "Phase 2 - Rebuild and Push",
};

// The "current" phase. Bump this pointer when a new phase is added — the bare
// `powerlifting` key (and `pnpm start`) always follow it, so the default path
// is the latest program and old phases are only run when named explicitly.
const LATEST_POWERLIFTING_CONFIG = PHASE2_CONFIG;

export const POWERLIFTING_CONFIGS: Record<string, PowerliftingConfig> = {
  // Bare key = latest phase (safe default; avoids accidentally syncing an old plan).
  powerlifting: LATEST_POWERLIFTING_CONFIG,
  // Explicit pinned phases, preserved for historical re-syncs.
  "powerlifting-phase1": PHASE1_CONFIG,
  "powerlifting-phase2": PHASE2_CONFIG,
};

// 4-week Light/Medium/Heavy/Deload cycle, then test weeks
function getWeekLabel(weekNum: number): string {
  if (weekNum <= 12) {
    return ["Light", "Medium", "Heavy", "Deload"][(weekNum - 1) % 4];
  }
  if (weekNum === 13) return "TM Test";
  if (weekNum === 14) return "PR Test";
  return "Recovery"; // 15
}

function cleanDayName(dayName: string): string {
  return dayName.replace(/\s*\((?:DELOAD|TEST)\)\s*$/, "");
}

async function parseCsv(csvUrl: URL): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    createReadStream(csvUrl)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on("data", (row: CsvRow) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function groupByWeekAndDay(rows: CsvRow[]): ParsedWeek[] {
  const weeks = new Map<number, Map<string, ParsedExercise[]>>();

  for (const row of rows) {
    const weekNum = parseInt(row.WEEK, 10);
    if (isNaN(weekNum) || weekNum > 15) continue;

    if (!weeks.has(weekNum)) {
      weeks.set(weekNum, new Map());
    }

    const dayExercises = weeks.get(weekNum)!;
    if (!dayExercises.has(row.DAY)) {
      dayExercises.set(row.DAY, []);
    }

    let weightKg: number | "BW" | "Select" | null = null;
    if (row["WEIGHT (kg)"] === "BW") {
      weightKg = "BW";
    } else if (
      row["WEIGHT (kg)"] === "Select" ||
      row["WEIGHT (kg)"] === "-"
    ) {
      weightKg = "Select";
    } else {
      const parsed = parseFloat(row["WEIGHT (kg)"]);
      if (!isNaN(parsed)) weightKg = parsed;
    }

    let reps: number | "AMRAP" | "Easy" | null = null;
    if (row.REPS === "AMRAP") reps = "AMRAP";
    else if (row.REPS === "Easy") reps = "Easy";
    else if (row.REPS !== "-") {
      const parsed = parseInt(row.REPS, 10);
      if (!isNaN(parsed)) reps = parsed;
    }

    const sets = parseInt(row.SETS, 10) || 0;

    dayExercises.get(row.DAY)!.push({
      name: row.EXERCISE,
      sets,
      reps,
      percentTm: row["% TM"],
      weightKg,
      notes: row.NOTES,
    });
  }

  const result: ParsedWeek[] = [];
  for (const [weekNum, days] of weeks) {
    const parsedDays: ParsedDay[] = [];
    for (const [dayFull, exercises] of days) {
      const parts = dayFull.split(" - ");
      parsedDays.push({
        dayCode: parts[0],
        dayName: parts[1] || parts[0],
        exercises,
      });
    }
    result.push({ weekNumber: weekNum, days: parsedDays });
  }

  return result.sort((a, b) => a.weekNumber - b.weekNumber);
}

function buildExerciseNotes(
  exercise: ParsedExercise,
  extraNotes: string[] = []
): string {
  const parts: string[] = [];
  if (exercise.percentTm && exercise.percentTm !== "-") {
    parts.push(`${exercise.percentTm} TM`);
  }
  parts.push(...extraNotes.filter(Boolean));
  if (exercise.notes) parts.push(exercise.notes);
  return parts.join(" - ");
}

function buildSets(exercise: ParsedExercise): HevySet[] {
  const sets: HevySet[] = [];
  if (exercise.sets === 0 || exercise.weightKg === "Select") return sets;

  for (let i = 0; i < exercise.sets; i++) {
    const set: HevySet = { type: "normal" };
    if (exercise.weightKg === "BW") {
      set.weight_kg = null;
    } else if (typeof exercise.weightKg === "number") {
      set.weight_kg = exercise.weightKg;
    }
    if (exercise.reps === "AMRAP" || exercise.reps === "Easy") {
      set.reps = null;
    } else if (typeof exercise.reps === "number") {
      set.reps = exercise.reps;
    }
    sets.push(set);
  }
  return sets;
}

interface NormalizedExerciseEntry {
  name: string;
  extraNotes: string[];
}

function noteAlreadyMentions(rawNotes: string, phrase: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[-_]/g, " ");
  return normalize(rawNotes).includes(normalize(phrase));
}

function baseLiftName(name: string): string {
  const lower = name.toLowerCase();
  if (
    /^(?:light\s+)?(?:high\s+bar\s+)?back\s+squat(?:\s+\(backoff\)|\s+-\s+new\s+1rm)?$/.test(
      lower
    ) ||
    /^(?:light\s+)?high\s+bar\s+squat(?:\s+\(backoff\)|\s+-\s+new\s+1rm)?$/.test(
      lower
    ) ||
    lower === "light squat"
  ) {
    return "Back Squat";
  }
  if (
    /^(?:light\s+)?bench\s+press(?:\s+\(backoff\)|\s+-\s+new\s+1rm)?$/.test(
      lower
    ) ||
    lower === "light bench"
  ) {
    return "Bench Press";
  }
  if (/^(?:light\s+)?deadlift(?:\s+\(backoff\)|\s+-\s+new\s+1rm)?$/.test(lower)) {
    return "Deadlift";
  }
  return name;
}

function findPreviousWorkingWeight(
  dayExercises: ParsedExercise[],
  currentIndex: number,
  normalizedName: string
): number | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = dayExercises[i];
    if (
      baseLiftName(candidate.name) === normalizedName &&
      typeof candidate.weightKg === "number"
    ) {
      return candidate.weightKg;
    }
  }
  return null;
}

function backoffNote(
  exercise: ParsedExercise,
  dayExercises: ParsedExercise[],
  currentIndex: number,
  normalizedName: string
): string {
  const previousWeight = findPreviousWorkingWeight(
    dayExercises,
    currentIndex,
    normalizedName
  );
  if (previousWeight && typeof exercise.weightKg === "number") {
    const percentOfWorkingWeight = Math.round(
      (exercise.weightKg / previousWeight) * 100
    );
    return `Backoff sets at ${percentOfWorkingWeight}% of working weight`;
  }
  return "Backoff sets";
}

function normalizePowerliftingExercise(
  exercise: ParsedExercise,
  dayExercises: ParsedExercise[],
  currentIndex: number
): NormalizedExerciseEntry[] {
  const name = exercise.name;
  const lower = name.toLowerCase();
  const extraNotes: string[] = [];

  const addHighBarNote = () => {
    if (!noteAlreadyMentions(exercise.notes, "high bar")) {
      extraNotes.push("High bar");
    }
  };

  if (name === "Cable Woodchop") {
    const sharedNotes = ["Cable woodchop split by direction"];
    return [
      {
        name: "Cable Twist (up to down)",
        extraNotes: [...sharedNotes, "Up-to-down direction"],
      },
      {
        name: "Cable Twist (Down to up)",
        extraNotes: [...sharedNotes, "Down-to-up direction"],
      },
    ];
  }

  if (name === "Larsen Press (feet up)") {
    return [
      {
        name: "Feet Up Bench Press (Barbell)",
        extraNotes: ["Larsen press / feet-up bench"],
      },
    ];
  }

  const pauseMatch = /^Pause Squat \((\d+) sec\)$/.exec(name);
  if (pauseMatch) {
    return [
      {
        name: "Pause Squat (Barbell)",
        extraNotes: [`${pauseMatch[1]} sec pause`],
      },
    ];
  }

  if (name === "Ring Dip") {
    return [{ name: "Ring Dips", extraNotes }];
  }

  if (name === "Inverted Row (Rings)") {
    return [{ name: "Inverted Row", extraNotes: ["Rings"] }];
  }

  if (lower.includes("high bar squat")) {
    addHighBarNote();
  }

  if (lower.includes("backoff")) {
    const normalizedName = baseLiftName(name);
    extraNotes.push(
      backoffNote(exercise, dayExercises, currentIndex, normalizedName)
    );
    return [{ name: normalizedName, extraNotes }];
  }

  if (lower.startsWith("light ")) {
    const normalizedName = baseLiftName(name);
    extraNotes.push("Light / recovery sets");
    return [{ name: normalizedName, extraNotes }];
  }

  if (lower.includes("new 1rm")) {
    const normalizedName = baseLiftName(name);
    extraNotes.push("New 1RM attempt");
    return [{ name: normalizedName, extraNotes }];
  }

  if (name === "High Bar Squat") {
    return [{ name: "Back Squat", extraNotes }];
  }

  return [{ name, extraNotes }];
}

export async function buildPowerliftingPlan(
  weekRange: [number, number] | null,
  config: PowerliftingConfig = PHASE1_CONFIG
): Promise<RoutinePlan> {
  const csvUrl = new URL(config.csvFile, import.meta.url);
  console.log(`📄 Parsing powerlifting CSV (${config.programLabel})...`);
  const csvRows = await parseCsv(csvUrl);
  console.log(`   Found ${csvRows.length} rows\n`);

  console.log("📊 Grouping exercises by week and day...");
  let weeks = groupByWeekAndDay(csvRows);
  if (weekRange) {
    weeks = weeks.filter(
      (w) => w.weekNumber >= weekRange[0] && w.weekNumber <= weekRange[1]
    );
  }
  console.log(`   Found ${weeks.length} weeks to process\n`);

  const uniqueExerciseNames = new Set<string>();

  const folders: PlannedFolder[] = [];
  for (const week of weeks) {
    const weekLabel = getWeekLabel(week.weekNumber);
    const folderTitle = `Week ${week.weekNumber} / 15 - (${weekLabel})`;
    const oldFolderTitle = `Week ${week.weekNumber} - ${config.programSuffix}`;

    const routines: PlannedRoutine[] = [];
    for (const day of week.days) {
      const cleaned = cleanDayName(day.dayName);
      const routineTitle =
        cleaned.toLowerCase() === weekLabel.toLowerCase()
          ? `Week ${week.weekNumber} - ${cleaned}`
          : `Week ${week.weekNumber} - ${cleaned} (${weekLabel})`;
      const prevRoutineTitle = `Week ${week.weekNumber} - ${day.dayName}`;
      const oldRoutineTitle = day.dayName;

      const exercises: PlannedExerciseSpec[] = [];
      for (const [index, ex] of day.exercises.entries()) {
        const sets = buildSets(ex);
        if (sets.length === 0) continue;

        const normalizedEntries = normalizePowerliftingExercise(
          ex,
          day.exercises,
          index
        );

        for (const entry of normalizedEntries) {
          let notes = buildExerciseNotes(ex, entry.extraNotes);
          if (ex.reps === "AMRAP") {
            notes = notes ? `AMRAP - ${notes}` : "AMRAP";
          } else if (ex.reps === "Easy") {
            notes = notes ? `Easy reps - ${notes}` : "Easy reps";
          }

          const isCompound = ex.percentTm && ex.percentTm !== "-";
          const rest_seconds = isCompound ? 120 : 45;

          uniqueExerciseNames.add(entry.name);
          exercises.push({
            name: entry.name,
            sets,
            ...(notes ? { notes } : {}),
            rest_seconds,
          });
        }
      }

      routines.push({
        title: routineTitle,
        notes: `Week ${week.weekNumber}`,
        alternateTitles: [prevRoutineTitle, oldRoutineTitle],
        exercises,
      });
    }

    folders.push({
      title: folderTitle,
      alternateTitles: [oldFolderTitle],
      routines,
    });
  }

  return {
    programLabel: config.programLabel,
    uniqueExerciseNames,
    folders,
  };
}

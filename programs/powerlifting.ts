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

const CSV_PATH = new URL(
  "../16-week-powerlifting-program.csv",
  import.meta.url
);
const PROGRAM_SUFFIX = "15 Week Periodized Program";

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

async function parseCsv(): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    createReadStream(CSV_PATH)
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

function buildExerciseNotes(exercise: ParsedExercise): string {
  const parts: string[] = [];
  if (exercise.percentTm && exercise.percentTm !== "-") {
    parts.push(`${exercise.percentTm} TM`);
  }
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

export async function buildPowerliftingPlan(
  weekRange: [number, number] | null
): Promise<RoutinePlan> {
  console.log("📄 Parsing powerlifting CSV...");
  const csvRows = await parseCsv();
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
  for (const week of weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) uniqueExerciseNames.add(ex.name);
    }
  }

  const folders: PlannedFolder[] = [];
  for (const week of weeks) {
    const weekLabel = getWeekLabel(week.weekNumber);
    const folderTitle = `Week ${week.weekNumber} / 15 - (${weekLabel})`;
    const oldFolderTitle = `Week ${week.weekNumber} - ${PROGRAM_SUFFIX}`;

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
      for (const ex of day.exercises) {
        const sets = buildSets(ex);
        if (sets.length === 0) continue;

        let notes = buildExerciseNotes(ex);
        if (ex.reps === "AMRAP") {
          notes = notes ? `AMRAP - ${notes}` : "AMRAP";
        } else if (ex.reps === "Easy") {
          notes = notes ? `Easy reps - ${notes}` : "Easy reps";
        }

        const isCompound = ex.percentTm && ex.percentTm !== "-";
        const rest_seconds = isCompound ? 120 : 45;

        exercises.push({
          name: ex.name,
          sets,
          ...(notes ? { notes } : {}),
          rest_seconds,
        });
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
    programLabel: "16 Week Powerlifting Program",
    uniqueExerciseNames,
    folders,
  };
}

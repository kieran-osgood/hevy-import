import { createReadStream } from "fs";
import { parse } from "csv-parse";
import type {
  HalfMarathonWeekCsvRow,
  HalfMarathonProtocolCsvRow,
  HevySet,
  PlannedExerciseSpec,
  PlannedFolder,
  PlannedRoutine,
  RoutinePlan,
} from "../types.js";

const WEEK_CSV_PATH = new URL(
  "../40-week-half-marathon-program.csv",
  import.meta.url
);
const PROTOCOL_CSV_PATH = new URL(
  "../40-week-half-marathon-protocols.csv",
  import.meta.url
);

const MAX_WEEKS = 40;

interface ParsedRun {
  runNumber: 1 | 2 | 3;
  runType: string;
  distanceKm: number;
  notes: string;
}

interface ParsedWeek {
  weekNumber: number;
  phase: number;
  phaseName: string;
  month: number;
  runs: ParsedRun[];
  liftingGuidance: string;
  keyFocus: string;
  watchFor: string;
}

interface ParsedProtocolExercise {
  order: number;
  exercise: string;
  setsRepsDuration: string;
  notes: string;
}

interface PhaseProtocols {
  preRunWarmup: ParsedProtocolExercise[];
  postRunCooldown: ParsedProtocolExercise[];
}

async function readCsv<T>(url: URL): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    createReadStream(url)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (row: T) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function parseWeekRows(rows: HalfMarathonWeekCsvRow[]): ParsedWeek[] {
  const weeks: ParsedWeek[] = [];
  for (const row of rows) {
    const weekNum = parseInt(row.week, 10);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > MAX_WEEKS) continue;

    const runs: ParsedRun[] = [];
    for (const n of [1, 2, 3] as const) {
      const type = row[`run${n}_type` as keyof HalfMarathonWeekCsvRow] as string;
      const distStr = row[
        `run${n}_distance_km` as keyof HalfMarathonWeekCsvRow
      ] as string;
      const notes = row[
        `run${n}_notes` as keyof HalfMarathonWeekCsvRow
      ] as string;
      const distance = parseFloat(distStr);
      if (!type || isNaN(distance) || distance <= 0) continue;
      runs.push({
        runNumber: n,
        runType: type,
        distanceKm: distance,
        notes: notes || "",
      });
    }

    weeks.push({
      weekNumber: weekNum,
      phase: parseInt(row.phase, 10) || 0,
      phaseName: row.phase_name,
      month: parseInt(row.month, 10) || 0,
      runs,
      liftingGuidance: row.lifting_guidance || "",
      keyFocus: row.key_focus || "",
      watchFor: row.watch_for || "",
    });
  }
  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
}

function groupProtocolsByPhase(
  rows: HalfMarathonProtocolCsvRow[]
): Map<number, PhaseProtocols> {
  const map = new Map<number, PhaseProtocols>();
  for (const row of rows) {
    const phase = parseInt(row.phase, 10);
    if (isNaN(phase)) continue;
    if (!map.has(phase)) {
      map.set(phase, { preRunWarmup: [], postRunCooldown: [] });
    }
    const bucket = map.get(phase)!;
    const entry: ParsedProtocolExercise = {
      order: parseInt(row.order, 10) || 0,
      exercise: row.exercise,
      setsRepsDuration: row.sets_reps_duration,
      notes: row.notes || "",
    };
    if (row.protocol_type === "pre_run_warmup") bucket.preRunWarmup.push(entry);
    else if (row.protocol_type === "post_run_cooldown")
      bucket.postRunCooldown.push(entry);
    // lifting_guidance rows are surfaced via routine notes, not as exercises
  }
  for (const bucket of map.values()) {
    bucket.preRunWarmup.sort((a, b) => a.order - b.order);
    bucket.postRunCooldown.sort((a, b) => a.order - b.order);
  }
  return map;
}

// ---------------- sets_reps_duration parser ----------------

interface ParsedSetSpec {
  sets: HevySet[];
  noteSuffix?: string;
  // If the spec is unparseable, the routine builder folds the raw string into
  // the exercise notes and emits no exercise at all (it's guidance, not work).
  unparseable?: boolean;
}

// Try to parse strings like:
//   "3x10 each side"
//   "3x20-30s each side"
//   "60s each side"
//   "2x20 steps each direction"
//   "4x100m"
//   "2 mins each foot"
//   "As normal" / "As per Phase 1" / "None — avoid" → unparseable
function parseSetSpec(raw: string): ParsedSetSpec {
  if (!raw) return { sets: [], unparseable: true };
  const trimmed = raw.trim();

  const noteSuffixMatch =
    /\b(each (?:side|leg|foot|direction|variation))\b/i.exec(trimmed);
  const noteSuffix = noteSuffixMatch ? noteSuffixMatch[1] : undefined;

  // Bail out on obviously narrative entries.
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("as per") ||
    lower.startsWith("as normal") ||
    lower.startsWith("none") ||
    lower.startsWith("lighter") ||
    lower.startsWith("abbreviated") ||
    lower.startsWith("maximum") ||
    lower.includes("reintroduce") ||
    lower.includes("drop one") ||
    lower.includes("before picking") ||
    lower.includes("upper body only") ||
    lower.includes("no lifting") ||
    lower.startsWith("1x per") ||
    lower.startsWith("weeks ") ||
    lower.startsWith("race ")
  ) {
    return { sets: [], unparseable: true, noteSuffix };
  }

  const pickUpperBound = (m: string): number => {
    const range = /(\d+)\s*-\s*(\d+)/.exec(m);
    if (range) return parseInt(range[2], 10);
    const single = /(\d+)/.exec(m);
    return single ? parseInt(single[1], 10) : 0;
  };

  // Pattern: N x <num>s   (duration sets, e.g. 3x20-30s, 3x20s)
  let m = /^(\d+)\s*[xX]\s*([\d-]+)\s*s\b/.exec(trimmed);
  if (m) {
    const n = parseInt(m[1], 10);
    const duration = pickUpperBound(m[2]);
    const sets: HevySet[] = [];
    for (let i = 0; i < n; i++)
      sets.push({ type: "normal", duration_seconds: duration });
    return { sets, noteSuffix };
  }

  // Pattern: N x <num>m   (distance sets, e.g. 4x100m, 2x20m)
  m = /^(\d+)\s*[xX]\s*(\d+)\s*m\b/.exec(trimmed);
  if (m) {
    const n = parseInt(m[1], 10);
    const dist = parseInt(m[2], 10);
    const sets: HevySet[] = [];
    for (let i = 0; i < n; i++)
      sets.push({ type: "normal", distance_meters: dist });
    return { sets, noteSuffix };
  }

  // Pattern: N x <num> steps   (treat steps as reps)
  m = /^(\d+)\s*[xX]\s*(\d+)\s*steps?\b/i.exec(trimmed);
  if (m) {
    const n = parseInt(m[1], 10);
    const reps = parseInt(m[2], 10);
    const sets: HevySet[] = [];
    for (let i = 0; i < n; i++) sets.push({ type: "normal", reps });
    return {
      sets,
      noteSuffix: noteSuffix ? `${noteSuffix} (steps)` : "(steps)",
    };
  }

  // Pattern: N x <reps>   (e.g. 3x10, 3x12)
  m = /^(\d+)\s*[xX]\s*(\d+)\b/.exec(trimmed);
  if (m) {
    const n = parseInt(m[1], 10);
    const reps = parseInt(m[2], 10);
    const sets: HevySet[] = [];
    for (let i = 0; i < n; i++) sets.push({ type: "normal", reps });
    return { sets, noteSuffix };
  }

  // Pattern: <num>s   (single duration set, e.g. 90s, 60s)
  m = /^([\d-]+)\s*s\b/.exec(trimmed);
  if (m) {
    return {
      sets: [{ type: "normal", duration_seconds: pickUpperBound(m[1]) }],
      noteSuffix,
    };
  }

  // Pattern: <num> mins   (single duration set, e.g. "2 mins each foot")
  m = /^(\d+)\s*mins?\b/i.exec(trimmed);
  if (m) {
    const minutes = parseInt(m[1], 10);
    return {
      sets: [{ type: "normal", duration_seconds: minutes * 60 }],
      noteSuffix,
    };
  }

  // Pattern: <num> each direction each side   (treat as reps)
  m = /^(\d+)\s*each\s+direction/i.exec(trimmed);
  if (m) {
    const reps = parseInt(m[1], 10);
    return { sets: [{ type: "normal", reps }], noteSuffix };
  }

  // Pattern: <num> each side  (single set, reps = N)
  m = /^(\d+)\s+each/i.exec(trimmed);
  if (m) {
    const reps = parseInt(m[1], 10);
    return { sets: [{ type: "normal", reps }], noteSuffix };
  }

  return { sets: [], unparseable: true, noteSuffix };
}

function joinNotes(...parts: (string | undefined)[]): string | undefined {
  const filtered = parts.filter((p): p is string => !!p && p.trim().length > 0);
  if (filtered.length === 0) return undefined;
  return filtered.join(" — ");
}

function buildProtocolExercise(
  proto: ParsedProtocolExercise,
  defaultRest: number
): { spec: PlannedExerciseSpec | null; guidanceNote?: string } {
  const parsed = parseSetSpec(proto.setsRepsDuration);
  if (parsed.unparseable || parsed.sets.length === 0) {
    // Fold this into routine notes as guidance — e.g. "Lower body: As normal".
    const guidance = `${proto.exercise}: ${proto.setsRepsDuration}${proto.notes ? ` — ${proto.notes}` : ""}`;
    return { spec: null, guidanceNote: guidance };
  }
  return {
    spec: {
      name: proto.exercise,
      sets: parsed.sets,
      notes: joinNotes(parsed.noteSuffix, proto.notes),
      rest_seconds: defaultRest,
    },
  };
}

function buildRunExercise(run: ParsedRun): PlannedExerciseSpec {
  const distanceMeters = Math.round(run.distanceKm * 1000);
  const notes = joinNotes(run.runType, run.notes);
  return {
    name: "Running",
    sets: [{ type: "normal", distance_meters: distanceMeters }],
    notes,
    rest_seconds: 60,
  };
}

export async function buildHalfMarathonPlan(
  weekRange: [number, number] | null
): Promise<RoutinePlan> {
  console.log("📄 Parsing half-marathon CSVs...");
  const weekRows = await readCsv<HalfMarathonWeekCsvRow>(WEEK_CSV_PATH);
  const protocolRows = await readCsv<HalfMarathonProtocolCsvRow>(
    PROTOCOL_CSV_PATH
  );
  console.log(
    `   Found ${weekRows.length} week rows, ${protocolRows.length} protocol rows\n`
  );

  let weeks = parseWeekRows(weekRows);
  if (weekRange) {
    weeks = weeks.filter(
      (w) => w.weekNumber >= weekRange[0] && w.weekNumber <= weekRange[1]
    );
  }
  console.log(`   Found ${weeks.length} weeks to process\n`);

  const protocolsByPhase = groupProtocolsByPhase(protocolRows);

  const uniqueExerciseNames = new Set<string>();
  uniqueExerciseNames.add("Running");

  const folders: PlannedFolder[] = [];
  for (const week of weeks) {
    const protocols = protocolsByPhase.get(week.phase) ?? {
      preRunWarmup: [],
      postRunCooldown: [],
    };

    const folderTitle = `Half Marathon Week ${week.weekNumber} / ${MAX_WEEKS} - ${week.phaseName}`;

    const routines: PlannedRoutine[] = [];
    for (const run of week.runs) {
      const distanceLabel = Number.isInteger(run.distanceKm)
        ? `${run.distanceKm}km`
        : `${run.distanceKm}km`;
      const routineTitle = `Week ${week.weekNumber} / ${MAX_WEEKS} - Run ${run.runNumber} - ${distanceLabel} ${run.runType}`;

      const exercises: PlannedExerciseSpec[] = [];
      const guidanceNotes: string[] = [];

      // Warmup
      for (const proto of protocols.preRunWarmup) {
        const { spec, guidanceNote } = buildProtocolExercise(proto, 30);
        if (spec) {
          exercises.push(spec);
          uniqueExerciseNames.add(spec.name);
        } else if (guidanceNote) {
          guidanceNotes.push(`Warmup — ${guidanceNote}`);
        }
      }

      // Run
      const runSpec = buildRunExercise(run);
      exercises.push(runSpec);

      // Cooldown
      for (const proto of protocols.postRunCooldown) {
        const { spec, guidanceNote } = buildProtocolExercise(proto, 30);
        if (spec) {
          exercises.push(spec);
          uniqueExerciseNames.add(spec.name);
        } else if (guidanceNote) {
          guidanceNotes.push(`Cooldown — ${guidanceNote}`);
        }
      }

      const noteLines: string[] = [];
      if (week.keyFocus) noteLines.push(`Focus: ${week.keyFocus}`);
      if (week.watchFor) noteLines.push(`Watch: ${week.watchFor}`);
      if (week.liftingGuidance)
        noteLines.push(`Lifting: ${week.liftingGuidance}`);
      noteLines.push(...guidanceNotes);

      routines.push({
        title: routineTitle,
        notes: noteLines.length > 0 ? noteLines.join("\n") : undefined,
        exercises,
      });
    }

    folders.push({
      title: folderTitle,
      routines,
    });
  }

  return {
    programLabel: `${MAX_WEEKS} Week Half Marathon Program`,
    uniqueExerciseNames,
    folders,
  };
}

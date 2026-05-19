export interface CsvRow {
  WEEK: string;
  DAY: string;
  EXERCISE: string;
  SETS: string;
  REPS: string;
  "% TM": string;
  "WEIGHT (kg)": string;
  "ACTUAL REPS": string;
  RPE: string;
  NOTES: string;
}

export interface HevyExerciseTemplate {
  id: string;
  title: string;
  type: ExerciseType;
  primary_muscle_group: MuscleGroup;
  secondary_muscle_groups: MuscleGroup[];
  equipment: EquipmentCategory;
  is_custom: boolean;
}

export type ExerciseType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "duration"
  | "distance_duration"
  | "weight_distance";

export type EquipmentCategory =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "other"
  | "weighted_bodyweight"
  | "band"
  | "cardio"
  | "none";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs"
  | "forearms"
  | "other"
  | "full_body"
  | "cardio";

export interface HevySet {
  type: "normal" | "warmup" | "dropset" | "failure";
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
}

export interface HevyRoutineExercise {
  exercise_template_id: string;
  superset_id: number | null;
  rest_seconds?: number;
  notes?: string;
  sets: HevySet[];
}

export interface HevyRoutine {
  title: string;
  folder_id?: number;
  notes?: string;
  exercises: HevyRoutineExercise[];
}

export interface HevyRoutineFolder {
  id?: number;
  title: string;
}

export interface ExerciseMapping {
  csvName: string;
  templateId: string;
  templateTitle: string;
  matchScore: number;
  isCustom: boolean;
}

export interface ParsedExercise {
  name: string;
  sets: number;
  reps: number | "AMRAP" | "Easy" | null;
  percentTm: string;
  weightKg: number | "BW" | "Select" | null;
  notes: string;
}

export interface ParsedDay {
  dayCode: string;
  dayName: string;
  exercises: ParsedExercise[];
}

export interface ParsedWeek {
  weekNumber: number;
  days: ParsedDay[];
}

export interface ApiResponse<T> {
  page: number;
  page_count: number;
  [key: string]: T[] | number;
}

// ---------------- Half marathon CSV row types ----------------

export interface HalfMarathonWeekCsvRow {
  week: string;
  phase: string;
  phase_name: string;
  month: string;
  run1_type: string;
  run1_distance_km: string;
  run1_notes: string;
  run2_type: string;
  run2_distance_km: string;
  run2_notes: string;
  run3_type: string;
  run3_distance_km: string;
  run3_notes: string;
  total_run_km: string;
  lifting_guidance: string;
  key_focus: string;
  watch_for: string;
}

export interface HalfMarathonProtocolCsvRow {
  phase: string;
  phase_name: string;
  protocol_type: string;
  order: string;
  exercise: string;
  sets_reps_duration: string;
  notes: string;
}

// ---------------- Common plan model (shared between programs) ----------------

// Exercise spec carries the source name (CSV exercise name) plus its sets and
// per-exercise notes. The sync pipeline resolves the name → Hevy template id.
export interface PlannedExerciseSpec {
  name: string;
  sets: HevySet[];
  notes?: string;
  rest_seconds?: number;
}

export interface PlannedRoutine {
  title: string;
  notes?: string;
  // Alternate prior titles to match on when updating, so renames don't
  // create duplicates. Used by powerlifting to handle its title migration.
  alternateTitles?: string[];
  exercises: PlannedExerciseSpec[];
}

export interface PlannedFolder {
  title: string;
  alternateTitles?: string[];
  routines: PlannedRoutine[];
}

export interface RoutinePlan {
  programLabel: string;
  uniqueExerciseNames: Set<string>;
  folders: PlannedFolder[];
}

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
}

export interface HevyRoutineExercise {
  exercise_template_id: string;
  superset_id: number | null;
  notes: string;
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

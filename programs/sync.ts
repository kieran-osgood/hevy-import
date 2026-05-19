import {
  buildExerciseMapping,
  getCustomExerciseDefinition,
  CUSTOM_EXERCISES,
} from "../exercise-mapping.js";
import type {
  HevyExerciseTemplate,
  HevyRoutineExercise,
  HevySet,
  RoutinePlan,
  PlannedFolder,
  PlannedRoutine,
  ExerciseMapping,
} from "../types.js";

// API config (shared)
const API_BASE = "https://api.hevyapp.com/v1";

// Rate limiting configuration
const RATE_LIMIT = {
  baseDelay: 3000,
  maxRetries: 5,
  initialBackoff: 5000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | null = null;
  let backoff = RATE_LIMIT.initialBackoff;

  for (let attempt = 0; attempt <= RATE_LIMIT.maxRetries; attempt++) {
    try {
      const result = await fn();
      await sleep(RATE_LIMIT.baseDelay);
      return result;
    } catch (error) {
      lastError = error as Error;
      const errorMsg = lastError.message || "";

      if (errorMsg.includes("429") && attempt < RATE_LIMIT.maxRetries) {
        console.log(
          `   ⏳ Rate limited on ${context}, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${RATE_LIMIT.maxRetries})...`
        );
        await sleep(backoff);
        backoff *= RATE_LIMIT.backoffMultiplier;
      } else {
        throw lastError;
      }
    }
  }

  throw lastError;
}

function apiHeaders(): Record<string, string> {
  return {
    "api-key": process.env.HEVY_API_KEY!,
    "Content-Type": "application/json",
  };
}

async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `API GET ${endpoint} failed: ${response.status} - ${error}`
    );
  }
  return response.json();
}

async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `API POST ${endpoint} failed: ${response.status} - ${text}`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return { id: text } as T;
  }
}

async function apiPut<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "PUT",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `API PUT ${endpoint} failed: ${response.status} - ${error}`
    );
  }
  return response.json();
}

async function fetchAllExerciseTemplates(): Promise<HevyExerciseTemplate[]> {
  const templates: HevyExerciseTemplate[] = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const response = await withRetry(
      () =>
        apiGet<{
          page: number;
          page_count: number;
          exercise_templates: HevyExerciseTemplate[];
        }>(`/exercise_templates?page=${page}&pageSize=100`),
      `fetch exercise templates page ${page}`
    );

    templates.push(...response.exercise_templates);
    pageCount = response.page_count;
    page++;
  }

  return templates;
}

async function fetchAllRoutineFolders(): Promise<
  Array<{ id: number; title: string }>
> {
  const folders: Array<{ id: number; title: string }> = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const response = await withRetry(
      () =>
        apiGet<{
          page: number;
          page_count: number;
          routine_folders: Array<{ id: number; title: string }>;
        }>(`/routine_folders?page=${page}`),
      `fetch routine folders page ${page}`
    );

    folders.push(...response.routine_folders);
    pageCount = response.page_count;
    page++;
  }

  return folders;
}

async function fetchAllRoutines(): Promise<
  Array<{ id: string; title: string; folder_id: number | null }>
> {
  const routines: Array<{
    id: string;
    title: string;
    folder_id: number | null;
  }> = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const response = await withRetry(
      () =>
        apiGet<{
          page: number;
          page_count: number;
          routines: Array<{
            id: string;
            title: string;
            folder_id: number | null;
          }>;
        }>(`/routines?page=${page}`),
      `fetch routines page ${page}`
    );

    routines.push(...response.routines);
    pageCount = response.page_count;
    page++;
  }

  return routines;
}

const MUSCLE_GROUP_MAP: Record<string, string> = {
  quads: "quadriceps",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  chest: "chest",
  back: "lats",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  abs: "abdominals",
  forearms: "forearms",
  other: "other",
  cardio: "cardio",
  full_body: "full_body",
};

const EQUIPMENT_MAP: Record<string, string> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  machine: "machine",
  cable: "machine",
  bodyweight: "none",
  band: "resistance_band",
  cardio: "other",
  none: "none",
  other: "other",
};

async function createCustomExercise(
  title: string
): Promise<HevyExerciseTemplate> {
  const definition = getCustomExerciseDefinition(title);
  const exerciseData = definition
    ? {
        title: definition.title,
        exercise_type: definition.type,
        muscle_group: MUSCLE_GROUP_MAP[definition.primaryMuscle] || "other",
        equipment_category: EQUIPMENT_MAP[definition.equipment] || "other",
      }
    : {
        title,
        exercise_type: "weight_reps",
        muscle_group: "other",
        equipment_category: "other",
      };

  const response = await apiPost<
    { exercise_template: HevyExerciseTemplate } | { id: string }
  >("/exercise_templates", { exercise: exerciseData });

  if ("exercise_template" in response) {
    return response.exercise_template;
  }
  return {
    id: response.id,
    title,
    type: definition?.type ?? "weight_reps",
    primary_muscle_group: definition?.primaryMuscle ?? "other",
    secondary_muscle_groups: [],
    equipment: definition?.equipment ?? "other",
    is_custom: true,
  };
}

// Filter set fields to those valid for the exercise type. Hevy rejects
// e.g. distance_meters on a weight_reps exercise. The CUSTOM_EXERCISES type
// drives this — for Hevy built-ins we don't have a local definition, so we
// pass everything through and trust the caller.
function filterSetForType(set: HevySet, type: string | undefined): HevySet {
  if (!type) return set;
  const out: HevySet = { type: set.type };
  const allow = (field: keyof HevySet) => {
    const v = set[field];
    if (v !== undefined) (out as unknown as Record<string, unknown>)[field] = v;
  };
  switch (type) {
    case "weight_reps":
    case "weighted_bodyweight":
      allow("weight_kg");
      allow("reps");
      break;
    case "bodyweight_reps":
      allow("reps");
      break;
    case "duration":
      allow("duration_seconds");
      break;
    case "distance_duration":
      allow("distance_meters");
      allow("duration_seconds");
      break;
    case "weight_distance":
      allow("weight_kg");
      allow("distance_meters");
      break;
    default:
      return set;
  }
  return out;
}

export interface SyncOptions {
  dryRun: boolean;
}

export async function syncRoutinePlan(
  plan: RoutinePlan,
  opts: SyncOptions
): Promise<void> {
  console.log(`🏋 Hevy Routine Import - ${plan.programLabel}`);
  console.log("================================================");
  if (opts.dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
  }

  console.log(`   Found ${plan.uniqueExerciseNames.size} unique exercises`);
  console.log(`   Found ${plan.folders.length} folders to process\n`);

  if (opts.dryRun) {
    printDryRunSummary(plan);
    return;
  }

  // Step 1: Fetch existing exercise templates
  console.log("📚 Fetching exercise templates from Hevy...");
  const existingTemplates = await fetchAllExerciseTemplates();
  console.log(`   Found ${existingTemplates.length} existing templates\n`);

  // Step 2: Build exercise mapping
  console.log("🔗 Building exercise mapping...");
  const exerciseMapping = buildExerciseMapping(
    Array.from(plan.uniqueExerciseNames),
    existingTemplates
  );

  // Create any missing custom exercises
  const needsCreation = Array.from(exerciseMapping.entries()).filter(
    ([, mapping]) => mapping.templateId === "__NEEDS_CREATION__"
  );

  if (needsCreation.length > 0) {
    console.log(`   Creating ${needsCreation.length} custom exercises...\n`);
    for (const [name] of needsCreation) {
      console.log(`   Creating: ${name}`);
      const template = await withRetry(
        () => createCustomExercise(name),
        `create custom exercise "${name}"`
      );
      exerciseMapping.set(name, {
        csvName: name,
        templateId: template.id,
        templateTitle: template.title,
        matchScore: 1,
        isCustom: true,
      });
      // Keep a local record so type filtering in build below uses the right type
      existingTemplates.push(template);
    }
  }

  console.log("\n   Exercise mapping results:");
  for (const [name, mapping] of exerciseMapping) {
    if (mapping.isCustom) {
      console.log(`   📝 ${name} → ${mapping.templateTitle} (custom)`);
    } else if (mapping.matchScore < 1) {
      console.log(
        `   !  ${name} → ${mapping.templateTitle} (${Math.round(mapping.matchScore * 100)}% match)`
      );
    } else {
      console.log(`   ✓ ${name} → ${mapping.templateTitle}`);
    }
  }

  // Step 3: Fetch existing folders + routines
  console.log("\n📁 Fetching existing folders...");
  const existingFolders = await fetchAllRoutineFolders();
  console.log(`   Found ${existingFolders.length} existing folders\n`);

  console.log("📋 Fetching existing routines...");
  const existingRoutines = await fetchAllRoutines();
  console.log(`   Found ${existingRoutines.length} existing routines\n`);

  let foldersCreated = 0;
  let routinesCreated = 0;
  let routinesUpdated = 0;

  console.log("🚀 Creating folders and routines...\n");

  for (const plannedFolder of plan.folders) {
    const titleCandidates = [
      plannedFolder.title,
      ...(plannedFolder.alternateTitles ?? []),
    ];
    console.log(`📁 Processing ${plannedFolder.title}...`);

    let folder = existingFolders.find((f) => titleCandidates.includes(f.title));

    if (!folder) {
      console.log("   Creating folder...");
      const response = await withRetry(
        () =>
          apiPost<{
            routine_folder: { id: number; title: string };
          }>("/routine_folders", {
            routine_folder: { title: plannedFolder.title },
          }),
        `create folder "${plannedFolder.title}"`
      );
      folder = response.routine_folder;
      existingFolders.push(folder);
      foldersCreated++;
    } else if (folder.title !== plannedFolder.title) {
      console.log(
        `   ⚠️  Folder exists with old name: "${folder.title}" (rename not supported by API)`
      );
    } else {
      console.log("   Folder already exists");
    }

    for (const plannedRoutine of plannedFolder.routines) {
      const routineTitleCandidates = [
        plannedRoutine.title,
        ...(plannedRoutine.alternateTitles ?? []),
      ];
      console.log(`   📋 Processing routine: ${plannedRoutine.title}`);

      const exercises = buildHevyExercises(
        plannedRoutine,
        exerciseMapping,
        existingTemplates
      );

      if (exercises.length === 0) {
        console.log("      i  No exercises to add, skipping routine");
        continue;
      }

      const existingRoutine = existingRoutines.find(
        (r) =>
          routineTitleCandidates.includes(r.title) && r.folder_id === folder!.id
      );

      if (existingRoutine) {
        console.log("      Updating existing routine...");
        await withRetry(
          () =>
            apiPut(`/routines/${existingRoutine.id}`, {
              routine: {
                title: plannedRoutine.title,
                ...(plannedRoutine.notes ? { notes: plannedRoutine.notes } : {}),
                exercises,
              },
            }),
          `update routine "${plannedRoutine.title}"`
        );
        routinesUpdated++;
      } else {
        console.log("      Creating new routine...");
        const response = await withRetry(
          () =>
            apiPost<{ routine: Array<{ id: string }> }>("/routines", {
              routine: {
                title: plannedRoutine.title,
                folder_id: folder.id,
                ...(plannedRoutine.notes ? { notes: plannedRoutine.notes } : {}),
                exercises,
              },
            }),
          `create routine "${plannedRoutine.title}"`
        );
        const newId = response.routine?.[0]?.id;
        if (!newId) {
          throw new Error(
            `Routine created but couldn't extract id from response: ${JSON.stringify(response)}`
          );
        }
        existingRoutines.push({
          id: newId,
          title: plannedRoutine.title,
          folder_id: folder.id,
        });
        routinesCreated++;
      }
    }
  }

  console.log("\n================================================");
  console.log("✅ Import complete!");
  console.log(`   Folders created: ${foldersCreated}`);
  console.log(`   Routines created: ${routinesCreated}`);
  console.log(`   Routines updated: ${routinesUpdated}`);
  console.log("================================================\n");
}

function buildHevyExercises(
  routine: PlannedRoutine,
  exerciseMapping: Map<string, ExerciseMapping>,
  existingTemplates: HevyExerciseTemplate[]
): HevyRoutineExercise[] {
  const out: HevyRoutineExercise[] = [];
  for (const ex of routine.exercises) {
    const mapping = exerciseMapping.get(ex.name);
    if (!mapping || mapping.templateId === "__NEEDS_CREATION__") {
      console.log(`      !  Skipping unmapped exercise: ${ex.name}`);
      continue;
    }
    if (ex.sets.length === 0) {
      console.log(`      i  Skipping exercise with no sets: ${ex.name}`);
      continue;
    }
    const template = existingTemplates.find((t) => t.id === mapping.templateId);
    const filteredSets = ex.sets.map((s) =>
      filterSetForType(s, template?.type)
    );
    const first = filteredSets[0];
    const summary =
      first.weight_kg != null || first.reps != null
        ? `${filteredSets.length} sets @ ${first.weight_kg ?? "null"}kg x ${first.reps ?? "null"} reps`
        : first.distance_meters != null
          ? `${filteredSets.length} sets @ ${first.distance_meters}m${first.duration_seconds != null ? ` / ${first.duration_seconds}s` : ""}`
          : first.duration_seconds != null
            ? `${filteredSets.length} sets @ ${first.duration_seconds}s`
            : `${filteredSets.length} sets`;
    console.log(`      + ${ex.name}: ${summary}`);

    out.push({
      exercise_template_id: mapping.templateId,
      superset_id: null,
      ...(ex.rest_seconds != null ? { rest_seconds: ex.rest_seconds } : {}),
      ...(ex.notes ? { notes: ex.notes } : {}),
      sets: filteredSets,
    });
  }
  return out;
}

function printDryRunSummary(plan: RoutinePlan): void {
  console.log("📋 DRY RUN SUMMARY:");
  console.log("===================\n");

  console.log("Exercises to map:");
  for (const name of plan.uniqueExerciseNames) {
    const isCustom = CUSTOM_EXERCISES.some(
      (c) => c.title.toLowerCase() === name.toLowerCase()
    );
    console.log(`  ${isCustom ? "📝 [CUSTOM]" : "✓"} ${name}`);
  }

  console.log("\n\nFolders to create:");
  for (const folder of plan.folders) {
    console.log(`  📁 ${folder.title}`);
  }

  console.log("\n\nRoutines to create:");
  for (const folder of plan.folders) {
    console.log(`\n  ${folder.title}:`);
    for (const routine of folder.routines) {
      console.log(
        `    📋 ${routine.title} (${routine.exercises.length} exercises)`
      );
      for (const ex of routine.exercises) {
        const first = ex.sets[0];
        const summary = first
          ? first.distance_meters != null
            ? `${ex.sets.length} × ${first.distance_meters}m${first.duration_seconds != null ? ` / ${first.duration_seconds}s` : ""}`
            : first.duration_seconds != null
              ? `${ex.sets.length} × ${first.duration_seconds}s`
              : first.weight_kg != null
                ? `${ex.sets.length} × ${first.reps ?? "?"} @ ${first.weight_kg}kg`
                : first.reps != null
                  ? `${ex.sets.length} × ${first.reps} reps`
                  : `${ex.sets.length} sets`
          : "0 sets";
        console.log(
          `       - ${ex.name}: ${summary}${ex.notes ? ` (${ex.notes})` : ""}`
        );
      }
      if (routine.notes) {
        console.log(`       notes: ${routine.notes.replace(/\n/g, " | ")}`);
      }
    }
  }

  console.log("\n✅ Dry run complete. Use without --dry-run to execute.\n");
}

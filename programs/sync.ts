import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  PlannedRoutine,
  ExerciseMapping,
} from "../types.js";

// API config (shared)
const API_BASE = "https://api.hevyapp.com/v1";
const LOW_CONFIDENCE_THRESHOLD = 0.8;
const DRY_RUN_REPORT_DIR = "dry-run-reports";

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
  openReport?: boolean;
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
    const { exerciseMapping, templateCount, mappingError } =
      await buildDryRunExerciseMapping(plan);

    printDryRunSummary(plan, exerciseMapping, mappingError);

    const reportPath = await writeDryRunHtmlReport(plan, {
      exerciseMapping,
      templateCount,
      mappingError,
    });
    console.log(`📄 Dry run HTML report: ${reportPath}`);
    if (opts.openReport !== false) {
      const opened = await openFileInBrowser(reportPath);
      if (opened) {
        console.log("🌐 Opened dry run report in your browser.");
      } else {
        console.log("   Open it manually with the file path above.");
      }
    }
    console.log("\n✅ Dry run complete. Use without --dry-run to execute.\n");
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
    } else if (mapping.matchScore < LOW_CONFIDENCE_THRESHOLD) {
      console.log(
        `   ⚠️  ${name} → ${mapping.templateTitle} (${Math.round(mapping.matchScore * 100)}% match; below ${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}%)`
      );
    } else if (mapping.matchScore < 1) {
      console.log(
        `   ~  ${name} → ${mapping.templateTitle} (${Math.round(mapping.matchScore * 100)}% match)`
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

export interface DryRunMappingResult {
  exerciseMapping?: Map<string, ExerciseMapping>;
  templateCount?: number;
  mappingError?: string;
}

interface ExerciseDisplayStatus {
  icon: string;
  label: string;
  className: string;
  matchedTitle: string;
  confidence: string;
  detail: string;
  isWarning: boolean;
}

export async function buildDryRunExerciseMapping(
  plan: RoutinePlan
): Promise<DryRunMappingResult> {
  if (!process.env.HEVY_API_KEY) {
    const message =
      "HEVY_API_KEY is not set, so dry run cannot fetch your Hevy exercise list or score matches.";
    console.log(`⚠️  ${message}`);
    console.log("   Set HEVY_API_KEY to enable low-confidence match warnings.\n");
    return { mappingError: message };
  }

  try {
    console.log(
      "📚 Fetching exercise templates from Hevy for dry-run match confidence..."
    );
    const templates = await fetchAllExerciseTemplates();
    console.log(`   Found ${templates.length} existing templates\n`);
    return {
      exerciseMapping: buildExerciseMapping(
        Array.from(plan.uniqueExerciseNames),
        templates
      ),
      templateCount: templates.length,
    };
  } catch (error) {
    const message = `Could not fetch Hevy exercise templates: ${(error as Error).message}`;
    console.log(`⚠️  ${message}`);
    console.log("   Continuing dry run without match confidence warnings.\n");
    return { mappingError: message };
  }
}

function isKnownCustomExercise(name: string): boolean {
  return CUSTOM_EXERCISES.some(
    (c) => c.title.toLowerCase() === name.toLowerCase()
  );
}

function getExerciseDisplayStatus(
  name: string,
  mapping?: ExerciseMapping
): ExerciseDisplayStatus {
  const knownCustom = isKnownCustomExercise(name);

  if (!mapping) {
    return {
      icon: knownCustom ? "📝" : "？",
      label: knownCustom ? "Known custom" : "Not checked",
      className: knownCustom ? "custom" : "unknown",
      matchedTitle: knownCustom ? name : "—",
      confidence: "—",
      detail: knownCustom
        ? "Listed in local custom exercise definitions."
        : "No Hevy API exercise list was available during this dry run.",
      isWarning: false,
    };
  }

  if (mapping.templateId === "__NEEDS_CREATION__") {
    return {
      icon: knownCustom ? "📝" : "⚠️",
      label: knownCustom ? "Will create custom" : "No Hevy match",
      className: knownCustom ? "custom" : "warning",
      matchedTitle: mapping.templateTitle,
      confidence: "0%",
      detail: knownCustom
        ? "This is an intended local custom exercise."
        : "No close Hevy exercise matched. The importer would create a generic custom exercise if synced.",
      isWarning: !knownCustom,
    };
  }

  const confidence = Math.round(mapping.matchScore * 100);
  if (!mapping.isCustom && mapping.matchScore < LOW_CONFIDENCE_THRESHOLD) {
    return {
      icon: "⚠️",
      label: "Low confidence",
      className: "warning",
      matchedTitle: mapping.templateTitle,
      confidence: `${confidence}%`,
      detail: `Below the ${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% warning threshold; verify this is the exercise you intended.`,
      isWarning: true,
    };
  }

  if (mapping.isCustom) {
    return {
      icon: "📝",
      label: "Custom",
      className: "custom",
      matchedTitle: mapping.templateTitle,
      confidence: `${confidence}%`,
      detail: "Matched an existing custom exercise template.",
      isWarning: false,
    };
  }

  if (mapping.matchScore < 1) {
    return {
      icon: "~",
      label: "Fuzzy match",
      className: "fuzzy",
      matchedTitle: mapping.templateTitle,
      confidence: `${confidence}%`,
      detail: "Matched by name similarity.",
      isWarning: false,
    };
  }

  return {
    icon: "✓",
    label: "Exact match",
    className: "ok",
    matchedTitle: mapping.templateTitle,
    confidence: "100%",
    detail: "Exact or explicit exercise mapping.",
    isWarning: false,
  };
}

function summarizeSets(sets: HevySet[]): string {
  const first = sets[0];
  if (!first) return "0 sets";
  if (first.distance_meters != null) {
    return `${sets.length} × ${first.distance_meters}m${first.duration_seconds != null ? ` / ${first.duration_seconds}s` : ""}`;
  }
  if (first.duration_seconds != null) {
    return `${sets.length} × ${first.duration_seconds}s`;
  }
  if (first.weight_kg != null) {
    return `${sets.length} × ${first.reps ?? "?"} @ ${first.weight_kg}kg`;
  }
  if (first.reps != null) {
    return `${sets.length} × ${first.reps} reps`;
  }
  return `${sets.length} sets`;
}

function printDryRunSummary(
  plan: RoutinePlan,
  exerciseMapping?: Map<string, ExerciseMapping>,
  mappingError?: string
): void {
  console.log("📋 DRY RUN SUMMARY:");
  console.log("===================\n");

  console.log("Exercise mapping preview:");
  if (mappingError) {
    console.log(`  ⚠️  ${mappingError}`);
  }
  for (const name of plan.uniqueExerciseNames) {
    const mapping = exerciseMapping?.get(name);
    const status = getExerciseDisplayStatus(name, mapping);
    const arrow = exerciseMapping
      ? ` → ${status.matchedTitle} (${status.confidence})`
      : "";
    console.log(`  ${status.icon} [${status.label}] ${name}${arrow}`);
    if (status.isWarning) {
      console.log(`      ${status.detail}`);
    }
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
        const mapping = exerciseMapping?.get(ex.name);
        const status = getExerciseDisplayStatus(ex.name, mapping);
        const matchSuffix = exerciseMapping
          ? ` → ${status.matchedTitle} ${status.isWarning ? "⚠️" : ""}`
          : "";
        console.log(
          `       - ${ex.name}${matchSuffix}: ${summarizeSets(ex.sets)}${ex.notes ? ` (${ex.notes})` : ""}`
        );
      }
      if (routine.notes) {
        console.log(`       notes: ${routine.notes.replace(/\n/g, " | ")}`);
      }
    }
  }
}

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHtmlNotes(notes: string | undefined): string {
  if (!notes) return "";
  return escapeHtml(notes).replace(/\n/g, "<br>");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "hevy-dry-run";
}

function buildMappingRows(
  plan: RoutinePlan,
  exerciseMapping?: Map<string, ExerciseMapping>
): string {
  return Array.from(plan.uniqueExerciseNames)
    .map((name) => {
      const mapping = exerciseMapping?.get(name);
      const status = getExerciseDisplayStatus(name, mapping);
      return `<tr class="${status.className}">
        <td><span class="status ${status.className}">${escapeHtml(status.icon)} ${escapeHtml(status.label)}</span></td>
        <td class="source">${escapeHtml(name)}</td>
        <td>${escapeHtml(status.matchedTitle)}</td>
        <td>${escapeHtml(status.confidence)}</td>
        <td>${escapeHtml(status.detail)}</td>
      </tr>`;
    })
    .join("\n");
}

function buildRoutineHtml(
  routine: PlannedRoutine,
  exerciseMapping?: Map<string, ExerciseMapping>
): string {
  const exerciseRows = routine.exercises
    .map((ex) => {
      const mapping = exerciseMapping?.get(ex.name);
      const status = getExerciseDisplayStatus(ex.name, mapping);
      return `<tr class="${status.className}">
        <td class="source">${escapeHtml(ex.name)}</td>
        <td>${escapeHtml(summarizeSets(ex.sets))}</td>
        <td>${formatHtmlNotes(ex.notes)}</td>
        <td><span class="status ${status.className}">${escapeHtml(status.icon)} ${escapeHtml(status.label)}</span></td>
        <td>${escapeHtml(status.matchedTitle)}</td>
        <td>${escapeHtml(status.confidence)}</td>
      </tr>`;
    })
    .join("\n");

  return `<article class="routine-card">
    <h3>📋 ${escapeHtml(routine.title)}</h3>
    ${routine.notes ? `<p class="routine-notes">${formatHtmlNotes(routine.notes)}</p>` : ""}
    <table>
      <thead>
        <tr><th>CSV exercise</th><th>Sets</th><th>Notes</th><th>Match status</th><th>Hevy exercise</th><th>Confidence</th></tr>
      </thead>
      <tbody>${exerciseRows}</tbody>
    </table>
  </article>`;
}

function buildFoldersHtml(
  plan: RoutinePlan,
  exerciseMapping?: Map<string, ExerciseMapping>
): string {
  return plan.folders
    .map((folder, index) => {
      const routines = folder.routines
        .map((routine) => buildRoutineHtml(routine, exerciseMapping))
        .join("\n");
      return `<details class="folder" ${index === 0 ? "open" : ""}>
        <summary>📁 ${escapeHtml(folder.title)} <span>${folder.routines.length} routines</span></summary>
        ${routines}
      </details>`;
    })
    .join("\n");
}

export function buildDryRunHtml(
  plan: RoutinePlan,
  result: DryRunMappingResult,
  options: { titlePrefix?: string; footerHtml?: string } = {}
): string {
  const uniqueExerciseCount = plan.uniqueExerciseNames.size;
  const routineCount = plan.folders.reduce(
    (sum, folder) => sum + folder.routines.length,
    0
  );
  const exerciseInstanceCount = plan.folders.reduce(
    (sum, folder) =>
      sum +
      folder.routines.reduce(
        (routineSum, routine) => routineSum + routine.exercises.length,
        0
      ),
    0
  );
  const warningCount = result.exerciseMapping
    ? Array.from(plan.uniqueExerciseNames).filter((name) =>
        getExerciseDisplayStatus(name, result.exerciseMapping?.get(name))
          .isWarning
      ).length
    : 0;
  const generatedAt = new Date().toLocaleString();
  const thresholdPercent = Math.round(LOW_CONFIDENCE_THRESHOLD * 100);
  const mappingNote = result.exerciseMapping
    ? `Fetched ${result.templateCount ?? 0} Hevy exercises from the API. Warnings show matches below ${thresholdPercent}%.`
    : `No Hevy API exercise list was available, so confidence warnings could not be calculated.${
        result.mappingError ? ` ${result.mappingError}` : ""
      }`;
  const titlePrefix = options.titlePrefix ?? "Hevy Dry Run";
  const footerHtml =
    options.footerHtml ??
    "Generated by <code>pnpm start… --dry-run</code>. Review warnings before running a real sync.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titlePrefix)} — ${escapeHtml(plan.programLabel)}</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7fb; --panel:#ffffff; --text:#172033; --muted:#64748b; --border:#d9e1ee; --ok:#0f766e; --ok-bg:#ccfbf1; --fuzzy:#7c3aed; --fuzzy-bg:#ede9fe; --custom:#0369a1; --custom-bg:#e0f2fe; --warn:#b45309; --warn-bg:#fff7ed; --warn-line:#fdba74; --unknown:#475569; --unknown-bg:#f1f5f9; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.45; }
    header { padding: 36px 28px 24px; background: linear-gradient(135deg, #0f172a, #1e3a8a); color: white; }
    header h1 { margin: 0 0 8px; font-size: clamp(28px, 5vw, 44px); }
    header p { margin: 0; opacity: 0.85; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-top: -46px; margin-bottom: 24px; }
    .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
    .stat strong { display: block; font-size: 28px; }
    .stat span { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
    section, .folder, .routine-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; margin-bottom: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05); }
    section { padding: 20px; }
    h2 { margin: 0 0 12px; }
    .note { color: var(--muted); margin-top: 0; }
    .flow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .flow span { background: #eef2ff; border: 1px solid #c7d2fe; color: #3730a3; border-radius: 999px; padding: 8px 12px; font-weight: 650; }
    .flow b { color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; text-align: left; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; background: #f8fafc; }
    tr.warning { background: var(--warn-bg); }
    tr.warning td:first-child { border-left: 4px solid var(--warn-line); }
    .source { font-weight: 700; }
    .status { display: inline-block; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .status.ok { background: var(--ok-bg); color: var(--ok); }
    .status.fuzzy { background: var(--fuzzy-bg); color: var(--fuzzy); }
    .status.custom { background: var(--custom-bg); color: var(--custom); }
    .status.warning { background: var(--warn-bg); color: var(--warn); }
    .status.unknown { background: var(--unknown-bg); color: var(--unknown); }
    details.folder { overflow: hidden; }
    details.folder > summary { cursor: pointer; list-style: none; padding: 16px 20px; font-size: 20px; font-weight: 800; display: flex; justify-content: space-between; gap: 16px; }
    details.folder > summary::-webkit-details-marker { display: none; }
    details.folder > summary span { color: var(--muted); font-size: 14px; font-weight: 600; }
    .routine-card { margin: 0 16px 16px; padding: 16px; box-shadow: none; }
    .routine-card h3 { margin: 0 0 10px; }
    .routine-notes { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; background: #f8fafc; color: #334155; }
    footer { color: var(--muted); text-align: center; padding: 20px; }
    @media (max-width: 760px) { main { padding: 14px; } table { display: block; overflow-x: auto; } .stats { margin-top: 0; } }
  </style>
</head>
<body>
  <header>
    <h1>🏋 ${escapeHtml(titlePrefix)}</h1>
    <p>${escapeHtml(plan.programLabel)} · generated ${escapeHtml(generatedAt)}</p>
  </header>
  <main>
    <div class="stats">
      <div class="stat"><strong>${uniqueExerciseCount}</strong><span>Unique exercises</span></div>
      <div class="stat"><strong>${plan.folders.length}</strong><span>Folders</span></div>
      <div class="stat"><strong>${routineCount}</strong><span>Routines</span></div>
      <div class="stat"><strong>${exerciseInstanceCount}</strong><span>Exercise rows</span></div>
      <div class="stat"><strong>${warningCount}</strong><span>Match warnings</span></div>
    </div>

    <section>
      <h2>Import flow</h2>
      <p class="note">Static dry-run preview only — no server and no writes to Hevy.</p>
      <div class="flow"><span>CSV plan</span><b>→</b><span>Routine folders</span><b>→</b><span>Exercise matching</span><b>→</b><span>Hevy sync payload</span></div>
      <p class="note">${escapeHtml(mappingNote)}</p>
    </section>

    <section>
      <h2>Exercise matching</h2>
      <table>
        <thead><tr><th>Status</th><th>CSV exercise</th><th>Hevy exercise</th><th>Confidence</th><th>Notes</th></tr></thead>
        <tbody>${buildMappingRows(plan, result.exerciseMapping)}</tbody>
      </table>
    </section>

    <section>
      <h2>Planned routines</h2>
      <p class="note">Open each folder to inspect the generated routines, sets, notes, and matched Hevy exercises.</p>
    </section>

    ${buildFoldersHtml(plan, result.exerciseMapping)}
  </main>
  <footer>${footerHtml}</footer>
</body>
</html>`;
}

export async function writeDryRunHtmlReport(
  plan: RoutinePlan,
  result: DryRunMappingResult,
  options: { outputDir?: string; fileName?: string; titlePrefix?: string; footerHtml?: string } = {}
): Promise<string> {
  const dir = resolve(options.outputDir ?? DRY_RUN_REPORT_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = resolve(dir, options.fileName ?? `${slugify(plan.programLabel)}.html`);
  await writeFile(
    filePath,
    buildDryRunHtml(plan, result, {
      titlePrefix: options.titlePrefix,
      footerHtml: options.footerHtml,
    }),
    "utf8"
  );
  return filePath;
}

async function openFileInBrowser(filePath: string): Promise<boolean> {
  const target = pathToFileURL(filePath).href;
  let command: string;
  let args: string[];

  if (process.platform === "darwin") {
    command = "open";
    args = [target];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", target];
  } else {
    command = "xdg-open";
    args = [target];
  }

  return new Promise((resolveOpen) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    let settled = false;
    const settle = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolveOpen(value);
      }
    };
    child.once("error", () => settle(false));
    child.once("spawn", () => {
      child.unref();
      settle(true);
    });
  });
}

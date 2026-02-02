import { createReadStream } from "fs";
import { parse } from "csv-parse";
import {
	buildExerciseMapping,
	getCustomExerciseDefinition,
	CUSTOM_EXERCISES,
} from "./exercise-mapping.js";
import type {
	CsvRow,
	HevyExerciseTemplate,
	HevyRoutine,
	HevyRoutineExercise,
	HevySet,
	ParsedWeek,
	ParsedDay,
	ParsedExercise,
	ExerciseMapping,
} from "./types.js";

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

// Parse --week argument (supports --week=1, --week 1, --week=1-3, --week 1-3)
let weekArg: string | undefined;
const weekEqualIdx = args.findIndex((a) => a.startsWith("--week="));
if (weekEqualIdx !== -1) {
	weekArg = args[weekEqualIdx].split("=")[1];
} else {
	const weekIdx = args.indexOf("--week");
	if (
		weekIdx !== -1 &&
		args[weekIdx + 1] &&
		!args[weekIdx + 1].startsWith("--")
	) {
		weekArg = args[weekIdx + 1];
	}
}

let weekRange: [number, number] | null = null;
if (weekArg) {
	if (weekArg.includes("-")) {
		const [start, end] = weekArg.split("-").map(Number);
		weekRange = [start, end];
	} else {
		const week = Number(weekArg);
		weekRange = [week, week];
	}
}

// Configuration
const API_BASE = "https://api.hevyapp.com/v1";
const API_KEY = process.env.HEVY_API_KEY ?? "";
const CSV_PATH = new URL("./16-week-powerlifting-program.csv", import.meta.url);
const PROGRAM_SUFFIX = "15 Week Periodized Program";

if (!API_KEY && !dryRun) {
	console.error("❌ HEVY_API_KEY environment variable is required");
	console.error("   Set it with: export HEVY_API_KEY=your_api_key");
	process.exit(1);
}

// Rate limiting helper
async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// API helpers
async function apiGet<T>(endpoint: string): Promise<T> {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		headers: {
			"api-key": API_KEY!,
			"Content-Type": "application/json",
		},
	});
	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`API GET ${endpoint} failed: ${response.status} - ${error}`,
		);
	}
	return response.json();
}

async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		method: "POST",
		headers: {
			"api-key": API_KEY!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`API POST ${endpoint} failed: ${response.status} - ${text}`);
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		// If response is just an ID string, wrap it
		return { id: text } as T;
	}
}

async function apiPut<T>(endpoint: string, body: unknown): Promise<T> {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		method: "PUT",
		headers: {
			"api-key": API_KEY!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`API PUT ${endpoint} failed: ${response.status} - ${error}`,
		);
	}
	return response.json();
}

// Fetch all pages of exercise templates
async function fetchAllExerciseTemplates(): Promise<HevyExerciseTemplate[]> {
	const templates: HevyExerciseTemplate[] = [];
	let page = 1;
	let pageCount = 1;

	while (page <= pageCount) {
		const response = await apiGet<{
			page: number;
			page_count: number;
			exercise_templates: HevyExerciseTemplate[];
		}>(`/exercise_templates?page=${page}&pageSize=100`);

		templates.push(...response.exercise_templates);
		pageCount = response.page_count;
		page++;
		await sleep(100); // Rate limiting
	}

	return templates;
}

// Fetch all routine folders
async function fetchAllRoutineFolders(): Promise<
	Array<{ id: number; title: string }>
> {
	const folders: Array<{ id: number; title: string }> = [];
	let page = 1;
	let pageCount = 1;

	while (page <= pageCount) {
		const response = await apiGet<{
			page: number;
			page_count: number;
			routine_folders: Array<{ id: number; title: string }>;
		}>(`/routine_folders?page=${page}`);

		folders.push(...response.routine_folders);
		pageCount = response.page_count;
		page++;
		await sleep(100);
	}

	return folders;
}

// Fetch all routines
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
		const response = await apiGet<{
			page: number;
			page_count: number;
			routines: Array<{ id: string; title: string; folder_id: number | null }>;
		}>(`/routines?page=${page}`);

		routines.push(...response.routines);
		pageCount = response.page_count;
		page++;
		await sleep(100);
	}

	return routines;
}

// Parse CSV file
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

// Group CSV rows by week and day
function groupByWeekAndDay(rows: CsvRow[]): ParsedWeek[] {
	const weeks = new Map<number, Map<string, ParsedExercise[]>>();

	for (const row of rows) {
		const weekNum = parseInt(row.WEEK, 10);
		if (isNaN(weekNum) || weekNum > 15) continue; // Skip week 16

		if (!weeks.has(weekNum)) {
			weeks.set(weekNum, new Map());
		}

		const dayCode = row.DAY.split(" - ")[0]; // "A", "B", "C", "D"
		const dayExercises = weeks.get(weekNum)!;

		if (!dayExercises.has(row.DAY)) {
			dayExercises.set(row.DAY, []);
		}

		// Parse weight
		let weightKg: number | "BW" | "Select" | null = null;
		if (row["WEIGHT (kg)"] === "BW") {
			weightKg = "BW";
		} else if (row["WEIGHT (kg)"] === "Select" || row["WEIGHT (kg)"] === "-") {
			weightKg = "Select";
		} else {
			const parsed = parseFloat(row["WEIGHT (kg)"]);
			if (!isNaN(parsed)) {
				weightKg = parsed;
			}
		}

		// Parse reps
		let reps: number | "AMRAP" | "Easy" | null = null;
		if (row.REPS === "AMRAP") {
			reps = "AMRAP";
		} else if (row.REPS === "Easy") {
			reps = "Easy";
		} else if (row.REPS !== "-") {
			const parsed = parseInt(row.REPS, 10);
			if (!isNaN(parsed)) {
				reps = parsed;
			}
		}

		// Parse sets
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

	// Convert to array format
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

// Build exercise notes including % TM and original notes
function buildExerciseNotes(exercise: ParsedExercise): string {
	const parts: string[] = [];
	if (exercise.percentTm && exercise.percentTm !== "-") {
		parts.push(`${exercise.percentTm} TM`);
	}
	if (exercise.notes) {
		parts.push(exercise.notes);
	}
	return parts.join(" - ");
}

// Build sets array for an exercise
function buildSets(exercise: ParsedExercise): HevySet[] {
	const sets: HevySet[] = [];

	if (exercise.sets === 0 || exercise.weightKg === "Select") {
		return sets;
	}

	for (let i = 0; i < exercise.sets; i++) {
		const set: HevySet = { type: "normal" };

		// Handle weight
		if (exercise.weightKg === "BW") {
			set.weight_kg = null;
		} else if (typeof exercise.weightKg === "number") {
			set.weight_kg = exercise.weightKg;
		}

		// Handle reps
		if (exercise.reps === "AMRAP" || exercise.reps === "Easy") {
			set.reps = null; // AMRAP/Easy will be noted in exercise notes
		} else if (typeof exercise.reps === "number") {
			set.reps = exercise.reps;
		}

		sets.push(set);
	}

	return sets;
}

// Map our muscle group names to Hevy API values
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
};

// Map our equipment names to Hevy API values
const EQUIPMENT_MAP: Record<string, string> = {
	barbell: "barbell",
	dumbbell: "dumbbell",
	machine: "machine",
	cable: "machine", // Hevy doesn't have cable, use machine
	bodyweight: "none",
	other: "other",
};

// Create custom exercise via API
async function createCustomExercise(
	title: string,
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

	// Handle both response formats
	if ("exercise_template" in response) {
		return response.exercise_template;
	}
	// If API just returns an ID, construct a minimal template object
	return {
		id: response.id,
		title,
		type: "weight_reps",
		primary_muscle_group: "other",
		secondary_muscle_groups: [],
		equipment: "other",
		is_custom: true,
	};
}

// Main import function
async function main() {
	console.log("🏋 Hevy Routine Import - 16 Week Powerlifting Program");
	console.log("================================================");
	if (dryRun) {
		console.log("🔍 DRY RUN MODE - No changes will be made\n");
	}
	if (weekRange) {
		console.log(`📅 Processing weeks ${weekRange[0]}-${weekRange[1]}\n`);
	} else {
		console.log("📅 Processing all weeks (1-15)\n");
	}

	// Step 1: Parse CSV
	console.log("📄 Parsing CSV file...");
	const csvRows = await parseCsv();
	console.log(`   Found ${csvRows.length} rows\n`);

	// Step 2: Group by week and day
	console.log("📊 Grouping exercises by week and day...");
	let weeks = groupByWeekAndDay(csvRows);

	// Filter by week range if specified
	if (weekRange) {
		weeks = weeks.filter(
			(w) => w.weekNumber >= weekRange![0] && w.weekNumber <= weekRange![1],
		);
	}

	console.log(`   Found ${weeks.length} weeks to process\n`);

	// Get unique exercise names
	const uniqueExercises = new Set<string>();
	for (const week of weeks) {
		for (const day of week.days) {
			for (const exercise of day.exercises) {
				uniqueExercises.add(exercise.name);
			}
		}
	}
	console.log(`   Found ${uniqueExercises.size} unique exercises\n`);

	if (dryRun) {
		// Dry run output
		console.log("📋 DRY RUN SUMMARY:");
		console.log("===================\n");

		console.log("Exercises to map:");
		for (const name of uniqueExercises) {
			const isCustom = CUSTOM_EXERCISES.some(
				(c) => c.title.toLowerCase() === name.toLowerCase(),
			);
			console.log(`  ${isCustom ? "📝 [CUSTOM]" : "✓"} ${name}`);
		}

		console.log("\n\nFolders to create:");
		for (const week of weeks) {
			console.log(`  📁 Week ${week.weekNumber} - ${PROGRAM_SUFFIX}`);
		}

		console.log("\n\nRoutines to create:");
		for (const week of weeks) {
			console.log(`\n  Week ${week.weekNumber}:`);
			for (const day of week.days) {
				console.log(
					`    📋 ${day.dayName} (${day.exercises.length} exercises)`,
				);
				for (const exercise of day.exercises) {
					const notes = buildExerciseNotes(exercise);
					const weightStr = exercise.weightKg === "BW" ? "BW" :
						exercise.weightKg === "Select" ? "?" :
						exercise.weightKg ? `${exercise.weightKg}kg` : "?";
					console.log(
						`       - ${exercise.name}: ${exercise.sets}x${exercise.reps || "?"} @ ${weightStr} ${notes ? `(${notes})` : ""}`,
					);
				}
			}
		}

		console.log("\n✅ Dry run complete. Use without --dry-run to execute.\n");
		return;
	}

	// Step 3: Fetch existing exercise templates
	console.log("📚 Fetching exercise templates from Hevy...");
	const existingTemplates = await fetchAllExerciseTemplates();
	console.log(`   Found ${existingTemplates.length} existing templates\n`);

	// Step 4: Build exercise mapping
	console.log("🔗 Building exercise mapping...");
	const exerciseMapping = buildExerciseMapping(
		Array.from(uniqueExercises),
		existingTemplates,
	);

	// Create any missing custom exercises
	const needsCreation = Array.from(exerciseMapping.entries()).filter(
		([, mapping]) => mapping.templateId === "__NEEDS_CREATION__",
	);

	if (needsCreation.length > 0) {
		console.log(`   Creating ${needsCreation.length} custom exercises...\n`);
		for (const [name] of needsCreation) {
			console.log(`   Creating: ${name}`);
			const template = await createCustomExercise(name);
			exerciseMapping.set(name, {
				csvName: name,
				templateId: template.id,
				templateTitle: template.title,
				matchScore: 1,
				isCustom: true,
			});
			await sleep(200); // Rate limiting
		}
	}

	// Log mapping results
	console.log("\n   Exercise mapping results:");
	for (const [name, mapping] of exerciseMapping) {
		if (mapping.isCustom) {
			console.log(`   📝 ${name} → ${mapping.templateTitle} (custom)`);
		} else if (mapping.matchScore < 1) {
			console.log(
				`   !  ${name} → ${mapping.templateTitle} (${Math.round(mapping.matchScore * 100)}% match)`,
			);
		} else {
			console.log(`   ✓ ${name} → ${mapping.templateTitle}`);
		}
	}

	// Step 5: Fetch existing folders
	console.log("\n📁 Fetching existing folders...");
	const existingFolders = await fetchAllRoutineFolders();
	console.log(`   Found ${existingFolders.length} existing folders\n`);

	// Step 6: Fetch existing routines
	console.log("📋 Fetching existing routines...");
	const existingRoutines = await fetchAllRoutines();
	console.log(`   Found ${existingRoutines.length} existing routines\n`);

	// Track stats
	let foldersCreated = 0;
	let routinesCreated = 0;
	let routinesUpdated = 0;

	// Step 7: Create folders and routines
	console.log("🚀 Creating folders and routines...\n");

	for (const week of weeks) {
		const folderTitle = `Week ${week.weekNumber} - ${PROGRAM_SUFFIX}`;
		console.log(`📁 Processing ${folderTitle}...`);

		// Check if folder exists
		let folder = existingFolders.find((f) => f.title === folderTitle);

		if (!folder) {
			console.log("   Creating folder...");
			const response = await apiPost<{
				routine_folder: { id: number; title: string };
			}>("/routine_folders", { routine_folder: { title: folderTitle } });
			folder = response.routine_folder;
			existingFolders.push(folder);
			foldersCreated++;
			await sleep(200);
		} else {
			console.log("   Folder already exists");
		}

		// Create routines for each day
		for (const day of week.days) {
			const routineTitle = day.dayName;
			console.log(`   📋 Processing routine: ${routineTitle}`);

			// Build exercises array
			const exercises: HevyRoutineExercise[] = [];
			for (const exercise of day.exercises) {
				const mapping = exerciseMapping.get(exercise.name);
				if (!mapping || mapping.templateId === "__NEEDS_CREATION__") {
					console.log(`      !  Skipping unmapped exercise: ${exercise.name}`);
					continue;
				}

				const sets = buildSets(exercise);
				if (sets.length === 0) {
					console.log(
						`      i  Skipping exercise with no sets: ${exercise.name}`,
					);
					continue;
				}

				// Debug: show first set details
				if (sets.length > 0) {
					const s = sets[0];
					console.log(
						`      + ${exercise.name}: ${sets.length} sets @ ${s.weight_kg ?? "null"}kg x ${s.reps ?? "null"} reps`,
					);
				}

				// Add AMRAP note if needed
				let notes = buildExerciseNotes(exercise);
				if (exercise.reps === "AMRAP") {
					notes = notes ? `AMRAP - ${notes}` : "AMRAP";
				} else if (exercise.reps === "Easy") {
					notes = notes ? `Easy reps - ${notes}` : "Easy reps";
				}

				exercises.push({
					exercise_template_id: mapping.templateId,
					superset_id: null,
					...(notes ? { notes } : {}),
					sets,
				});
			}

			if (exercises.length === 0) {
				console.log("      i  No exercises to add, skipping routine");
				continue;
			}

			// Check if routine exists in this folder
			const existingRoutine = existingRoutines.find(
				(r) => r.title === routineTitle && r.folder_id === folder!.id,
			);

			if (existingRoutine) {
				console.log("      Updating existing routine...");
				// PUT doesn't allow folder_id
				await apiPut(`/routines/${existingRoutine.id}`, {
					routine: {
						title: routineTitle,
						notes: `Week ${week.weekNumber}`,
						exercises,
					},
				});
				routinesUpdated++;
			} else {
				console.log("      Creating new routine...");
				const response = await apiPost<{ routine: { id: string } }>(
					"/routines",
					{
						routine: {
							title: routineTitle,
							folder_id: folder.id,
							notes: `Week ${week.weekNumber}`,
							exercises,
						},
					},
				);
				existingRoutines.push({
					id: response.routine.id,
					title: routineTitle,
					folder_id: folder.id,
				});
				routinesCreated++;
			}
			await sleep(200);
		}
	}

	// Summary
	console.log("\n================================================");
	console.log("✅ Import complete!");
	console.log(`   Folders created: ${foldersCreated}`);
	console.log(`   Routines created: ${routinesCreated}`);
	console.log(`   Routines updated: ${routinesUpdated}`);
	console.log("================================================\n");
}

main().catch((error) => {
	console.error("❌ Error:", error.message);
	process.exit(1);
});

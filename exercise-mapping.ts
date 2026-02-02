import * as stringSimilarity from "string-similarity";
import type {
  HevyExerciseTemplate,
  ExerciseMapping,
  ExerciseType,
  EquipmentCategory,
  MuscleGroup,
} from "./types.js";

// Custom exercises that need to be created
export const CUSTOM_EXERCISES: Array<{
  title: string;
  type: ExerciseType;
  equipment: EquipmentCategory;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
}> = [
  {
    title: "Pause Squat (3 sec)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
  },
  {
    title: "Pause Squat (2 sec)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
  },
  {
    title: "Pause Squat (1 sec)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
  },
  {
    title: "Larsen Press (feet up)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
  },
  {
    title: 'Spoto Press (1" pause)',
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
  },
  {
    title: "Deficit Deadlift (5cm)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Deficit Deadlift (2.5cm)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Paused Deadlift (below knee)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Close Grip Bench",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "triceps",
    secondaryMuscles: ["chest", "shoulders"],
  },
  {
    title: "Inverted Row (Rings)",
    type: "bodyweight_reps",
    equipment: "other",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
  },
  {
    title: "Cable Crunch",
    type: "weight_reps",
    equipment: "cable",
    primaryMuscle: "abs",
    secondaryMuscles: [],
  },
  {
    title: "Face Pull",
    type: "weight_reps",
    equipment: "cable",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["back"],
  },
  {
    title: "Pec Deck",
    type: "weight_reps",
    equipment: "machine",
    primaryMuscle: "chest",
    secondaryMuscles: [],
  },
  {
    title: "Back Squat (backoff)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
  },
  {
    title: "Bench Press (backoff)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
  },
  {
    title: "Deadlift (backoff)",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Light Squat",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
  },
  {
    title: "Light Bench",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
  },
  {
    title: "Light Deadlift",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Back Squat - NEW 1RM",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
  },
  {
    title: "Bench Press - NEW 1RM",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
  },
  {
    title: "Deadlift - NEW 1RM",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Optional: 2nd attempt",
    type: "weight_reps",
    equipment: "barbell",
    primaryMuscle: "other",
    secondaryMuscles: [],
  },
  {
    title: "Light accessories",
    type: "weight_reps",
    equipment: "other",
    primaryMuscle: "other",
    secondaryMuscles: [],
  },
  {
    title: "Light accessories only",
    type: "weight_reps",
    equipment: "other",
    primaryMuscle: "other",
    secondaryMuscles: [],
  },
  {
    title: "Tricep Extension",
    type: "weight_reps",
    equipment: "cable",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
  },
  {
    title: "Cable Row",
    type: "weight_reps",
    equipment: "cable",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
  },
];

// Explicit mappings for exercises that have different names in Hevy
const EXPLICIT_MAPPINGS: Record<string, string> = {
  "Back Squat": "Barbell Squat",
  "Bench Press": "Barbell Bench Press",
  Deadlift: "Deadlift (Barbell)",
  "Romanian Deadlift": "Romanian Deadlift (Barbell)",
  "Leg Press": "Leg Press (Machine)",
  "Leg Extension": "Leg Extension (Machine)",
  "Pull Up": "Pull Up",
  "Chest Dip": "Dip",
  "Incline DB Press": "Incline Dumbbell Bench Press",
  "Seated Cable Row": "Seated Cable Row",
  "Barbell Curl": "Barbell Curl",
  "Barbell Row": "Barbell Row",
  "Front Squat": "Front Squat (Barbell)",
  "Lateral Raise": "Lateral Raise (Dumbbell)",
  "Hanging Leg Raise": "Hanging Leg Raise",
  "Tricep Extension (Cable)": "Triceps Pushdown",
};

export function buildExerciseMapping(
  csvExercises: string[],
  hevyTemplates: HevyExerciseTemplate[]
): Map<string, ExerciseMapping> {
  const mapping = new Map<string, ExerciseMapping>();
  const templateTitles = hevyTemplates.map((t) => t.title.toLowerCase());

  for (const csvExercise of csvExercises) {
    // Skip empty or notes-only entries
    if (
      !csvExercise ||
      csvExercise === "-" ||
      csvExercise === "UPDATE TRAINING MAXES" ||
      csvExercise === "Begin next 16-week cycle"
    ) {
      continue;
    }

    // Check explicit mappings first
    if (EXPLICIT_MAPPINGS[csvExercise]) {
      const matchedTemplate = hevyTemplates.find(
        (t) =>
          t.title.toLowerCase() === EXPLICIT_MAPPINGS[csvExercise].toLowerCase()
      );
      if (matchedTemplate) {
        mapping.set(csvExercise, {
          csvName: csvExercise,
          templateId: matchedTemplate.id,
          templateTitle: matchedTemplate.title,
          matchScore: 1,
          isCustom: false,
        });
        continue;
      }
    }

    // Check if it's a custom exercise we need to create
    const customExercise = CUSTOM_EXERCISES.find(
      (c) => c.title.toLowerCase() === csvExercise.toLowerCase()
    );
    if (customExercise) {
      // Check if already exists in templates (might have been created before)
      const existingTemplate = hevyTemplates.find(
        (t) => t.title.toLowerCase() === csvExercise.toLowerCase()
      );
      if (existingTemplate) {
        mapping.set(csvExercise, {
          csvName: csvExercise,
          templateId: existingTemplate.id,
          templateTitle: existingTemplate.title,
          matchScore: 1,
          isCustom: true,
        });
      } else {
        // Mark as needing creation
        mapping.set(csvExercise, {
          csvName: csvExercise,
          templateId: "__NEEDS_CREATION__",
          templateTitle: csvExercise,
          matchScore: 0,
          isCustom: true,
        });
      }
      continue;
    }

    // Try exact match (case insensitive)
    const exactMatch = hevyTemplates.find(
      (t) => t.title.toLowerCase() === csvExercise.toLowerCase()
    );
    if (exactMatch) {
      mapping.set(csvExercise, {
        csvName: csvExercise,
        templateId: exactMatch.id,
        templateTitle: exactMatch.title,
        matchScore: 1,
        isCustom: false,
      });
      continue;
    }

    // Fuzzy match
    const result = stringSimilarity.findBestMatch(
      csvExercise.toLowerCase(),
      templateTitles
    );

    if (result.bestMatch.rating >= 0.6) {
      const matchedTemplate = hevyTemplates.find(
        (t) => t.title.toLowerCase() === result.bestMatch.target
      );
      if (matchedTemplate) {
        mapping.set(csvExercise, {
          csvName: csvExercise,
          templateId: matchedTemplate.id,
          templateTitle: matchedTemplate.title,
          matchScore: result.bestMatch.rating,
          isCustom: false,
        });
        continue;
      }
    }

    // No match - mark as needing creation
    mapping.set(csvExercise, {
      csvName: csvExercise,
      templateId: "__NEEDS_CREATION__",
      templateTitle: csvExercise,
      matchScore: 0,
      isCustom: true,
    });
  }

  return mapping;
}

export function getCustomExerciseDefinition(
  title: string
): (typeof CUSTOM_EXERCISES)[0] | undefined {
  return CUSTOM_EXERCISES.find(
    (c) => c.title.toLowerCase() === title.toLowerCase()
  );
}

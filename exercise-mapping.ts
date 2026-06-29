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
    title: "Cable Crunch",
    type: "weight_reps",
    equipment: "cable",
    primaryMuscle: "abs",
    secondaryMuscles: [],
  },
  {
    title: "Ab Wheel",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "abs",
    secondaryMuscles: [],
  },
  {
    title: "Back Extension",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "back",
    secondaryMuscles: ["glutes", "hamstrings"],
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

  // ----- Half marathon warmup / cooldown / running -----
  // Used by the half marathon program. Hevy's fuzzy matcher handles common
  // names (e.g. Glute Bridges, Clamshells) — list only the ones unlikely to
  // exist as built-ins, plus Running as a fallback in case fuzzy match misses.
  {
    title: "Running",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "McGill Bird Dog",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "abs",
    secondaryMuscles: ["glutes"],
  },
  {
    title: "McGill Dead Bug",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "abs",
    secondaryMuscles: [],
  },
  {
    title: "McGill Side Plank",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "abs",
    secondaryMuscles: ["shoulders"],
  },
  {
    title: "Ankle Circles",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Heel Raises",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Ankle Circles + Heel Raises",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Hip Flexor Stretch",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "quads",
    secondaryMuscles: [],
  },
  {
    title: "Leg Swings",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "other",
    secondaryMuscles: ["hamstrings", "glutes"],
  },
  {
    title: "Calf Stretch (Gastrocnemius)",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Calf Stretch (Soleus)",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Glute Stretch",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Foot Rolling",
    type: "duration",
    equipment: "other",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Single-Leg Glute Bridges",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings"],
  },
  {
    title: "Banded Lateral Walks",
    type: "bodyweight_reps",
    equipment: "band",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Banded Clamshells",
    type: "bodyweight_reps",
    equipment: "band",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Banded Clamshells + Lateral Walks",
    type: "bodyweight_reps",
    equipment: "band",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Dynamic Hip Flexor Lunge with Reach",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes"],
  },
  {
    title: "Ankle Dorsiflexion Wall Mobilisation",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Easy Jog (warmup)",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Easy jog",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Calf + Achilles Stretch",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "Walk (after long runs only)",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Strides before race pace sessions",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Race morning warm-up",
    type: "duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Race morning strides",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "IT Band / Glute Stretch",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Foam Roll Quads",
    type: "duration",
    equipment: "other",
    primaryMuscle: "quads",
    secondaryMuscles: [],
  },
  {
    title: "Foam Roll IT Band",
    type: "duration",
    equipment: "other",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Foam Roll Calves",
    type: "duration",
    equipment: "other",
    primaryMuscle: "calves",
    secondaryMuscles: [],
  },
  {
    title: "A-Skips",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "quads",
    secondaryMuscles: ["calves"],
  },
  {
    title: "B-Skips",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes"],
  },
  {
    title: "Strides",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Walk (cooldown)",
    type: "distance_duration",
    equipment: "cardio",
    primaryMuscle: "cardio",
    secondaryMuscles: [],
  },
  {
    title: "Glute Bridges",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings"],
  },
  {
    title: "Clamshells",
    type: "bodyweight_reps",
    equipment: "bodyweight",
    primaryMuscle: "glutes",
    secondaryMuscles: [],
  },
  {
    title: "Full lower body stretch circuit",
    type: "duration",
    equipment: "bodyweight",
    primaryMuscle: "full_body",
    secondaryMuscles: [],
  },
];

// Explicit mappings for exercises that have different names in Hevy.
// Values are ordered aliases: use the first title that exists in the user's
// Hevy template list. If none exist, fuzzy-match only against these intended
// target aliases (not the source name), so e.g. Leg Curl cannot drift to Drag Curl.
const EXPLICIT_TARGET_FUZZY_THRESHOLD = 0.8;
const EXPLICIT_MAPPINGS: Record<string, string[]> = {
  "Back Squat": ["Squat (Barbell)"],
  "High Bar Squat": ["Squat (Barbell)"],
  "Pause Squat (1 sec)": ["Pause Squat (Barbell)"],
  "Pause Squat (2 sec)": ["Pause Squat (Barbell)"],
  "Pause Squat (3 sec)": ["Pause Squat (Barbell)"],
  "Pause Squat (Barbell)": ["Pause Squat (Barbell)"],
  "Bench Press": ["Bench Press (Barbell)"],
  "Feet Up Bench Press (Barbell)": ["Feet Up Bench Press (Barbell)"],
  Deadlift: ["Deadlift (Barbell)"],
  "Romanian Deadlift": ["Romanian Deadlift (Barbell)"],
  "Leg Press": ["Leg Press (Machine)", "Leg Press Machine", "Leg Press"],
  "Leg Extension": [
    "Leg Extension (Machine)",
    "Leg Extension Machine",
    "Leg Extension",
  ],
  "Pull Up": ["Pull Up", "Pull Ups", "Pull-up", "Pull-ups"],
  "Chest Dip": ["Dip", "Dips", "Chest Dip", "Chest Dips"],
  "Incline DB Press": [
    "Incline Dumbbell Bench Press",
    "Incline Dumbbell Bench Press (Dumbbell)",
    "Incline Dumbbell Press",
  ],
  "Seated Cable Row": ["Seated Cable Row - Bar Grip", "Seated Cable Row"],
  "Barbell Curl": ["Bicep Curl (Barbell)", "Barbell Curl"],
  "Barbell Row": ["Bent Over Row (Barbell)", "Barbell Row"],
  "Front Squat": ["Front Squat (Barbell)", "Front Squat"],
  "Lateral Raise": ["Lateral Raise (Dumbbell)"],
  "Hanging Leg Raise": ["Hanging Leg Raise"],
  "Tricep Extension (Cable)": [
    "Triceps Pushdown",
    "Tricep Pushdown",
    "Cable Triceps Pushdown",
  ],
  "Leg Curl": [
    "Seated Leg Curl (Machine)",
    "Seated Leg Curl Machine",
    "Seated Leg Curl",
    "Leg Curl Machine",
    "Leg Curl (Machine)",
    "Leg Curl",
    "Lying Leg Curl Machine",
    "Lying Leg Curl (Machine)",
    "Lying Leg Curl",
    "Hamstring Curl (Machine)",
    "Hamstring Curl Machine",
  ],
  "Single Arm Landmine Press": [
    "Single Arm Landmine Press",
    "Single Arm Landmine Press (Barbell)",
    "Single-Arm Landmine Press",
    "Single-Arm Landmine Press (Barbell)",
  ],
  "Ring Dip": ["Ring Dips", "Ring Dip"],
  "Ring Dips": ["Ring Dips", "Ring Dip"],
  "Ring Rollout": ["Ring Rollout"],
  "Ab Wheel": [
    "Ab Wheel",
    "Ab Wheel (Bodyweight)",
    "Ab Wheel Rollout",
    "Ab Wheel Rollout (Bodyweight)",
  ],
  "Back Extension": [
    "Back Extension",
    "Back Extension (Bodyweight)",
    "Hyperextension",
    "Hyperextensions",
  ],
  "Inverted Row": ["Inverted Row"],
  "Inverted Row (Rings)": ["Inverted Row"],
  "Single Leg Romanian Deadlift (Dumbbell)": [
    "Single Leg Romanian Deadlift (Dumbbell)",
  ],
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

    // Check explicit mappings first. Exact aliases win; if no exact alias
    // exists, fuzzy-match the intended aliases only (not the source name), then
    // flag a gap rather than letting unrelated exercises win by accident.
    const explicitTargets = EXPLICIT_MAPPINGS[csvExercise];
    if (explicitTargets) {
      let matchedTemplate: HevyExerciseTemplate | undefined;
      let matchScore = 1;

      for (const target of explicitTargets) {
        matchedTemplate = hevyTemplates.find(
          (t) => t.title.toLowerCase() === target.toLowerCase()
        );
        if (matchedTemplate) break;
      }

      if (!matchedTemplate) {
        let best:
          | { template: HevyExerciseTemplate; rating: number }
          | undefined;
        for (const target of explicitTargets) {
          const result = stringSimilarity.findBestMatch(
            target.toLowerCase(),
            templateTitles
          );
          const template = hevyTemplates.find(
            (t) => t.title.toLowerCase() === result.bestMatch.target
          );
          if (
            template &&
            result.bestMatch.rating >= EXPLICIT_TARGET_FUZZY_THRESHOLD &&
            (!best || result.bestMatch.rating > best.rating)
          ) {
            best = { template, rating: result.bestMatch.rating };
          }
        }
        if (best) {
          matchedTemplate = best.template;
          matchScore = best.rating;
        }
      }

      if (matchedTemplate) {
        mapping.set(csvExercise, {
          csvName: csvExercise,
          templateId: matchedTemplate.id,
          templateTitle: matchedTemplate.title,
          matchScore,
          isCustom: false,
        });
      } else {
        mapping.set(csvExercise, {
          csvName: csvExercise,
          templateId: "__NEEDS_CREATION__",
          templateTitle: explicitTargets[0] ?? csvExercise,
          matchScore: 0,
          isCustom: false,
        });
      }
      continue;
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

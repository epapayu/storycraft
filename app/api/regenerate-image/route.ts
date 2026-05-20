import { generateImageForScenario } from "@/app/features/shared/actions/image-generation";
import logger from "@/app/logger";
import { Scenario } from "@/app/types";

import { DEFAULT_SETTINGS } from "@/lib/ai-config";
import {
    regenerateImageApiPostSchema,
    regenerateImageApiPutSchema,
} from "@/app/schemas";
import {
    successResponse,
    forbiddenResponse,
    errorResponse,
} from "@/lib/api/response";
import { verifyScenarioAccess } from "@/lib/api/ownership";
import { withAuth } from "@/lib/api/with-auth";
import { validateInput } from "@/lib/utils/validation";

export const POST = withAuth(async (request, { userId }) => {
    try {
        const body = await request.json();

        // Validate request body
        const validation = validateInput(body, regenerateImageApiPostSchema);
        if (!validation.success) {
            return validation.errorResponse;
        }

        const {
            prompt,
            scenario,
            modelName = DEFAULT_SETTINGS.imageModel,
        } = validation.data;

        // Verify ownership if scenario has an ID
        if (scenario.id) {
            const hasAccess = await verifyScenarioAccess(scenario.id, userId, "editor");
            if (!hasAccess) {
                return forbiddenResponse();
            }
        }


        const result = await generateImageForScenario({
            scenario,
            imagePrompt: prompt,
            modelName,
        });

        return successResponse(result);
    } catch (error) {
        logger.error("Error regenerating image:", error);
        return errorResponse(
            "Failed to regenerate image",
            "IMAGE_REGEN_ERROR",
            500,
            error instanceof Error ? error.message : "Unknown error",
        );
    }
});

export const PUT = withAuth(async (request) => {
    try {
        const body = await request.json();

        // Validate request body
        // Note: regenerateImageApiPutSchema only has 'prompt'
        const validation = validateInput(body, regenerateImageApiPutSchema);
        if (!validation.success) {
            return validation.errorResponse;
        }

        const { prompt } = validation.data;

        // Note: PUT currently doesn't receive a scenario ID, so it's technically
        // not checking ownership of any specific scenario.
        // However, if it were to be used, it should probably include a scenario ID.

        const result = await generateImageForScenario({
            scenario: {
                style: "Photographic",
                aspectRatio: "1:1",
                characters: [],
                settings: [],
                props: [],
                name: "",
                pitch: "",
                scenario: "",
                durationSeconds: 0,
                genre: "",
                mood: "",
                music: "",
                language: { name: "English", code: "en-US" },
                scenes: [],
            } as Scenario,
            entity: { name: "Entity", description: prompt },
            entityType: "character", // Default to character for 1:1
        });

        return successResponse(result);
    } catch (error) {
        logger.error("Error regenerating character image:", error);
        return errorResponse(
            "Failed to regenerate character image",
            "CHAR_IMAGE_REGEN_ERROR",
            500,
            error instanceof Error ? error.message : "Unknown error",
        );
    }
});

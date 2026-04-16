"use server";

import { generateMusic as generateMusicApi } from "@/lib/api/gemini";
import logger from "@/app/logger";
import { generateMusicSchema } from "@/app/schemas";
import { requireAuth } from "@/lib/api/auth-utils";
import { validateActionInput } from "@/lib/utils/validation";

export async function generateMusic(prompt: string): Promise<string> {
    await requireAuth();
    validateActionInput(
        { prompt },
        generateMusicSchema,
        "Validation error in generateMusic",
    );
    logger.debug("Generating music");
    try {
        const response = await generateMusicApi(prompt);
        if (!response.success || !response.audioGcsUri) {
            throw new Error(
                response.errorMessage || "Failed to generate music",
            );
        }
        logger.debug("Music generated!");
        return response.audioGcsUri;
    } catch (error) {
        logger.error("Error generating music:", error);
        throw new Error(
            `Failed to generate music: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
}

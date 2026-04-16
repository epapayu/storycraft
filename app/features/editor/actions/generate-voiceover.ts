"use server";

import { generateSpeech } from "@/lib/api/gemini";
import { Language } from "@/app/types";
import logger from "@/app/logger";
import { generateVoiceoverSchema } from "@/app/schemas";
import { requireAuth } from "@/lib/api/auth-utils";
import { validateActionInput } from "@/lib/utils/validation";

export async function generateVoiceover(
    scenes: Array<{
        voiceover: string;
    }>,
    language: Language,
    voiceName?: string,
): Promise<string[]> {
    await requireAuth();
    validateActionInput(
        {
            scenes,
            language,
            voiceName,
        },
        generateVoiceoverSchema,
        "Validation error in generateVoiceover",
    );

    logger.debug(`Generating voiceover with voice: ${voiceName || "default"}`);
    try {
        const speachAudioFiles = await Promise.all(
            scenes.map(async (scene) => {
                const result = await generateSpeech(
                    scene.voiceover,
                    language.code,
                    voiceName,
                );

                if (!result.success || !result.audioGcsUri) {
                    throw new Error(
                        result.errorMessage || "Failed to generate speech",
                    );
                }

                return { filename: result.audioGcsUri, text: scene.voiceover };
            }),
        );
        const voiceoverAudioUrls = speachAudioFiles.map((r) => r.filename);
        logger.debug(`Generated voiceover audio URLs: ${voiceoverAudioUrls}`);
        return voiceoverAudioUrls;
    } catch (error) {
        logger.error("Error generating voiceover:", error);
        throw new Error(
            `Failed to generate voiceover: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
}

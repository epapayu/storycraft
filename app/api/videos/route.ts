import { Scene, Scenario } from "@/app/types";
import { videoPromptToString } from "@/lib/utils/prompt-utils";
import { generateSceneVideo } from "@/lib/api/veo";
import pLimit from "p-limit";

import logger from "@/app/logger";
import { getRAIUserMessage } from "@/lib/utils/rai";
import { DEFAULT_SETTINGS } from "@/lib/ai-config";
import { videoApiPostSchema } from "@/app/schemas";
import {
    successResponse,
    forbiddenResponse,
    errorResponse,
} from "@/lib/api/response";
import { verifyScenarioAccess } from "@/lib/api/ownership";
import { withAuth } from "@/lib/api/with-auth";
import { validateInput } from "@/lib/utils/validation";

const USE_COSMO = process.env.USE_COSMO === "true";
const GCS_VIDEOS_STORAGE_URI = process.env.GCS_VIDEOS_STORAGE_URI;

const placeholderVideoUrls = [
    `${GCS_VIDEOS_STORAGE_URI}cosmo.mp4`,
    `${GCS_VIDEOS_STORAGE_URI}dogs1.mp4`,
    `${GCS_VIDEOS_STORAGE_URI}dogs2.mp4`,
    `${GCS_VIDEOS_STORAGE_URI}cats1.mp4`,
];

const placeholderVideoUrls916 = [
    //`${GCS_VIDEOS_STORAGE_URI}cat_1_9_16.mp4`,
    `${GCS_VIDEOS_STORAGE_URI}cat_2_9_16.mp4`,
    `${GCS_VIDEOS_STORAGE_URI}dog_9_16.mp4`,
    `${GCS_VIDEOS_STORAGE_URI}dog_2_9_16.mp4`,
];

/**
 * Handles POST requests to generate videos from a list of scenes. test
 *
 * @param req - The incoming request object, containing a JSON payload with an array of scenes.
 *               Each scene should have `imagePrompt`, `description`, `voiceover`, and optionally `imageBase64`.
 * @returns A Promise that resolves to a Response object. The response will be a JSON object
 *          with either a success flag and the generated video URLs or an error message.
 */
export const POST = withAuth(async (req, { userId }) => {
    try {
        const body = await req.json();

        // Validate request body
        const validation = validateInput(body, videoApiPostSchema);
        if (!validation.success) {
            return validation.errorResponse;
        }

        const {
            scenes,
            scenario,
            aspectRatio,
            model,
            generateAudio,
            durationSeconds,
            resolution,
        } = validation.data;

        // Verify ownership if scenario has an ID
        if (scenario.id) {
            const hasAccess = await verifyScenarioAccess(scenario.id, userId, "editor");
            if (!hasAccess) {
                return forbiddenResponse();
            }
        }


        logger.debug("Generating videos in parallel...");
        logger.debug(`model: ${model}`);
        logger.debug(`generateAudio: ${generateAudio}`);
        logger.debug(`resolution: ${resolution}`);
        logger.debug(`scenes: ${scenes}`);
        logger.debug(`durationSeconds: ${durationSeconds}`);

        const limit = pLimit(10); // Max 10 concurrent video generations

        const videoGenerationTasks = (scenes as Scene[])
            .filter((scene) => scene.imageGcsUri)
            .map((scene, index) =>
                limit(async () => {
                    logger.debug(
                        `Starting video generation for scene ${index + 1}`,
                    );
                    let url: string;
                    if (USE_COSMO) {
                        // randomize the placeholder video urls
                        logger.debug(`aspectRatio: ${aspectRatio}`);
                        if (aspectRatio === "9:16") {
                            url =
                                placeholderVideoUrls916[
                                    Math.floor(
                                        Math.random() *
                                            placeholderVideoUrls916.length,
                                    )
                                ];
                        } else {
                            url =
                                placeholderVideoUrls[
                                    Math.floor(
                                        Math.random() *
                                            placeholderVideoUrls.length,
                                    )
                                ];
                        }
                    } else {
                        const promptString =
                            typeof scene.videoPrompt === "string"
                                ? scene.videoPrompt
                                : videoPromptToString(
                                      scene.videoPrompt,
                                      scenario as Scenario,
                                  );
                        logger.debug(promptString);
                        logger.debug(
                            `Operation started for scene ${index + 1}`,
                        );
                        const generateVideoResponse = await generateSceneVideo(
                            promptString,
                            scene.imageGcsUri!,
                            aspectRatio,
                            model || DEFAULT_SETTINGS.videoModel,
                            generateAudio !== undefined
                                ? generateAudio
                                : DEFAULT_SETTINGS.generateAudio,
                            durationSeconds,
                            resolution || DEFAULT_SETTINGS.videoResolution,
                        );
                        logger.debug(
                            `Video generation completed for scene ${index + 1}`,
                        );
                        logger.debug(generateVideoResponse);

                        if (generateVideoResponse.raiMediaFilteredReasons) {
                            // Throw an error with the determined user-friendly message
                            throw new Error(
                                getRAIUserMessage(
                                    generateVideoResponse
                                        .raiMediaFilteredReasons[0],
                                ),
                            );
                        }
                        const videos = generateVideoResponse.generatedVideos;
                        if (!videos || videos.length === 0) {
                            console.log(
                                JSON.stringify(generateVideoResponse, null, 2),
                            );
                            throw new Error("No videos generated");
                        }
                        const gcsUri = videos[0]?.video?.uri;
                        if (!gcsUri) {
                            throw new Error("No video URI generated");
                        }
                        url = gcsUri;
                    }
                    logger.debug(`Video Generated! ${url}`);
                    return url;
                }),
            );

        const videoUrls = await Promise.all(videoGenerationTasks);

        return successResponse({ videoUrls });
    } catch (error) {
        logger.error("Error in generateVideo:", error);
        return errorResponse(
            error instanceof Error
                ? error.message
                : "Failed to generate video(s)",
            "VIDEO_GENERATION_ERROR",
        );
    }
});

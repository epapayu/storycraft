import logger from "@/app/logger";
import { DEFAULT_SETTINGS } from "@/lib/ai-config";
import { GenerateVideosResponse, GoogleGenAI } from "@google/genai";
import { env } from "@/lib/utils/env";

const PROJECT_ID = env.PROJECT_ID;

// Use a global variable to ensure the client is reused across HMR in development
const globalForAI = global as unknown as { ai: GoogleGenAI };

function getAiClient() {
    if (globalForAI.ai) {
        return globalForAI.ai;
    }

    const ai = new GoogleGenAI({
        vertexai: true,
        project: PROJECT_ID,
        location: "global",
    });

    if (process.env.NODE_ENV !== "production") {
        globalForAI.ai = ai;
    }

    return ai;
}

async function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateSceneVideo(
    prompt: string,
    imageGcsUri: string,
    aspectRatio: string = "16:9",
    model: string = DEFAULT_SETTINGS.videoModel,
    generateAudio: boolean = DEFAULT_SETTINGS.generateAudio,
    durationSeconds: number = 8,
    resolution: string = "1080p",
): Promise<GenerateVideosResponse> {
    const ai = getAiClient();
    const modifiedPrompt = prompt + "\nSubtitles: off";
    logger.debug(
        `generateSceneVideo {model: ${model}, prompt: ${modifiedPrompt}, resolution: ${resolution}}`,
    );

    let operation = await ai.models.generateVideos({
        model: model,
        prompt: modifiedPrompt,
        image: {
            gcsUri: imageGcsUri,
            mimeType: "image/png",
        },
        config: {
            outputGcsUri: env.GCS_VIDEOS_STORAGE_URI,
            numberOfVideos: 1,
            aspectRatio: aspectRatio,
            generateAudio: generateAudio,
            durationSeconds: durationSeconds,
            // compressionQuality: VideoCompressionQuality.LOSSLESS,
            resolution: resolution,
        },
    });

    console.log("[SERVER] Waiting for video generation to complete...");
    let pollCount = 0;
    const maxPolls = 60;

    while (!operation.done && pollCount < maxPolls) {
        logger.debug(`poll operation ${operation.name}`);
        operation = await ai.operations.get({ operation: operation });
        await delay(5000);
        pollCount++;
    }

    if (!operation.done) {
        throw new Error("Video generation timed out");
    }

    const videos = operation.response?.generatedVideos;
    if (!videos || videos.length === 0) {
        logger.error(JSON.stringify(operation, null, 2));
        throw new Error("No videos generated");
    }
    return operation.response!;
}

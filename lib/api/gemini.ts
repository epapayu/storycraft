import {
    ContentListUnion,
    GenerateContentConfig,
    GoogleGenAI,
    ThinkingLevel,
    UpscaleImageConfig,
} from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import { uploadImage } from "@/lib/storage/storage";
import logger from "@/app/logger";
import { env } from "@/lib/utils/env";
import { DEFAULT_SETTINGS } from "@/lib/ai-config";
import { withRetry } from "@/lib/utils/retry";
import { uploadBufferToGcs } from "@/lib/utils/storage-utils";
import { convertPcmToMp3 } from "@/lib/utils/ffmpeg";

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

export async function generateContent(
    prompt: ContentListUnion,
    config: GenerateContentConfig = {
        thinkingConfig: {
            // includeThoughts: true,
            thinkingBudget: -1,
        },
        responseMimeType: "application/json",
    },
    model: string = DEFAULT_SETTINGS.llmModel,
): Promise<string | undefined> {
    const ai = getAiClient();
    config = {
        ...config,
        thinkingConfig: {
            // includeThoughts: true,
            thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: config.responseMimeType,
    };

    const useSearchAndBrowser = false;
    if (useSearchAndBrowser) {
        config.tools = [{ googleSearch: {} }, { urlContext: {} }];
        config.responseMimeType = "text/plain";
    }

    const response = await ai.models.generateContent({
        model,
        config,
        contents: prompt,
    });

    return response.text;
}

interface GenerateNanoBananaImageResponse {
    success: boolean;
    imageGcsUri?: string;
    errorMessage?: string;
}

interface GenerateMusicResponse {
    success: boolean;
    audioGcsUri?: string;
    errorMessage?: string;
}

export async function generateSpeech(
    text: string,
    language: string,
    voiceName?: string,
): Promise<GenerateMusicResponse> {
    const ai = getAiClient();
    logger.debug(`Generating speech for text: ${text}`);
    logger.debug(`Language: ${language}`);
    logger.debug(`Voice Name: ${voiceName}`);
    return withRetry(
        async () => {
            const response = await ai.models.generateContent({
                model: "gemini-3.1-flash-tts-preview",
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceName,
                            },
                        },
                        languageCode: language,
                    },
                },
                contents: text,
            });

            // Process the response to find and save the generated image
            if (!response.candidates || response.candidates.length === 0) {
                logger.warn("No candidates found in the response.");
                // If no candidates, but no error, it might be a valid (empty) response, so break retry loop.
                return {
                    success: false,
                    errorMessage: "No candidates found in the response.",
                };
            }

            const firstCandidate = response.candidates[0];
            let audioGcsUri;
            for (const part of firstCandidate.content!.parts!) {
                if (part.inlineData) {
                    const pcmBuffer = Buffer.from(
                        part.inlineData!.data!,
                        "base64",
                    );
                    const audioBuffer = await convertPcmToMp3(pcmBuffer);
                    const uuid = uuidv4();
                    audioGcsUri = await uploadBufferToGcs(
                        audioBuffer,
                        `audio-${uuid}.mp3`,
                        "audio/mpeg",
                    );
                    return { success: true, audioGcsUri: audioGcsUri! };
                }
            }

            // If we reach here, no inlineData (audio) was found
            return {
                success: false,
                errorMessage:
                    response.text || "No audio data found in response.",
            };
        },
        { maxRetries: 1 },
    );
}

export async function generateMusic(
    prompt: string,
): Promise<GenerateMusicResponse> {
    const ai = getAiClient();
    return withRetry(
        async () => {
            const response = await ai.models.generateContent({
                model: "lyria-3-pro-preview",
                config: {
                    responseModalities: ["AUDIO", "TEXT"],
                },
                contents: prompt,
            });

            // Process the response to find and save the generated image
            if (!response.candidates || response.candidates.length === 0) {
                logger.warn("No candidates found in the response.");
                // If no candidates, but no error, it might be a valid (empty) response, so break retry loop.
                return {
                    success: false,
                    errorMessage: "No candidates found in the response.",
                };
            }

            const firstCandidate = response.candidates[0];
            let audioGcsUri;
            for (const part of firstCandidate.content!.parts!) {
                if (part.inlineData) {
                    const audioBuffer = Buffer.from(
                        part.inlineData!.data!,
                        "base64",
                    );
                    const uuid = uuidv4();
                    audioGcsUri = await uploadBufferToGcs(
                        audioBuffer,
                        `music-${uuid}.mp3`,
                        "audio/mpeg",
                    );
                    return { success: true, audioGcsUri: audioGcsUri! };
                }
            }

            // If we reach here, no inlineData (audio) was found
            return {
                success: false,
                errorMessage:
                    response.text || "No audio data found in response.",
            };
        },
        { maxRetries: 1 },
    );
}

export async function generateImage(
    prompt: ContentListUnion,
    config: GenerateContentConfig = {
        responseModalities: ["IMAGE"],
    },
    model: string = DEFAULT_SETTINGS.imageModel,
): Promise<GenerateNanoBananaImageResponse> {
    const ai = getAiClient();
    logger.debug(JSON.stringify(prompt, null, 2));

    return withRetry(
        async () => {
            logger.debug("Generate Image : " + model);
            logger.debug("Config : " + JSON.stringify(config, null, 2));
            const response = await ai.models.generateContent({
                model,
                config,
                contents: prompt,
            });

            // Process the response to find and save the generated image
            if (!response.candidates || response.candidates.length === 0) {
                logger.warn("No candidates found in the response.");
                // If no candidates, but no error, it might be a valid (empty) response, so break retry loop.
                return {
                    success: false,
                    errorMessage: "No candidates found in the response.",
                };
            }

            const firstCandidate = response.candidates[0];
            let imageGcsUri;
            for (const part of firstCandidate.content!.parts!) {
                if (part.inlineData) {
                    const imageBuffer = Buffer.from(
                        part.inlineData!.data!,
                        "base64",
                    );
                    const uuid = uuidv4();
                    imageGcsUri = await uploadImage(
                        imageBuffer.toString("base64"),
                        `gemini-${uuid}.png`,
                    );
                    return { success: true, imageGcsUri: imageGcsUri! };
                }
            }
            // If we reach here, no inlineData was found but no error occurred, so break retry loop.
            return { success: false, errorMessage: response.text };
        },
        {
            maxRetries: 5,
            onRetry: (attempt, error, delay) => {
                logger.warn(
                    `Attempt ${attempt} failed for generateImage. Retrying in ${Math.round(delay)}ms...`,
                    error,
                );
            },
        },
    );
}

export async function upscaleImage(
    imageGcsUri: string,
    upscaleFactor: "x2" | "x3" | "x4" = "x2",
    config: UpscaleImageConfig = {
        outputGcsUri: env.GCS_VIDEOS_STORAGE_URI,
        outputMimeType: "image/png",
        includeRaiReason: true,
        enhanceInputImage: true,
        imagePreservationFactor: 1.0,
    },
    model: string = "imagen-4.0-upscale-preview",
): Promise<GenerateNanoBananaImageResponse> {
    const ai = getAiClient();
    return withRetry(
        async () => {
            logger.debug("Upscale Image : " + model);
            logger.debug("Config : " + JSON.stringify(config, null, 2));
            const response = await ai.models.upscaleImage({
                model,
                image: {
                    gcsUri: imageGcsUri,
                    mimeType: "image/png",
                },
                upscaleFactor,
                config,
            });

            if (
                !response.generatedImages ||
                response.generatedImages.length === 0
            ) {
                console.error("[SERVER] No generated images in response");
                return {
                    success: false,
                    errorMessage: "No candidates found in the response.",
                };
            }

            const candidate = response.generatedImages[0];
            if (!candidate.image || !candidate.image.gcsUri) {
                console.error("[SERVER] No image in response");
                return {
                    success: false,
                    errorMessage: "No content parts in response",
                };
            }

            const upscaledImageGcsUri = candidate.image.gcsUri;
            // If we reach here, no inlineData was found but no error occurred, so break retry loop.
            return { success: true, imageGcsUri: upscaledImageGcsUri };
        },
        {
            maxRetries: 5,
            onRetry: (attempt, error, delay) => {
                logger.warn(
                    `Attempt ${attempt} failed for upscaleImage. Retrying in ${Math.round(delay)}ms...`,
                    error,
                );
            },
        },
    );
}

"use server";

import { analyzeStyleImageSchema } from "@/app/schemas";
import { generateContent } from "@/lib/api/gemini";
import { requireAuth } from "@/lib/api/auth-utils";
import logger from "@/app/logger";

export async function analyzeStyleImageAction(
    gcsUri: string,
): Promise<{ success: boolean; description?: string; error?: string }> {
    try {
        await requireAuth();

        const parseResult = analyzeStyleImageSchema.safeParse({ gcsUri });
        if (!parseResult.success) {
            return {
                success: false,
                error: `Invalid input: ${parseResult.error.message}`,
            };
        }

        const prompt = [
            {
                fileData: {
                    mimeType: "image/jpeg",
                    fileUri: gcsUri,
                },
            },
            {
                text: "Analyze the visual style of this image. Describe the lighting, color palette, medium (e.g., oil painting, digital art, photography), texture, and overall mood. Do NOT describe the subject matter (e.g., people, objects) or specific content. Focus ONLY on the artistic style. Provide a concise comma-separated list of descriptors suitable for an image generation prompt.",
            },
        ];

        const description = await generateContent(
            prompt,
            { responseMimeType: "text/plain" },
            "gemini-3-flash-preview",
        );

        if (!description) {
            throw new Error("No description generated");
        }

        return { success: true, description };
    } catch (error) {
        logger.error("Error analyzing style image:", error);
        return { success: false, error: "Failed to analyze style image" };
    }
}

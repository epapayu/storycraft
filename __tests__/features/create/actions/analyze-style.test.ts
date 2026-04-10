import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeStyleImageAction } from "@/app/features/create/actions/analyze-style";
import * as gemini from "@/lib/api/gemini";

vi.mock("@/lib/api/auth-utils", () => ({
    requireAuth: vi.fn().mockResolvedValue({ user: { id: "test-user" } }),
}));

vi.mock("@/lib/api/gemini", () => ({
    generateContent: vi.fn(),
}));

vi.mock("@/app/logger", () => ({
    default: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

describe("analyzeStyleImageAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return a style description when valid GCS URI is provided", async () => {
        const mockDescription =
            "Cinematic lighting, high contrast, warm sepia tones";
        (
            gemini.generateContent as unknown as ReturnType<typeof vi.fn>
        ).mockResolvedValue(mockDescription);

        const result = await analyzeStyleImageAction("gs://bucket/style.jpg");

        expect(result.success).toBe(true);
        expect(result.description).toBe(mockDescription);
        expect(gemini.generateContent).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    fileData: expect.objectContaining({
                        fileUri: "gs://bucket/style.jpg",
                    }),
                }),
                expect.objectContaining({
                    text: expect.stringContaining("Analyze the visual style"),
                }),
            ]),
            expect.objectContaining({ responseMimeType: "text/plain" }),
            "gemini-3-flash-preview",
        );
    });

    it("should return failure if input is invalid", async () => {
        const result = await analyzeStyleImageAction("invalid-uri");

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid input");
        expect(gemini.generateContent).not.toHaveBeenCalled();
    });

    it("should return failure if Gemini API fails", async () => {
        (
            gemini.generateContent as unknown as ReturnType<typeof vi.fn>
        ).mockRejectedValue(new Error("API Error"));

        const result = await analyzeStyleImageAction("gs://bucket/style.jpg");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Failed to analyze style image");
    });

    it("should return failure if description is empty", async () => {
        (
            gemini.generateContent as unknown as ReturnType<typeof vi.fn>
        ).mockResolvedValue(undefined);

        const result = await analyzeStyleImageAction("gs://bucket/style.jpg");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Failed to analyze style image");
    });
});

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { POST, PUT } from "@/app/api/regenerate-image/route";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import * as imageGen from "@/app/features/shared/actions/image-generation";
import { verifyScenarioAccess } from "@/lib/api/ownership";

vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/app/features/shared/actions/image-generation", () => ({
    generateImageForScenario: vi.fn(),
}));

vi.mock("@/lib/api/ownership", () => ({
    verifyScenarioAccess: vi.fn(),
}));

vi.mock("@/app/logger", () => ({
    default: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

describe("regenerate-image API integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (auth as Mock).mockResolvedValue({ user: { id: "user-1" } });
        (imageGen.generateImageForScenario as Mock).mockResolvedValue({
            success: true,
            imageGcsUri: "gs://bucket/mock-regen-image.png",
        });
        (verifyScenarioAccess as Mock).mockResolvedValue(true);
    });

    it("POST should return 403 when user does not own the scenario", async () => {
        (verifyScenarioAccess as Mock).mockResolvedValue(false);


        const body = {
            prompt: {
                Style: "Photographic",
                Scene: "A test scene",
                Composition: {
                    shot_type: "Wide Shot",
                    lighting: "Natural",
                    overall_mood: "Calm",
                },
                Subject: [],
                Context: [],
                Prop: [],
            },
            scenario: {
                id: "other-user-scenario",
                name: "Test",
                pitch: "Test",
                scenario: "Test",
                style: "Photographic",
                aspectRatio: "16:9",
                durationSeconds: 10,
                genre: "Test",
                mood: "Test",
                music: "Test",
                language: { name: "English", code: "en-US" },
                characters: [],
                settings: [],
                props: [],
                scenes: [],
            },
        };

        const request = new NextRequest(
            "http://localhost/api/regenerate-image",
            {
                method: "POST",
                body: JSON.stringify(body),
            },
        );

        const response = await POST(request);
        expect(response.status).toBe(403);
        expect(imageGen.generateImageForScenario).not.toHaveBeenCalled();
    });

    it("POST should call generateImageForScenario for scene regeneration when owned", async () => {
        const body = {
            prompt: {
                Style: "Photographic",
                Scene: "A test scene",
                Composition: {
                    shot_type: "Wide Shot",
                    lighting: "Natural",
                    overall_mood: "Calm",
                },
                Subject: [],
                Context: [],
                Prop: [],
            },
            scenario: {
                name: "Test",
                pitch: "Test",
                scenario: "Test",
                style: "Photographic",
                aspectRatio: "16:9",
                durationSeconds: 10,
                genre: "Test",
                mood: "Test",
                music: "Test",
                language: { name: "English", code: "en-US" },
                characters: [],
                settings: [],
                props: [],
                scenes: [],
            },
        };

        const request = new NextRequest(
            "http://localhost/api/regenerate-image",
            {
                method: "POST",
                body: JSON.stringify(body),
            },
        );

        const response = await POST(request);
        const json = await response.json();

        expect(imageGen.generateImageForScenario).toHaveBeenCalled();
        expect(json.data.imageGcsUri).toBe("gs://bucket/mock-regen-image.png");
    });

    it("PUT should call generateImageForScenario for entity regeneration", async () => {
        const body = {
            prompt: "Character prompt",
            scenario: {
                name: "Test",
                pitch: "Test",
                scenario: "Test",
                style: "Photographic",
                aspectRatio: "1:1",
                durationSeconds: 10,
                genre: "Test",
                mood: "Test",
                music: "Test",
                language: { name: "English", code: "en-US" },
                characters: [],
                settings: [],
                props: [],
                scenes: [],
            },
            entity: { name: "Hero", description: "Brave hero" },
            entityType: "character",
        };

        const request = new NextRequest(
            "http://localhost/api/regenerate-image",
            {
                method: "PUT",
                body: JSON.stringify(body),
            },
        );

        const response = await PUT(request);
        const json = await response.json();

        expect(imageGen.generateImageForScenario).toHaveBeenCalled();
        expect(json.data.imageGcsUri).toBe("gs://bucket/mock-regen-image.png");
    });
});

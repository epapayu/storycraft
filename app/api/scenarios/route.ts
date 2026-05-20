import { firestore } from "@/lib/storage/firestore";
import { Scene } from "@/app/types";
import logger from "@/app/logger";
import { scenarioApiPostSchema } from "@/app/schemas";
import { z } from "zod";
import {
    successResponse,
    forbiddenResponse,
    errorResponse,
    notFoundResponse,
} from "@/lib/api/response";
import { withAuth } from "@/lib/api/with-auth";
import { validateInput } from "@/lib/utils/validation";
import { verifyScenarioAccess, verifyProjectAccess } from "@/lib/api/ownership";

export const POST = withAuth(async (request, { userId }) => {
    try {
        const body = await request.json();

        // Validate request body
        const validation = validateInput(
            body,
            scenarioApiPostSchema,
            "Scenario validation failed",
        );
        if (!validation.success) {
            return validation.errorResponse;
        }

        const { scenario, scenarioId, projectId } = validation.data;

        // Verify project access if provided
        if (projectId) {
            const hasAccess = await verifyProjectAccess(projectId, userId, "editor");
            if (!hasAccess) {
                return forbiddenResponse("Forbidden: You do not have editor access to this project.");
            }
        }

        // Generate a unique ID if not provided
        const id = scenarioId || firestore.collection("scenarios").doc().id;

        // Prepare the scenario data for Firestore (filter out undefined values)
        const baseScenario: Record<string, any> = {
            id,
            name: scenario.name || "",
            pitch: scenario.pitch || "",
            scenario: scenario.scenario || "",
            aspectRatio: scenario.aspectRatio || "16:9",
            durationSeconds: scenario.durationSeconds || 8,
            style: scenario.style || "",
            genre: scenario.genre || "",
            mood: scenario.mood || "",
            music: scenario.music || "",
            language: scenario.language || {
                name: "English (United States)",
                code: "en-US",
            },
            characters: scenario.characters || [],
            props: scenario.props || [],
            settings: scenario.settings || [],
            scenes: (scenario.scenes || []).map((scene: Scene) => {
                const sceneData: Record<string, unknown> = {
                    imagePrompt: scene.imagePrompt,
                    videoPrompt: scene.videoPrompt,
                    description: scene.description || "",
                    voiceover: scene.voiceover || "",
                    charactersPresent: scene.charactersPresent || [],
                };

                // Only add optional fields if they have values
                if (scene.imageGcsUri)
                    sceneData.imageGcsUri = scene.imageGcsUri;
                if (typeof scene.videoUri === "string")
                    sceneData.videoUri = scene.videoUri;
                if (typeof scene.voiceoverAudioUri === "string")
                    sceneData.voiceoverAudioUri = scene.voiceoverAudioUri;
                if (scene.errorMessage)
                    sceneData.errorMessage = scene.errorMessage;

                return sceneData;
            }),
            styleImageUri: scenario.styleImageUri || null,
            musicUrl: scenario.musicUrl || null,
            logoOverlay: scenario.logoOverlay || null,
        };

        // Map project association or fallback to personal legacy mapping
        if (projectId) {
            baseScenario.projectId = projectId;
            baseScenario.createdBy = userId;
        } else {
            baseScenario.userId = userId;
        }

        const scenarioRef = firestore.collection("scenarios").doc(id);

        await firestore.runTransaction(async (transaction: any) => {
            const scenarioDoc = await transaction.get(scenarioRef);

            if (scenarioDoc.exists) {
                // Verify that user has editor access to existing scenario
                const hasAccess = await verifyScenarioAccess(id, userId, "editor");
                if (!hasAccess) {
                    throw new Error("FORBIDDEN");
                }

                // Update existing scenario
                logger.info(`Updating scenario: ${id}`);
                transaction.update(scenarioRef, {
                    ...baseScenario,
                    updatedAt: new Date(),
                });
            } else {
                // Create new scenario
                logger.info(`Creating new scenario: ${id}`);
                transaction.set(scenarioRef, {
                    ...baseScenario,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
        });

        return successResponse({ scenarioId: id });
    } catch (error) {
        if (error instanceof Error && error.message === "FORBIDDEN") {
            return forbiddenResponse();
        }
        logger.error(`Error saving scenario: ${error}`);
        return errorResponse("Failed to save scenario", "SAVE_ERROR");
    }
});

export const GET = withAuth(async (request, { userId }) => {
    try {
        const { searchParams } = new URL(request.url);
        const scenarioIdParam = searchParams.get("id");
        const projectIdParam = searchParams.get("projectId");

        // Validate scenarioId if provided
        let scenarioId: string | null = null;
        if (scenarioIdParam) {
            const validation = validateInput(
                scenarioIdParam,
                z.string(),
                "Invalid scenario ID",
            );
            if (!validation.success) {
                return validation.errorResponse;
            }
            scenarioId = validation.data;
        }

        // Validate projectId if provided
        let projectId: string | null = null;
        if (projectIdParam) {
            const validation = validateInput(
                projectIdParam,
                z.string(),
                "Invalid project ID",
            );
            if (!validation.success) {
                return validation.errorResponse;
            }
            projectId = validation.data;
        }

        if (scenarioId) {
            // Get specific scenario
            const scenarioDoc = await firestore
                .collection("scenarios")
                .doc(scenarioId)
                .get();

            if (!scenarioDoc.exists) {
                return notFoundResponse("Scenario not found");
            }

            // Verify access (legacy user owner OR project viewer)
            const hasAccess = await verifyScenarioAccess(scenarioId, userId, "viewer");
            if (!hasAccess) {
                return notFoundResponse("Scenario not found");
            }

            return successResponse({
                id: scenarioId,
                ...scenarioDoc.data(),
            });
        } else {
            let scenariosSnapshot;

            if (projectId) {
                // Verify project access
                const hasAccess = await verifyProjectAccess(projectId, userId, "viewer");
                if (!hasAccess) {
                    return forbiddenResponse("You do not have access to this project's scenarios.");
                }

                // Get all scenarios for project
                scenariosSnapshot = await firestore
                    .collection("scenarios")
                    .where("projectId", "==", projectId)
                    .orderBy("updatedAt", "desc")
                    .get();
            } else {
                // Get all scenarios for legacy user fallback
                scenariosSnapshot = await firestore
                    .collection("scenarios")
                    .where("userId", "==", userId)
                    .orderBy("updatedAt", "desc")
                    .get();
            }

            const scenarios = scenariosSnapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data(),
            }));

            return successResponse({ scenarios });
        }
    } catch (error) {
        logger.error(`Error fetching scenarios: ${error}`);
        return errorResponse("Failed to fetch scenarios", "FETCH_ERROR");
    }
});

export const DELETE = withAuth(async (request, { userId }) => {
    try {
        const { searchParams } = new URL(request.url);
        const scenarioIdParam = searchParams.get("id");

        if (!scenarioIdParam) {
            return errorResponse(
                "Scenario ID is required",
                "VALIDATION_ERROR",
                400,
            );
        }

        const validation = validateInput(
            scenarioIdParam,
            z.string(),
            "Invalid scenario ID",
        );
        if (!validation.success) {
            return validation.errorResponse;
        }
        const scenarioId = validation.data;

        // Get the scenario reference
        const scenarioRef = firestore.collection("scenarios").doc(scenarioId);

        // Use a transaction to atomically verify ownership and delete both scenario and timeline
        try {
            await firestore.runTransaction(async (transaction: any) => {
                const scenarioDoc = await transaction.get(scenarioRef);

                if (!scenarioDoc.exists) {
                    throw new Error("NOT_FOUND");
                }

                // Check if user has editor access to this scenario
                const hasAccess = await verifyScenarioAccess(scenarioId, userId, "editor");
                if (!hasAccess) {
                    throw new Error("FORBIDDEN");
                }

                // Delete the scenario
                transaction.delete(scenarioRef);

                // Delete the associated timeline if it exists
                const timelineRef = firestore
                    .collection("timelines")
                    .doc(scenarioId);
                transaction.delete(timelineRef);
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === "NOT_FOUND") {
                    return notFoundResponse("Scenario not found");
                }
                if (error.message === "FORBIDDEN") {
                    return forbiddenResponse();
                }
            }
            throw error; // Re-throw for the outer catch block
        }

        return successResponse({ success: true });
    } catch (error) {
        logger.error(`Error deleting scenario: ${error}`);
        return errorResponse("Failed to delete scenario", "DELETE_ERROR");
    }
});

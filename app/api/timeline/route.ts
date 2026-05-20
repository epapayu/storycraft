import { firestore } from "@/lib/storage/firestore";
import { timelineApiPostSchema } from "@/app/schemas";
import { z } from "zod";
import logger from "@/app/logger";
import {
    successResponse,
    forbiddenResponse,
    errorResponse,
} from "@/lib/api/response";
import { withAuth } from "@/lib/api/with-auth";
import { validateInput } from "@/lib/utils/validation";
import { verifyScenarioAccess } from "@/lib/api/ownership";

// Save or update timeline state
export const POST = withAuth(async (request, { userId }) => {
    try {
        const body = await request.json();

        // Validate request body
        const validation = validateInput(body, timelineApiPostSchema);
        if (!validation.success) {
            return validation.errorResponse;
        }

        const { scenarioId, layers } = validation.data;

        // Verify access to the parent scenario before writing
        const hasAccess = await verifyScenarioAccess(scenarioId, userId, "editor");
        if (!hasAccess) {
            return forbiddenResponse("Forbidden: You do not have editor access to this scenario.");
        }

        // Use scenarioId as the timeline document ID (1:1 relationship)
        const timelineRef = firestore.collection("timelines").doc(scenarioId);
        const scenarioRef = firestore.collection("scenarios").doc(scenarioId);

        await firestore.runTransaction(async (transaction: any) => {
            const existingDoc = await transaction.get(timelineRef);
            const scenarioDoc = await transaction.get(scenarioRef);
            const scenarioData = scenarioDoc.data();

            const timelineData: Record<string, any> = {
                id: scenarioId,
                scenarioId,
                layers,
                updatedAt: new Date(),
            };

            // Backwards compatibility mapping
            if (scenarioData?.projectId) {
                timelineData.projectId = scenarioData.projectId;
            } else {
                timelineData.userId = userId;
            }

            if (existingDoc.exists) {
                transaction.update(timelineRef, timelineData);
            } else {
                transaction.set(timelineRef, {
                    ...timelineData,
                    createdAt: new Date(),
                });
            }
        });

        return successResponse({ timelineId: scenarioId });
    } catch (error) {
        logger.error(`Error saving timeline: ${error}`);
        return errorResponse("Failed to save timeline", "SAVE_TIMELINE_ERROR");
    }
});

// Load timeline state
export const GET = withAuth(async (request, { userId }) => {
    try {
        const { searchParams } = new URL(request.url);
        const scenarioIdParam = searchParams.get("scenarioId");

        if (!scenarioIdParam) {
            return errorResponse(
                "scenarioId is required",
                "VALIDATION_ERROR",
                400,
            );
        }

        const validation = validateInput(
            scenarioIdParam,
            z.string().min(1),
            "Invalid scenarioId",
        );
        if (!validation.success) {
            return validation.errorResponse;
        }
        const scenarioId = validation.data;

        const timelineDoc = await firestore
            .collection("timelines")
            .doc(scenarioId)
            .get();

        if (!timelineDoc.exists) {
            return successResponse({ timeline: null });
        }

        // Verify viewer access to parent scenario
        const hasAccess = await verifyScenarioAccess(scenarioId, userId, "viewer");
        if (!hasAccess) {
            // Treat as not found for safety
            return successResponse({ timeline: null });
        }

        return successResponse({ timeline: timelineDoc.data() });
    } catch (error) {
        logger.error(`Error loading timeline: ${error}`);
        return errorResponse("Failed to load timeline", "LOAD_TIMELINE_ERROR");
    }
});

// Delete timeline (reset to scenario defaults)
export const DELETE = withAuth(async (request, { userId }) => {
    try {
        const { searchParams } = new URL(request.url);
        const scenarioIdParam = searchParams.get("scenarioId");

        if (!scenarioIdParam) {
            return errorResponse(
                "scenarioId is required",
                "VALIDATION_ERROR",
                400,
            );
        }

        const validation = validateInput(
            scenarioIdParam,
            z.string().min(1),
            "Invalid scenarioId",
        );
        if (!validation.success) {
            return validation.errorResponse;
        }
        const scenarioId = validation.data;

        // Verify editor access to scenario
        const hasAccess = await verifyScenarioAccess(scenarioId, userId, "editor");
        if (!hasAccess) {
            return forbiddenResponse("Forbidden: You do not have editor access to this scenario.");
        }

        const timelineRef = firestore.collection("timelines").doc(scenarioId);

        await firestore.runTransaction(async (transaction: any) => {
            const timelineDoc = await transaction.get(timelineRef);

            if (timelineDoc.exists) {
                transaction.delete(timelineRef);
            }
        });

        return successResponse({ success: true });
    } catch (error) {
        logger.error(`Error deleting timeline: ${error}`);
        return errorResponse(
            "Failed to delete timeline",
            "DELETE_TIMELINE_ERROR",
        );
    }
});

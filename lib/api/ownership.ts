import { firestore } from "@/lib/storage/firestore";
import logger from "@/app/logger";
import { FirestoreProject } from "@/types/firestore";

/**
 * Verifies that the active user belongs to the project and holds the required role.
 * @param projectId ID of the project.
 * @param userId ID of the user.
 * @param requiredRole Minimum role required ("viewer" | "editor" | "owner").
 */
export async function verifyProjectAccess(
    projectId: string,
    userId: string,
    requiredRole: "viewer" | "editor" | "owner" = "viewer"
): Promise<boolean> {
    try {
        const projectDoc = await firestore.collection("projects").doc(projectId).get();
        if (!projectDoc.exists) return false;

        const project = projectDoc.data() as FirestoreProject;
        const userRole = project.members[userId];
        if (!userRole) return false;

        const roleWeights = { viewer: 1, editor: 2, owner: 3 };
        return roleWeights[userRole] >= roleWeights[requiredRole];
    } catch (error) {
        logger.error(`Error verifying project access for project ${projectId}, user ${userId}:`, error);
        return false;
    }
}

/**
 * Verifies that the given user has access to the scenario.
 * Checks direct ownership (backwards compatibility) OR project access.
 * @param scenarioId The ID of the scenario to check.
 * @param userId The ID of the user to verify access for.
 * @param requiredRole The required access level inside the project.
 * @returns A promise that resolves to true if access is permitted.
 */
export async function verifyScenarioAccess(
    scenarioId: string | undefined,
    userId: string,
    requiredRole: "viewer" | "editor" | "owner" = "viewer"
): Promise<boolean> {
    if (!scenarioId) {
        return true; // No scenario ID means it's likely a new scenario or not yet saved
    }

    try {
        const scenarioDoc = await firestore
            .collection("scenarios")
            .doc(scenarioId)
            .get();

        if (!scenarioDoc.exists) {
            return false;
        }

        const data = scenarioDoc.data();
        
        // 1. Fallback to personal ownership check (legacy documents)
        if (data?.userId && data.userId === userId) {
            return true;
        }

        // 2. Check project level access if project exists
        if (data?.projectId) {
            return await verifyProjectAccess(data.projectId, userId, requiredRole);
        }

        return false;
    } catch (error) {
        logger.error(
            `Error verifying scenario access for ${scenarioId}:`,
            error,
        );
        return false;
    }
}


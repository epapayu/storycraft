import { firestore } from "@/lib/storage/firestore";
import logger from "@/app/logger";
import { projectMemberPutSchema } from "@/app/schemas";
import {
    successResponse,
    errorResponse,
    forbiddenResponse,
    notFoundResponse,
} from "@/lib/api/response";
import { withAuth } from "@/lib/api/with-auth";
import { validateInput } from "@/lib/utils/validation";
import { verifyProjectAccess } from "@/lib/api/ownership";

// Invite / Add a member to the project
export const PUT = withAuth(async (request, { userId }) => {
    try {
        const body = await request.json();

        // Validate input
        const validation = validateInput(
            body,
            projectMemberPutSchema,
            "Project member validation failed"
        );
        if (!validation.success) {
            return validation.errorResponse;
        }

        const { projectId, email, role } = validation.data;

        // Verify active user has owner access to the project to add members
        const isOwner = await verifyProjectAccess(projectId, userId, "owner");
        if (!isOwner) {
            return forbiddenResponse("Forbidden: Only project owners can add members.");
        }

        // Lookup user by email
        const usersSnapshot = await firestore
            .collection("users")
            .where("email", "==", email.trim())
            .limit(1)
            .get();

        if (usersSnapshot.empty) {
            return notFoundResponse(`User with email ${email} not found. They must log in to StoryCraft at least once before you can invite them.`);
        }

        const targetUserDoc = usersSnapshot.docs[0];
        const targetUserId = targetUserDoc.id;

        const projectRef = firestore.collection("projects").doc(projectId);

        await firestore.runTransaction(async (transaction: any) => {
            const projectDoc = await transaction.get(projectRef);
            if (!projectDoc.exists) {
                throw new Error("NOT_FOUND");
            }

            const projectData = projectDoc.data();
            const members = {
                ...projectData?.members,
                [targetUserId]: role,
            };

            transaction.update(projectRef, {
                members,
                updatedAt: new Date(),
            });
        });

        logger.info(`User ${userId} added ${targetUserId} (${email}) as ${role} to project ${projectId}`);
        return successResponse({ success: true });
    } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") {
            return notFoundResponse("Project not found");
        }
        logger.error(`Error adding project member: ${error}`);
        return errorResponse("Failed to add member to project", "MEMBER_ADD_ERROR");
    }
});

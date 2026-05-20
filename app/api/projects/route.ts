import { firestore } from "@/lib/storage/firestore";
import logger from "@/app/logger";
import { projectApiPostSchema } from "@/app/schemas";
import {
    successResponse,
    errorResponse,
} from "@/lib/api/response";
import { withAuth } from "@/lib/api/with-auth";
import { validateInput } from "@/lib/utils/validation";

// Create a new project
export const POST = withAuth(async (request, { userId }) => {
    try {
        const body = await request.json();

        // Validate input
        const validation = validateInput(
            body,
            projectApiPostSchema,
            "Project validation failed"
        );
        if (!validation.success) {
            return validation.errorResponse;
        }

        const { name } = validation.data;

        // Generate project doc
        const projectId = firestore.collection("projects").doc().id;
        const projectData = {
            id: projectId,
            name,
            ownerId: userId,
            members: {
                [userId]: "owner",
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await firestore.collection("projects").doc(projectId).set(projectData);
        logger.info(`Created new project ${projectId} owned by ${userId}`);

        return successResponse({ projectId });
    } catch (error) {
        logger.error(`Error creating project: ${error}`);
        return errorResponse("Failed to create project", "PROJECT_CREATE_ERROR");
    }
});

// List all projects the current user belongs to
export const GET = withAuth(async (request, { userId }) => {
    try {
        const projectsRef = firestore.collection("projects");

        // Fetch projects where user is owner, editor, or viewer
        // NOTE: We cannot use orderBy() in the Firestore query because combining an inequality/in query 
        // on a dynamic map field path (members.userId) with a sort (updatedAt) requires a composite index. 
        // Since the map key (userId) is dynamic, we cannot pre-register these indexes in Firestore.
        // Instead, we fetch the projects first, and sort them in-memory.
        const projectsSnapshot = await projectsRef
            .where(`members.${userId}`, "in", ["owner", "editor", "viewer"])
            .get();

        const projects = projectsSnapshot.docs.map((doc: any) => doc.data());

        // Sort in-memory by updatedAt descending
        projects.sort((a: any, b: any) => {
            const dateA = a.updatedAt?.toDate?.() || new Date(a.updatedAt);
            const dateB = b.updatedAt?.toDate?.() || new Date(b.updatedAt);
            return dateB.getTime() - dateA.getTime();
        });

        return successResponse({ projects });
    } catch (error) {
        logger.error(`Error fetching projects: ${error}`);
        return errorResponse("Failed to fetch projects", "PROJECT_FETCH_ERROR");
    }
});

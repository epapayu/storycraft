import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientLogger } from "@/lib/utils/client-logger";
import { ApiResponse } from "@/types/api";
import { FirestoreProject } from "@/types/firestore";
import { toast } from "sonner";

export const PROJECT_KEYS = {
    all: ["projects"] as const,
    lists: () => [...PROJECT_KEYS.all, "list"] as const,
};

export function useProjects() {
    return useQuery({
        queryKey: PROJECT_KEYS.lists(),
        queryFn: async () => {
            const response = await fetch("/api/projects");
            if (!response.ok) {
                throw new Error("Failed to fetch projects");
            }
            const result = (await response.json()) as ApiResponse<{
                projects: FirestoreProject[];
            }>;
            return result.data?.projects || [];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 3,
        refetchOnWindowFocus: false,
    });
}

export function useSaveProjectMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (name: string) => {
            const response = await fetch("/api/projects", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                throw new Error("Failed to create project");
            }

            const result = (await response.json()) as ApiResponse<{
                projectId: string;
            }>;

            if (!result.success || !result.data) {
                throw new Error(result.error?.message || "Failed to create project");
            }

            return result.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.lists() });
            clientLogger.info(`Project ${data.projectId} created successfully`);
        },
        onError: (error) => {
            clientLogger.error("Error creating project:", error);
            toast.error(error.message || "Failed to create project");
        },
    });
}

export function useAddProjectMemberMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            projectId,
            email,
            role,
        }: {
            projectId: string;
            email: string;
            role: "owner" | "editor" | "viewer";
        }) => {
            const response = await fetch("/api/projects/members", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ projectId, email, role }),
            });

            if (!response.ok) {
                const errResult = await response.json();
                throw new Error(errResult.error?.message || "Failed to add member");
            }

            const result = (await response.json()) as ApiResponse<{ success: boolean }>;
            if (!result.success) {
                throw new Error(result.error?.message || "Failed to add member");
            }

            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.lists() });
            toast.success("Member added successfully!");
        },
        onError: (error) => {
            clientLogger.error("Error adding member:", error);
            toast.error(error.message || "Failed to add member");
        },
    });
}


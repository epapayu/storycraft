import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Scenario } from "@/app/types";
import { clientLogger } from "@/lib/utils/client-logger";
import { ApiResponse } from "@/types/api";
import { FirestoreTimestamp } from "@/types/firestore";
import { toast } from "sonner";

export const SCENARIO_KEYS = {
    all: ["scenarios"] as const,
    lists: () => [...SCENARIO_KEYS.all, "list"] as const,
    details: () => [...SCENARIO_KEYS.all, "detail"] as const,
    detail: (id: string) => [...SCENARIO_KEYS.details(), id] as const,
};

export type ScenarioWithId = Scenario & {
    id: string;
    updatedAt?: FirestoreTimestamp;
    createdAt?: FirestoreTimestamp;
};

export function useScenarios(projectId?: string | null) {
    return useQuery({
        queryKey: [...SCENARIO_KEYS.lists(), projectId || "legacy"],
        queryFn: async () => {
            const url = projectId
                ? `/api/scenarios?projectId=${projectId}`
                : "/api/scenarios";
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch scenarios");
            }
            const result = (await response.json()) as ApiResponse<{
                scenarios: ScenarioWithId[];
            }>;
            return result.data?.scenarios || [];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 3,
        refetchOnWindowFocus: false,
    });
}

export function useScenarioById(id: string | null) {
    return useQuery({
        queryKey: SCENARIO_KEYS.detail(id || ""),
        queryFn: async () => {
            if (!id) return null;
            const response = await fetch(`/api/scenarios?id=${id}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error("Failed to fetch scenario");
            }
            const result =
                (await response.json()) as ApiResponse<ScenarioWithId>;
            return result.data || null;
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 3,
        refetchOnWindowFocus: false,
    });
}

export function useSaveScenarioMutation(projectId?: string | null) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            scenario,
            scenarioId,
        }: {
            scenario: Scenario;
            scenarioId?: string | null;
        }) => {
            const response = await fetch("/api/scenarios", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    scenario,
                    scenarioId,
                    projectId: projectId || undefined,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save scenario");
            }

            const result = (await response.json()) as ApiResponse<{
                scenarioId: string;
            }>;
            if (!result.success || !result.data) {
                throw new Error(
                    result.error?.message || "Failed to save scenario",
                );
            }
            return result.data;
        },
        onSuccess: (data) => {
            // Invalidate lists
            queryClient.invalidateQueries({ queryKey: SCENARIO_KEYS.lists() });

            // Invalidate or update the specific scenario
            const id = data.scenarioId;
            queryClient.invalidateQueries({
                queryKey: SCENARIO_KEYS.detail(id),
            });

            clientLogger.info(`Scenario ${id} saved successfully`);
        },
        onError: (error) => {
            clientLogger.error("Error saving scenario:", error);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to save scenario",
            );
        },
    });
}

export function useDeleteScenarioMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`/api/scenarios?id=${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to delete scenario");
            }

            const result = (await response.json()) as ApiResponse<{
                success: boolean;
            }>;
            if (!result.success) {
                throw new Error(
                    result.error?.message || "Failed to delete scenario",
                );
            }
            return result.data;
        },
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: SCENARIO_KEYS.lists() });
            queryClient.removeQueries({ queryKey: SCENARIO_KEYS.detail(id) });
            clientLogger.info(`Scenario ${id} deleted successfully`);
        },
        onError: (error) => {
            clientLogger.error("Error deleting scenario:", error);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to delete scenario",
            );
        },
    });
}

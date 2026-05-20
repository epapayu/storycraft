import { useCallback, useRef } from "react";
import { useAuth } from "@/app/features/shared/hooks/use-auth";
import type { Scenario } from "@/app/types";
import { ApiResponse } from "@/types/api";
import { clientLogger } from "@/lib/utils/client-logger";
import {
    useSaveScenarioMutation,
    useDeleteScenarioMutation,
    useScenarios,
    SCENARIO_KEYS,
    ScenarioWithId,
} from "./use-scenarios-query";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectStore } from "@/app/features/shared/stores/useProjectStore";
import { useScenarioStore } from "../stores/useScenarioStore";

export function useScenario() {
    const { session } = useAuth();
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const setField = useScenarioStore((state) => state.setField);
    const queryClient = useQueryClient();
    const activeProjectId = useProjectStore((state) => state.activeProjectId);

    const saveMutation = useSaveScenarioMutation(activeProjectId);
    const deleteMutation = useDeleteScenarioMutation();
    const {
        data: scenarios = [] as ScenarioWithId[],
        refetch: refetchScenarios,
        isLoading,
        error,
    } = useScenarios(activeProjectId);

    const saveScenario = useCallback(
        async (scenario: Scenario, scenarioId?: string) => {
            if (!session?.user?.id) {
                clientLogger.warn(
                    "Cannot save scenario: user not authenticated",
                );
                return null;
            }

            try {
                // Get the latest ID from the store at call time
                const actualId =
                    scenarioId ||
                    useScenarioStore.getState().currentScenarioId ||
                    undefined;

                const result = await saveMutation.mutateAsync({
                    scenario,
                    scenarioId: actualId,
                });

                // Update the current scenario ID for future saves if it was newly created
                if (result.scenarioId && result.scenarioId !== actualId) {
                    setField("currentScenarioId", result.scenarioId);
                }

                return result.scenarioId;
            } catch (error) {
                throw error;
            }
        },
        [session?.user?.id, saveMutation, setField],
    );

    const saveScenarioDebounced = useCallback(
        (scenario: Scenario, scenarioId?: string) => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            saveTimeoutRef.current = setTimeout(() => {
                saveScenario(scenario, scenarioId).catch((error) => {
                    clientLogger.error("Debounced save failed:", error);
                });
            }, 1000);
        },
        [saveScenario],
    );

    const loadScenario = useCallback(
        async (scenarioId: string): Promise<ScenarioWithId | null> => {
            if (!session?.user?.id) {
                clientLogger.warn(
                    "Cannot load scenario: user not authenticated",
                );
                return null;
            }

            try {
                const cachedData = queryClient.getQueryData<ScenarioWithId>(
                    SCENARIO_KEYS.detail(scenarioId),
                );
                if (cachedData) {
                    setField("currentScenarioId", scenarioId);
                    return cachedData;
                }

                const response = await fetch(`/api/scenarios?id=${scenarioId}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        return null;
                    }
                    throw new Error("Failed to load scenario");
                }

                const result =
                    (await response.json()) as ApiResponse<ScenarioWithId>;
                const scenarioData = result.data;

                if (!scenarioData) {
                    return null;
                }

                queryClient.setQueryData(
                    SCENARIO_KEYS.detail(scenarioId),
                    scenarioData,
                );

                setField("currentScenarioId", scenarioId);

                return scenarioData;
            } catch (error) {
                clientLogger.error("Error loading scenario:", error);
                throw error;
            }
        },
        [session?.user?.id, queryClient, setField],
    );

    const loadUserScenarios = useCallback(async (): Promise<
        ScenarioWithId[]
    > => {
        if (!session?.user?.id) {
            clientLogger.warn("Cannot load scenarios: user not authenticated");
            return [];
        }

        try {
            const result = await refetchScenarios();
            return (result.data as ScenarioWithId[]) || [];
        } catch (error) {
            clientLogger.error("Error loading user scenarios:", error);
            throw error;
        }
    }, [session?.user?.id, refetchScenarios]);

    const getCurrentScenarioId = useCallback(() => {
        return useScenarioStore.getState().currentScenarioId;
    }, []);

    const setCurrentScenarioId = useCallback(
        (id: string | null) => {
            setField("currentScenarioId", id);
        },
        [setField],
    );

    return {
        saveScenario,
        saveScenarioDebounced,
        loadScenario,
        loadUserScenarios,
        getCurrentScenarioId,
        setCurrentScenarioId,
        isAuthenticated: !!session?.user?.id,
        scenarios,
        isSaving: saveMutation.isPending,
        isDeleting: deleteMutation.isPending,
        deleteScenario: deleteMutation.mutateAsync,
        isLoading,
        error,
    };
}

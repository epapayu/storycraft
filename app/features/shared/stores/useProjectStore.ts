import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface ProjectState {
    activeProjectId: string | null;
    setActiveProjectId: (projectId: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
    devtools((set) => ({
        activeProjectId: null,
        setActiveProjectId: (activeProjectId) =>
            set({ activeProjectId }, false, "setActiveProjectId"),
    })),
);

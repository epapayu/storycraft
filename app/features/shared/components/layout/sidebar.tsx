"use client";

import { Plus, BookOpen, PanelLeft, Settings, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScenario } from "@/app/features/scenario/hooks/use-scenario";
import { Scenario } from "@/app/types";
import { cn } from "@/lib/utils/utils";
import { useScenarioStore } from "@/app/features/scenario/stores/useScenarioStore";
import { useEditorStore } from "@/app/features/editor/stores/useEditorStore";
import { useSidebarActions } from "@/app/features/shared/hooks/use-sidebar-actions";
import {
    useSettings,
    LLM_OPTIONS,
    IMAGE_MODEL_OPTIONS,
    VIDEO_MODEL_OPTIONS,
    VIDEO_RESOLUTION_OPTIONS,
} from "@/app/features/shared/hooks/use-settings";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { memo } from "react";
import { toast } from "sonner";
import { ProjectSwitcher } from "./project-switcher";

export const Sidebar = memo(function Sidebar() {
    const { settings, updateSettings } = useSettings();
    const { scenarios, isLoading, loadScenario, setCurrentScenarioId } =
        useScenario();
    const currentScenario = useScenarioStore((state) => state.scenario);
    const { activeTab, setActiveTab } = useEditorStore();
    const {
        handleSelectScenario,
        handleCreateNewStory,
        toggleSidebar,
        isCollapsed,
    } = useSidebarActions();

    const currentScenarioId = currentScenario?.id;

    const handleSelect = async (scenario: Scenario & { id: string }) => {
        setCurrentScenarioId(scenario.id);

        try {
            // Fetch fresh data from Firestore instead of using cached sidebar data
            const freshScenario = await loadScenario(scenario.id);

            if (freshScenario) {
                handleSelectScenario(freshScenario, scenario.id);
            } else {
                // Fallback to cached data if fetch fails
                const appScenario: Scenario = {
                    id: scenario.id,
                    name: scenario.name,
                    pitch: scenario.pitch,
                    scenario: scenario.scenario,
                    style: scenario.style,
                    aspectRatio: scenario.aspectRatio || "16:9",
                    durationSeconds: scenario.durationSeconds || 8,
                    genre: scenario.genre,
                    mood: scenario.mood,
                    music: scenario.mood,
                    language: scenario.language,
                    characters: scenario.characters || [],
                    props: scenario.props || [],
                    settings: scenario.settings || [],
                    scenes: scenario.scenes || [],
                    musicUrl: scenario.musicUrl,
                    logoOverlay: scenario.logoOverlay,
                };
                handleSelectScenario(appScenario, scenario.id);
            }
        } catch (error) {
            toast.error("Failed to load scenario details");
            console.error("Error loading fresh scenario:", error);
            // Fallback to cached data if fetch fails
            const appScenario: Scenario = {
                id: scenario.id,
                name: scenario.name,
                pitch: scenario.pitch,
                scenario: scenario.scenario,
                style: scenario.style,
                aspectRatio: scenario.aspectRatio || "16:9",
                durationSeconds: scenario.durationSeconds || 8,
                genre: scenario.genre,
                mood: scenario.mood,
                music: scenario.mood,
                language: scenario.language,
                characters: scenario.characters || [],
                props: scenario.props || [],
                settings: scenario.settings || [],
                scenes: scenario.scenes || [],
                musicUrl: scenario.musicUrl,
                logoOverlay: scenario.logoOverlay,
            };
            handleSelectScenario(appScenario, scenario.id);
        }
    };

    return (
        <aside
            className={cn(
                "border-border bg-card/50 fixed top-0 bottom-0 left-0 z-30 flex h-screen flex-shrink-0 flex-col border-r transition-all duration-300 ease-in-out",
                isCollapsed ? "w-[70px]" : "w-[280px]",
            )}
        >
            <div className="border-border flex h-16 items-center px-3 transition-all duration-300 gap-2">
                {/* Toggle Button - Centered in Rail (46px zone) */}
                <div className="flex w-[46px] shrink-0 justify-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="text-muted-foreground hover:text-foreground"
                        title={
                            isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"
                        }
                    >
                        <PanelLeft className="h-5 w-5" />
                    </Button>
                </div>

                <div className="flex-1 overflow-hidden">
                    <ProjectSwitcher isCollapsed={isCollapsed} />
                </div>
            </div>

            <div className="overflow-hidden px-3 py-4">
                <Button
                    onClick={handleCreateNewStory}
                    className={cn(
                        "bg-primary text-primary-foreground hover:bg-primary/90 h-12 w-full justify-start overflow-hidden rounded-2xl p-0 shadow-sm transition-all duration-300",
                    )}
                    title="New Story"
                >
                    {/* Icon Slot - Fixed width to match rail center */}
                    <div className="flex h-full w-[46px] shrink-0 items-center justify-center">
                        <Plus className="h-5 w-5" />
                    </div>
                    <span
                        className={cn(
                            "overflow-hidden whitespace-nowrap transition-all duration-300",
                            isCollapsed
                                ? "w-0 opacity-0"
                                : "w-auto pr-4 opacity-100",
                        )}
                    >
                        New Story
                    </span>
                </Button>
            </div>

            <div className="scrollbar-hide flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3">
                <div className="mb-2">
                    <button
                        onClick={() => setActiveTab("stories")}
                        className={cn(
                            "flex h-12 w-full items-center overflow-hidden rounded-full transition-all duration-200",
                            activeTab === "stories"
                                ? "bg-secondary text-secondary-foreground"
                                : "text-foreground hover:bg-muted",
                        )}
                        title="Your Stories"
                    >
                        <div className="flex h-full w-[46px] shrink-0 items-center justify-center">
                            <Library className="h-4 w-4" />
                        </div>
                        <span
                            className={cn(
                                "truncate text-left transition-all duration-300",
                                isCollapsed
                                    ? "w-0 opacity-0"
                                    : "w-auto flex-1 pr-4 opacity-100",
                            )}
                        >
                            Your Stories
                        </span>
                    </button>
                </div>

                <div
                    className={cn(
                        "text-muted-foreground flex h-8 items-center overflow-hidden text-xs font-medium tracking-wider whitespace-nowrap uppercase transition-all duration-300",
                        isCollapsed
                            ? "w-0 opacity-0"
                            : "w-full px-2 opacity-100",
                    )}
                >
                    Recent
                </div>

                {isLoading ? (
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="bg-muted/50 h-12 w-full animate-pulse rounded-full"
                            />
                        ))}
                    </div>
                ) : scenarios.length === 0 ? (
                    !isCollapsed && (
                        <div className="text-muted-foreground px-2 text-sm whitespace-nowrap">
                            No stories yet.
                        </div>
                    )
                ) : (
                    scenarios.map((scenario) => (
                        <button
                            key={scenario.id}
                            onClick={() => handleSelect(scenario)}
                            className={cn(
                                "flex h-12 w-full items-center overflow-hidden rounded-full transition-all duration-200",
                                activeTab !== "stories" &&
                                    currentScenarioId === scenario.id
                                    ? "bg-secondary text-secondary-foreground"
                                    : "text-foreground hover:bg-muted",
                            )}
                            title={scenario.name}
                        >
                            {/* Icon Slot - Fixed width 46px + relative centering */}
                            <div className="flex h-full w-[46px] shrink-0 items-center justify-center">
                                <BookOpen className="h-4 w-4" />
                            </div>

                            <span
                                className={cn(
                                    "truncate text-left transition-all duration-300",
                                    isCollapsed
                                        ? "w-0 opacity-0"
                                        : "w-auto flex-1 pr-4 opacity-100",
                                )}
                            >
                                {scenario.name || "Untitled Story"}
                            </span>
                        </button>
                    ))
                )}
            </div>

            <div className="border-border overflow-hidden border-t p-2">
                <Dialog>
                    <DialogTrigger asChild>
                        <button
                            className={cn(
                                "text-foreground hover:bg-muted mb-2 flex h-12 w-full items-center overflow-hidden rounded-full transition-all duration-200",
                            )}
                            title="Settings"
                        >
                            <div className="flex h-full w-[46px] shrink-0 items-center justify-center">
                                <Settings className="h-4 w-4" />
                            </div>
                            <span
                                className={cn(
                                    "truncate text-left transition-all duration-300",
                                    isCollapsed
                                        ? "w-0 opacity-0"
                                        : "w-auto flex-1 pr-4 opacity-100",
                                )}
                            >
                                Settings
                            </span>
                        </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Generation Settings</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                    LLM Model
                                </label>
                                <Select
                                    value={JSON.stringify(
                                        LLM_OPTIONS.find(
                                            (opt) =>
                                                opt.modelName ===
                                                    settings.llmModel &&
                                                opt.thinkingBudget ===
                                                    settings.thinkingBudget,
                                        ),
                                    )}
                                    onValueChange={(value) => {
                                        const opt = JSON.parse(value);
                                        updateSettings({
                                            llmModel: opt.modelName,
                                            thinkingBudget: opt.thinkingBudget,
                                        });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select LLM" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {LLM_OPTIONS.map((opt) => (
                                            <SelectItem
                                                key={opt.label}
                                                value={JSON.stringify(opt)}
                                            >
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                    Image Model
                                </label>
                                <Select
                                    value={settings.imageModel}
                                    onValueChange={(value) =>
                                        updateSettings({
                                            imageModel: value,
                                        })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Image Model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {IMAGE_MODEL_OPTIONS.map((opt) => (
                                            <SelectItem
                                                key={opt.label}
                                                value={opt.modelName}
                                            >
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                    Video Model
                                </label>
                                <Select
                                    value={settings.videoModel}
                                    onValueChange={(value) =>
                                        updateSettings({
                                            videoModel: value,
                                        })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Video Model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {VIDEO_MODEL_OPTIONS.map((opt) => (
                                            <SelectItem
                                                key={opt.modelName}
                                                value={opt.modelName}
                                            >
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                    Resolution
                                </label>
                                <Select
                                    value={settings.videoResolution}
                                    onValueChange={(value) =>
                                        updateSettings({
                                            videoResolution: value,
                                        })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Resolution" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {VIDEO_RESOLUTION_OPTIONS.map((opt) => (
                                            <SelectItem
                                                key={opt.value}
                                                value={opt.value}
                                            >
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <label
                                    htmlFor="generate-audio"
                                    className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Generate Audio
                                </label>
                                <input
                                    type="checkbox"
                                    id="generate-audio"
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    checked={settings.generateAudio}
                                    onChange={(e) =>
                                        updateSettings({
                                            generateAudio: e.target.checked,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                <p
                    className={cn(
                        "text-muted-foreground pt-2 text-xs whitespace-nowrap",
                        // Use transition-none to hide instantly on collapse
                        isCollapsed
                            ? "h-0 w-0 opacity-0 transition-none"
                            : "h-auto w-full text-center opacity-100 transition-all duration-300",
                    )}
                >
                    Made with ❤️ by @mblanc
                </p>
            </div>
        </aside>
    );
});

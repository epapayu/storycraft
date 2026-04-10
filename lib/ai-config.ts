export const LLM_OPTIONS = [
    {
        label: "Gemini 3.1   Pro Preview",
        modelName: "gemini-3.1-pro-preview",
        thinkingBudget: 0,
    },
    {
        label: "Gemini 3 Flash Preview",
        modelName: "gemini-3-flash-preview",
        thinkingBudget: 0,
    },
    {
        label: "Gemini 3.1 Flash Lite Preview",
        modelName: "gemini-3.1-flash-lite-preview",
        thinkingBudget: 0,
    },
] as const;

export const IMAGE_MODEL_OPTIONS = [
    {
        label: "Nano Banana 2 Preview",
        modelName: "gemini-3.1-flash-image-preview",
    },
    {
        label: "Nano Banana Pro Preview",
        modelName: "gemini-3-pro-image-preview",
    },
    {
        label: "Nano Banana",
        modelName: "gemini-2.5-flash-image",
    },
] as const;

export const VIDEO_MODEL_OPTIONS = [
    {
        label: "Veo 3.1 Lite",
        modelName: "veo-3.1-lite-generate-001",
    },
    {
        label: "Veo 3.1 Fast",
        modelName: "veo-3.1-fast-generate-001",
    },
    {
        label: "Veo 3.1",
        modelName: "veo-3.1-generate-001",
    },
] as const;

export const VIDEO_RESOLUTION_OPTIONS = [
    {
        label: "720p",
        value: "720p",
    },
    {
        label: "1080p",
        value: "1080p",
    },
    {
        label: "4K",
        value: "4k",
    },
] as const;

export interface Settings {
    llmModel: string;
    thinkingBudget: number;
    imageModel: string;
    videoModel: string;
    videoResolution: string;
    generateAudio: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
    llmModel: "gemini-3-flash-preview",
    thinkingBudget: 0,
    imageModel: "gemini-3.1-flash-image-preview",
    videoModel: "veo-3.0-lite-generate-001",
    videoResolution: "1080p",
    generateAudio: false,
};

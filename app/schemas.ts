import { z } from "zod";
import {
    Character,
    Language,
    Prop,
    Setting,
    Scene,
    Scenario,
    TimelineItem,
    TimelineLayer,
} from "./types";

// Base Types

export const languageSchema: z.ZodType<Language> = z.object({
    name: z.string(),
    code: z.string(),
});

export const imagePromptSchema = z.object({
    Style: z.string(),
    Scene: z.string(),
    Composition: z.object({
        shot_type: z.string(),
        lighting: z.string(),
        overall_mood: z.string(),
    }),
    Subject: z.array(
        z.object({ name: z.string(), description: z.string().optional() }),
    ),
    Prop: z.array(
        z.object({ name: z.string(), description: z.string().optional() }),
    ),
    Context: z.array(
        z.object({ name: z.string(), description: z.string().optional() }),
    ),
});

export const videoPromptSchema = z.object({
    Action: z.string(),
    Camera_Motion: z.string(),
    Ambiance_Audio: z.string(),
    Dialogue: z.array(
        z.object({
            name: z.string(),
            speaker: z.string(),
            line: z.string(),
        }),
    ),
});

export const sceneSchema: z.ZodType<Scene> = z.object({
    imagePrompt: imagePromptSchema,
    videoPrompt: videoPromptSchema,
    description: z.string(),
    voiceover: z.string(),
    charactersPresent: z.array(z.string()),
    imageGcsUri: z.string().optional(),
    videoUri: z.string().optional(),
    voiceoverAudioUri: z.string().optional(),
    errorMessage: z.string().optional(),
});

export const characterSchema: z.ZodType<Character> = z.object({
    name: z.string(),
    description: z.string(),
    voice: z.string().optional(),
    imageGcsUri: z.string().optional(),
});

export const settingSchema: z.ZodType<Setting> = z.object({
    name: z.string(),
    description: z.string(),
    imageGcsUri: z.string().optional(),
});

export const propSchema: z.ZodType<Prop> = z.object({
    name: z.string(),
    description: z.string(),
    imageGcsUri: z.string().optional(),
});

export const scenarioSchema: z.ZodType<Scenario> = z.object({
    id: z.string().optional(),
    name: z.string(),
    pitch: z.string(),
    scenario: z.string(),
    style: z.string(),
    aspectRatio: z.string(),
    durationSeconds: z.number(),
    genre: z.string(),
    mood: z.string(),
    music: z.string(),
    musicUrl: z.string().nullish(),
    language: languageSchema,
    characters: z.array(characterSchema).default([]),
    settings: z.array(settingSchema).default([]),
    props: z.array(propSchema).default([]),
    logoOverlay: z.string().nullish(),
    styleImageUri: z.string().nullish(),
    scenes: z.array(sceneSchema).default([]),
});

export const timelineItemSchema: z.ZodType<TimelineItem> = z.object({
    id: z.string(),
    startTime: z.number(),
    duration: z.number(),
    content: z.string(),
    type: z.enum(["video", "voiceover", "music"]),
    metadata: z
        .object({
            logoOverlay: z.string().optional(),
        })
        .and(
            z.record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean(), z.undefined()]),
            ),
        )
        .optional(),
});

export const timelineLayerSchema: z.ZodType<TimelineLayer> = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["video", "voiceover", "music"]),
    items: z.array(timelineItemSchema),
});

// Action Inputs

export const generateScenarioSchema = z.object({
    name: z.string().min(1).max(200),
    pitch: z.string().min(10).max(5000),
    numScenes: z.number().int().min(1).max(20),
    style: z.string(),
    aspectRatio: z.string(), // z.enum(['16:9', '9:16']) but kept string to match existing looser types if needed, though enum is safer
    durationSeconds: z.number(),
    language: languageSchema,
    modelName: z.string().optional(),
    thinkingBudget: z.number().optional(),
    styleImageUri: z.string().optional(),
});

export const generateStoryboardSchema = z.object({
    scenario: scenarioSchema,
    numScenes: z.number().int(),
    style: z.string(),
    language: languageSchema,
    modelName: z.string().optional(),
    thinkingBudget: z.number().optional(),
});

export const conversationalEditSchema = z.object({
    imageGcsUri: z.string().startsWith("gs://"),
    instruction: z.string().min(1),
    sceneNumber: z.number(),
    scenarioId: z.string().min(1),
});

export const generateMusicSchema = z.object({
    prompt: z.string(),
});

export const exportMovieSchema = z.object({
    layers: z.array(timelineLayerSchema),
});

export const generateVoiceoverSchema = z.object({
    scenes: z.array(z.object({ voiceover: z.string() })),
    language: languageSchema,
    voiceName: z.string().optional(),
});

export const resizeImageSchema = z.object({
    base64Image: z.string(),
    width: z.number().default(1920),
    height: z.number().default(1080),
});

export const createCollageSchema = z.object({
    characters: z.array(characterSchema),
    props: z.array(propSchema),
    aspectRatio: z.string(),
});

export const uploadImageToGCSSchema = z.object({
    base64: z.string(),
});

export const getDynamicImageUrlSchema = z.object({
    gcsUri: z.string().startsWith("gs://"),
    download: z.boolean().optional(),
    refresh: z.boolean().optional(),
});

export const saveImageToPublicSchema = z.object({
    base64String: z.string(),
    originalFilename: z.string(),
});

export const uploadStyleImageToGCSSchema = z.object({
    base64: z.string(),
    filename: z.string(),
});

// Shared Schemas
export const idSchema = z.string().min(1);

// API Request Schemas

export const scenarioApiPostSchema = z.object({
    scenario: scenarioSchema,
    scenarioId: z.string().optional(),
    projectId: z.string().optional(),
});


export const videoApiPostSchema = z.object({
    scenes: z.array(sceneSchema),
    scenario: scenarioSchema,
    aspectRatio: z.enum(["16:9", "9:16"]),
    model: z.string().optional(),
    generateAudio: z.boolean().optional(),
    resolution: z.string().optional(),
    durationSeconds: z.number().optional(),
});

export const regenerateImageApiPostSchema = z.object({
    prompt: imagePromptSchema,
    scenario: scenarioSchema,
    modelName: z.string().optional(),
});

export const regenerateImageApiPutSchema = z.object({
    prompt: z.string().min(1),
});

export const sceneApiPostSchema = z.object({
    imagePrompt: z.string().min(1),
    description: z.string().min(1),
    voiceover: z.string().min(1),
    imageBase64: z.string().optional(),
});

export const timelineApiPostSchema = z.object({
    scenarioId: z.string().min(1),
    layers: z.array(timelineLayerSchema),
});

export const projectApiPostSchema = z.object({
    name: z.string().min(1).max(100),
});

export const projectMemberPutSchema = z.object({
    projectId: z.string().min(1),
    email: z.string().email(),
    role: z.enum(["owner", "editor", "viewer"]),
});



// Modify Scenario Schemas
export const deleteCharacterSchema = z.object({
    currentScenario: z.string().min(1),
    oldName: z.string().min(1),
    oldDescription: z.string().min(1),
});

export const regenerateCharacterTextSchema = z.object({
    currentScenario: z.string().min(1),
    oldCharacterName: z.string().min(1),
    newCharacterName: z.string().min(1),
    newCharacterDescription: z.string().min(1),
    style: z.string(),
    llmModel: z.string().optional(),
    thinkingBudget: z.number().optional(),
    imageModel: z.string().optional(),
});

export const regenerateCharacterImageSchema = z.object({
    currentScenario: z.string().min(1),
    characterName: z.string().min(1),
    currentCharacterDescription: z.string().min(1),
    currentCharacterVoice: z.string().optional(),
    imageGcsUri: z.string().startsWith("gs://"),
    allCharacters: z.array(characterSchema),
    style: z.string(),
    llmModel: z.string().optional(),
    thinkingBudget: z.number().optional(),
    imageModel: z.string().optional(),
});

export const deleteSettingSchema = z.object({
    currentScenario: z.string().min(1),
    oldName: z.string().min(1),
    oldDescription: z.string().min(1),
});

export const regenerateSettingTextSchema = z.object({
    currentScenario: z.string().min(1),
    oldSettingName: z.string().min(1),
    newSettingName: z.string().min(1),
    newSettingDescription: z.string().min(1),
    style: z.string(),
    aspectRatio: z.string().optional(),
    llmModel: z.string().optional(),
    thinkingBudget: z.number().optional(),
    imageModel: z.string().optional(),
});

export const regenerateSettingImageSchema = z.object({
    currentScenario: z.string().min(1),
    settingName: z.string().min(1),
    currentSettingDescription: z.string().min(1),
    imageGcsUri: z.string().startsWith("gs://"),
    allSettings: z.array(settingSchema),
    style: z.string(),
    llmModel: z.string().optional(),
    thinkingBudget: z.number().optional(),
    imageModel: z.string().optional(),
});

export const deletePropSchema = z.object({
    currentScenario: z.string().min(1),
    oldName: z.string().min(1),
    oldDescription: z.string().min(1),
});

export const regeneratePropTextSchema = z.object({
    currentScenario: z.string(),
    oldPropName: z.string(),
    newPropName: z.string(),
    newPropDescription: z.string(),
    style: z.string(),
    llmModel: z.string().optional(),
    thinkingBudget: z.number().optional(),
    imageModel: z.string().optional(),
});

export const regeneratePropImageSchema = z.object({
    currentScenario: z.string(),
    propName: z.string(),
    currentPropDescription: z.string(),
    imageGcsUri: z.string(),
    allProps: z.array(propSchema),
    style: z.string(),
    llmModel: z.string().optional(),
    thinkingBudget: z.number().optional(),
    imageModel: z.string().optional(),
});

export const analyzeStyleImageSchema = z.object({
    gcsUri: z.string().startsWith("gs://"),
});

// Inferred Types
export type GenerateScenarioInput = z.infer<typeof generateScenarioSchema>;
export type GenerateStoryboardInput = z.infer<typeof generateStoryboardSchema>;
export type ConversationalEditInput = z.infer<typeof conversationalEditSchema>;
export type GenerateMusicInput = z.infer<typeof generateMusicSchema>;
export type ExportMovieInput = z.infer<typeof exportMovieSchema>;
export type GenerateVoiceoverInput = z.infer<typeof generateVoiceoverSchema>;
export type ResizeImageInput = z.infer<typeof resizeImageSchema>;
export type CreateCollageInput = z.infer<typeof createCollageSchema>;
export type UploadImageToGCSInput = z.infer<typeof uploadImageToGCSSchema>;
export type GetDynamicImageUrlInput = z.infer<typeof getDynamicImageUrlSchema>;
export type SaveImageToPublicInput = z.infer<typeof saveImageToPublicSchema>;
export type UploadStyleImageInput = z.infer<typeof uploadStyleImageToGCSSchema>;
export type AnalyzeStyleImageInput = z.infer<typeof analyzeStyleImageSchema>;

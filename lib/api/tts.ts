import textToSpeech, { protos } from "@google-cloud/text-to-speech";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import logger from "@/app/logger";
import { uploadBufferToGcs } from "@/lib/utils/storage-utils";

// Use a global variable to ensure the client is reused across HMR in development
const globalForTTS = global as unknown as {
    client: InstanceType<typeof textToSpeech.TextToSpeechClient>;
};

function getTTSClient() {
    if (globalForTTS.client) {
        return globalForTTS.client;
    }

    const client = new textToSpeech.TextToSpeechClient();

    if (process.env.NODE_ENV !== "production") {
        globalForTTS.client = client;
    }

    return client;
}

// Simple in-memory cache for voices: Map<languageCode, { voices: IVoice[], timestamp: number }>
const voiceCache = new Map<
    string,
    { voices: protos.google.cloud.texttospeech.v1.IVoice[]; timestamp: number }
>();

export async function tts(
    text: string,
    language: string,
    voiceName?: string,
): Promise<string> {
    const client = getTTSClient();
    const listVoicesRequest: protos.google.cloud.texttospeech.v1.IListVoicesRequest =
        {
            languageCode: language,
        };

    // Cache key based on language
    const cacheKey = language;
    const now = Date.now();
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    let response: protos.google.cloud.texttospeech.v1.IListVoicesResponse;

    if (
        voiceCache.has(cacheKey) &&
        now - voiceCache.get(cacheKey)!.timestamp < CACHE_TTL
    ) {
        response = { voices: voiceCache.get(cacheKey)!.voices };
    } else {
        const [apiResponse] = await client.listVoices(listVoicesRequest);
        response = apiResponse;
        if (response.voices) {
            voiceCache.set(cacheKey, {
                voices: response.voices,
                timestamp: now,
            });
        }
    }

    //logger.debug(response)
    // log every voices containing the selected voice name
    response?.voices?.forEach(
        (voice: protos.google.cloud.texttospeech.v1.IVoice) => {
            if (voice.name?.includes(voiceName!)) {
                logger.debug(voice);
            }
        },
    );

    let selectedVoiceName: string | null | undefined;
    if (voiceName) {
        selectedVoiceName = voiceName;
    } else {
        selectedVoiceName = "Algenib";
    }
    // If no voice is specified, use the default selection logic
    // if (selectedVoiceName && response.voices) {
    //   // choose the voice with the name that contains the selected voice
    //   const voice = response.voices.find((voice) => voice.name?.includes('Chirp3-HD-'+selectedVoiceName!));
    //   if (voice) {
    //     selectedVoiceName = voice.name;
    //   } else {
    //     const charonVoice = response.voices.find((voice) => voice.name?.includes('Chirp3-HD-Charon'));
    //     if (charonVoice) {
    //       selectedVoiceName = charonVoice.name;
    //     } else {
    //       logger.error('No voices found for language:', language);
    //       throw new Error('No voices found for language');
    //     }
    //   }
    // }

    logger.debug(`Using voice: ${selectedVoiceName}`);
    const request = {
        input: {
            text: text,
            prompt: "Voiceover for a short movie. Fast paced and engaging.",
        },
        voice: {
            languageCode: language,
            name: selectedVoiceName,
            modelName: "gemini-2.5-flash-tts",
        },
        audioConfig: {
            audioEncoding:
                protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
        },
    };

    try {
        const response = await client.synthesizeSpeech(request);
        const audioContent = response[0].audioContent;

        if (!audioContent) {
            logger.error("No audio content received from TTS API");
            throw new Error("No audio content received from TTS API");
        }

        // Define the directory where you want to save the audio files
        const publicDir = path.join(process.cwd(), "public");
        const outputDir = path.join(publicDir, "tts"); // Example: public/audio

        // Ensure the directory exists
        await fs.promises.mkdir(outputDir, { recursive: true });

        // Generate a unique filename, e.g., using a timestamp or a UUID
        const uuid = uuidv4();
        const fileName = `audio-${uuid}.mp3`;

        // Return the relative file path (for serving the file)
        // Upload video to GCS
        logger.debug(`Upload result to GCS`);
        return await uploadBufferToGcs(
            Buffer.from(audioContent),
            fileName,
            "audio/mpeg",
        );
    } catch (error) {
        logger.error("Error in tts function:", error);
        throw error;
    }
}

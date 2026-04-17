import { TimelineLayer } from "@/app/types";
import { storage } from "@/lib/storage/storage";
import { getGcsDestination } from "@/lib/utils/storage-utils";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import logger from "@/app/logger";

const MOOD_MUSIC: { [key: string]: string } = {
    Angry: "[Angry] Drop and Roll - Silent Partner.mp3",
    Bright: "[Bright] Crimson Fly - Huma-Huma.mp3",
    Calm: "[Calm] Pachabelly - Huma-Huma.mp3",
    Dark: "[Dark] Court and Page - Silent Partner.mp3",
    Funky: "[Funky] Lines - Topher Mohr and Alex Elena.mp3",
    Happy: "[Happy] Good Starts - Jingle Punks.mp3",
    Inspirational: "[Inspirational] Grass - Silent Partner.mp3",
    Romantic: "[Romantic] Ode to Joy - Cooper Cannell.mp3",
    Sad: "[Sad] Ether - Silent Partner.mp3",
};

/**
 * Transforms a GCS signed URL into a GCS URI (gs://<bucket>/<path>).
 *
 * @param signedUrl The GCS signed URL.
 * @returns The GCS URI or null if the signed URL is invalid.
 */
export function signedUrlToGcsUri(signedUrl: string): string {
    try {
        const url = new URL(signedUrl);
        const pathname = url.pathname;

        // Extract bucket and path from pathname
        const parts = pathname.split("/");
        if (parts.length < 3) {
            throw new Error("Invalid signed URL format: less than 3 parts");
        }

        const bucket = parts[1];
        const path = parts.slice(2).join("/");

        // Construct GCS URI
        return `gs://${bucket}/${path}`;
    } catch (error) {
        logger.error("Error parsing signed URL:", error);
        throw new Error(`Error parsing signed URL ${signedUrl}: ${error}`);
    }
}

async function addAudioToVideoWithFadeOut(
    videoPath: string,
    audioPath: string,
    outputPath: string,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        // 1. Get Video Duration and check for audio track using ffprobe
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                logger.error("Error getting video metadata:", err);
                reject(err);
                return;
            }

            const videoDuration = metadata.format.duration;
            if (videoDuration === undefined) {
                logger.error("Error getting video duration");
                reject(new Error("Could not determine video duration"));
                return;
            }

            // Check if video has audio track
            const hasAudio = metadata.streams.some(
                (stream) => stream.codec_type === "audio",
            );

            // Fade out settings
            const fadeOutDuration = 3; // seconds
            const fadeOutStartTime = videoDuration - fadeOutDuration;

            // Handle very short videos
            // if (fadeOutStartTime < 0) {
            //   console.warn('Video is shorter than the desired fade out duration');
            //   fadeOutStartTime = 0;
            //   fadeOutDuration = videoDuration;
            // }

            // 2. Add Audio to Video with Fade-Out
            const command = ffmpeg(videoPath).input(audioPath);

            const filterComplex: string[] = [];

            if (hasAudio) {
                // Mix original video audio with new audio
                filterComplex.push(
                    "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[mixed_audio]",
                    `[mixed_audio]afade=t=out:st=${fadeOutStartTime}:d=${fadeOutDuration}[faded_audio]`,
                );
            } else {
                // Just fade out the new audio
                filterComplex.push(
                    `[1:a]afade=t=out:st=${fadeOutStartTime}:d=${fadeOutDuration}[faded_audio]`,
                );
            }

            command
                .complexFilter(filterComplex)
                .outputOptions([
                    "-map 0:v",
                    "-map [faded_audio]",
                    "-c:v copy",
                    "-c:a aac",
                    "-shortest",
                ])
                .output(outputPath)
                .on("end", () => {
                    logger.debug(
                        "Successfully added audio to video with fade-out!",
                    );
                    resolve();
                })
                .on("error", (err) => {
                    logger.error("Error adding audio to video:", err);
                    reject(err);
                })
                .run();
        });
    });
}

// Simple in-memory cache for audio durations: Map<filePath, duration>
const durationCache = new Map<string, number>();
const MAX_CACHE_SIZE = 100;

function getAudioDuration(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        if (durationCache.has(filePath)) {
            resolve(durationCache.get(filePath)!);
            return;
        }

        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                return reject(
                    new Error(`ffprobe error for ${filePath}: ${err.message}`),
                );
            }
            if (
                metadata &&
                metadata.format &&
                typeof metadata.format.duration === "number"
            ) {
                const duration = metadata.format.duration;
                // Simple LRU-like eviction
                if (durationCache.size >= MAX_CACHE_SIZE) {
                    const firstKey = durationCache.keys().next().value;
                    if (firstKey) durationCache.delete(firstKey);
                }
                durationCache.set(filePath, duration);
                resolve(duration);
            } else {
                reject(new Error(`Could not get duration for ${filePath}`));
            }
        });
    });
}

export async function mixAudioWithVoiceovers(
    speechAudioFiles: string[],
    musicAudioFile: string,
    outputAudioPath: string,
    musicVolumeDuringVoiceover: number = 0.4,
    voiceoverIntervalSeconds: number = 8,
): Promise<void> {
    if (!musicAudioFile) {
        throw new Error("Music audio file path (musicAudioFile) is required.");
    }
    if (!outputAudioPath) {
        throw new Error(
            "Output audio file path (outputAudioPath) is required.",
        );
    }

    // Handle case with no voiceovers: just copy the music file
    if (!speechAudioFiles || speechAudioFiles.length === 0) {
        logger.warn(
            "No speech audio files provided. Copying music file as output.",
        );
        return new Promise<void>((resolve, reject) => {
            ffmpeg(musicAudioFile)
                .outputOptions("-c:a copy") // Copy codec without re-encoding
                .on("error", (err: Error) => {
                    const errorMessage = `Error copying music file ${musicAudioFile} to ${outputAudioPath}: ${err.message}`;
                    logger.error(errorMessage);
                    reject(new Error(errorMessage));
                })
                .on("end", () => {
                    logger.debug(`Music file copied to ${outputAudioPath}`);
                    resolve();
                })
                .save(outputAudioPath);
        });
    }

    try {
        logger.debug("Fetching voiceover durations...");
        const voiceoverDurations: number[] = await Promise.all(
            speechAudioFiles.map((voPath: string) => getAudioDuration(voPath)),
        );
        logger.debug("Voiceover durations:", voiceoverDurations);

        const command = ffmpeg();

        command.input(musicAudioFile); // Input 0: Music
        speechAudioFiles.forEach((voPath: string) => {
            // Inputs 1 to N: Voiceovers
            command.input(voPath);
        });

        const filterComplex: string[] = [];
        let musicStreamLabel = "[0:a]"; // Music is the first input

        // 1. Construct the volume ducking condition for the music
        const duckingConditions: string[] = voiceoverDurations.map(
            (duration: number, index: number) => {
                const startTime: number = index * voiceoverIntervalSeconds;
                const endTime: number = startTime + duration;
                // .toFixed(3) for precision with float seconds in FFmpeg filters
                return `between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`;
            },
        );

        // Only apply volume filter if there are conditions (i.e., voiceovers)
        const duckingConditionString: string = duckingConditions.join("+");
        if (duckingConditionString) {
            filterComplex.push(
                `${musicStreamLabel}volume=eval=frame:volume='if(${duckingConditionString}, ${musicVolumeDuringVoiceover}, 0.5)'[music_ducked]`,
            );
            musicStreamLabel = "[music_ducked]"; // Update music stream to the ducked version
        }

        // 2. Prepare voiceover streams with delays and give them labels
        const delayedVoiceoverLabels: string[] = [];
        speechAudioFiles.forEach((_voFile: string, index: number) => {
            const voInputStreamLabel = `[${index + 1}:a]`; // Voiceover inputs start from 1
            const voOutputLabel = `[vo${index}]`;
            const delaySeconds: number = index * voiceoverIntervalSeconds;
            // adelay takes values in milliseconds or seconds (with 's' suffix)
            // 'all=1' ensures all channels (e.g. stereo) are delayed.
            filterComplex.push(
                `${voInputStreamLabel}adelay=${delaySeconds}s:all=1${voOutputLabel}`,
            );
            delayedVoiceoverLabels.push(voOutputLabel);
        });

        // 3. Mix the ducked music and all delayed voiceovers
        const allStreamsToMix: string[] = [
            musicStreamLabel,
            ...delayedVoiceoverLabels,
        ];
        filterComplex.push(
            `${allStreamsToMix.join("")}amix=inputs=${allStreamsToMix.length}:duration=first:dropout_transition=0[aout]`,
        );
        filterComplex.push(`[aout]loudnorm=I=-14:LRA=11:TP=-1.0[final_output]`);

        command.complexFilter(filterComplex, "final_output");

        // Set output options based on extension
        const outputExtension: string = path
            .extname(outputAudioPath)
            .toLowerCase();
        // fluent-ffmpeg typically expects an array of strings for multiple options
        if (outputExtension === ".mp3") {
            command.outputOptions(["-c:a libmp3lame", "-q:a 2"]); // VBR quality 2
        } else if (outputExtension === ".aac" || outputExtension === ".m4a") {
            command.outputOptions(["-c:a aac", "-b:a 192k"]); // AAC with 192kbps
        } else if (outputExtension === ".wav") {
            command.outputOptions("-c:a pcm_s16le"); // Uncompressed WAV (single option string is fine)
        } else {
            logger.warn(
                `Unknown output extension ${outputExtension}. Using libmp3lame audio codec by default.`,
            );
            command.outputOptions(["-c:a libmp3lame", "-q:a 2"]);
        }

        return new Promise<void>((resolve, reject) => {
            command
                .on("start", (commandLine: string) => {
                    logger.debug("Spawned FFmpeg with command: " + commandLine);
                })
                .on(
                    "progress",
                    (progress: {
                        frames: number;
                        currentFps: number;
                        currentKbps: number;
                        targetSize: number;
                        timemark: string;
                        percent?: number | undefined;
                    }) => {
                        if (typeof progress.percent === "number") {
                            // Check if percent is a number
                            logger.debug(
                                `Processing: ${progress.percent.toFixed(2)}% done`,
                            );
                        } else if (progress.timemark) {
                            logger.debug(`Processing at: ${progress.timemark}`); // Fallback to timemark
                        }
                    },
                )
                .on(
                    "error",
                    (
                        err: Error,
                        stdout: string | null,
                        stderr: string | null,
                    ) => {
                        const errorMessage = `Error processing audio: ${err.message}\nFFmpeg stdout: ${stdout?.toString()}\nFFmpeg stderr: ${stderr?.toString()}`;
                        logger.error(errorMessage);
                        reject(new Error(errorMessage));
                    },
                )
                .on("end", (stdout: string | null, stderr: string | null) => {
                    logger.debug(
                        `Audio mixing finished successfully. Output: ${outputAudioPath}`,
                    );
                    const stdOutput = stdout?.toString();
                    const stdError = stderr?.toString();
                    if (stdOutput) logger.debug("ffmpeg stdout:", stdOutput);
                    // stderr can contain informational messages as well, not just errors
                    if (stdError) logger.debug("ffmpeg stderr:", stdError);
                    resolve();
                })
                .save(outputAudioPath);
        });
    } catch (error: unknown) {
        // Catch 'unknown' and then perform type checking for robust error handling
        let errorMessage = "An unexpected error occurred during audio mixing.";
        if (error instanceof Error) {
            errorMessage = `Failed to mix audio: ${error.message}`;
        } else if (typeof error === "string") {
            errorMessage = `Failed to mix audio: ${error}`;
        }
        logger.error(errorMessage, error); // Log original error object for more context
        throw new Error(errorMessage); // Re-throw as a standard Error object
    }
}

async function concatenateVideos(
    inputPaths: string[],
    outputPath: string,
): Promise<void> {
    // Create FFmpeg command
    const command = ffmpeg();

    // Add all video inputs
    inputPaths.forEach((path) => {
        command.input(path);
    });

    // Build the filter complex
    const filterComplex = [];

    // First, check which inputs have audio and prepare the filter chain
    const inputLabels = await Promise.all(
        inputPaths.map(async (path, i) => {
            let videoDurationSecs = "0"; // Store as string initially
            const hasAudio = await new Promise<boolean>((resolve) => {
                ffmpeg.ffprobe(path, (err, metadata) => {
                    if (err) {
                        logger.error(`Error probing ${path}:`, err);
                        resolve(false); // Assume no audio and attempt to get duration later
                        return;
                    }
                    // Get video duration
                    const videoStream = metadata.streams.find(
                        (s) => s.codec_type === "video",
                    );
                    if (videoStream && videoStream.duration) {
                        videoDurationSecs = videoStream.duration;
                    } else if (metadata.format && metadata.format.duration) {
                        videoDurationSecs = metadata.format.duration.toString();
                    }

                    const hasAudioStream = metadata.streams.some(
                        (s) => s.codec_type === "audio",
                    );
                    resolve(hasAudioStream);
                });
            });

            const videoLabel = `[${i}:v]`;
            filterComplex.push(`${videoLabel}setpts=PTS-STARTPTS[v${i}]`);

            if (hasAudio) {
                const audioLabel = `[${i}:a]`;
                filterComplex.push(`${audioLabel}asetpts=PTS-STARTPTS[a${i}]`);
                return `[v${i}][a${i}]`;
            } else {
                if (parseFloat(videoDurationSecs) <= 0) {
                    // Fallback if duration couldn't be read, log and use a default or error
                    logger.warn(
                        `Could not determine duration for ${path}, using default of 1s for silent audio. This might cause issues.`,
                    );
                    videoDurationSecs = "1"; // Or handle as an error
                }
                // For videos without audio, create a silent audio stream with explicit duration
                filterComplex.push(
                    `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${videoDurationSecs}[a${i}]`,
                );
                return `[v${i}][a${i}]`;
            }
        }),
    );

    // Then concatenate all labeled streams
    const concatInputs = inputLabels.join("");
    filterComplex.push(
        `${concatInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`,
    );

    // Apply the filter complex and set output options
    command
        .complexFilter(filterComplex, ["outv", "outa"])
        .format("mp4") // Explicitly set output format
        .outputOptions([
            "-c:v libx264", // Use H.264 codec for video
            "-preset veryfast", // Encoding preset
            "-crf 23", // Constant Rate Factor (quality)
            "-c:a aac", // Use AAC codec for audio
            "-b:a 192k", // Audio bitrate
            "-movflags +faststart", // Enable fast start for web playback
            "-y", // Overwrite output file if it exists
        ])
        .output(outputPath);

    // Execute the command with explicit error handling
    await new Promise<void>((resolve, reject) => {
        command
            .on("start", (commandLine) => {
                logger.debug("FFmpeg command:", commandLine);
                // Verify the command doesn't have duplicate mappings
                if (
                    commandLine.includes(
                        "-map [outv] -map [outa] -map [outv] -map [outa]",
                    )
                ) {
                    logger.error("Command contains duplicate stream mappings");
                    reject(
                        new Error("Invalid command: duplicate stream mappings"),
                    );
                    return;
                }
            })
            .on("progress", (progress) => {
                if (progress.percent) {
                    logger.debug(
                        `Processing: ${Math.floor(progress.percent)}% done`,
                    );
                }
            })
            .on("end", () => {
                logger.debug("Video concatenation completed");
                resolve();
            })
            .on("error", (err, stdout, stderr) => {
                logger.error("Error during video concatenation:", err);
                logger.error(`FFmpeg stdout: ${stdout}`);
                logger.error(`FFmpeg stderr: ${stderr}`);
                reject(err);
            })
            .run();
    });
}

export async function exportMovie(
    layers: TimelineLayer[],
): Promise<{ videoUrl: string; vttUrl?: string }> {
    logger.debug(`Export Movie`);
    logger.debug(layers);

    const id = uuidv4();
    const outputFileName = `${id}.mp4`;
    const outputFileNameWithAudio = `${id}_with_audio.mp4`;
    const outputFileNameWithVoiceover = `${id}_with_voiceover.mp4`;
    let finalOutputPath;
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "video-concat-"),
    );
    const publicDir = path.join(process.cwd(), "public");

    const videoLayer = layers.find((layer) => layer.id === "videos");
    const voiceoverLayer = layers.find((layer) => layer.id === "voiceovers");
    const musicLayer = layers.find((layer) => layer.id === "music");

    if (!videoLayer) {
        throw new Error("Missing video layer");
    }

    const gcsVideoUris = videoLayer.items.map((item) => item.content);

    try {
        // Download all videos to local temp directory
        logger.debug(`Download all videos`);
        logger.debug(gcsVideoUris);
        const localPaths = await Promise.all(
            gcsVideoUris.map(async (signedUri, index) => {
                const uri = signedUrlToGcsUri(signedUri);
                const match = uri.match(/gs:\/\/([^\/]+)\/(.+)/);
                if (!match) {
                    throw new Error(`Invalid GCS URI format: ${uri}`);
                }

                const [, bucket, filePath] = match;
                const localPath = path.join(
                    tempDir,
                    `video-${index}${path.extname(filePath)}`,
                );

                await storage
                    .bucket(bucket)
                    .file(filePath)
                    .download({ destination: localPath });
                return localPath;
            }),
        );

        // Concatenate videos using FFmpeg concat filter
        logger.debug(`Concatenate videos using FFmpeg concat filter`);
        const outputPath = path.join(tempDir, outputFileName);
        await concatenateVideos(localPaths, outputPath);
        finalOutputPath = outputPath;
        logger.debug(`Concatenate videos done`);
        const outputPathWithAudio = path.join(tempDir, outputFileNameWithAudio);
        const outputPathWithVoiceover = path.join(
            tempDir,
            outputFileNameWithVoiceover,
        );
        let audioFile = path.join(publicDir, MOOD_MUSIC["Happy"]);
        if (musicLayer && musicLayer.items.length > 0) {
            // Download music to local temp directory
            logger.debug(`Download music`);
            const uri = signedUrlToGcsUri(musicLayer.items[0].content);
            const match = uri.match(/gs:\/\/([^\/]+)\/(.+)/);
            if (!match) {
                throw new Error(`Invalid GCS URI format: ${uri}`);
            }

            const [, bucket, filePath] = match;
            audioFile = path.join(tempDir, `music${path.extname(filePath)}`);

            await storage
                .bucket(bucket)
                .file(filePath)
                .download({ destination: audioFile });
        }

        // Mix Voiceover and Music
        logger.debug(`Mix Voiceover and Music`);
        let musicAudioFile = audioFile;
        if (voiceoverLayer) {
            // Download all videos to local temp directory
            logger.debug(`Download all voiceovers`);
            const speachAudioFiles = await Promise.all(
                voiceoverLayer.items.map(async (item, index) => {
                    const uri = signedUrlToGcsUri(item.content);
                    const match = uri.match(/gs:\/\/([^\/]+)\/(.+)/);
                    if (!match) {
                        throw new Error(`Invalid GCS URI format: ${uri}`);
                    }

                    const [, bucket, filePath] = match;
                    const localPath = path.join(
                        tempDir,
                        `voiceover-${index}${path.extname(filePath)}`,
                    );

                    await storage
                        .bucket(bucket)
                        .file(filePath)
                        .download({ destination: localPath });
                    return localPath;
                }),
            );
            await mixAudioWithVoiceovers(
                speachAudioFiles,
                audioFile,
                outputPathWithVoiceover,
                0.4,
                videoLayer.items[0].duration,
            );
            musicAudioFile = outputPathWithVoiceover;
        }

        // Adding an audio file
        logger.debug(`Adding music`);
        await addAudioToVideoWithFadeOut(
            outputPath,
            musicAudioFile,
            outputPathWithAudio,
        );
        finalOutputPath = outputPathWithAudio;
        let vttUrl: string | undefined;

        // Upload video to GCS
        logger.debug(`Upload result to GCS`);
        const { bucketName, destinationPath } =
            getGcsDestination(outputFileName);
        const bucket = storage.bucket(bucketName);

        await bucket.upload(finalOutputPath, {
            destination: destinationPath,
            metadata: {
                contentType: "video/mp4",
            },
        });

        const file = bucket.file(destinationPath);
        const videoUrl = file.cloudStorageURI.href;

        // if (voiceoverLayer) {
        //   // Upload VTT file to GCS
        //   const vttDestinationPath = path.join(GCS_VIDEOS_STORAGE_URI.replace(`gs://${bucketName}/`, ''), vttFileName);
        //   await bucket
        //     .upload(path.join(publicDir, vttFileName), {
        //       destination: vttDestinationPath,
        //       metadata: {
        //         contentType: 'text/vtt',
        //       },
        //     });
        //   const vttFile = bucket.file(vttDestinationPath);
        //   [vttUrl] = await vttFile.getSignedUrl(options);
        // }

        logger.debug(`videoUrl: ${videoUrl}`);
        if (vttUrl) logger.debug(`vttUrl: ${vttUrl}`);

        return { videoUrl, vttUrl };
    } catch (error) {
        logger.error("Error exporting movie:", error);
        throw new Error(
            `Failed to movie: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    } finally {
        // Clean up temporary files
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}

/**
 * Converts raw PCM audio data to MP3 format.
 * Gemini models (like TTS or native audio) return raw 16-bit PCM at 24kHz little-endian.
 *
 * @param pcmBuffer The raw PCM audio data.
 * @param sampleRate The sample rate of the PCM data (default: 24000).
 * @param numChannels The number of channels (default: 1 for mono).
 * @returns A Promise that resolves with the MP3 audio data as a Buffer.
 */
export async function convertPcmToMp3(
    pcmBuffer: Buffer,
    sampleRate: number = 24000,
    numChannels: number = 1,
): Promise<Buffer> {
    const id = uuidv4();
    const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), `pcm-to-mp3-${id}-`),
    );
    const pcmPath = path.join(tempDir, "input.raw");
    const mp3Path = path.join(tempDir, "output.mp3");

    try {
        await fs.promises.writeFile(pcmPath, pcmBuffer);

        await new Promise<void>((resolve, reject) => {
            ffmpeg(pcmPath)
                .inputOptions([
                    "-f s16le",
                    `-ar ${sampleRate}`,
                    `-ac ${numChannels}`,
                ])
                .outputOptions(["-c:a libmp3lame", "-q:a 2"])
                .on("start", (commandLine) => {
                    logger.debug("FFmpeg PCM to MP3 command:", commandLine);
                })
                .on("error", (err, stdout, stderr) => {
                    logger.error(
                        "FFmpeg error during PCM to MP3 conversion:",
                        err,
                    );
                    logger.error(`FFmpeg stderr: ${stderr}`);
                    reject(err);
                })
                .on("end", () => {
                    logger.debug("PCM to MP3 conversion completed");
                    resolve();
                })
                .save(mp3Path);
        });

        return await fs.promises.readFile(mp3Path);
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
}

/**
 * Concatenates a music audio buffer twice with a fade-out/fade-in transition,
 * and returns the resulting audio buffer.
 *
 * @param inputAudioBuffer The input music audio data as a Buffer.
 * @param inputFormat The format of the input audio buffer (e.g., 'mp3', 'wav', 'aac'). This is crucial for FFmpeg to interpret the buffer correctly.
 * @param fadeDuration The duration of the fade-out and fade-in in seconds (default: 2).
 * @returns A Promise that resolves with the resulting audio Buffer, or rejects on error.
 */
export async function concatenateMusicWithFade(
    inputAudioBuffer: Buffer,
    inputFormat: string,
    fadeDuration: number = 2,
): Promise<Buffer> {
    return new Promise<Buffer>(async (resolve, reject) => {
        // --- Step 1: Get the duration of the input music buffer ---
        let musicDuration: number;
        try {
            musicDuration = await getAudioDurationFromBuffer(
                inputAudioBuffer,
                inputFormat,
            );
            if (musicDuration <= 0) {
                return reject(
                    new Error(
                        "Could not determine music duration or duration is zero.",
                    ),
                );
            }
        } catch (error) {
            return reject(
                new Error(`Failed to get music duration from buffer: ${error}`),
            );
        }
        logger.debug(`musicDuration: ${musicDuration}`);

        const fadeOutStartTime = musicDuration - fadeDuration;

        if (fadeOutStartTime < 0) {
            return reject(
                new Error(
                    "Fade duration is longer than the music buffer duration. Adjust fadeDuration.",
                ),
            );
        }

        // Create a temporary directory for processing
        const tempDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), "audio-concat-"),
        );
        const tempInputPath = path.join(tempDir, `input.${inputFormat}`);
        const tempOutputPath = path.join(tempDir, `output.mp3`);

        try {
            // Write input buffer to temporary file
            await fs.promises.writeFile(tempInputPath, inputAudioBuffer);

            // Run FFmpeg command
            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempInputPath)
                    .complexFilter(
                        [
                            // Split the input into two streams
                            {
                                filter: "asplit",
                                options: { outputs: 2 },
                                inputs: "[0:a]",
                                outputs: ["split1", "split2"],
                            },
                            // Apply fade-out to the first stream
                            {
                                filter: "afade",
                                options: {
                                    type: "out",
                                    start_time: fadeOutStartTime,
                                    duration: fadeDuration,
                                },
                                inputs: "split1",
                                outputs: "faded1",
                            },
                            // Apply fade-in to the second stream
                            {
                                filter: "afade",
                                options: {
                                    type: "in",
                                    start_time: 0,
                                    duration: fadeDuration,
                                },
                                inputs: "split2",
                                outputs: "faded2",
                            },
                            // Concatenate the two streams
                            {
                                filter: "concat",
                                options: { n: 2, v: 0, a: 1 },
                                inputs: ["faded1", "faded2"],
                                outputs: "out",
                            },
                        ],
                        "out",
                    )
                    .outputOptions(["-c:a libmp3lame", "-q:a 2"])
                    .on("start", (commandLine: string) => {
                        logger.debug(
                            "FFmpeg process started with command:",
                            commandLine,
                        );
                    })
                    .on(
                        "error",
                        (
                            err: Error,
                            stdout: string | null,
                            stderr: string | null,
                        ) => {
                            logger.error(`FFmpeg error: ${err.message}`);
                            logger.error(`FFmpeg stdout: ${stdout}`);
                            logger.error(`FFmpeg stderr: ${stderr}`);
                            reject(err);
                        },
                    )
                    .on("end", () => {
                        logger.debug("Concatenation finished.");
                        resolve();
                    })
                    .save(tempOutputPath);
            });

            // Read the output file
            const outputBuffer = await fs.promises.readFile(tempOutputPath);
            resolve(outputBuffer);
        } catch (error) {
            reject(error);
        } finally {
            // Clean up temporary files
            try {
                await fs.promises.rm(tempDir, {
                    recursive: true,
                    force: true,
                });
            } catch (cleanupErr) {
                logger.warn("Error cleaning up temp files:", cleanupErr);
            }
        }
    });
}

/**
 * Helper function to get the duration of an audio buffer using ffprobe.
 * This corrected version uses the fluent-ffmpeg's built-in ffprobe method.
 *
 * @param audioBuffer The audio data as a Buffer.
 * @param inputFormat The format of the audio buffer (e.g., 'mp3', 'wav', 'aac').
 * @returns A Promise that resolves with the duration in seconds, or rejects on error.
 */
function getAudioDurationFromBuffer(
    audioBuffer: Buffer,
    inputFormat: string,
): Promise<number> {
    return new Promise(async (resolve, reject) => {
        // Create a temporary directory to store the buffer
        const tempDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), "audio-duration-"),
        );
        const tempFilePath = path.join(tempDir, `temp_audio.${inputFormat}`);

        try {
            // Write buffer to temporary file
            await fs.promises.writeFile(tempFilePath, audioBuffer);

            // Use ffprobe on the temporary file instead of the buffer directly
            ffmpeg.ffprobe(tempFilePath, async (err, data) => {
                // Clean up temp file and directory
                try {
                    await fs.promises.rm(tempDir, {
                        recursive: true,
                        force: true,
                    });
                } catch (cleanupErr) {
                    logger.warn("Error cleaning up temp files:", cleanupErr);
                }

                if (err) {
                    return reject(new Error(`ffprobe failed: ${err.message}`));
                }

                // Try to get duration from format first
                if (data.format && typeof data.format.duration === "number") {
                    return resolve(data.format.duration);
                }

                // Fallback: try to get duration from audio stream
                const audioStream = data.streams.find(
                    (stream) => stream.codec_type === "audio",
                );
                if (audioStream && typeof audioStream.duration === "number") {
                    return resolve(audioStream.duration);
                }

                // If we still can't get duration, try to calculate it from sample rate and number of samples
                if (
                    audioStream &&
                    audioStream.sample_rate &&
                    audioStream.samples
                ) {
                    const duration =
                        audioStream.samples / audioStream.sample_rate;
                    if (duration > 0) {
                        return resolve(duration);
                    }
                }

                reject(
                    new Error(
                        "Could not determine duration from ffprobe metadata.",
                    ),
                );
            });
        } catch (error) {
            // Clean up temp file and directory in case of error
            try {
                await fs.promises.rm(tempDir, {
                    recursive: true,
                    force: true,
                });
            } catch (cleanupErr) {
                logger.warn("Error cleaning up temp files:", cleanupErr);
            }
            reject(new Error(`Failed to process audio buffer: ${error}`));
        }
    });
}

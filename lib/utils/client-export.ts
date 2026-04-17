import {
    AudioBufferSource,
    AudioCodec,
    AudioEncodingConfig,
    BufferTarget,
    CanvasSink,
    CanvasSource,
    Input,
    Mp4OutputFormat,
    WebMOutputFormat,
    Output,
    UrlSource,
    VideoEncodingConfig,
    ALL_FORMATS,
} from "mediabunny";
import { TimelineLayer } from "@/app/types";
import { clientLogger } from "@/lib/utils/client-logger";

// Constants
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const SAMPLE_RATE = 44100;

/**
 * Checks if a specific audio configuration is supported by the browser.
 */
async function isAudioConfigSupported(
    codec: string,
    sampleRate: number,
    numberOfChannels: number,
    bitrate: number,
): Promise<boolean> {
    if (
        typeof AudioEncoder === "undefined" ||
        !AudioEncoder.isConfigSupported
    ) {
        return false;
    }

    try {
        const result = await AudioEncoder.isConfigSupported({
            codec,
            sampleRate,
            numberOfChannels,
            bitrate,
        });
        return !!result.supported;
    } catch (error) {
        clientLogger.warn(`Check for ${codec} support failed:`, error);
        return false;
    }
}

export async function exportVideoClient(
    layers: TimelineLayer[],
    onProgress?: (progress: number) => void,
): Promise<Blob> {
    clientLogger.info("Starting client-side export...");

    // 1. Determine Output Format and Audio Codec
    let audioCodec: AudioCodec = "aac";
    let outputFormat: Mp4OutputFormat | WebMOutputFormat =
        new Mp4OutputFormat();
    let mimeType = "video/mp4";

    // Standard AAC LC codec string for WebCodecs
    const AAC_CODEC = "mp4a.40.2";

    const aacSupported = await isAudioConfigSupported(
        AAC_CODEC,
        SAMPLE_RATE,
        2,
        128_000,
    );

    if (!aacSupported) {
        clientLogger.warn(
            "AAC encoding not supported by this browser. Falling back to Opus and WebM.",
        );
        audioCodec = "opus";
        outputFormat = new WebMOutputFormat();
        mimeType = "video/webm";
    }

    // 2. Initialize Output with BufferTarget
    const target = new BufferTarget();
    const output = new Output({
        format: outputFormat,
        target: target,
    });

    // 3. Setup Video Track
    // Create an OffscreenCanvas for drawing frames
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d")!;

    // Video Encoding Config (H.264)
    // Note: If on Firefox, H.264 might also be unsupported for encoding.
    // For now we focus on the reported audio error.
    const videoConfig: VideoEncodingConfig = {
        codec: "avc", // H.264
        bitrate: 5_000_000, // 5 Mbps
    };

    const canvasSource = new CanvasSource(canvas, videoConfig);
    output.addVideoTrack(canvasSource);

    // 4. Setup Audio Track
    const audioConfig: AudioEncodingConfig = {
        codec: audioCodec,
        bitrate: 128_000,
    };

    const audioSource = new AudioBufferSource(audioConfig);
    output.addAudioTrack(audioSource);

    // 5. Start Output
    await output.start();

    // 6. Compute Duration
    // Find max duration from layers
    let duration = 0;
    layers.forEach((layer) => {
        layer.items.forEach((item) => {
            duration = Math.max(duration, item.startTime + item.duration);
        });
    });
    if (duration === 0) duration = 1; // Minimum duration

    clientLogger.info(`Export duration: ${duration}s`);

    // 7. Process Audio (Mix to AudioBuffer)
    const audioContext = new OfflineAudioContext(
        2,
        Math.ceil(duration * SAMPLE_RATE),
        SAMPLE_RATE,
    );

    // Helper to load audio buffer
    const loadAudioBuffer = async (
        url: string,
    ): Promise<AudioBuffer | null> => {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        } catch {
            clientLogger.error("Failed to load audio:", url);
            return null;
        }
    };

    // Process all audio items
    const audioPromises = layers.flatMap((layer) => {
        if (layer.type === "voiceover" || layer.type === "music") {
            return layer.items.map(async (item) => {
                if (!item.content) return;
                const buffer = await loadAudioBuffer(item.content);
                if (buffer) {
                    const source = audioContext.createBufferSource();
                    const gainNode = audioContext.createGain();

                    source.buffer = buffer;

                    // Handle trimming if metadata exists
                    const startTime = item.startTime;
                    const offset =
                        typeof item.metadata?.trimStart === "number"
                            ? item.metadata.trimStart
                            : 0;
                    const playDuration = item.duration;

                    source.connect(gainNode);
                    gainNode.connect(audioContext.destination);

                    source.start(startTime, offset, playDuration);

                    // Add ducking for music tracks for the last 2 seconds
                    if (layer.type === "music") {
                        const duckStart = Math.max(0, duration - 2);
                        const duckEnd = duration;

                        if (duckEnd > duckStart) {
                            gainNode.gain.setValueAtTime(1, duckStart);
                            gainNode.gain.linearRampToValueAtTime(0, duckEnd);
                        }
                    }
                }
            });
        }
        return [];
    });

    await Promise.all(audioPromises);
    const mixedAudioBuffer = await audioContext.startRendering(); // Returns AudioBuffer

    // Add Audio to Source
    await audioSource.add(mixedAudioBuffer);

    // 8. Process Video (Frame by Frame)
    const videoLayer = layers.find((l) => l.type === "video");
    const videoInputs = new Map<string, { input: Input; sink: CanvasSink }>();

    if (videoLayer) {
        for (const item of videoLayer.items) {
            if (item.content) {
                try {
                    const input = new Input({
                        source: new UrlSource(item.content),
                        formats: ALL_FORMATS,
                    });
                    const track = await input.getPrimaryVideoTrack();
                    if (track) {
                        const sink = new CanvasSink(track);
                        videoInputs.set(item.id, { input, sink });
                    }
                } catch {
                    clientLogger.error(
                        "Failed to load video input:",
                        item.content,
                    );
                }
            }
        }
    }

    // Render Loop
    const dt = 1 / FPS;
    const totalFrames = Math.ceil(duration * FPS);

    for (let i = 0; i < totalFrames; i++) {
        const time = i * dt;

        // Report progress
        if (onProgress) {
            const progress = Math.round((i / totalFrames) * 100);
            onProgress(progress);
        }

        // Clear canvas
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Find active video clip
        const activeClip = videoLayer?.items.find(
            (item) =>
                time >= item.startTime && time < item.startTime + item.duration,
        );

        if (activeClip && videoInputs.has(activeClip.id)) {
            const { sink } = videoInputs.get(activeClip.id)!;

            const offset =
                typeof activeClip.metadata?.trimStart === "number"
                    ? activeClip.metadata.trimStart
                    : 0;
            const clipTime = time - activeClip.startTime + offset;

            try {
                const wrapped = await sink.getCanvas(clipTime);
                if (wrapped && wrapped.canvas) {
                    ctx.drawImage(wrapped.canvas, 0, 0, WIDTH, HEIGHT);
                }
            } catch {
                // ignore
            }
        }

        // Add frame to output
        await canvasSource.add(time, dt);
    }

    // Finalize
    await output.finalize();

    // Cleanup video inputs
    videoInputs.forEach(({ input }) => {
        try {
            input.dispose();
        } catch (e) {
            clientLogger.warn("Failed to dispose video input:", e);
        }
    });

    if (!target.buffer) {
        throw new Error("Export failed: No buffer produced");
    }

    return new Blob([target.buffer], { type: mimeType });
}

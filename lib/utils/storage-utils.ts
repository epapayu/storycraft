import * as path from "path";
import { storage } from "@/lib/storage/storage";
import logger from "@/app/logger";

/**
 * Extracts the bucket name and destination path from the GCS_VIDEOS_STORAGE_URI environment variable
 * and the provided filename.
 *
 * @param fileName The name of the file to be stored.
 * @param projectId Optional ID of the project to partition directory path.
 * @returns An object containing the bucket name and the destination path.
 */
export function getGcsDestination(fileName: string, projectId?: string): {
    bucketName: string;
    destinationPath: string;
} {
    const gcsUri = process.env.GCS_VIDEOS_STORAGE_URI || "";
    const bucketName = gcsUri.replace("gs://", "").split("/")[0];
    let basePath = gcsUri.replace(`gs://${bucketName}`, "");
    if (basePath.startsWith("/")) basePath = basePath.substring(1);

    if (projectId) {
        basePath = path.join(basePath, projectId);
    }

    const destinationPath = path.join(basePath, fileName);
    return { bucketName, destinationPath };
}

/**
 * Uploads a buffer to Google Cloud Storage.
 *
 * @param buffer The file content as a Buffer.
 * @param fileName The name of the file to be stored.
 * @param contentType The MIME type of the file.
 * @param projectId Optional ID of the project to partition directory path.
 * @returns The GCS URI of the uploaded file.
 */
export async function uploadBufferToGcs(
    buffer: Buffer,
    fileName: string,
    contentType: string,
    projectId?: string,
): Promise<string> {
    logger.debug(`Uploading ${fileName} to GCS...`);
    const { bucketName, destinationPath } = getGcsDestination(fileName, projectId);
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationPath);

    await file.save(buffer, {
        metadata: {
            contentType,
        },
    });

    return file.cloudStorageURI.href;
}

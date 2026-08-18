import { storageService } from "@/db/storage";
import { hasNativeSupport, type IFileStorageWithNativeSupport } from "@/db/storage/IFileStorage";

const FINGERPRINT_READ_SIZE = 64 * 1024;

async function hashToHex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer).slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeFileFingerprint(
  absolutePath: string,
  fileSize: number,
): Promise<string> {
  if (!hasNativeSupport(storageService)) {
    return `${fileSize}:${absolutePath}`;
  }

  const nativeStorage = storageService as IFileStorageWithNativeSupport;
  const readResult = await nativeStorage.readBytes(absolutePath, FINGERPRINT_READ_SIZE);

  if (readResult.isErr()) {
    return `${fileSize}:${absolutePath}`;
  }

  const hashHex = await hashToHex(readResult.value);
  return `${fileSize}:${hashHex}`;
}

export async function computeFileFingerprintFromBlob(file: File): Promise<string> {
  const readSize = Math.min(FINGERPRINT_READ_SIZE, file.size);
  const slice = file.slice(0, readSize);
  const buffer = await slice.arrayBuffer();
  const hashHex = await hashToHex(new Uint8Array(buffer));
  return `${file.size}:${hashHex}`;
}

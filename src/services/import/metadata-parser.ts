import { normalizeMetadata } from "@/lib/metadata";
import { WorkerPool } from "../worker-pool";

type NormalizedMetadata = ReturnType<typeof normalizeMetadata>;

/**
 * Parses audio bytes in a worker and normalizes the resulting tags.
 * Shared by the import pipeline and the folder-sync flow.
 */
export class MetadataParser {
  constructor(private readonly workerPool: WorkerPool) {}

  /**
   * @param name Display file name (used for format detection and error messages).
   * @param bytes Head bytes of the audio file.
   * @param file Original `File` when importing from the web; a lightweight mock
   *   is substituted for native imports where no `File` object exists.
   */
  async parse(name: string, bytes: Uint8Array, file?: File): Promise<NormalizedMetadata> {
    const rawMeta = await this.workerPool.parse(name, bytes, { extractCover: true });
    const fileMock = file ?? ({ name, webkitRelativePath: "" } as File);
    return normalizeMetadata(fileMock, rawMeta);
  }
}

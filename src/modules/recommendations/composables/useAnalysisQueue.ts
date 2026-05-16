import { computed, readonly, ref } from "vue";
import { audioFeaturesRepository, CURRENT_ALGORITHM_VERSION } from "@/db/repositories/audioFeatures.repository";
import { trackRepository } from "@/db/repositories";
import { storageService } from "@/db/storage";
import type { TrackId } from "@/types/ids";
import type { AnalysisRequest, AnalysisResponse } from "../workers/types";
import EssentiaWorker from "../workers/essentia.worker?worker";
import { AsyncQueue } from "@/lib/async-queue";

let worker: Worker | null = null;

interface PendingRequest {
  resolve: () => void;
  reject: (err: Error) => void;
}

const pending = new Map<string, PendingRequest>();

function handleWorkerMessage(e: MessageEvent<AnalysisResponse>): void {
  const { requestId, trackId } = e.data;
  console.log("RESPONCE FROM WORKER", e);
  const p = pending.get(requestId);
  if (!p) return;
  pending.delete(requestId);

  if (e.data.success) {
    audioFeaturesRepository.upsert({
      trackId,
      ...e.data.features,
      analyzedAt: Date.now(),
      algorithmVersion: CURRENT_ALGORITHM_VERSION,
    })
      .then(() => p.resolve())
      .catch(p.reject);
  }
  else {
    p.reject(new Error(e.data.error));
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new EssentiaWorker();
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (err) => {
    console.error("WORKER ERROR");
    console.error("message:", err.message);
    console.error("filename:", err.filename);
    console.error("lineno:", err.lineno);
    console.error("colno:", err.colno);
    console.error(err);
  };
  return worker;
}

async function analyzeTrack(trackId: TrackId): Promise<void> {
  const trackResult = await trackRepository.findById(trackId);
  if (trackResult.isErr() || !trackResult.value) return;

  const fileResult = await storageService.getFile(trackResult.value.storagePath);
  if (fileResult.isErr()) return;

  const buffer = await fileResult.value.arrayBuffer();
  const fileData = new Uint8Array(buffer);
  console.log("SENT TO WORKER", trackId);
  return new Promise<void>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pending.set(requestId, { resolve, reject });

    const request: AnalysisRequest = { requestId, trackId, fileData };
    getWorker().postMessage(request, [fileData.buffer]);
  });
}

const processedCount = ref(0);
const currentTrackId = ref<TrackId | null>(null);

const queue = new AsyncQueue<TrackId>(
  async (trackId) => {
    currentTrackId.value = trackId;
    try {
      await analyzeTrack(trackId);
    }
    finally {
      processedCount.value++;
      currentTrackId.value = null;
    }
  },
  { useIdleCallback: true, idleTimeout: 5000 },
);

export function useAnalysisQueue() {
  async function start(): Promise<void> {
    const unanalyzedResult = await audioFeaturesRepository.findUnanalyzedIds();
    if (unanalyzedResult.isErr()) return;
    queue.append(unanalyzedResult.value);
  }

  return {
    start,
    stop: () => queue.stop(),
    enqueue: (ids: TrackId[]) => queue.prepend(ids),
    isRunning: computed (() => queue.isRunning),
    processedCount: readonly(processedCount),
    currentTrackId: readonly(currentTrackId),
  };
}

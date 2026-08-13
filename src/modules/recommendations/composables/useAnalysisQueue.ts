import { computed, readonly, ref } from "vue";
import { tryOnScopeDispose } from "@vueuse/core";
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
    console.error("[EssentiaWorker] Error:", err.message);
    for (const [id, p] of pending) {
      p.reject(new Error(`Worker error: ${err.message}`));
      pending.delete(id);
    }
  };
  return worker;
}

async function analyzeTrack(trackId: TrackId): Promise<void> {
  const trackResult = await trackRepository.findById(trackId);
  if (trackResult.isErr() || !trackResult.value?.storagePath) return;

  const fileResult = await storageService.getFile(trackResult.value.storagePath);
  if (fileResult.isErr()) return;

  const buffer = await fileResult.value.arrayBuffer();
  const fileData = new Uint8Array(buffer);

  return new Promise<void>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pending.set(requestId, { resolve, reject });

    const request: AnalysisRequest = { requestId, trackId, fileData };
    getWorker().postMessage(request, [fileData.buffer]);
  });
}

export function useAnalysisQueue() {
  const processedCount = ref(0);
  const currentTrackId = ref<TrackId | null>(null);
  let isRunning = false;

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

  async function start(): Promise<void> {
    if (isRunning) return;
    isRunning = true;
    try {
      const unanalyzedResult = await audioFeaturesRepository.findUnanalyzedIds();
      if (unanalyzedResult.isErr()) return;
      if (!isRunning) return;
      queue.append(unanalyzedResult.value);
    }
    finally {
      isRunning = false;
    }
  }

  function stop() {
    isRunning = false;
    queue.stop();
    worker?.terminate();
    worker = null;
    for (const [id, p] of pending) {
      p.reject(new Error("Analysis stopped"));
      pending.delete(id);
    }
  }

  tryOnScopeDispose(() => {
    stop();
  });

  return {
    start,
    stop,
    enqueue: (ids: TrackId[]) => queue.prepend(ids),
    isRunning: computed(() => isRunning || queue.isRunning),
    processedCount: readonly(processedCount),
    currentTrackId: readonly(currentTrackId),
  };
}

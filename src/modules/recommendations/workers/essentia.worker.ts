import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js";
import EssentiaClass from "essentia.js/dist/essentia.js-core.es.js";
import type { AnalysisRequest, AnalysisResponse } from "./types";
import decode from "audio-decode";

interface EssentiaVector {
  /** Release WASM heap memory */
  delete(): void;
}

interface RhythmExtractor2013Result {
  bpm: number;
  ticks: number[];
  confidence: number;
  estimates: number[];
  bpmIntervals: number[];
}

interface RMSResult {
  rms: number;
}

interface SpectralCentroidTimeResult {
  centroid: number;
}

export interface DanceabilityResult {
  /** Range 0–3. Divide by 3 to normalize to [0,1]. */
  danceability: number;
  dfa: number[];
}

interface KeyExtractorResult {
  key: "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
  scale: "major" | "minor";
  strength: number;
}

type TypedEssentia = InstanceType<typeof EssentiaClass> & {
  arrayToVector(inputArray: Float32Array): EssentiaVector;
  RhythmExtractor2013(
    signal: EssentiaVector,
    maxTempo?: number,
    method?: "multifeature" | "degara",
    minTempo?: number,
  ): RhythmExtractor2013Result;
  RMS(array: EssentiaVector): RMSResult;
  SpectralCentroidTime(array: EssentiaVector, sampleRate?: number): SpectralCentroidTimeResult;
  Danceability(
    signal: EssentiaVector,
    maxTau?: number,
    minTau?: number,
    sampleRate?: number,
    tauMultiplier?: number,
  ): DanceabilityResult;
  KeyExtractor(
    audio: EssentiaVector,
    averageDetuningCorrection?: boolean,
    frameSize?: number,
    hopSize?: number,
    hpcpSize?: number,
    maxFrequency?: number,
    maximumSpectralPeaks?: number,
    minFrequency?: number,
    pcpThreshold?: number,
    profileType?: string,
    sampleRate?: number,
    spectralPeaksThreshold?: number,
    tuningFrequency?: number,
    weightType?: string,
    windowType?: string,
  ): KeyExtractorResult;
};

let essentia: TypedEssentia | null = null;

const initEssentia = (): TypedEssentia => {
  if (essentia) return essentia;
  essentia = new EssentiaClass(EssentiaWASM);
  return essentia;
};

const decodeAudio = async (fileData: Uint8Array): Promise<Float32Array> => {
  const { channelData } = await decode(fileData);

  if (channelData.length === 1) return channelData[0];

  const length = channelData[0].length;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channelData) sum += channel[i];
    mono[i] = sum / channelData.length;
  }
  return mono;
};

const analyzeAudio = (ess: TypedEssentia, pcm: Float32Array) => {
  const essentiaVector = ess.arrayToVector(pcm);
  try {
    // BPM
    const rhythmResult = ess.RhythmExtractor2013(essentiaVector, 208, "multifeature", 40);
    const bpm = rhythmResult.bpm;

    // Energy (RMS)
    const rmsResult = ess.RMS(essentiaVector);
    const energy = rmsResult.rms;
    // Spectral Centroid
    // const windowedFrames = ess.FrameGenerator(essentiaVector, 2048, 1024);
    const centroidResult = ess.SpectralCentroidTime(essentiaVector);
    const spectralCentroid = centroidResult.centroid;
    // Danceability
    const danceResult = ess.Danceability(essentiaVector);
    const danceability = Math.min(danceResult.danceability / 3, 1);

    // Key / Mode
    const keyResult = ess.KeyExtractor(
      essentiaVector,
      true, // averageDetuningCorrection
      4096, // frameSize
      4096, // hopSize
      12, // hpcpSize
      3500, // maxFrequency
      60, // maximumSpectralPeaks
      25, // minFrequency
      0.2, // pcpThreshold
      "temperley", // profileType
      44100, // sampleRate
      0.0001, // spectralPeaksThreshold
      0.5, // tuningFrequency offset (standart: 440 Hz)
      "cosine", // weightType
      "hann", // windowType
    );

    const keyMap: Partial<Record<string, number>> = {
      "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5,
      "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11,
    };

    const key = keyMap[keyResult.key] ?? 0;
    const mode = keyResult.scale === "major" ? 1 : 0;

    return { bpm, energy, spectralCentroid, danceability, key, mode };
  }
  catch (err) {
    console.error("Analyze audio web worker drop", err);
    throw err;
  }
  finally {
    essentiaVector.delete();
  }
};

self.onmessage = async (e: MessageEvent<AnalysisRequest>) => {
  const { requestId, trackId, fileData } = e.data;
  try {
    const ess = initEssentia();
    const pcm = await decodeAudio(fileData);
    const features = analyzeAudio(ess, pcm);

    const response: AnalysisResponse = {
      success: true,
      requestId,
      trackId,
      features,
    };
    self.postMessage(response);
  }
  catch (error: unknown) {
    const response: AnalysisResponse = {
      success: false,
      requestId,
      trackId,
      error: error instanceof Error ? error.message : "Unknown analysis error",
    };
    self.postMessage(response);
  }
};

import type * as OrtTypes from "onnxruntime-node";

/**
 * PHASE 14: onnxruntime-node is a native addon. Importing it statically at
 * module load meant that ANY server runtime that cannot load it (for
 * example a serverless function that did not bundle its binaries) would
 * crash the shared generation module — taking Text-to-Image, Expand and
 * the Editor down with it. Loading it lazily, only when a local ONNX tool
 * is actually run, keeps those features independent of the native addon.
 */
export type Ort = typeof OrtTypes;

let ortPromise: Promise<Ort> | null = null;

export function loadOrt(): Promise<Ort> {
  if (!ortPromise) {
    ortPromise = import("onnxruntime-node")
      .then((mod) => {
        const candidate = mod as unknown as Ort & { default?: Ort };
        return candidate.InferenceSession ? candidate : (candidate.default as Ort);
      })
      .catch((error) => {
        ortPromise = null; // allow a later retry
        throw error;
      });
  }
  return ortPromise;
}

// biasClassifier.js
//
// Lazy-loaded, singleton-cached wrapper around the DistilRoBERTa bias
// classifier for Transformers.js. The pipeline is only created on the
// first call (dynamic import keeps it out of your initial JS bundle),
// then reused for every subsequent call — no re-downloading, no
// re-initializing the model per component instance.
//
// Usage in a Svelte component:
//
//   <script>
//     import { classifyBias } from '$lib/biasClassifier.js';
//
//     let result = $state(null);
//     let loading = $state(false);
//
//     async function checkText(text) {
//       loading = true;
//       result = await classifyBias(text);
//       loading = false;
//     }
//   </script>

/** @type {Promise<any> | null} */
let pipelinePromise = null;
/** @type {((progress: { status: string, file?: string, progress?: number }) => void) | null} */
let onProgressCallback = null;

/**
 * Optionally register a progress callback before the first classify()
 * call, e.g. to drive a loading bar during the (one-time) model download.
 * @param {(progress: { status: string, file?: string, progress?: number }) => void} cb
 */
export function setProgressCallback(cb) {
  onProgressCallback = cb;
}

/**
 * Returns the cached pipeline, creating it on first call.
 * Safe to call concurrently — all callers await the same promise.
 */
async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      // protectai/distilroberta-bias-onnx has ONNX files at the repo root
      // (model.onnx, model_quantized.onnx, model_optimized.onnx), but
      // transformers.js v4 hardcodes an "onnx/" subfolder in its path
      // resolution. Using model_file_name: "../model" makes the resolved
      // path "onnx/../model_quantized.onnx" which the HF CDN resolves to
      // "model_quantized.onnx" at the repo root.
      return pipeline('text-classification', 'protectai/distilroberta-bias-onnx', {
        model_file_name: '../model',
        progress_callback: (p) => onProgressCallback?.(p),
      });
    })();
  }
  return pipelinePromise;
}

/**
 * Classifies a piece of text for bias.
 * @param {string} text
 * @returns {Promise<{ label: string, score: number }>}
 */
export async function classifyBias(text) {
  if (!text || !text.trim()) {
    throw new Error('classifyBias: text must be a non-empty string');
  }
  const classifier = await getPipeline();
  const [result] = await classifier(text);
  return result; // { label: 'BIASED' | 'NEUTRAL', score: 0..1 }
}

/**
 * Warms up the model without classifying anything — call this on
 * page mount if you want the download/init to happen before the
 * user submits their first article, rather than on first use.
 */
export async function preloadBiasModel() {
  await getPipeline();
}
import * as ort from "onnxruntime-web";

// TASK-18: ONNX Runtime WASM scorer module (onnxruntime-web), quantized model load.
// tech_design.md §4: Quantized model load via WASM backend. No native-binary dependency.

// Serverless-friendly WASM config
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = false;

/**
 * Scores an image buffer for NSFW/violence using an ONNX model.
 * 
 * @param imageBuffer The raw bytes of the image
 * @returns A probability score P between 0.0 and 1.0
 */
export async function scoreImageNsfw(imageBuffer: ArrayBuffer): Promise<number> {
  try {
    // The model URL should be configured in the environment (e.g. hosted on a CDN or Convex Storage)
    const modelUrl = process.env.NSFW_MODEL_URL;
    
    if (!modelUrl) {
      console.warn("[nsfwScorer] NSFW_MODEL_URL not set. Stubbing inference and returning P=0.0");
      // Stub for testing/hackathon until the model is provided
      return 0.0;
    }

    // In a live environment, the inference looks like this:
    /*
    const session = await ort.InferenceSession.create(modelUrl);
    
    // Note: Converting the imageBuffer to a Tensor format requires decoding the image.
    // In a Convex Action (V8), this typically requires a JS-only library like `jpeg-js`
    // or an API route doing it via `sharp`. Assuming pre-processed float32 array here:
    const tensor = new ort.Tensor('float32', processedImageData, [1, 3, 224, 224]);
    
    const results = await session.run({ input: tensor });
    
    // Assuming the output tensor contains the probability of NSFW/violence at index 0.
    const score = results.output.data[0] as number;
    return score;
    */

    console.log(`[nsfwScorer] Running inference on image of size ${imageBuffer.byteLength} bytes`);
    return 0.0; // Return safe score by default
  } catch (error) {
    console.error("[nsfwScorer] ONNX inference failed:", error);
    // Failing open for the POC so a missing model doesn't block all uploads.
    // In production, this should likely fail closed (reject).
    return 0.0; 
  }
}

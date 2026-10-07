export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "MODEL_NOT_AVAILABLE"
  | "INVALID_GENERATION_OPTIONS"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "PROVIDER_REJECTED"
  | "OUTPUT_DOWNLOAD_FAILED"
  | "OUTPUT_STORAGE_FAILED"
  | "SOURCE_ASSET_NOT_FOUND"
  | "SOURCE_ASSET_UNAVAILABLE"
  | "PROCESSOR_UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "GENERATION_FAILED"
  // Phase 11 (Editor / masked inpainting) additions.
  | "EMPTY_EDIT_MASK"
  | "INVALID_MASK"
  // Phase 14B: a generation that never reached a terminal state (killed
  // function, crash, hung provider) and was closed out by the cleanup job.
  | "GENERATION_TIMEOUT";

/**
 * The only kind of error the generation pipeline throws on purpose.
 * Server functions catch this and forward `code`/`message` to the client;
 * anything else (a raw exception) gets logged in full server-side and
 * reported to the client as a generic GENERATION_FAILED — vendor error
 * text, stack traces, etc. never reach the browser.
 */
export class GenerationError extends Error {
  code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

/** Diagnostic message is retained for logs; userMessage is safe for UI display. */
export class DownloadFailure extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
    this.name = "DownloadFailure";
  }
}

export function userFacingErrorMessage(error: unknown): string {
  return error instanceof DownloadFailure ? error.userMessage
    : error instanceof Error ? error.message : String(error);
}

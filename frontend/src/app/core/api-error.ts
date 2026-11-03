import { HttpErrorResponse } from '@angular/common/http';
import { Problem } from './api/generated/models';

export interface AppError {
  status: number;
  message: string;
}

/** `upload` adds hints that only make sense when the failed request was a photo upload. */
export type ErrorContext = 'upload' | 'default';

/** Turns any thrown value into a message that is safe and useful to show to the user. */
export function toAppError(error: unknown, context: ErrorContext = 'default'): AppError {
  if (isAbort(error)) {
    return { status: 0, message: 'The request was cancelled.' };
  }
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, message: 'Something went wrong. Please try again.' };
  }
  const problem = isProblem(error.error) ? error.error : null;
  const detail = problem?.detail ?? problem?.title ?? null;
  switch (error.status) {
    case 0:
      return {
        status: 0,
        message:
          context === 'upload'
            ? 'The upload did not reach the server. Check your connection and try again. If it keeps failing, the photo may be too large for your connection.'
            : 'Cannot reach the server. Check your connection and try again.',
      };
    case 400:
    case 415:
    case 422:
      return {
        status: error.status,
        message:
          context === 'upload'
            ? `${detail ?? 'The server could not read that photo.'} Try a JPEG or PNG photo.`
            : (detail ?? `Request failed (${error.status}).`),
      };
    case 413:
      return { status: 413, message: 'That photo is too large for the server (15 MB limit). Try a smaller one.' };
    case 503:
      return {
        status: 503,
        message: detail && problem?.status === 503 ? detail : 'The catalog is still loading. Try again in a minute.',
      };
    case 502:
    case 504:
      return {
        status: error.status,
        message: 'The server took too long to answer or is restarting. Wait a moment and try again.',
      };
    default:
      if (error.status >= 500) {
        return {
          status: error.status,
          message: `The server had a problem (error ${error.status}).${detail ? ` ${detail}` : ''} Try again in a moment.`,
        };
      }
      return { status: error.status, message: detail ?? `Request failed (${error.status}).` };
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && ('title' in value || 'detail' in value);
}

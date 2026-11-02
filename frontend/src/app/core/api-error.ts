import { HttpErrorResponse } from '@angular/common/http';
import { Problem } from './api/generated/models';

export interface AppError {
  status: number;
  message: string;
}

/** Turns any thrown value into a message that is safe and useful to show to the user. */
export function toAppError(error: unknown): AppError {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, message: 'Something went wrong. Please try again.' };
  }
  const problem = isProblem(error.error) ? error.error : null;
  switch (error.status) {
    case 0:
      return { status: 0, message: 'Cannot reach the server. Check your connection and try again.' };
    case 413:
      return { status: 413, message: 'That photo is too large. Try a smaller one.' };
    case 503:
      return { status: 503, message: 'The catalog is still loading. Try again in a minute.' };
    default:
      return {
        status: error.status,
        message: problem?.detail ?? problem?.title ?? `Request failed (${error.status}).`,
      };
  }
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && ('title' in value || 'detail' in value);
}

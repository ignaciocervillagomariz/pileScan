import { HttpErrorResponse } from '@angular/common/http';
import { toAppError } from './api-error';

describe('toAppError', () => {
  it('uses the problem detail when the server provides one', () => {
    const error = new HttpErrorResponse({ status: 422, error: { title: 'Unprocessable', detail: 'Unknown part 9999' } });
    expect(toAppError(error)).toEqual({ status: 422, message: 'Unknown part 9999' });
  });

  it('explains a catalog that is still importing', () => {
    expect(toAppError(new HttpErrorResponse({ status: 503 })).message).toMatch(/still loading/);
  });

  it('explains a network failure', () => {
    expect(toAppError(new HttpErrorResponse({ status: 0 })).message).toMatch(/Cannot reach/);
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(toAppError(new Error('boom')).message).toMatch(/went wrong/);
  });
});

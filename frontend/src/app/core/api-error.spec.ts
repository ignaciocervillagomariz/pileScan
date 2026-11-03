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

  it('explains an oversized photo', () => {
    expect(toAppError(new HttpErrorResponse({ status: 413 })).message).toMatch(/too large/);
  });

  it('explains gateway timeouts and server errors', () => {
    expect(toAppError(new HttpErrorResponse({ status: 504 })).message).toMatch(/took too long/);
    expect(toAppError(new HttpErrorResponse({ status: 500 })).message).toMatch(/server had a problem \(error 500\)/);
  });

  it('adds an upload hint to rejected photos', () => {
    const error = new HttpErrorResponse({ status: 400, error: { title: 'Bad Request', detail: 'Unsupported image.' } });
    expect(toAppError(error, 'upload').message).toBe('Unsupported image. Try a JPEG or PNG photo.');
    expect(toAppError(error).message).toBe('Unsupported image.');
  });

  it('describes a failed upload on a dead connection', () => {
    expect(toAppError(new HttpErrorResponse({ status: 0 }), 'upload').message).toMatch(/upload did not reach/);
  });
});

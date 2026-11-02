package com.pilescan.common;

import org.springframework.http.HttpStatus;

/** Base type of errors that map 1:1 to an RFC 9457 problem response. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String detail) {
        super(detail);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, detail);
    }

    public static ApiException badRequest(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, detail);
    }

    public static ApiException unprocessable(String detail) {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, detail);
    }

    public static ApiException payloadTooLarge(String detail) {
        return new ApiException(HttpStatus.CONTENT_TOO_LARGE, detail);
    }

    public static ApiException serviceUnavailable(String detail) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, detail);
    }

    public static ApiException notImplemented(String detail) {
        return new ApiException(HttpStatus.NOT_IMPLEMENTED, detail);
    }
}

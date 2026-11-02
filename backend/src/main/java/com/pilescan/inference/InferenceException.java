package com.pilescan.inference;

/** The inference service could not produce a usable answer. The message is shown to the user. */
public class InferenceException extends RuntimeException {

    public InferenceException(String message, Throwable cause) {
        super(message, cause);
    }

    public InferenceException(String message) {
        super(message);
    }
}

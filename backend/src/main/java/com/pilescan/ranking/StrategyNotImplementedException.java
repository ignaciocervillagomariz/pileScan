package com.pilescan.ranking;

import com.pilescan.common.ApiException;
import org.springframework.http.HttpStatus;

/** Thrown by ranking strategies that are declared but not built yet; maps to HTTP 501. */
public class StrategyNotImplementedException extends ApiException {

    public StrategyNotImplementedException(String strategy) {
        super(HttpStatus.NOT_IMPLEMENTED, "Ranking strategy '" + strategy + "' is not implemented yet.");
    }
}

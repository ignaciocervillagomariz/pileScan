package com.pilescan.ranking;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "sets")
@RestController
@RequestMapping("/api/scans/{scanId}/set-candidates")
class SetCandidateController {

    private final RankingService service;

    SetCandidateController(RankingService service) {
        this.service = service;
    }

    @Operation(operationId = "getSetCandidates", summary = "Rank the official sets these pieces most likely come from.")
    @GetMapping
    SetCandidatesResponse getSetCandidates(@PathVariable UUID scanId,
                                           @RequestParam(defaultValue = "5") @Min(1) @Max(20) int limit,
                                           @RequestParam(defaultValue = "coverage") String strategy,
                                           @RequestParam(defaultValue = "50") @Min(0) @Max(500) int missingLimit) {
        return service.candidates(scanId, strategy, limit, missingLimit);
    }
}

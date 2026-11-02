package com.pilescan.partmapping;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "admin")
@RestController
@RequestMapping("/api/admin/unmapped-part-ids")
class UnmappedPartIdController {

    private final PartMappingRepository repository;

    UnmappedPartIdController(PartMappingRepository repository) {
        this.repository = repository;
    }

    @Operation(operationId = "listUnmappedPartIds", summary = "Detector part IDs that could not be mapped to a Rebrickable part_num.")
    @GetMapping
    List<UnmappedPartId> list() {
        return repository.listUnmapped();
    }
}

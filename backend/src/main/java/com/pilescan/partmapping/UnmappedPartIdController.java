package com.pilescan.partmapping;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/unmapped-part-ids")
class UnmappedPartIdController {

    private final PartMappingRepository repository;

    UnmappedPartIdController(PartMappingRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    List<UnmappedPartId> list() {
        return repository.listUnmapped();
    }
}

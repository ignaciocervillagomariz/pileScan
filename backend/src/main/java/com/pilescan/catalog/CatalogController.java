package com.pilescan.catalog;

import com.pilescan.common.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "catalog")
@RestController
@RequestMapping("/api")
class CatalogController {

    private final CatalogRepository catalog;

    CatalogController(CatalogRepository catalog) {
        this.catalog = catalog;
    }

    @Operation(operationId = "searchParts", summary = "Search parts by part number or name (autocomplete).")
    @GetMapping("/parts")
    List<Part> searchParts(@RequestParam @NotBlank @Size(max = 100) String q,
                           @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
        return catalog.searchParts(q.strip(), limit);
    }

    @Operation(operationId = "getPart", summary = "Get one part by Rebrickable part_num.")
    @GetMapping("/parts/{partNum}")
    Part getPart(@PathVariable String partNum) {
        return catalog.findPart(partNum)
                .orElseThrow(() -> ApiException.notFound("Part " + partNum + " not found."));
    }

    @Operation(operationId = "listColors", summary = "All Rebrickable colors, sorted by name.")
    @GetMapping("/colors")
    List<Color> listColors() {
        return catalog.listColors();
    }
}

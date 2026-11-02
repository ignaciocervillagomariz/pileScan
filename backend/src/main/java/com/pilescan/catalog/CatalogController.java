package com.pilescan.catalog;

import com.pilescan.common.ApiException;
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

@RestController
@RequestMapping("/api")
class CatalogController {

    private final CatalogRepository catalog;

    CatalogController(CatalogRepository catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/parts")
    List<Part> searchParts(@RequestParam @NotBlank @Size(max = 100) String q,
                           @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
        return catalog.searchParts(q.strip(), limit);
    }

    @GetMapping("/parts/{partNum}")
    Part getPart(@PathVariable String partNum) {
        return catalog.findPart(partNum)
                .orElseThrow(() -> ApiException.notFound("Part " + partNum + " not found."));
    }

    @GetMapping("/colors")
    List<Color> listColors() {
        return catalog.listColors();
    }
}

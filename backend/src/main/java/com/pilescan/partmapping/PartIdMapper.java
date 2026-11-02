package com.pilescan.partmapping;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.partmapping.PartMappingRepository.CachedMapping;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Maps classifier part IDs (usually BrickLink-style) to Rebrickable {@code part_num}.
 *
 * <ol>
 *   <li>The same ID exists in the catalog: it is the same part (true for the vast majority).</li>
 *   <li>A cached answer in {@code part_id_mapping}, including negative ones, which are re-checked
 *       after {@link #NOT_FOUND_TTL} (Rebrickable adds mappings over time) and API errors after
 *       {@link #ERROR_TTL}.</li>
 *   <li>The Rebrickable API, if a key is configured. The answer is cached.</li>
 * </ol>
 * Whatever stays unmapped is tracked for {@code GET /api/admin/unmapped-part-ids}.
 */
@Service
public class PartIdMapper {

    static final Duration NOT_FOUND_TTL = Duration.ofDays(7);
    static final Duration ERROR_TTL = Duration.ofHours(1);
    private static final String NO_KEY = "REBRICKABLE_API_KEY is not configured";
    private static final Logger log = LoggerFactory.getLogger(PartIdMapper.class);

    private final CatalogRepository catalog;
    private final PartMappingRepository repository;
    private final RebrickablePartLookup lookup;
    private final Clock clock;

    PartIdMapper(CatalogRepository catalog, PartMappingRepository repository, RebrickablePartLookup lookup,
                 Clock clock) {
        this.catalog = catalog;
        this.repository = repository;
        this.lookup = lookup;
        this.clock = clock;
    }

    public MappingResult map(String idSystem, String rawId) {
        if (catalog.partExists(rawId)) {
            repository.clearUnmapped(idSystem, rawId);
            return MappingResult.mapped(rawId);
        }
        // Only BrickLink and LDraw IDs can be searched through the API.
        boolean searchable = idSystem.equals("bricklink") || idSystem.equals("ldraw");
        OffsetDateTime now = OffsetDateTime.now(clock);

        CachedMapping cached = searchable ? repository.find(idSystem, rawId).orElse(null) : null;
        if (cached != null && "MAPPED".equals(cached.status()) && catalog.partExists(cached.partNum())) {
            repository.clearUnmapped(idSystem, rawId);
            return MappingResult.mapped(cached.partNum());
        }
        if (cached != null && isFresh(cached, now)) {
            return unmapped(idSystem, rawId, cached.detail(), now);
        }
        if (!searchable) {
            return unmapped(idSystem, rawId, "Part not found in catalog", now);
        }
        if (!lookup.isConfigured()) {
            return unmapped(idSystem, rawId, NO_KEY, now);
        }
        return queryApi(idSystem, rawId, now);
    }

    private MappingResult queryApi(String idSystem, String rawId, OffsetDateTime now) {
        try {
            List<String> found = lookup.findPartNums(idSystem, rawId);
            String partNum = found.stream().filter(catalog::partExists).findFirst().orElse(null);
            if (partNum != null) {
                repository.save(idSystem, rawId, partNum, "MAPPED", null, now);
                repository.clearUnmapped(idSystem, rawId);
                return MappingResult.mapped(partNum);
            }
            String detail = found.isEmpty()
                    ? "Rebrickable has no part for this " + idSystem + " ID"
                    : "Rebrickable maps to " + found.getFirst() + ", which is not in the local catalog";
            repository.save(idSystem, rawId, null, "NOT_FOUND", detail, now);
            return unmapped(idSystem, rawId, detail, now);
        } catch (RebrickablePartLookup.LookupException e) {
            log.warn("Rebrickable lookup failed for {} {}: {}", idSystem, rawId, e.getMessage());
            repository.save(idSystem, rawId, null, "ERROR", e.getMessage(), now);
            return unmapped(idSystem, rawId, e.getMessage(), now);
        }
    }

    private boolean isFresh(CachedMapping cached, OffsetDateTime now) {
        Duration ttl = switch (cached.status()) {
            case "NOT_FOUND" -> NOT_FOUND_TTL;
            case "ERROR" -> ERROR_TTL;
            default -> Duration.ZERO;
        };
        return cached.checkedAt().plus(ttl).isAfter(now);
    }

    private MappingResult unmapped(String idSystem, String rawId, String error, OffsetDateTime now) {
        repository.recordUnmapped(idSystem, rawId, error, now);
        return MappingResult.unmapped();
    }
}

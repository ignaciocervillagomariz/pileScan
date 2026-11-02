package com.pilescan.partmapping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pilescan.catalog.CatalogRepository;
import com.pilescan.partmapping.PartMappingRepository.CachedMapping;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PartIdMapperTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-02T12:00:00Z"), ZoneOffset.UTC);
    private static final OffsetDateTime NOW = OffsetDateTime.now(CLOCK);

    private final CatalogRepository catalog = mock(CatalogRepository.class);
    private final PartMappingRepository repository = mock(PartMappingRepository.class);
    private final RebrickablePartLookup lookup = mock(RebrickablePartLookup.class);
    private PartIdMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new PartIdMapper(catalog, repository, lookup, CLOCK);
        when(repository.find(any(), any())).thenReturn(Optional.empty());
        when(lookup.isConfigured()).thenReturn(true);
    }

    @Test
    void identicalIdInCatalogMapsDirectlyWithoutApiCall() throws Exception {
        when(catalog.partExists("3001")).thenReturn(true);

        MappingResult result = mapper.map("bricklink", "3001");

        assertThat(result).isEqualTo(new MappingResult("3001", MappingResult.Status.MAPPED));
        verify(lookup, never()).findPartNums(any(), any());
    }

    @Test
    void unknownIdIsResolvedThroughApiAndCached() throws Exception {
        when(catalog.partExists("3626b")).thenReturn(false);
        when(catalog.partExists("3626bpb0001")).thenReturn(true);
        when(lookup.findPartNums("bricklink", "3626b")).thenReturn(List.of("3626bpb0001"));

        MappingResult result = mapper.map("bricklink", "3626b");

        assertThat(result.partNum()).isEqualTo("3626bpb0001");
        verify(repository).save("bricklink", "3626b", "3626bpb0001", "MAPPED", null, NOW);
    }

    @Test
    void negativeAnswerIsCachedAndTrackedAsUnmapped() throws Exception {
        when(lookup.findPartNums("bricklink", "zzz")).thenReturn(List.of());

        MappingResult result = mapper.map("bricklink", "zzz");

        assertThat(result.status()).isEqualTo(MappingResult.Status.UNMAPPED);
        verify(repository).save("bricklink", "zzz", null, "NOT_FOUND", "Rebrickable has no part for this bricklink ID", NOW);
        verify(repository).recordUnmapped("bricklink", "zzz", "Rebrickable has no part for this bricklink ID", NOW);
    }

    @Test
    void freshNegativeCacheEntrySkipsApi() throws Exception {
        when(repository.find("bricklink", "zzz")).thenReturn(Optional.of(
                new CachedMapping(null, "NOT_FOUND", "nope", NOW.minusDays(1))));

        assertThat(mapper.map("bricklink", "zzz").status()).isEqualTo(MappingResult.Status.UNMAPPED);

        verify(lookup, never()).findPartNums(any(), any());
        verify(repository).recordUnmapped("bricklink", "zzz", "nope", NOW);
    }

    @Test
    void staleNegativeCacheEntryIsRechecked() throws Exception {
        when(repository.find("bricklink", "3010")).thenReturn(Optional.of(
                new CachedMapping(null, "NOT_FOUND", "nope", NOW.minusDays(8))));
        when(catalog.partExists("3010")).thenReturn(false);
        when(catalog.partExists("3010b")).thenReturn(true);
        when(lookup.findPartNums("bricklink", "3010")).thenReturn(List.of("3010b"));

        assertThat(mapper.map("bricklink", "3010").partNum()).isEqualTo("3010b");
    }

    @Test
    void apiFailureIsUnmappedAndRetriedAfterShortTtl() throws Exception {
        when(lookup.findPartNums("bricklink", "x1")).thenThrow(new RebrickablePartLookup.LookupException("boom"));

        assertThat(mapper.map("bricklink", "x1").status()).isEqualTo(MappingResult.Status.UNMAPPED);
        verify(repository).save("bricklink", "x1", null, "ERROR", "boom", NOW);

        when(repository.find("bricklink", "x1")).thenReturn(Optional.of(
                new CachedMapping(null, "ERROR", "boom", NOW.minusMinutes(61))));
        org.mockito.Mockito.doReturn(List.of()).when(lookup).findPartNums("bricklink", "x1");
        mapper.map("bricklink", "x1");
        verify(lookup, org.mockito.Mockito.times(2)).findPartNums("bricklink", "x1");
    }

    @Test
    void withoutApiKeyUnknownIdsAreUnmappedAndNotCached() throws Exception {
        when(lookup.isConfigured()).thenReturn(false);

        assertThat(mapper.map("bricklink", "3626b").status()).isEqualTo(MappingResult.Status.UNMAPPED);

        verify(lookup, never()).findPartNums(any(), any());
        verify(repository, never()).save(any(), any(), any(), any(), any(), any());
        verify(repository).recordUnmapped("bricklink", "3626b", "REBRICKABLE_API_KEY is not configured", NOW);
    }

    @Test
    void apiResultMissingFromCatalogStaysUnmapped() throws Exception {
        when(lookup.findPartNums("ldraw", "999")).thenReturn(List.of("999x"));

        assertThat(mapper.map("ldraw", "999").status()).isEqualTo(MappingResult.Status.UNMAPPED);
        verify(repository).save("ldraw", "999", null, "NOT_FOUND",
                "Rebrickable maps to 999x, which is not in the local catalog", NOW);
    }
}

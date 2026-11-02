package com.pilescan.scan;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface ScanRepository extends JpaRepository<ScanEntity, UUID> {
}

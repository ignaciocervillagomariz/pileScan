package com.pilescan;

import java.security.Security;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PilescanBackendApplication {

    public static void main(String[] args) {
        // java.security ships networkaddress.cache.negative.ttl=10 and that setting beats the
        // sun.net.inetaddr.negative.ttl system property. While a peer container (inference) is stopped,
        // Docker DNS answers NXDOMAIN; without this the JVM keeps failing for 10 s after it is back.
        // It must be set before the first lookup.
        Security.setProperty("networkaddress.cache.negative.ttl", "0");
        SpringApplication.run(PilescanBackendApplication.class, args);
    }
}

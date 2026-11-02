package com.pilescan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PilescanBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(PilescanBackendApplication.class, args);
    }
}

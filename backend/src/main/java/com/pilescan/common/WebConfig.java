package com.pilescan.common;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * No CORS configuration on purpose: the browser only talks to nginx (same origin), see
 * docs/decisions/0008-same-origin-api-behind-nginx.md.
 */
@Configuration
class WebConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}

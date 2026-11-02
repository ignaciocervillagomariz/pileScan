# syntax=docker/dockerfile:1

FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build
# Dependencies first so source edits do not invalidate the download layer.
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && mv target/backend-*.jar app.jar

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S pilescan && adduser -S pilescan -G pilescan \
    && mkdir -p /data/scans /data/catalog && chown -R pilescan:pilescan /data
USER pilescan
WORKDIR /app
COPY --from=build /build/app.jar app.jar
ENV SCAN_STORAGE_DIR=/data/scans CATALOG_CACHE_DIR=/data/catalog
EXPOSE 8080
# busybox wget (used by the compose health check) is part of the Alpine base image.
# Short DNS cache and idle keep-alive: peers redeployed by compose get a new container address.
# (Negative DNS caching is disabled in PilescanBackendApplication: a system property cannot do it.)
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-Dsun.net.inetaddr.ttl=5", \
    "-Djdk.httpclient.keepalive.timeout=5", \
    "-jar", "app.jar"]

# syntax=docker/dockerfile:1

# Angular 22 needs Node >= 22.22.3 or >= 24.15.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Pre-compress for nginx's gzip_static: level 9 once at build time instead of level 1 per request.
RUN find dist/pilescan/browser -type f \( -name '*.js' -o -name '*.css' -o -name '*.wasm' \
      -o -name '*.html' -o -name '*.json' -o -name '*.svg' -o -name '*.webmanifest' \) \
      -exec gzip -9 -k {} +

FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/pilescan/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1

# Versión web: la app (apps/mobile) exportada como sitio estático y servida por Caddy, que también
# hace de proxy de la API (ver Caddyfile). URL_API es la dirección pública de la API: queda fija en
# el sitio al compilarlo, como EXPO_PUBLIC_API_URL en la app del celular.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci -w mobile --ignore-scripts
COPY packages/shared packages/shared
COPY apps/mobile apps/mobile
ARG URL_API
RUN test -n "$URL_API" || (echo "Falta el argumento URL_API" && exit 1)
ENV APP_VARIANT=production EXPO_PUBLIC_API_URL=$URL_API EXPO_PUBLIC_ENTORNO=produccion
WORKDIR /app/apps/mobile
RUN npx expo export --platform web --output-dir /web

FROM caddy:2
COPY --from=build /web /srv/web

# Imagen del servidor (apps/server). La app móvil no se incluye: solo su package.json, que npm
# necesita para validar el package-lock del monorepo.
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/

FROM base AS build
RUN npm ci -w @scouttracker/server --ignore-scripts
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @scouttracker/server

FROM base AS produccion
ENV NODE_ENV=production
RUN npm ci --omit=dev -w @scouttracker/server --ignore-scripts && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/migrations apps/server/migrations
WORKDIR /app/apps/server
RUN mkdir -p /datos/archivos && chown -R node:node /datos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://localhost:3000/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]

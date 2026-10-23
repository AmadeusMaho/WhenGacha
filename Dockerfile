# --- compilación ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# La app consulta las fuentes de datos a través del proxy con caché del propio servidor.
ENV VITE_USE_PROXY=1
RUN npm run build

# --- servidor: app estática + proxy con caché (sin dependencias) ---
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server/index.mjs"]

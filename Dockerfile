FROM node:24-alpine AS ui-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.js types.ts ./
COPY ui ./ui
RUN npm run build

FROM node:24-alpine AS runtime-build
WORKDIR /app/runtime
COPY runtime/package*.json ./
RUN npm ci
COPY runtime/tsconfig.json ./tsconfig.json
COPY runtime/src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV UI_PORT=3001
ENV BIND_HOST=0.0.0.0
ENV GUILD_DB_PATH=/app/data/guild.sqlite

COPY --from=ui-build /app/dist ./dist
COPY --from=runtime-build /app/runtime/package*.json ./runtime/
COPY --from=runtime-build /app/runtime/node_modules ./runtime/node_modules
COPY --from=runtime-build /app/runtime/dist ./runtime/dist

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3001 3000
CMD ["node", "runtime/dist/index.js"]

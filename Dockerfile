FROM node:24-alpine AS ui-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.node.json vite.config.ts tailwind.config.js postcss.config.js types.ts ./
COPY ui ./ui
RUN npm run build

FROM node:24-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./tsconfig.json
COPY server/src ./src
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
COPY --from=server-build /app/server/package*.json ./server/
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3001 3000
CMD ["node", "server/dist/index.js"]

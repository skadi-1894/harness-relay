FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS build
WORKDIR /app
COPY package*.json ./
RUN HUSKY=0 npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates util-linux tini && apt-get clean
ENV NODE_ENV=production HOST=0.0.0.0 HOME=/state CODEX_HOME=/state/codex CLAUDE_CONFIG_DIR=/state/claude
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild @anthropic-ai/claude-code && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
RUN mkdir -p /state/codex /state/claude && chown -R node:node /state
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]

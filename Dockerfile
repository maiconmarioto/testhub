FROM mcr.microsoft.com/playwright:v1.53.0-noble

WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ai/package.json ./packages/ai/package.json
COPY packages/artifacts/package.json ./packages/artifacts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/runner/package.json ./packages/runner/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/spec/package.json ./packages/spec/package.json
RUN npm ci

COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY apps/cli ./apps/cli
COPY apps/mcp ./apps/mcp
COPY apps/worker ./apps/worker
COPY packages ./packages
COPY examples ./examples
RUN npm run build

CMD ["node", "dist/apps/cli/src/cli.js", "server", "--port", "4321"]

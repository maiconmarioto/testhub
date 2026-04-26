FROM mcr.microsoft.com/playwright:v1.53.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY examples ./examples
RUN npm run build

ENTRYPOINT ["node", "dist/cli.js"]

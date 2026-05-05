# Dockerfile for the silver-tokens MCP server (apps/mcp).
# Bun workspaces hoist deps to the root node_modules, so we don't need per-package copies.

FROM oven/bun:1.2

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/mcp/package.json ./apps/mcp/
COPY packages/db/package.json ./packages/db/
COPY packages/parsers/package.json ./packages/parsers/
COPY packages/proficiency/package.json ./packages/proficiency/
COPY packages/shared/package.json ./packages/shared/

RUN bun install

COPY apps/mcp ./apps/mcp/
COPY packages ./packages/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "--filter", "@silver-tokens/mcp", "start"]

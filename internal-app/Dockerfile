FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:20-alpine
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
EXPOSE 8787
CMD ["node","src/server.js"]

FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8787 \
    GRIDPULSE_BIND_ADDRESS=0.0.0.0

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
EXPOSE 8787

CMD ["node", "src/server.js"]

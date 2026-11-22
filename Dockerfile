FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=3001 DB_PATH=/data/museum-v3.db
EXPOSE 3001
CMD ["node", "server/index.js"]

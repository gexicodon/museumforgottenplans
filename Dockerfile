FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=3001 DB_PATH=/data/museum.db
EXPOSE 3001
CMD ["node", "server/index.js"]

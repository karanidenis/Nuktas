FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production MCP_HTTP_PORT=8200 MCP_HOST=0.0.0.0
EXPOSE 8200
CMD ["node", "src/http.js"]

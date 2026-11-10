FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 4000

# Seed demo data on boot (idempotent — `ON CONFLICT ... DO UPDATE`), so a fresh
# `docker compose up --build` has a working login without manual steps.
# Seeding failure is logged but never blocks the server from starting.
CMD ["sh", "-c", "node db/seed.js; exec node src/index.js"]

# Image chạy trên VPS / Docker Compose / Render… (Node.js 22, không cần JVM).
# Bước 1: cài đủ phụ thuộc và biên dịch TypeScript → dist/
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Bước 2: chỉ phụ thuộc chạy thật (không có TypeScript / vitest)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bước 3: ảnh chạy
FROM node:22-alpine
ENV NODE_ENV=production \
    TZ=Asia/Ho_Chi_Minh \
    PORT=10000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY package.json ./
USER node
EXPOSE 10000
# Schema do migrations/*.sql dựng lúc khởi động (db/migrate.ts); DB trống cũng chạy được.
CMD ["node", "dist/server.js"]

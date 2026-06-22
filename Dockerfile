# ===== Stage 1: production deps =====
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ===== Stage 2: runtime =====
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# curl ใช้สำหรับ healthcheck ของ Coolify + Docker
RUN apk add --no-cache curl

# Copy production deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY package.json ./
COPY server.js ./
COPY scripts ./scripts
COPY db ./db
COPY public ./public

# Run as non-root user (security)
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
USER app

EXPOSE 3000

# ไม่ใส่ HEALTHCHECK ใน Dockerfile — ให้ Coolify จัดการ healthcheck ผ่าน UI
# (ถ้าใส่ที่นี่ Docker จะรายงาน status = "starting" 30 วินาทีแรก
#  ทำให้ Coolify ตัดสินว่า "not healthy" แล้ว rollback ทันที)

CMD ["node", "server.js"]

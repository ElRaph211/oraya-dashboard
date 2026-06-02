# ---- Stage 1: deps -----------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# ---- Stage 2: builder --------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite a besoin des VITE_* au build → Railway les expose comme variables d'env
ENV NODE_ENV=production
RUN npm run build

# ---- Stage 3: runner ---------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# On copie uniquement ce qui est nécessaire à l'exécution
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/start-server.mjs ./start-server.mjs
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
# node_modules — uniquement les deps de prod (recopiées depuis builder)
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs

ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "start-server.mjs"]

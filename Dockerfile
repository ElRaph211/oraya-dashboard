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

# Vite inline les VITE_* à la compilation : il faut les recevoir via --build-arg
# Sur Railway → "Build Args" du service. Les valeurs viennent des variables
# d'environnement définies dans Railway (mêmes noms).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

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

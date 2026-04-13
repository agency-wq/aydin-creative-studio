FROM node:20-slim

# Dipendenze sistema per Chrome Headless Shell (Remotion) + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libpango-1.0-0 libasound2 libxshmfence1 libx11-xcb1 \
  libxcb-dri3-0 libxext6 libxfixes3 libxss1 libxtst6 \
  fonts-liberation ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN pnpm install --frozen-lockfile

RUN npx prisma generate

COPY src ./src
COPY tsconfig.json ./
COPY next.config.ts ./
COPY public ./public
COPY postcss.config.mjs ./

# Build Next.js (webapp usa next start, worker usa tsx — la build non nuoce)
RUN npm run build

# Default: webapp (next start). Worker override via startCommand in Railway.
CMD ["npm", "start"]

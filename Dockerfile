# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates git python3 make g++ xvfb xauth \
        libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 libxtst6 \
        libxkbcommon0 libdrm2 libxrandr2 libxcomposite1 libxdamage1 \
        libxfixes3 libxcursor1 libpango-1.0-0 libcairo2 \
        libatspi2.0-0 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/node_modules /home/node/.npm /home/node/.cache/electron \
    && chown -R node:node /app /home/node/.npm /home/node/.cache

WORKDIR /app
USER node

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS builder
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends fakeroot rpm xz-utils \
    && rm -rf /var/lib/apt/lists/*
USER node

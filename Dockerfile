FROM node:18 AS build

WORKDIR /opt/node_app

# Copy package files first for better caching
COPY package.json yarn.lock ./

# Create directory structure and copy package.json files
RUN mkdir -p packages/common packages/element packages/excalidraw packages/math packages/utils excalidraw-app
COPY packages/common/package.json ./packages/common/
COPY packages/element/package.json ./packages/element/
COPY packages/excalidraw/package.json ./packages/excalidraw/
COPY packages/math/package.json ./packages/math/
COPY packages/utils/package.json ./packages/utils/
COPY excalidraw-app/package.json ./excalidraw-app/

# Install dependencies with cache
RUN --mount=type=cache,target=/root/.cache/yarn \
    yarn install --frozen-lockfile --network-timeout 600000 || \
    yarn install --network-timeout 600000

# Copy source files
COPY . .

ARG NODE_ENV=production
ARG VITE_APP_REMOTE_STORAGE=postgres
ARG VITE_APP_POSTGRES_API_BASE_URL=http://localhost:4001

# Build the application with environment variables
ENV VITE_APP_REMOTE_STORAGE=${VITE_APP_REMOTE_STORAGE}
ENV VITE_APP_POSTGRES_API_BASE_URL=${VITE_APP_POSTGRES_API_BASE_URL}

RUN yarn build:app:docker 2>&1 | tee build.log || \
    (cat build.log && exit 1)

# Verify build output exists
RUN ls -la /opt/node_app/excalidraw-app/build || \
    (echo "Build directory not found!" && exit 1)

FROM nginx:1.27-alpine

COPY --from=build /opt/node_app/excalidraw-app/build /usr/share/nginx/html

HEALTHCHECK CMD wget -q -O /dev/null http://localhost || exit 1

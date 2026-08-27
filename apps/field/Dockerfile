FROM node:22.22.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/field/package.json apps/field/
RUN npm ci --workspace @plant-route/field --include-workspace-root
COPY apps/field apps/field
RUN npm run build --workspace @plant-route/field

FROM nginx:1.29-alpine
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/field/dist /usr/share/nginx/html
HEALTHCHECK --interval=3s --timeout=2s --retries=20 CMD wget -qO- http://127.0.0.1/healthz || exit 1

FROM node:22.22.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace @plant-route/admin --include-workspace-root
COPY apps/admin apps/admin
RUN npm run build --workspace @plant-route/admin

FROM nginx:1.29-alpine
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/admin/dist /usr/share/nginx/html/admin
HEALTHCHECK --interval=3s --timeout=2s --retries=20 CMD wget -qO- http://127.0.0.1/healthz || exit 1

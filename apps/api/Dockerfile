FROM node:22.22.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @plant-route/domain --workspace @plant-route/api --include-workspace-root
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN npm run build --workspace @plant-route/domain && npm run build --workspace @plant-route/api

FROM node:22.22.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/apps/api/package.json apps/api/
COPY --from=build /workspace/packages/domain/package.json packages/domain/
RUN npm ci --omit=dev --workspace @plant-route/domain --workspace @plant-route/api --include-workspace-root
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/packages/domain/dist packages/domain/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

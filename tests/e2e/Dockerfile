FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /workspace
COPY package.json package-lock.json playwright.config.ts tsconfig.base.json ./
COPY tests/e2e tests/e2e
COPY scripts/summarize-convergence.mjs scripts/summarize-convergence.mjs
RUN npm ci --include-workspace-root
ENV E2E_BASE_URL=http://localhost:8080
CMD ["npm", "run", "e2e"]

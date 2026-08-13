FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

USER node
CMD ["node", "src/server.mjs"]

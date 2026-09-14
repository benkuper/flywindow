FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docs ./docs
COPY --chown=node:node README.md LICENSE ./
RUN mkdir -p /app/data/cache && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]

FROM node:20-alpine

WORKDIR /app

# Copy dependency definition
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server code
COPY server.js ./

# Set environment
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

EXPOSE 8787

# Run as non-root user
USER node

CMD ["node", "server.js"]

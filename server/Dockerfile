FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /data

ENV DATA_DIR=/data
ENV PORT=4242

EXPOSE 4242

CMD ["node", "index.js"]

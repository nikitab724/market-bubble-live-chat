FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache g++ make python3

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4178

EXPOSE 4178

CMD ["node", "server.mjs"]

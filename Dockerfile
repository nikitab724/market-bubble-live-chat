FROM node:24-alpine

WORKDIR /app

COPY . .

ENV NODE_ENV=production
ENV PORT=4178

EXPOSE 4178

CMD ["node", "server.mjs"]

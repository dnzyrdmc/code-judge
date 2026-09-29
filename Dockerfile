FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["npm","start"]

# Multi-stage: build the Vite SPA, serve via nginx with /api proxy (plan §3c).
FROM node:20-alpine AS build
WORKDIR /app

# Must match one of the backend's GOOGLE_CLIENT_IDS or Google auth 401s.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY package.json package-lock.json* bun.lock* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Stage 1: Build React production bundle
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci || npm install

COPY . .

# Build with empty VITE_API_URL so all requests default to relative /api
ENV VITE_API_URL=""
RUN npm run build

# Stage 2: Serve with Nginx reverse proxy
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

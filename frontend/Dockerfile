# Build Stage
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 👇 Fix this - make sure ARG is defined before ENV
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Print the API URL during build for debugging
RUN echo "Building with VITE_API_URL: $VITE_API_URL"

RUN npm run build

# Production Stage
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

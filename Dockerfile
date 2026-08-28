FROM node:20-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y openjdk-17-jdk gradle unzip && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node","server.js"]

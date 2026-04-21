FROM node:20-alpine

WORKDIR /app

# 安裝依賴（使用 package-lock.json 避免網路 fetch）
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# 複製應用程式
COPY server.js ./

# 啟動
EXPOSE 3000
CMD ["node", "server.js"]

# Sử dụng Node.js LTS version (Next.js yêu cầu >=20.9)
FROM node:20-alpine

# Cài đặt g++ compiler và build tools cho C/C++ execution
RUN apk add --no-cache g++ make

# Tạo thư mục làm việc
WORKDIR /app

# Copy package.json và package-lock.json
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Copy toàn bộ source code
COPY . .

# Expose port
EXPOSE 8888

# Command để chạy ứng dụng
CMD ["npm", "start"] 
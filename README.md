# XÂY DỰNG HỆ THỐNG BACKEND CHO NỀN TẢNG HỌC TẬP TRỰC TUYẾN TÍCH HỢP YẾU TỐ TRÒ CHƠI

**Đồ án Thực tập Chuyên ngành / Đồ án Tốt nghiệp**

* **Sinh viên thực hiện:** Nguyễn Văn Tổng
* **Giảng viên hướng dẫn:** ThS. Nguyễn Ngọc Đan Thanh
* **Học kỳ:** I, Năm học 2025-2026

## 1. Giới thiệu dự án

Dự án này xây dựng hệ thống Backend phục vụ cho nền tảng học tập trực tuyến (LMS), tập trung vào giải quyết vấn đề quản lý chuẩn đầu ra (OBE) và tăng cường hứng thú học tập thông qua Gamification (Trò chơi hóa).

Hệ thống được thiết kế theo kiến trúc Monolithic Modular, đóng gói toàn bộ các dịch vụ (Service) trong môi trường Docker để đảm bảo tính nhất quán khi triển khai và vận hành.

## 2. Tính năng chính

### Quản lý Học thuật và Chuẩn đầu ra (OBE)

* Quản lý cấu trúc cây phân cấp: Chương trình đào tạo, Môn học, và các chuẩn đầu ra (PO/PLO).
* Quản lý nội dung khóa học, bài giảng và tài liệu học tập.

### Thi Trực tuyến Thời gian thực (Real-time Quiz)

* Tổ chức các kỳ thi trực tuyến với khả năng đồng bộ trạng thái thời gian thực cho nhiều sinh viên cùng lúc.
* Sử dụng công nghệ Socket.IO để tối ưu hóa độ trễ truyền tải dữ liệu.

### Gamification (Trò chơi hóa)

* **Leaderboard:** Bảng xếp hạng thi đua cập nhật thời gian thực.
* **Hệ thống vật phẩm:** Quản lý kho đồ, tiền tệ trong game và các kỹ năng bổ trợ.

### Bảo mật và Hiệu năng

* Xác thực người dùng an toàn bằng JWT (Access Token và Refresh Token).
* Sử dụng Nginx làm Reverse Proxy và Load Balancer.
* Tối ưu hóa tốc độ truy xuất dữ liệu nóng bằng Redis Cache.

## 3. Kiến trúc và Công nghệ

Hệ thống sử dụng các công nghệ sau (được định nghĩa trong `docker-compose.yml`):

| Thành phần | Công nghệ | Mô tả |
| --- | --- | --- |
| **Backend API** | Node.js, Express | Xử lý logic nghiệp vụ chính, cung cấp RESTful API. |
| **Game Server** | Colyseus | Server chuyên biệt xử lý trạng thái game thời gian thực (Multiplayer). |
| **Frontend** | Next.js, TypeScript | Giao diện người dùng, Server-side Rendering. |
| **Database** | PostgreSQL 15 | Cơ sở dữ liệu quan hệ, lưu trữ dữ liệu bền vững. |
| **Cache / PubSub** | Redis 7 | Bộ nhớ đệm, quản lý phiên Socket và Bảng xếp hạng. |
| **Gateway** | NGINX | Cổng vào (Gateway), điều hướng request. |
| **Infrastructure** | Docker Compose | Công cụ định nghĩa và vận hành đa container. |

## 4. Hướng dẫn Cài đặt và Triển khai

Để chạy dự án, máy tính cần cài đặt sẵn **Docker** và **Git**.

### Bước 1: Clone mã nguồn

Tải mã nguồn về máy tính:

```bash
git clone https://github.com/TongNguyenvk/cn-da22ttc-nguyenvantong-backendhttt-nodejs
cd cn-da22ttc-nguyenvantong-backendhttt-nodejs
```

### Bước 2: Cấu hình biến môi trường

Sao chép file `.env.example` thành `.env` và cấu hình các thông số:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env` với các giá trị phù hợp (tham khảo `.env.example`).

### Bước 3: Khởi chạy hệ thống

Sử dụng Docker Compose để build và chạy toàn bộ hệ thống:

```bash
docker-compose up -d --build
```

### Bước 4: Truy cập dịch vụ

Sau khi khởi động thành công, các dịch vụ sẽ hoạt động tại các địa chỉ sau:

* **Backend API:** `http://localhost:8888`
* **PostgreSQL:** Port `5433`
* **Redis:** Port `6379`


## 5. Cấu trúc thư mục

```
├── src/                    # Mã nguồn Backend chính
│   ├── config/             # Cấu hình ứng dụng
│   ├── controllers/        # Xử lý request/response
│   ├── middleware/         # Middleware (auth, validation...)
│   ├── models/             # Sequelize models (ORM)
│   ├── routes/             # Định nghĩa API routes
│   ├── services/           # Business logic
│   ├── redis/              # Cấu hình và tiện ích Redis
│   ├── utils/              # Hàm tiện ích dùng chung
│   ├── app.js              # Khởi tạo Express app
│   ├── server.js           # Entry point server
│   └── socket.js           # Cấu hình Socket.IO
├── config/                 # Cấu hình Sequelize CLI
├── docker/                 # Docker configs & Dockerfile
│   ├── docker-compose.yml  # File triển khai chính
│   └── Dockerfile          # Build image Node.js
├── migrations/             # Database migrations
├── sql/                    # SQL scripts thủ công
├── uploads/                # Thư mục lưu file upload
├── docs/                   # Tài liệu API và hướng dẫn
└── thesis/                 # Tài liệu đồ án
```

## 6. Thông tin liên hệ

Mọi thắc mắc về đồ án hoặc hỗ trợ kỹ thuật, vui lòng liên hệ nhóm tác giả:

* **Họ và tên:** Nguyễn Văn Tổng
* **Email:** tongct08@gmail.com
* **Số điện thoại:** 0383778804
* **GitHub:** https://github.com/TongNguyenvk

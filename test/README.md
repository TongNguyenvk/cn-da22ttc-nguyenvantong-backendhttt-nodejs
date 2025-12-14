# 🧪 Test Suite - Import Questions with Media

## 📋 Mô tả

Test suite này kiểm tra toàn bộ workflow của hệ thống import questions with media, bao gồm:
- Upload media files
- Import questions từ Excel
- Link media với questions và answers
- Verify data integrity

## 🚀 Cách chạy tests

### Option 1: JavaScript Test (Recommended)

```bash
# Install dependencies (nếu chưa có)
npm install axios form-data exceljs

# Set environment variables
export TEST_TOKEN="your_jwt_token_here"
export SUBJECT_ID="1"
export BASE_URL="http://localhost:8888"

# Run test
npm test
# hoặc
node test/import-with-media.test.js
```

### Option 2: Bash Test

```bash
# Make script executable
chmod +x test/import-with-media.test.sh

# Run test
npm run test:bash
# hoặc
./test/import-with-media.test.sh YOUR_TOKEN SUBJECT_ID
```

## 📦 Requirements

### JavaScript Test
- Node.js >= 14
- npm packages:
  - `axios` - HTTP client
  - `form-data` - Form data handling
  - `exceljs` - Excel file creation

### Bash Test
- bash shell
- curl
- Python 3 with openpyxl (for Excel creation)

```bash
# Install Python dependencies
pip3 install openpyxl
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_TOKEN` | JWT authentication token | Required |
| `SUBJECT_ID` | Subject ID for import | `1` |
| `BASE_URL` | API base URL | `http://localhost:8888` |

### Getting a Test Token

```bash
# Login to get token
curl -X POST http://localhost:8888/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }'

# Copy the token from response
export TEST_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 📊 Test Cases

### Test 1: Server Health Check
- Kiểm tra server đang chạy
- Verify API endpoint accessible

### Test 2: Create Test Media Files
- Tạo 3 dummy media files:
  - `test_image.jpg`
  - `test_video.mp4`
  - `test_audio.mp3`

### Test 3: Upload Media Files
- Upload 3 media files qua batch upload API
- Verify upload success
- Check response contains uploaded file info

### Test 4: Create Test Excel File
- Tạo Excel file với 2 sheets:
  - Sheet 1: Questions (3 câu hỏi)
  - Sheet 2: LOs (1 learning outcome)
- Include media file references

### Test 5: Import Questions with Media
- Import Excel file với subject_id
- Verify import success
- Check questions và media được link đúng

### Test 6: Verify Questions
- Retrieve questions từ database
- Verify số lượng questions
- Check data integrity

### Test 7: Test Temp Media Serving
- Test endpoint serve temp media files
- Verify file accessibility

### Cleanup
- Xóa test files
- Clean up temp directories

## 📈 Expected Output

### Success Output

```
==================================================
  Import Questions with Media - Test
==================================================

Base URL: http://localhost:8888
Subject ID: 1

==================================================
  Test 1: Server Health Check
==================================================

✓ PASS: Server is running

==================================================
  Test 2: Create Test Media Files
==================================================

✓ PASS: Created 3 test media files

==================================================
  Test 3: Upload Media Files
==================================================

✓ PASS: Media files uploaded successfully
  → Uploaded 3 files

==================================================
  Test 4: Create Test Excel File
==================================================

✓ PASS: Test Excel file created

==================================================
  Test 5: Import Questions with Media
==================================================

✓ PASS: Questions imported successfully
  → Imported 3 questions
  → Linked 3 media files

==================================================
  Test 6: Verify Questions
==================================================

✓ PASS: Questions retrieved successfully
  → Total questions in database: 15

==================================================
  Test 7: Test Temp Media Serving
==================================================

✓ PASS: Media serving endpoint is working (HTTP 200)

==================================================
  Cleanup
==================================================

✓ PASS: Test files cleaned up

==================================================
  Test Summary
==================================================

✓ All tests passed!

Next steps:
1. Check the database for imported questions
2. Verify media files in uploads/media/
3. Test the questions in the application

To run cleanup script:
  node src/scripts/cleanupTempMedia.js
```

## 🐛 Troubleshooting

### Error: "Server is not responding"
**Solution**: 
- Kiểm tra server đang chạy: `npm run dev`
- Verify BASE_URL đúng

### Error: "Authentication failed"
**Solution**:
- Kiểm tra TEST_TOKEN còn valid
- Login lại để lấy token mới
- Verify user có role `teacher` hoặc `admin`

### Error: "subject_id không tồn tại"
**Solution**:
- Kiểm tra SUBJECT_ID trong database
- Tạo subject mới nếu cần:
```sql
INSERT INTO subjects (name) VALUES ('Test Subject');
```

### Error: "Failed to create Excel file"
**Solution**:
- JavaScript: Install `exceljs`: `npm install exceljs`
- Bash: Install `openpyxl`: `pip3 install openpyxl`

### Error: "Media files not found"
**Solution**:
- Kiểm tra thư mục `uploads/temp/` tồn tại
- Verify permissions: `chmod 755 uploads/temp/`

## 📝 Manual Testing

Nếu muốn test thủ công từng bước:

### Step 1: Upload Media
```bash
curl -X POST http://localhost:8888/api/questions/batch-upload-media \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "media_files=@image1.jpg" \
  -F "media_files=@video1.mp4"
```

### Step 2: Import Questions
```bash
curl -X POST http://localhost:8888/api/questions/import-excel-with-media \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@questions.xlsx" \
  -F "subject_id=1"
```

### Step 3: Verify
```bash
curl -X GET http://localhost:8888/api/questions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔄 Continuous Integration

### GitHub Actions Example

```yaml
name: Test Import System

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start server
        run: npm run dev &
        
      - name: Wait for server
        run: sleep 5
      
      - name: Run tests
        env:
          TEST_TOKEN: ${{ secrets.TEST_TOKEN }}
          SUBJECT_ID: 1
        run: npm test
```

## 📚 Related Documentation

- [Import Guide](../docs/IMPORT_QUESTIONS_WITH_MEDIA_GUIDE.md)
- [API Documentation](../docs/API_IMPORT_QUESTIONS_WITH_MEDIA.md)
- [System Overview](../docs/README_IMPORT_SYSTEM.md)

## 🤝 Contributing

Khi thêm test cases mới:
1. Follow existing test structure
2. Add descriptive test names
3. Include error handling
4. Update this README
5. Ensure cleanup runs properly

## 📞 Support

Nếu gặp vấn đề với tests:
1. Check server logs: `tail -f logs/app.log`
2. Verify database connection
3. Check file permissions
4. Review error messages carefully

---

**Happy Testing! 🚀**

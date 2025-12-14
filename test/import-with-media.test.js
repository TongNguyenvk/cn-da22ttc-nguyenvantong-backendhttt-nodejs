/**
 * Test script for Import Questions with Media
 * Usage: node test/import-with-media.test.js
 * 
 * Requirements:
 * - npm install axios form-data exceljs
 * - Set TOKEN and SUBJECT_ID in .env or below
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:8888';
const TOKEN = process.env.TEST_TOKEN || 'YOUR_TOKEN_HERE';
const SUBJECT_ID = process.env.SUBJECT_ID || '1';

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

// Helper functions
function printSection(title) {
    console.log('\n' + '='.repeat(50));
    console.log(`  ${title}`);
    console.log('='.repeat(50) + '\n');
}

function printResult(success, message) {
    const symbol = success ? '✓' : '✗';
    const color = success ? colors.green : colors.red;
    console.log(`${color}${symbol} ${success ? 'PASS' : 'FAIL'}${colors.reset}: ${message}`);
}

function printInfo(message) {
    console.log(`  → ${message}`);
}

// Test functions
async function testServerHealth() {
    printSection('Test 1: Server Health Check');
    try {
        const response = await axios.get(`${BASE_URL}/api/questions`, {
            validateStatus: () => true
        });
        
        if (response.status === 200 || response.status === 401) {
            printResult(true, 'Server is running');
            return true;
        } else {
            printResult(false, `Server returned HTTP ${response.status}`);
            return false;
        }
    } catch (error) {
        printResult(false, `Server is not responding: ${error.message}`);
        return false;
    }
}

async function createTestMediaFiles() {
    printSection('Test 2: Create Test Media Files');
    
    const testDir = path.join(__dirname, 'test_media');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create dummy files
    fs.writeFileSync(path.join(testDir, 'test_image.jpg'), 'Test image content');
    fs.writeFileSync(path.join(testDir, 'test_video.mp4'), 'Test video content');
    fs.writeFileSync(path.join(testDir, 'test_audio.mp3'), 'Test audio content');
    
    printResult(true, 'Created 3 test media files');
    return testDir;
}

async function uploadMediaFiles(testDir) {
    printSection('Test 3: Upload Media Files');
    
    try {
        const formData = new FormData();
        formData.append('media_files', fs.createReadStream(path.join(testDir, 'test_image.jpg')));
        formData.append('media_files', fs.createReadStream(path.join(testDir, 'test_video.mp4')));
        formData.append('media_files', fs.createReadStream(path.join(testDir, 'test_audio.mp3')));
        
        const response = await axios.post(
            `${BASE_URL}/api/questions/batch-upload-media`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${TOKEN}`
                }
            }
        );
        
        if (response.data.success) {
            printResult(true, 'Media files uploaded successfully');
            printInfo(`Uploaded ${response.data.data.uploadedFiles.length} files`);
            return true;
        } else {
            printResult(false, 'Upload failed');
            printInfo(JSON.stringify(response.data, null, 2));
            return false;
        }
    } catch (error) {
        printResult(false, `Upload error: ${error.message}`);
        if (error.response) {
            printInfo(JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

async function createTestExcelFile() {
    printSection('Test 4: Create Test Excel File');
    
    try {
        const workbook = new ExcelJS.Workbook();
        
        // Sheet 1: Questions
        const ws1 = workbook.addWorksheet('Questions');
        
        // Add KQHT1 header
        ws1.addRow(['KQHT1']);
        ws1.addRow(['STT', 'Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng', 'Độ khó', 'Media File', 'Media A', 'Media B', 'Media C', 'Media D']);
        
        // Add test questions
        ws1.addRow([1, 'Test question with image?', 'Answer A', 'Answer B', 'Answer C', 'Answer D', 'A', 1, 'test_image.jpg', '', '', '', '']);
        ws1.addRow([2, 'Test question with video?', 'Answer A', 'Answer B', 'Answer C', 'Answer D', 'B', 2, 'test_video.mp4', '', '', '', '']);
        ws1.addRow([3, 'Test question with audio?', 'Answer A', 'Answer B', 'Answer C', 'Answer D', 'C', 1, 'test_audio.mp3', '', '', '', '']);
        
        // Sheet 2: LOs
        const ws2 = workbook.addWorksheet('LOs');
        ws2.addRow(['STT', 'KQHT', 'Tên KQHT']);
        ws2.addRow([1, 1, 'Test Learning Outcome 1']);
        
        // Save
        const filePath = path.join(__dirname, 'test_questions.xlsx');
        await workbook.xlsx.writeFile(filePath);
        
        printResult(true, 'Test Excel file created');
        return filePath;
    } catch (error) {
        printResult(false, `Failed to create Excel file: ${error.message}`);
        return null;
    }
}

async function importQuestionsWithMedia(excelPath) {
    printSection('Test 5: Import Questions with Media');
    
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(excelPath));
        formData.append('subject_id', SUBJECT_ID);
        
        const response = await axios.post(
            `${BASE_URL}/api/questions/import-excel-with-media`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${TOKEN}`
                },
                validateStatus: () => true
            }
        );
        
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        if (response.data.success) {
            printResult(true, 'Questions imported successfully');
            printInfo(`Imported ${response.data.data.totalImported} questions`);
            printInfo(`Linked ${response.data.data.totalMediaLinked} media files`);
            return true;
        } else {
            printResult(false, 'Import failed');
            printInfo(JSON.stringify(response.data, null, 2));
            return false;
        }
    } catch (error) {
        printResult(false, `Import error: ${error.message}`);
        if (error.response) {
            printInfo(JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

async function verifyQuestions() {
    printSection('Test 6: Verify Questions');
    
    try {
        const response = await axios.get(
            `${BASE_URL}/api/questions?limit=100`,
            {
                headers: {
                    'Authorization': `Bearer ${TOKEN}`
                }
            }
        );
        
        if (response.data.success) {
            printResult(true, 'Questions retrieved successfully');
            printInfo(`Total questions in database: ${response.data.data.totalItems}`);
            return true;
        } else {
            printResult(false, 'Failed to retrieve questions');
            return false;
        }
    } catch (error) {
        printResult(false, `Verification error: ${error.message}`);
        return false;
    }
}

async function testTempMediaServing() {
    printSection('Test 7: Test Temp Media Serving');
    
    try {
        const response = await axios.get(
            `${BASE_URL}/api/questions/temp-media/test_image.jpg`,
            {
                validateStatus: () => true
            }
        );
        
        if (response.status === 200 || response.status === 404) {
            printResult(true, `Media serving endpoint is working (HTTP ${response.status})`);
            return true;
        } else {
            printResult(false, `Media serving endpoint failed (HTTP ${response.status})`);
            return false;
        }
    } catch (error) {
        printResult(false, `Media serving error: ${error.message}`);
        return false;
    }
}

function cleanup() {
    printSection('Cleanup');
    
    console.log('Cleaning up test files...');
    
    // Remove test media directory
    const testDir = path.join(__dirname, 'test_media');
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    // Remove test Excel file
    const excelPath = path.join(__dirname, 'test_questions.xlsx');
    if (fs.existsSync(excelPath)) {
        fs.unlinkSync(excelPath);
    }
    
    printResult(true, 'Test files cleaned up');
}

// Main test runner
async function runTests() {
    console.log('='.repeat(50));
    console.log('  Import Questions with Media - Test');
    console.log('='.repeat(50));
    console.log(`\nBase URL: ${BASE_URL}`);
    console.log(`Subject ID: ${SUBJECT_ID}\n`);
    
    let allPassed = true;
    
    try {
        // Run tests
        allPassed = await testServerHealth() && allPassed;
        
        if (!allPassed) {
            console.log('\n❌ Server health check failed. Stopping tests.');
            return;
        }
        
        const testDir = await createTestMediaFiles();
        allPassed = await uploadMediaFiles(testDir) && allPassed;
        
        const excelPath = await createTestExcelFile();
        if (excelPath) {
            allPassed = await importQuestionsWithMedia(excelPath) && allPassed;
        } else {
            allPassed = false;
        }
        
        allPassed = await verifyQuestions() && allPassed;
        allPassed = await testTempMediaServing() && allPassed;
        
    } catch (error) {
        console.error('\n❌ Test suite error:', error.message);
        allPassed = false;
    } finally {
        cleanup();
    }
    
    // Summary
    printSection('Test Summary');
    if (allPassed) {
        console.log(`${colors.green}✓ All tests passed!${colors.reset}\n`);
    } else {
        console.log(`${colors.red}✗ Some tests failed${colors.reset}\n`);
    }
    
    console.log('Next steps:');
    console.log('1. Check the database for imported questions');
    console.log('2. Verify media files in uploads/media/');
    console.log('3. Test the questions in the application\n');
    console.log('To run cleanup script:');
    console.log('  node src/scripts/cleanupTempMedia.js\n');
}

// Run tests
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };

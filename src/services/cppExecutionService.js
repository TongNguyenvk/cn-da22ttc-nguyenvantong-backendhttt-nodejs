'use strict';

// Minimal C++ code execution service for trial runs.
// NOTE: This is an initial implementation; not a hardened sandbox.
// Future improvements: run inside Docker, resource limits (ulimit), seccomp, per-test isolation.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

class CppExecutionService {
    constructor(options = {}) {
        this.compileTimeoutMs = options.compileTimeoutMs || 5000;
        this.runTimeoutMs = options.runTimeoutMs || 3000; // total run time
        this.maxOutputSize = options.maxOutputSize || 50 * 1024; // 50KB
    }

    /**
     * Execute C/C++ code against test cases.
     * language: 'c' or 'cpp' (default: 'cpp')
     * testCases: [{ input: 'add(2,3)', output: '5', description }] or [{ input: '2 3', output: '5' }]
     * mode: 'function' (default) or 'stdio'
     * Returns { success, compile_error?, results: [{ test_case_id,input,expected,actual,actual_serialized,passed,error,description }], raw_stdout }
     */
    async executeCpp(userCode, testCases = [], mode = null, language = 'cpp') {
        // Auto-detect mode if not specified
        if (!mode) {
            mode = this._detectMode(userCode, testCases);
        }

        if (mode === 'stdio') {
            return await this._executeStdioMode(userCode, testCases, language);
        } else {
            return await this._executeFunctionMode(userCode, testCases, language);
        }
    }

    /**
     * Detect execution mode based on code and test cases
     */
    _detectMode(userCode, testCases) {
        // If user code has main(), use stdio mode
        if (/int\s+main\s*\(/.test(userCode)) {
            return 'stdio';
        }

        // If test case input looks like function call (contains parentheses)
        if (testCases.length > 0 && testCases[0].input) {
            const input = testCases[0].input.trim();
            if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(input)) {
                return 'function';
            }
        }

        // Default: function mode for backward compatibility
        return 'function';
    }

    /**
     * Execute in STDIN/STDOUT mode (competitive programming style)
     */
    async _executeStdioMode(userCode, testCases, language = 'cpp') {
        const tmpDir = this._createTempDir();
        const fileExt = language === 'c' ? '.c' : '.cpp';
        const sourceFile = path.join(tmpDir, 'main' + fileExt);
        const binaryFile = path.join(tmpDir, 'run_bin');

        try {
            // Sanitize and write user code
            const sanitized = this._sanitize(userCode || '');
            fs.writeFileSync(sourceFile, sanitized, 'utf8');

            // Compile
            const compileResult = await this._compile(sourceFile, binaryFile, tmpDir, language);
            if (!compileResult.success) {
                return {
                    success: false,
                    compile_error: compileResult.error,
                    results: testCases.map((tc, idx) => ({
                        test_case_id: idx + 1,
                        input: tc.input,
                        expected: tc.output ?? tc.expected ?? null,
                        actual: null,
                        actual_serialized: null,
                        passed: false,
                        error: compileResult.error,
                        description: tc.description || null
                    }))
                };
            }

            // Run each test case with stdin
            const results = [];
            for (let i = 0; i < testCases.length; i++) {
                const tc = testCases[i];
                const input = tc.input || '';
                const expected = (tc.output || tc.expected || '').toString().trim();

                // Debug log for stdin/stdout
                console.log(`[STDIO Debug] Test case ${i + 1}:`);
                console.log(`[STDIO Debug] Input (raw): "${input}"`);
                console.log(`[STDIO Debug] Input (escaped): ${JSON.stringify(input)}`);
                console.log(`[STDIO Debug] Expected: "${expected}"`);

                const runResult = await this._runWithStdin(binaryFile, input, tmpDir);
                
                console.log(`[STDIO Debug] Stdout: "${runResult.stdout}"`);
                console.log(`[STDIO Debug] Stderr: "${runResult.stderr || ''}"`);
                console.log(`[STDIO Debug] Error: ${runResult.error || 'none'}`);
                
                const actual = runResult.stdout.trim();
                const passed = !runResult.error && actual === expected;
                
                console.log(`[STDIO Debug] Actual (trimmed): "${actual}"`);
                console.log(`[STDIO Debug] Passed: ${passed}`);

                results.push({
                    test_case_id: i + 1,
                    input: input,
                    expected: expected,
                    actual: runResult.error ? null : actual,
                    actual_serialized: runResult.error ? null : actual,
                    passed: passed,
                    error: runResult.error,
                    description: tc.description || null
                });
            }

            return {
                success: true,
                mode: 'stdio',
                results: results
            };

        } catch (err) {
            return {
                success: false,
                system_error: err.message,
                results: testCases.map((tc, idx) => ({
                    test_case_id: idx + 1,
                    input: tc.input,
                    expected: tc.output ?? tc.expected ?? null,
                    actual: null,
                    actual_serialized: null,
                    passed: false,
                    error: 'System error: ' + err.message,
                    description: tc.description || null
                }))
            };
        } finally {
            this._safeCleanup(tmpDir);
        }
    }

    /**
     * Execute in Function mode (original implementation)
     */
    async _executeFunctionMode(userCode, testCases, language = 'cpp') {
        // 1. Create temp workspace
        const tmpDir = this._createTempDir();
        const fileExt = language === 'c' ? '.c' : '.cpp';
        const mainFile = path.join(tmpDir, 'main' + fileExt);
        const binaryFile = path.join(tmpDir, 'run_bin');

        try {
            // 2. Sanitize & write user code
            const sanitized = this._sanitize(userCode || '');
            
            // Check if user code has main function
            const hasMain = /int\s+main\s*\(/.test(sanitized);
            
            if (hasMain && testCases.length > 0) {
                // User code has main() - run it directly and ignore test cases
                console.log(`[${language.toUpperCase()} Execution] Code has main() function - running directly without test harness`);
                
                // Use executeCppSimple to run the code with main()
                const simpleResult = await this.executeCppSimple(userCode, language);
                
                if (!simpleResult.success) {
                    return {
                        success: false,
                        compile_error: simpleResult.compile_error,
                        runtime_error: simpleResult.runtime_error,
                        system_error: simpleResult.system_error,
                        results: testCases.map((tc, idx) => ({
                            test_case_id: idx + 1,
                            input: tc.input,
                            expected: tc.output ?? null,
                            actual: null,
                            actual_serialized: null,
                            passed: false,
                            error: simpleResult.compile_error || simpleResult.runtime_error || simpleResult.system_error,
                            description: tc.description || null
                        }))
                    };
                }
                
                // Return results indicating code ran but test cases were not validated
                return {
                    success: true,
                    has_main_warning: true,
                    raw_stdout: simpleResult.output,
                    results: testCases.map((tc, idx) => ({
                        test_case_id: idx + 1,
                        input: tc.input,
                        expected: tc.output ?? null,
                        actual: null,
                        actual_serialized: null,
                        passed: false,
                        error: 'Code has main() function - cannot validate test cases automatically. Remove main() to test against test cases, or check console output manually.',
                        description: tc.description || null,
                        console_output: simpleResult.output
                    }))
                };
            }

            // 3. Generate harness main file with inlined user code
            const harness = this._generateHarness(sanitized, testCases, language);
            fs.writeFileSync(mainFile, harness, 'utf8');

            // 4. Compile
            const compileResult = await this._compile(mainFile, binaryFile, tmpDir, language);
            if (!compileResult.success) {
                return {
                    success: false,
                    compile_error: compileResult.error,
                    results: testCases.map((tc, idx) => ({
                        test_case_id: idx + 1,
                        input: tc.input,
                        expected: tc.output ?? null,
                        actual: null,
                        actual_serialized: null,
                        passed: false,
                        error: compileResult.error || 'Compile failed',
                        description: tc.description || null
                    }))
                };
            }

            // 5. Run binary and capture stdout
            const runResult = await this._runBinary(binaryFile, tmpDir);
            const { stdout, error: runError, timeout: runTimeout } = runResult;

            if (runError) {
                return {
                    success: false,
                    runtime_error: runError,
                    results: testCases.map((tc, idx) => ({
                        test_case_id: idx + 1,
                        input: tc.input,
                        expected: tc.output ?? null,
                        actual: null,
                        actual_serialized: null,
                        passed: false,
                        error: runError,
                        description: tc.description || null
                    })),
                    raw_stdout: stdout
                };
            }

            // 6. Parse stdout markers
            const parsed = this._parseOutput(stdout);
            const results = testCases.map((tc, idx) => {
                const id = idx + 1;
                const marker = parsed.get(id);
                let actualVal = marker?.value ?? null;
                const expected = tc.output !== undefined ? String(tc.output).trim() : null;
                let passed = false;
                let error = null;
                if (marker?.error) {
                    error = marker.error;
                } else if (expected !== null && actualVal !== null) {
                    passed = (String(actualVal).trim() === expected);
                }
                return {
                    test_case_id: id,
                    input: tc.input,
                    expected,
                    actual: actualVal,
                    actual_serialized: actualVal === null ? null : String(actualVal),
                    passed,
                    error,
                    description: tc.description || null
                };
            });

            return {
                success: true,
                results,
                raw_stdout: stdout,
                timeout: runTimeout || false
            };

        } catch (err) {
            return {
                success: false,
                system_error: err.message,
                results: testCases.map((tc, idx) => ({
                    test_case_id: idx + 1,
                    input: tc.input,
                    expected: tc.output ?? null,
                    actual: null,
                    actual_serialized: null,
                    passed: false,
                    error: 'System error: ' + err.message,
                    description: tc.description || null
                }))
            };
        } finally {
            // 7. Cleanup temp dir (best-effort)
            this._safeCleanup(tmpDir);
        }
    }

    _createTempDir() {
        const dir = path.join(os.tmpdir(), 'cpp_run_' + crypto.randomBytes(8).toString('hex'));
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    _sanitize(code) {
        // Basic removal/block comments of dangerous patterns
        return code
            .replace(/system\s*\(/g, '/* blocked system( */')
            .replace(/fork\s*\(/g, '/* blocked fork( */')
            .replace(/execve\s*\(/g, '/* blocked execve( */')
            .replace(/#include\s*<unistd.h>/g, '/* blocked unistd */');
    }

    _generateHarness(userCode, testCases, language = 'cpp') {
        const lines = [];
        
        // Different includes for C vs C++
        if (language === 'c') {
            lines.push('#include <stdio.h>');
            lines.push('#include <stdlib.h>');
            lines.push('#include <string.h>');
        } else {
            lines.push('#include <bits/stdc++.h>');
            lines.push('using namespace std;');
        }
        lines.push('');
        
        // Check if user code already has main function
        const hasMain = /int\s+main\s*\(/.test(userCode);
        
        if (hasMain) {
            // User code has main - cannot run test cases with harness
            // Just include the user code as-is
            lines.push('// User code with main function');
            lines.push(userCode);
            lines.push('');
            lines.push('// Note: Cannot inject test cases when user code has main()');
        } else {
            // User code has no main - add harness
            lines.push('// User code');
            lines.push(userCode);
            lines.push('');
            lines.push('// Test harness');
            lines.push('int main(){');
            
            // C++ specific optimizations
            if (language === 'cpp') {
                lines.push('    ios::sync_with_stdio(false);');
                lines.push('    cin.tie(nullptr);');
                lines.push('    try {');
            }
            
            testCases.forEach((tc, idx) => {
                const id = idx + 1;
                const expr = (tc.input || '').trim();
                // Validate pattern: functionName(args...) or expression
                if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/.test(expr)) {
                    if (language === 'cpp') {
                        lines.push(`        try { auto _v${id} = ${expr}; cout << "__TC_${id}:" << _v${id} << endl; } catch(const std::exception &e){ cout << "__TC_${id}__ERR:" << e.what() << endl; }`);
                    } else {
                        // C doesn't have auto or exceptions, use simpler approach
                        lines.push(`        printf("__TC_${id}:%d\\n", ${expr});`);
                    }
                } else {
                    // Unsupported format
                    if (language === 'cpp') {
                        lines.push(`        cout << "__TC_${id}__ERR:Unsupported test case format" << endl;`);
                    } else {
                        lines.push(`        printf("__TC_${id}__ERR:Unsupported test case format\\n");`);
                    }
                }
            });
            
            if (language === 'cpp') {
                lines.push('    } catch(const std::exception &e){ cout << "__ERROR:" << e.what() << endl; }');
            }
            lines.push('    return 0;');
            lines.push('}');
        }
        
        return lines.join('\n');
    }

    _compile(mainFile, binaryFile, cwd, language = 'cpp') {
        return new Promise((resolve) => {
            // Choose compiler and flags based on language
            const compiler = language === 'c' ? 'gcc' : 'g++';
            const stdFlag = language === 'c' ? '-std=c11' : '-std=c++17';
            const args = [stdFlag, '-O2', mainFile, '-o', binaryFile];
            
            let finished = false;
            const proc = spawn(compiler, args, { cwd });
            let stderr = '';
            let stdout = '';
            
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { 
                stderr += d.toString(); 
                if (stderr.length > this.maxOutputSize) stderr = stderr.slice(-this.maxOutputSize); 
            });
            
            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    proc.kill('SIGKILL');
                    resolve({ success: false, error: 'Compile timeout' });
                }
            }, this.compileTimeoutMs);
            
            proc.on('exit', (code) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (code === 0) {
                    resolve({ success: true });
                } else {
                    // Format error message more clearly
                    const errorMsg = stderr.trim() || stdout.trim() || `Compile failed with exit code ${code}`;
                    console.error(`[${language.toUpperCase()} Compile Error]`, errorMsg);
                    resolve({ success: false, error: errorMsg });
                }
            });
            
            proc.on('error', (err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                const errorMsg = `Compiler error: ${err.message}. Make sure ${compiler} is installed.`;
                console.error(`[${language.toUpperCase()} Compiler Spawn Error]`, errorMsg);
                resolve({ success: false, error: errorMsg });
            });
        });
    }

    _runBinary(binaryFile, cwd) {
        return new Promise((resolve) => {
            let finished = false;
            let stdout = '';
            const proc = spawn(binaryFile, [], { cwd });
            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    proc.kill('SIGKILL');
                    resolve({ stdout, error: 'Runtime timeout', timeout: true });
                }
            }, this.runTimeoutMs);
            proc.stdout.on('data', d => { stdout += d.toString(); if (stdout.length > this.maxOutputSize) stdout = stdout.slice(-this.maxOutputSize); });
            proc.stderr.on('data', d => { stdout += d.toString(); }); // merge stderr into stdout for simplicity
            proc.on('exit', (code) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (code === 0) resolve({ stdout });
                else resolve({ stdout, error: 'Runtime exited with code ' + code });
            });
            proc.on('error', (err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve({ stdout, error: 'Spawn error: ' + err.message });
            });
        });
    }

    _runWithStdin(binaryFile, input, cwd) {
        return new Promise((resolve) => {
            let finished = false;
            let stdout = '';
            let stderr = '';
            const proc = spawn(binaryFile, [], { cwd });
            
            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    proc.kill('SIGKILL');
                    resolve({ stdout, error: 'Runtime timeout', timeout: true });
                }
            }, this.runTimeoutMs);

            // Handle stdin errors (e.g., EPIPE when process doesn't read input)
            proc.stdin.on('error', (err) => {
                // Ignore EPIPE - it's expected when process exits before reading all input
                if (err.code !== 'EPIPE') {
                    console.error('[CppExecutionService] stdin error:', err.message);
                }
            });

            // Write input to stdin
            if (input) {
                proc.stdin.write(input);
                proc.stdin.end();
            } else {
                proc.stdin.end();
            }

            proc.stdout.on('data', d => { 
                stdout += d.toString(); 
                if (stdout.length > this.maxOutputSize) {
                    stdout = stdout.slice(-this.maxOutputSize);
                }
            });
            
            proc.stderr.on('data', d => { 
                stderr += d.toString(); 
            });

            proc.on('exit', (code) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    resolve({ 
                        stdout, 
                        stderr,
                        error: `Runtime error (exit code ${code})${stderr ? ': ' + stderr : ''}` 
                    });
                }
            });

            proc.on('error', (err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve({ stdout, stderr, error: 'Spawn error: ' + err.message });
            });
        });
    }

    _parseOutput(stdout) {
        const lines = stdout.split(/\r?\n/);
        const map = new Map();
        for (const line of lines) {
            const mVal = line.match(/^__TC_(\d+):(.*)$/);
            const mErr = line.match(/^__TC_(\d+)__ERR:(.*)$/);
            if (mVal) {
                const id = parseInt(mVal[1], 10);
                map.set(id, { value: mVal[2].trim() });
            } else if (mErr) {
                const id = parseInt(mErr[1], 10);
                map.set(id, { error: mErr[2].trim() });
            }
        }
        return map;
    }

    _safeCleanup(dir) {
        try {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach(f => {
                    try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
                });
                fs.rmdirSync(dir);
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * Execute C/C++ code for simple run (code with main function)
     * Returns { success, output, compile_error?, runtime_error? }
     */
    async executeCppSimple(userCode, language = 'cpp') {
        const tmpDir = this._createTempDir();
        const fileExt = language === 'c' ? '.c' : '.cpp';
        const sourceFile = path.join(tmpDir, 'main' + fileExt);
        const binaryFile = path.join(tmpDir, 'run_bin');

        try {
            // Write user code directly
            const sanitized = this._sanitize(userCode || '');
            fs.writeFileSync(sourceFile, sanitized, 'utf8');

            // Compile
            const compileResult = await this._compile(sourceFile, binaryFile, tmpDir, language);
            if (!compileResult.success) {
                return {
                    success: false,
                    compile_error: this._formatCompileError(compileResult.error, language),
                    compile_error_raw: compileResult.error,
                    output: ''
                };
            }

            // Run
            const runResult = await this._runBinary(binaryFile, tmpDir);
            if (runResult.error && !runResult.timeout) {
                return {
                    success: false,
                    runtime_error: this._formatRuntimeError(runResult.error),
                    runtime_error_raw: runResult.error,
                    output: runResult.stdout || ''
                };
            }

            return {
                success: true,
                output: runResult.stdout || '',
                timeout: runResult.timeout || false
            };

        } catch (err) {
            return {
                success: false,
                system_error: err.message,
                output: ''
            };
        } finally {
            this._safeCleanup(tmpDir);
        }
    }

    /**
     * Execute C/C++ code with custom stdin input
     * Returns { success, output, compile_error?, runtime_error? }
     */
    async executeCppWithInput(userCode, customInput = '', language = 'cpp') {
        const tmpDir = this._createTempDir();
        const fileExt = language === 'c' ? '.c' : '.cpp';
        const sourceFile = path.join(tmpDir, 'main' + fileExt);
        const binaryFile = path.join(tmpDir, 'run_bin');

        console.log(`[RunWithInput] Language: ${language}, Input length: ${customInput.length}`);
        console.log(`[RunWithInput] Input (escaped): ${JSON.stringify(customInput)}`);

        try {
            // Write user code directly
            const sanitized = this._sanitize(userCode || '');
            fs.writeFileSync(sourceFile, sanitized, 'utf8');

            // Compile
            const compileResult = await this._compile(sourceFile, binaryFile, tmpDir, language);
            if (!compileResult.success) {
                return {
                    success: false,
                    compile_error: this._formatCompileError(compileResult.error, language),
                    compile_error_raw: compileResult.error,
                    output: ''
                };
            }

            // Run with stdin
            const runResult = await this._runWithStdin(binaryFile, customInput, tmpDir);
            
            console.log(`[RunWithInput] Stdout: "${runResult.stdout}"`);
            console.log(`[RunWithInput] Stderr: "${runResult.stderr || ''}"`);
            
            if (runResult.error && !runResult.timeout) {
                return {
                    success: false,
                    runtime_error: this._formatRuntimeError(runResult.error),
                    runtime_error_raw: runResult.error,
                    output: runResult.stdout || ''
                };
            }

            if (runResult.timeout) {
                return {
                    success: false,
                    runtime_error: 'Chương trình chạy quá thời gian cho phép (timeout). Có thể do vòng lặp vô hạn hoặc đang chờ input không được cung cấp.',
                    output: runResult.stdout || '',
                    timeout: true
                };
            }

            return {
                success: true,
                output: runResult.stdout || '(Không có output)',
                input_used: customInput
            };

        } catch (err) {
            return {
                success: false,
                system_error: err.message,
                output: ''
            };
        } finally {
            this._safeCleanup(tmpDir);
        }
    }

    /**
     * Format compile error for user-friendly display
     */
    _formatCompileError(error, language = 'cpp') {
        if (!error) return 'Lỗi biên dịch không xác định';
        
        const langName = language === 'c' ? 'C' : 'C++';
        let formatted = `❌ Lỗi biên dịch ${langName}:\n\n`;
        
        // Parse common error patterns
        const lines = error.split('\n');
        const errorDetails = [];
        
        for (const line of lines) {
            // Match pattern: file:line:col: error: message
            const match = line.match(/main\.(c|cpp):(\d+):(\d+):\s*(error|warning):\s*(.+)/);
            if (match) {
                const [, , lineNum, colNum, type, message] = match;
                const icon = type === 'error' ? '🔴' : '🟡';
                errorDetails.push(`${icon} Dòng ${lineNum}, cột ${colNum}: ${this._translateError(message)}`);
            } else if (line.includes('error:')) {
                // Generic error
                const msg = line.split('error:')[1]?.trim();
                if (msg) {
                    errorDetails.push(`🔴 ${this._translateError(msg)}`);
                }
            }
        }
        
        if (errorDetails.length > 0) {
            formatted += errorDetails.join('\n');
        } else {
            formatted += error; // Fallback to raw error
        }
        
        return formatted;
    }

    /**
     * Format runtime error for user-friendly display
     */
    _formatRuntimeError(error) {
        if (!error) return 'Lỗi runtime không xác định';
        
        let formatted = '❌ Lỗi khi chạy chương trình:\n\n';
        
        if (error.includes('timeout')) {
            return '⏱️ Chương trình chạy quá thời gian (timeout)\n\nNguyên nhân có thể:\n• Vòng lặp vô hạn\n• Đang chờ input từ bàn phím nhưng không có input được cung cấp\n• Thuật toán quá chậm';
        }
        
        if (error.includes('Segmentation fault') || error.includes('SIGSEGV')) {
            return '💥 Lỗi Segmentation Fault\n\nNguyên nhân có thể:\n• Truy cập mảng ngoài phạm vi\n• Sử dụng con trỏ null\n• Tràn stack (đệ quy quá sâu)';
        }
        
        if (error.includes('SIGFPE') || error.includes('Floating point exception')) {
            return '🔢 Lỗi phép tính số học\n\nNguyên nhân có thể:\n• Chia cho 0\n• Phép toán tràn số';
        }
        
        if (error.includes('SIGABRT')) {
            return '🛑 Chương trình bị hủy (SIGABRT)\n\nNguyên nhân có thể:\n• Assertion failed\n• Lỗi cấp phát bộ nhớ\n• Double free';
        }
        
        if (error.includes('exit code')) {
            const codeMatch = error.match(/exit code (\d+)/);
            if (codeMatch) {
                const code = parseInt(codeMatch[1]);
                if (code === 139) return formatted + 'Segmentation Fault - Truy cập bộ nhớ không hợp lệ';
                if (code === 136) return formatted + 'Floating Point Exception - Lỗi phép tính (chia cho 0?)';
                if (code === 134) return formatted + 'Abort - Chương trình bị hủy';
            }
        }
        
        return formatted + error;
    }

    /**
     * Translate common compiler error messages to Vietnamese
     */
    _translateError(message) {
        const translations = {
            "expected ';'": "Thiếu dấu chấm phẩy ';'",
            "expected '}'": "Thiếu dấu ngoặc nhọn '}'",
            "expected '{'": "Thiếu dấu ngoặc nhọn '{'",
            "expected ')'": "Thiếu dấu ngoặc đóng ')'",
            "expected '('": "Thiếu dấu ngoặc mở '('",
            "undeclared": "Biến/hàm chưa được khai báo",
            "was not declared in this scope": "chưa được khai báo trong phạm vi này",
            "No such file or directory": "Không tìm thấy file header. Kiểm tra lại #include",
            "iostream": "Thư viện iostream (C++). Nếu viết C, dùng stdio.h thay thế",
            "undefined reference": "Hàm/biến được gọi nhưng chưa được định nghĩa",
            "invalid conversion": "Chuyển đổi kiểu dữ liệu không hợp lệ",
            "cannot convert": "Không thể chuyển đổi kiểu dữ liệu",
            "too few arguments": "Thiếu tham số khi gọi hàm",
            "too many arguments": "Thừa tham số khi gọi hàm",
            "conflicting types": "Xung đột kiểu dữ liệu - khai báo không khớp",
            "redefinition": "Định nghĩa lại (trùng tên)",
            "unknown type name": "Tên kiểu dữ liệu không xác định",
        };
        
        for (const [eng, viet] of Object.entries(translations)) {
            if (message.toLowerCase().includes(eng.toLowerCase())) {
                return message + ` (${viet})`;
            }
        }
        
        return message;
    }
}

module.exports = CppExecutionService;

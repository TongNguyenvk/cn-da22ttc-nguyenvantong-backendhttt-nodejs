'use strict';

// Simple sandboxed JavaScript code execution for pre-submit trial runs.
// NOTE: This is NOT a full secure sandbox; it provides basic isolation using Node's vm module.
// It should be enhanced later (separate process/container, resource limits). For now, we:
// - Remove dangerous keywords
// - Run inside a limited context
// - Apply per-test timeout
// - Capture console output

const vm = require('vm');

class CodeExecutionService {
    constructor(options = {}) {
        this.defaultTimeoutMs = options.timeoutMs || 1000; // 1s per test
        this.maxConsoleLines = options.maxConsoleLines || 50;
    }

    /**
     * Execute JavaScript code against provided test cases.
     * testCases: [{ input, output, description }]
     * Returns: { success, results: [{ test_case_id, input, expected, actual, passed, error, console }] }
     */
    async executeJavaScript(userCode, testCases = [], opts = {}) {
        const timeoutMs = opts.timeoutMs || this.defaultTimeoutMs;
        const sanitizedCode = this._sanitize(userCode || '');
        const results = [];

        // Prepare shared sandbox context
        const sandbox = {
            console: this._createConsoleCapture(),
            result: undefined,
            exports: {},
            module: { exports: {} }
        };
        sandbox.global = sandbox;

        const context = vm.createContext(sandbox, { name: 'code-exec-sandbox' });

        // First, attempt to compile & run the user code itself
        try {
            const script = new vm.Script(sanitizedCode, { filename: 'user_code.js' });
            script.runInContext(context, { timeout: timeoutMs });
        } catch (error) {
            // Compilation/runtime error at load time; all test cases fail
            return {
                success: false,
                load_error: error.message,
                results: testCases.map((tc, idx) => ({
                    test_case_id: idx + 1,
                    input: tc.input,
                    expected: tc.output || null,
                    actual: null,
                    passed: false,
                    error: 'Load error: ' + error.message,
                    console: sandbox.console._lines
                }))
            };
        }

        // Auto-detect function name from user code
        const functionNameMatch = sanitizedCode.match(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
        const detectedFunctionName = functionNameMatch ? functionNameMatch[1] : null;

        for (let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            let inputExpr = (tc.input || '').trim();
            let actual = null;
            let errorMsg = null;
            let passed = false;

            // Strategy:
            // 1. If input is already a function call like "funcName(...)", use it directly
            // 2. If input is a simple value like "2" and we detected a function name, auto-wrap it
            // 3. Else mark unsupported
            const isInvocation = /^[A-Za-z_$][A-Za-z0-9_$]*\s*\(.*\)$/.test(inputExpr);

            if (!isInvocation && detectedFunctionName) {
                // Auto-wrap: "2" → "isPrime(2)"
                inputExpr = `${detectedFunctionName}(${inputExpr})`;
            }

            try {
                if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*\(.*\)$/.test(inputExpr)) {
                    actual = await this._runWithTimeout(context, inputExpr, timeoutMs);
                } else {
                    errorMsg = 'Unsupported test case format (expected functionCall(...))';
                }
            } catch (err) {
                errorMsg = err.message || String(err);
            }

            // Compare with expected if available (simple string compare on serialized value)
            const expectedRaw = tc.output !== undefined ? tc.output : null;
            if (expectedRaw !== null && errorMsg === null) {
                const actualStr = this._stringify(actual);
                passed = (actualStr === String(expectedRaw).trim());
            }

            results.push({
                test_case_id: i + 1,
                input: inputExpr,
                expected: expectedRaw,
                actual: errorMsg ? null : actual,
                actual_serialized: errorMsg ? null : this._stringify(actual),
                passed: passed,
                error: errorMsg,
                description: tc.description || null,
                console: sandbox.console._lines.slice(0, this.maxConsoleLines)
            });
        }

        return { success: true, results };
    }

    _sanitize(code) {
        // Basic keyword removal to reduce risk; NOT full security.
        return code
            .replace(/process\.exit\s*\(/g, '// blocked process.exit(')
            .replace(/require\s*\(/g, '// blocked require(')
            .replace(/import\s+/g, '// blocked import ')
            .replace(/child_process/g, '/* blocked child_process */');
    }

    _createConsoleCapture() {
        const lines = [];
        return {
            log: (...args) => lines.push(args.map(a => this._stringify(a)).join(' ')),
            error: (...args) => lines.push('[error] ' + args.map(a => this._stringify(a)).join(' ')),
            _lines: lines
        };
    }

    _runWithTimeout(context, expr, timeoutMs) {
        return new Promise((resolve, reject) => {
            let finished = false;
            const timer = setTimeout(() => {
                if (!finished) {
                    finished = true;
                    reject(new Error('Timeout after ' + timeoutMs + 'ms'));
                }
            }, timeoutMs);
            try {
                const script = new vm.Script(`(function(){ return ${expr}; })()`);
                const value = script.runInContext(context, { timeout: timeoutMs });
                if (!finished) {
                    finished = true;
                    clearTimeout(timer);
                    resolve(value);
                }
            } catch (err) {
                if (!finished) {
                    finished = true;
                    clearTimeout(timer);
                    reject(err);
                }
            }
        });
    }

    _stringify(val) {
        try {
            if (typeof val === 'string') return val;
            if (val === null || val === undefined) return String(val);
            return JSON.stringify(val);
        } catch (e) {
            return String(val);
        }
    }
}

module.exports = CodeExecutionService;

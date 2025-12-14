'use strict';

/**
 * Error Parser Service
 * Parse compile errors từ GCC/G++ thành structured format cho inline highlighting
 */

class ErrorParserService {
  
  /**
   * Parse GCC/G++ compile error output
   * 
   * Input format từ GCC:
   * /tmp/main.c:3:10: error: expected ';' before 'scanf'
   * /tmp/main.cpp:5:22: warning: implicit declaration of function 'foo'
   * 
   * @param {string} compileError - Raw compile error từ GCC
   * @param {string} language - 'c' or 'cpp'
   * @returns {Array} Array of inline error objects
   */
  static parseCompileError(compileError, language = 'c') {
    if (!compileError) return [];
    
    const errors = [];
    const lines = compileError.split('\n');
    
    // Regex match GCC error format: file:line:column: type: message
    // Ví dụ: /tmp/cpp_run_xxx/main.c:3:10: error: expected ';' before 'scanf'
    const errorRegex = /(?:\/tmp\/[^:]+\/)?(?:main\.(?:c|cpp)|[^:]+\.(?:c|cpp|h|hpp)):(\d+):(\d+):\s*(error|warning|note):\s*(.+)/i;
    
    // Track errors để tránh duplicate
    const seenErrors = new Set();
    
    for (const line of lines) {
      const match = line.match(errorRegex);
      if (match) {
        const [_, lineNum, column, severity, message] = match;
        
        // Tạo unique key để tránh duplicate
        const errorKey = `${lineNum}:${column}:${message}`;
        if (seenErrors.has(errorKey)) continue;
        seenErrors.add(errorKey);
        
        const errorObj = {
          line: parseInt(lineNum),
          column: parseInt(column),
          end_column: this._estimateEndColumn(parseInt(column), message),
          severity: severity.toLowerCase(),
          message_raw: message.trim(),
          message: this._translateError(message.trim(), language),
          suggestion: this._generateSuggestion(message.trim(), language)
        };
        
        errors.push(errorObj);
      }
    }
    
    // Sort by line number
    errors.sort((a, b) => a.line - b.line || a.column - b.column);
    
    return errors;
  }

  /**
   * Parse runtime error (nếu có stack trace)
   */
  static parseRuntimeError(runtimeError, language = 'c') {
    if (!runtimeError) return [];
    
    const errors = [];
    
    // Segmentation fault
    if (runtimeError.includes('Segmentation fault') || runtimeError.includes('SIGSEGV')) {
      errors.push({
        line: null, // Không biết dòng nào
        column: null,
        severity: 'error',
        message_raw: 'Segmentation fault',
        message: 'Lỗi truy cập bộ nhớ không hợp lệ (Segmentation fault)',
        suggestion: 'Kiểm tra truy cập mảng ngoài phạm vi hoặc con trỏ NULL'
      });
    }
    
    // Stack smashing
    if (runtimeError.includes('stack smashing') || runtimeError.includes('buffer overflow')) {
      errors.push({
        line: null,
        column: null,
        severity: 'error',
        message_raw: 'Stack buffer overflow',
        message: 'Lỗi tràn bộ đệm (Buffer overflow)',
        suggestion: 'Kiểm tra kích thước mảng và vòng lặp ghi dữ liệu'
      });
    }
    
    // Floating point exception
    if (runtimeError.includes('Floating point exception') || runtimeError.includes('SIGFPE')) {
      errors.push({
        line: null,
        column: null,
        severity: 'error',
        message_raw: 'Floating point exception',
        message: 'Lỗi phép tính (thường do chia cho 0)',
        suggestion: 'Kiểm tra các phép chia, đảm bảo mẫu số khác 0'
      });
    }
    
    // Timeout
    if (runtimeError.includes('timeout') || runtimeError.includes('Time limit')) {
      errors.push({
        line: null,
        column: null,
        severity: 'error',
        message_raw: 'Timeout',
        message: 'Chương trình chạy quá lâu (timeout)',
        suggestion: 'Kiểm tra vòng lặp vô hạn hoặc thuật toán chưa tối ưu'
      });
    }
    
    return errors;
  }

  /**
   * Estimate end column dựa trên loại lỗi
   */
  static _estimateEndColumn(startColumn, message) {
    // Nếu là lỗi undeclared identifier, highlight cả tên biến
    const identifierMatch = message.match(/'([^']+)'/);
    if (identifierMatch) {
      return startColumn + identifierMatch[1].length;
    }
    
    // Default: highlight khoảng 10 ký tự
    return startColumn + 10;
  }

  /**
   * Dịch error message sang tiếng Việt
   */
  static _translateError(message, language) {
    const messageLower = message.toLowerCase();
    
    // Syntax errors
    if (messageLower.includes("expected ';'") || messageLower.includes("expected ';'")) {
      return "Thiếu dấu ';' cuối câu lệnh";
    }
    if (messageLower.includes("expected ')'")) {
      return "Thiếu dấu ')' đóng ngoặc";
    }
    if (messageLower.includes("expected '('")) {
      return "Thiếu dấu '(' mở ngoặc";
    }
    if (messageLower.includes("expected '}'")) {
      return "Thiếu dấu '}' đóng block";
    }
    if (messageLower.includes("expected '{'")) {
      return "Thiếu dấu '{' mở block";
    }
    if (messageLower.includes("expected ']'")) {
      return "Thiếu dấu ']' đóng mảng";
    }
    if (messageLower.includes("expected declaration")) {
      return "Cú pháp khai báo không đúng";
    }
    
    // Undeclared/undefined
    if (messageLower.includes("undeclared") || messageLower.includes("was not declared")) {
      const varMatch = message.match(/'([^']+)'/);
      const varName = varMatch ? varMatch[1] : 'biến';
      return `'${varName}' chưa được khai báo`;
    }
    if (messageLower.includes("use of undeclared identifier")) {
      const varMatch = message.match(/'([^']+)'/);
      const varName = varMatch ? varMatch[1] : 'biến';
      return `Sử dụng '${varName}' nhưng chưa khai báo`;
    }
    
    // Implicit declaration (missing include)
    if (messageLower.includes("implicit declaration of function")) {
      const funcMatch = message.match(/'([^']+)'/);
      const funcName = funcMatch ? funcMatch[1] : 'hàm';
      return `Hàm '${funcName}' chưa được khai báo (thiếu #include?)`;
    }
    
    // Type errors
    if (messageLower.includes("incompatible types")) {
      return "Kiểu dữ liệu không tương thích";
    }
    if (messageLower.includes("invalid conversion")) {
      return "Chuyển đổi kiểu không hợp lệ";
    }
    if (messageLower.includes("cannot convert")) {
      return "Không thể chuyển đổi kiểu dữ liệu";
    }
    
    // Function arguments
    if (messageLower.includes("too few arguments")) {
      return "Thiếu tham số khi gọi hàm";
    }
    if (messageLower.includes("too many arguments")) {
      return "Thừa tham số khi gọi hàm";
    }
    
    // Redefinition
    if (messageLower.includes("redefinition") || messageLower.includes("redeclared")) {
      return "Khai báo trùng lặp";
    }
    
    // Array issues
    if (messageLower.includes("array subscript")) {
      return "Lỗi truy cập phần tử mảng";
    }
    if (messageLower.includes("variable-sized object")) {
      return "Không thể dùng biến làm kích thước mảng (dùng malloc hoặc const)";
    }
    
    // Return type
    if (messageLower.includes("return type") || messageLower.includes("void return")) {
      return "Lỗi kiểu trả về của hàm";
    }
    if (messageLower.includes("non-void function") && messageLower.includes("return")) {
      return "Hàm cần return nhưng thiếu giá trị trả về";
    }
    
    // Pointer issues
    if (messageLower.includes("invalid use of void")) {
      return "Sử dụng void không đúng cách";
    }
    if (messageLower.includes("dereferencing")) {
      return "Lỗi truy cập con trỏ";
    }
    
    // C++ specific
    if (language === 'cpp' || language === 'c++') {
      if (messageLower.includes("no match for")) {
        return "Không tìm thấy hàm/toán tử phù hợp";
      }
      if (messageLower.includes("no member named")) {
        return "Không có thành viên với tên này";
      }
    }
    
    // C specific errors when using C++ features
    if (language === 'c') {
      if (messageLower.includes("iostream") || messageLower.includes("cout") || messageLower.includes("cin")) {
        return "Đang dùng thư viện C++ trong code C (dùng stdio.h thay vì iostream)";
      }
    }
    
    // Fallback: return original with prefix
    return message;
  }

  /**
   * Generate suggestion để sửa lỗi
   */
  static _generateSuggestion(message, language) {
    const messageLower = message.toLowerCase();
    
    // Semicolon
    if (messageLower.includes("expected ';'")) {
      return "Thêm dấu ';' vào cuối câu lệnh trước đó";
    }
    
    // Brackets
    if (messageLower.includes("expected ')'")) {
      return "Kiểm tra các cặp ngoặc (), đảm bảo mở và đóng đúng";
    }
    if (messageLower.includes("expected '}'")) {
      return "Kiểm tra các cặp ngoặc {}, đảm bảo mở và đóng đúng";
    }
    
    // Undeclared
    if (messageLower.includes("undeclared") || messageLower.includes("was not declared")) {
      return "Khai báo biến trước khi sử dụng, hoặc kiểm tra lỗi chính tả tên biến";
    }
    
    // Implicit declaration
    if (messageLower.includes("implicit declaration")) {
      const funcMatch = message.match(/'([^']+)'/);
      const funcName = funcMatch ? funcMatch[1] : '';
      
      // Common functions and their headers
      const headerMap = {
        'printf': 'stdio.h', 'scanf': 'stdio.h', 'puts': 'stdio.h', 'gets': 'stdio.h',
        'malloc': 'stdlib.h', 'free': 'stdlib.h', 'realloc': 'stdlib.h', 'calloc': 'stdlib.h',
        'strlen': 'string.h', 'strcpy': 'string.h', 'strcmp': 'string.h', 'strcat': 'string.h',
        'sqrt': 'math.h', 'pow': 'math.h', 'abs': 'stdlib.h', 'fabs': 'math.h',
      };
      
      if (funcName && headerMap[funcName]) {
        return `Thêm #include <${headerMap[funcName]}> ở đầu file`;
      }
      return "Thêm #include cần thiết hoặc khai báo prototype hàm";
    }
    
    // Type errors
    if (messageLower.includes("incompatible types")) {
      return "Kiểm tra kiểu dữ liệu của biến và giá trị gán";
    }
    
    // Arguments
    if (messageLower.includes("too few arguments")) {
      return "Kiểm tra số lượng tham số khi gọi hàm";
    }
    if (messageLower.includes("too many arguments")) {
      return "Bạn đang truyền thừa tham số, kiểm tra lại định nghĩa hàm";
    }
    
    // C++ in C
    if (language === 'c' && (messageLower.includes("iostream") || messageLower.includes("cout"))) {
      return "Thay #include <iostream> bằng #include <stdio.h>, dùng printf/scanf thay cout/cin";
    }
    
    return null;
  }

  /**
   * Tạo summary ngắn gọn cho user
   */
  static createErrorSummary(inlineErrors) {
    if (!inlineErrors || inlineErrors.length === 0) {
      return null;
    }
    
    const errorCount = inlineErrors.filter(e => e.severity === 'error').length;
    const warningCount = inlineErrors.filter(e => e.severity === 'warning').length;
    
    let summary = '';
    if (errorCount > 0) {
      summary += `${errorCount} lỗi`;
    }
    if (warningCount > 0) {
      if (summary) summary += ', ';
      summary += `${warningCount} cảnh báo`;
    }
    
    return `Có ${summary} cần sửa`;
  }

  /**
   * Tạo bản dịch đầy đủ của compile error sang tiếng Việt
   * Format thân thiện, dễ đọc cho sinh viên
   * 
   * @param {string} compileError - Raw compile error từ GCC
   * @param {Array} inlineErrors - Parsed inline errors
   * @param {string} language - 'c' or 'cpp'
   * @returns {string} Compile error đã dịch sang tiếng Việt
   */
  static translateFullCompileError(compileError, inlineErrors, language = 'c') {
    if (!compileError) return null;
    
    // Nếu không có inline errors, thử parse
    if (!inlineErrors || inlineErrors.length === 0) {
      inlineErrors = this.parseCompileError(compileError, language);
    }
    
    if (inlineErrors.length === 0) {
      // Fallback: dịch cơ bản
      return this._basicTranslateError(compileError, language);
    }
    
    // Build formatted Vietnamese error message
    const lines = [];
    lines.push('❌ LỖI BIÊN DỊCH:\n');
    
    // Group errors by line
    const errorsByLine = {};
    inlineErrors.forEach(err => {
      if (err.severity === 'note') return; // Skip notes
      const key = err.line || 'unknown';
      if (!errorsByLine[key]) errorsByLine[key] = [];
      errorsByLine[key].push(err);
    });
    
    // Format each line's errors
    Object.keys(errorsByLine)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(lineNum => {
        const errors = errorsByLine[lineNum];
        errors.forEach(err => {
          const icon = err.severity === 'error' ? '🔴' : '🟡';
          const lineInfo = lineNum !== 'unknown' ? `Dòng ${lineNum}` : '';
          const colInfo = err.column ? `, cột ${err.column}` : '';
          
          lines.push(`${icon} ${lineInfo}${colInfo}: ${err.message}`);
          
          if (err.suggestion) {
            lines.push(`   💡 Gợi ý: ${err.suggestion}`);
          }
        });
      });
    
    // Add general tips based on error types
    const hasUndeclared = inlineErrors.some(e => 
      e.message_raw?.toLowerCase().includes('undeclared') || 
      e.message_raw?.toLowerCase().includes('was not declared')
    );
    const hasSemicolon = inlineErrors.some(e => 
      e.message_raw?.toLowerCase().includes("expected ';'")
    );
    const hasImplicit = inlineErrors.some(e => 
      e.message_raw?.toLowerCase().includes('implicit declaration')
    );
    
    lines.push('\n📝 MẸO CHUNG:');
    
    if (hasSemicolon) {
      lines.push('• Mỗi câu lệnh trong C phải kết thúc bằng dấu chấm phẩy (;)');
    }
    if (hasUndeclared) {
      lines.push('• Kiểm tra tên biến có viết đúng chính tả không');
      lines.push('• Đảm bảo đã khai báo biến trước khi sử dụng');
    }
    if (hasImplicit) {
      lines.push('• Thêm #include phù hợp cho các hàm thư viện');
    }
    
    return lines.join('\n');
  }

  /**
   * Basic translation for compile errors that can't be parsed
   */
  static _basicTranslateError(compileError, language) {
    let translated = compileError;
    
    // Common translations
    const translations = [
      [/error:/gi, 'lỗi:'],
      [/warning:/gi, 'cảnh báo:'],
      [/note:/gi, 'ghi chú:'],
      [/expected/gi, 'thiếu'],
      [/before/gi, 'trước'],
      [/after/gi, 'sau'],
      [/undeclared/gi, 'chưa khai báo'],
      [/undefined/gi, 'chưa định nghĩa'],
      [/In function/gi, 'Trong hàm'],
      [/invalid/gi, 'không hợp lệ'],
      [/too few arguments/gi, 'thiếu tham số'],
      [/too many arguments/gi, 'thừa tham số'],
      [/implicit declaration of function/gi, 'hàm chưa được khai báo'],
      [/incompatible types/gi, 'kiểu dữ liệu không tương thích'],
      [/redefinition of/gi, 'khai báo lại'],
      [/previous definition/gi, 'định nghĩa trước đó'],
    ];
    
    translations.forEach(([pattern, replacement]) => {
      translated = translated.replace(pattern, replacement);
    });
    
    return `❌ LỖI BIÊN DỊCH:\n\n${translated}`;
  }

  /**
   * Dịch runtime error sang tiếng Việt
   */
  static translateRuntimeError(runtimeError) {
    if (!runtimeError) return null;
    
    const errorLower = runtimeError.toLowerCase();
    
    if (errorLower.includes('segmentation fault') || errorLower.includes('sigsegv')) {
      return `❌ LỖI BỘ NHỚ (Segmentation Fault):

🔴 Chương trình cố truy cập vùng nhớ không hợp lệ.

📝 NGUYÊN NHÂN PHỔ BIẾN:
• Truy cập mảng ngoài phạm vi (arr[n] thay vì arr[n-1])
• Sử dụng con trỏ NULL
• Gọi đệ quy quá sâu (tràn stack)

💡 CÁCH DEBUG:
• Kiểm tra các chỉ số mảng
• In ra giá trị biến trước khi truy cập mảng`;
    }
    
    if (errorLower.includes('floating point exception') || errorLower.includes('sigfpe')) {
      return `❌ LỖI PHÉP TÍNH (Floating Point Exception):

🔴 Chương trình thực hiện phép tính không hợp lệ.

📝 NGUYÊN NHÂN PHỔ BIẾN:
• Chia cho 0
• Lỗi overflow số học

💡 CÁCH SỬA:
• Kiểm tra điều kiện trước khi chia: if (b != 0) c = a / b;`;
    }
    
    if (errorLower.includes('timeout') || errorLower.includes('time limit')) {
      return `⏱️ QUÁ THỜI GIAN (Timeout):

🔴 Chương trình chạy quá lâu và bị dừng.

📝 NGUYÊN NHÂN PHỔ BIẾN:
• Vòng lặp vô hạn (while true, for không có điều kiện dừng)
• Điều kiện dừng sai
• Thuật toán chưa tối ưu

💡 CÁCH DEBUG:
• Kiểm tra điều kiện vòng lặp
• In ra giá trị biến đếm để xem có tăng/giảm đúng không`;
    }
    
    if (errorLower.includes('stack smashing') || errorLower.includes('buffer overflow')) {
      return `❌ LỖI TRÀN BỘ ĐỆM (Buffer Overflow):

🔴 Ghi dữ liệu vượt quá kích thước mảng.

📝 NGUYÊN NHÂN PHỔ BIẾN:
• Mảng khai báo quá nhỏ
• Vòng lặp ghi quá nhiều phần tử

💡 CÁCH SỬA:
• Tăng kích thước mảng
• Kiểm tra điều kiện vòng lặp`;
    }
    
    // Generic runtime error
    return `❌ LỖI KHI CHẠY (Runtime Error):

${runtimeError}

💡 Kiểm tra lại logic code và các phép tính.`;
  }
}

module.exports = ErrorParserService;

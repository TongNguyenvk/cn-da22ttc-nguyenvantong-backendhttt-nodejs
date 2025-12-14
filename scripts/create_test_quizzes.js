/**
 * Script tạo câu hỏi code exercise (JS, C, C++) rồi tạo quiz luyện code
 * Sử dụng: node create_test_quizzes.js
 *
 * LƯU Ý: validation_rules và tags phải là JSON STRING, không phải object!
 */

const BASE_URL = "http://localhost:8888/api";
const TEACHER_EMAIL = "teacher@example.com";
const TEACHER_PASSWORD = "teacher123";
const COURSE_NAME = "test ảnh";

let authToken = "";
let courseId = null;
let loIds = [];

async function apiCall(method, endpoint, data = null) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (authToken) options.headers["Authorization"] = `Bearer ${authToken}`;
  if (data) options.body = JSON.stringify(data);
  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.message || result.error || `API Error: ${response.status}`
    );
  return result;
}

async function login() {
  console.log("🔐 Đăng nhập...");
  const result = await apiCall("POST", "/users/login", {
    email: TEACHER_EMAIL,
    password: TEACHER_PASSWORD,
  });
  authToken = result.token || result.data?.token;
  console.log("✅ OK");
}

async function findCourse() {
  console.log(`🔍 Tìm khóa học "${COURSE_NAME}"...`);
  const result = await apiCall("GET", "/courses?limit=100");
  const courses = result.data?.courses || result.courses || result.data || [];
  const course = courses.find(
    (c) => c.name.toLowerCase() === COURSE_NAME.toLowerCase()
  );
  if (!course) throw new Error(`Không tìm thấy khóa học`);
  courseId = course.course_id;
  console.log(`✅ Course ID: ${courseId}`);
}

async function getLOs() {
  const result = await apiCall("GET", `/los?course_id=${courseId}`);
  const los = result.data?.los || result.los || result.data || [];
  loIds = los.map((lo) => lo.lo_id);
  if (loIds.length === 0) {
    const newLO = await apiCall("POST", "/los", {
      name: "LO Code",
      description: "LO cho code",
      course_id: courseId,
    });
    loIds = [newLO.data?.lo_id || newLO.lo_id];
  }
  console.log(`✅ LO ID: ${loIds[0]}`);
}

// Tạo câu hỏi code exercise - validation_rules phải là JSON STRING
async function createCodeQuestion(q) {
  const data = {
    question_type_id: 4,
    level_id: q.level_id || 1,
    lo_id: loIds[0],
    question_text: q.question_text,
    // QUAN TRỌNG: validation_rules phải là JSON STRING
    validation_rules: JSON.stringify(q.validation_rules),
    hints: JSON.stringify(q.hints || []),
    tags: JSON.stringify(q.tags || []),
    time_limit: 300,
  };
  const result = await apiCall("POST", "/questions", data);
  return (
    result.data?.question_id ||
    result.question_id ||
    result.data?.question?.question_id
  );
}

async function createCodePracticeQuiz(name, questionIds) {
  const data = {
    course_id: courseId,
    name: name,
    duration: 60,
    quiz_mode: "code_practice",
    question_ids: questionIds,
    code_config: {
      allow_multiple_submissions: true,
      show_test_results: true,
      enable_ai_analysis: true,
      time_limit_per_question: 300,
    },
  };
  const result = await apiCall("POST", "/quizzes", data);
  return result.data || result;
}

// ============ CÂU HỎI CODE - JS, C, C++ ============

const CODE_QUESTIONS = {
  javascript: [
    {
      question_text:
        "Viết hàm tính tổng 2 số. Hàm nhận vào 2 tham số a và b, trả về tổng của chúng.\n\nVí dụ: sum(2, 3) => 5",
      level_id: 1,
      validation_rules: {
        language: "javascript",
        test_cases: [
          { input: "2, 3", expected: 5, description: "Test cơ bản" },
          { input: "0, 0", expected: 0, description: "Test với 0" },
          { input: "-1, 1", expected: 0, description: "Test số âm" },
        ],
      },
      hints: ["Sử dụng toán tử +", "Hàm nhận 2 tham số a và b"],
      tags: ["javascript", "basic", "math"],
    },
    {
      question_text:
        "Viết hàm kiểm tra số chẵn. Trả về true nếu số chẵn, false nếu số lẻ.",
      level_id: 1,
      validation_rules: {
        language: "javascript",
        test_cases: [
          { input: "4", expected: true, description: "Số chẵn" },
          { input: "7", expected: false, description: "Số lẻ" },
          { input: "0", expected: true, description: "Số 0" },
        ],
      },
      hints: ["Sử dụng toán tử % (modulo)", "Số chẵn chia 2 dư 0"],
      tags: ["javascript", "basic", "condition"],
    },
    {
      question_text:
        "Viết hàm đảo ngược chuỗi.\n\nVí dụ: reverse('hello') => 'olleh'",
      level_id: 2,
      validation_rules: {
        language: "javascript",
        test_cases: [
          { input: "'hello'", expected: "olleh", description: "Chuỗi thường" },
          { input: "'abc'", expected: "cba", description: "Chuỗi ngắn" },
          { input: "''", expected: "", description: "Chuỗi rỗng" },
        ],
      },
      hints: ["Dùng split('').reverse().join('')", "Hoặc dùng vòng lặp"],
      tags: ["javascript", "string", "algorithm"],
    },
    {
      question_text:
        "Viết hàm tìm số lớn nhất trong mảng.\n\nVí dụ: findMax([1, 5, 3, 9, 2]) => 9",
      level_id: 2,
      validation_rules: {
        language: "javascript",
        test_cases: [
          {
            input: "[1, 5, 3, 9, 2]",
            expected: 9,
            description: "Mảng số dương",
          },
          { input: "[-1, -5, -3]", expected: -1, description: "Mảng số âm" },
          { input: "[7]", expected: 7, description: "Mảng 1 phần tử" },
        ],
      },
      hints: ["Dùng Math.max(...arr)", "Hoặc dùng reduce"],
      tags: ["javascript", "array", "algorithm"],
    },
    {
      question_text:
        "Viết hàm kiểm tra chuỗi palindrome.\n\nPalindrome là chuỗi đọc xuôi ngược đều giống nhau.\nVí dụ: 'radar', 'level', 'madam'",
      level_id: 2,
      validation_rules: {
        language: "javascript",
        test_cases: [
          { input: "'radar'", expected: true, description: "Palindrome" },
          {
            input: "'hello'",
            expected: false,
            description: "Không palindrome",
          },
          { input: "'a'", expected: true, description: "1 ký tự" },
        ],
      },
      hints: ["So sánh chuỗi với chuỗi đảo ngược"],
      tags: ["javascript", "string", "algorithm"],
    },
  ],
  c: [
    {
      question_text:
        "Viết hàm tính giai thừa của n.\n\nVí dụ: factorial(5) => 120 (5! = 5*4*3*2*1)",
      level_id: 2,
      validation_rules: {
        language: "c",
        test_cases: [
          { input: "5", expected: 120, description: "5! = 120" },
          { input: "0", expected: 1, description: "0! = 1" },
          { input: "3", expected: 6, description: "3! = 6" },
        ],
      },
      hints: ["Dùng vòng lặp for từ 1 đến n", "Hoặc dùng đệ quy"],
      tags: ["c", "math", "loop"],
    },
    {
      question_text:
        "Viết hàm tính số Fibonacci thứ n.\n\nDãy Fibonacci: 0, 1, 1, 2, 3, 5, 8, 13...\nF(n) = F(n-1) + F(n-2)",
      level_id: 3,
      validation_rules: {
        language: "c",
        test_cases: [
          { input: "6", expected: 8, description: "Fib(6) = 8" },
          { input: "0", expected: 0, description: "Fib(0) = 0" },
          { input: "10", expected: 55, description: "Fib(10) = 55" },
        ],
      },
      hints: ["F(0) = 0, F(1) = 1", "F(n) = F(n-1) + F(n-2)"],
      tags: ["c", "recursion", "algorithm"],
    },
    {
      question_text:
        "Viết hàm kiểm tra số nguyên tố.\n\nTrả về 1 nếu là số nguyên tố, 0 nếu không phải.",
      level_id: 2,
      validation_rules: {
        language: "c",
        test_cases: [
          { input: "7", expected: 1, description: "7 là số nguyên tố" },
          { input: "4", expected: 0, description: "4 không phải số nguyên tố" },
          {
            input: "2",
            expected: 1,
            description: "2 là số nguyên tố nhỏ nhất",
          },
        ],
      },
      hints: [
        "Kiểm tra từ 2 đến sqrt(n)",
        "Nếu chia hết cho số nào thì không phải số nguyên tố",
      ],
      tags: ["c", "prime", "algorithm"],
    },
  ],
  cpp: [
    {
      question_text:
        "Viết hàm tính tổng các phần tử trong mảng.\n\nVí dụ: sumArray([1,2,3,4,5]) => 15",
      level_id: 1,
      validation_rules: {
        language: "cpp",
        test_cases: [
          { input: "[1,2,3,4,5]", expected: 15, description: "Mảng số dương" },
          { input: "[0]", expected: 0, description: "Mảng 1 phần tử" },
          { input: "[-1,1]", expected: 0, description: "Tổng bằng 0" },
        ],
      },
      hints: ["Dùng vòng lặp for", "Khởi tạo sum = 0"],
      tags: ["cpp", "array", "loop"],
    },
    {
      question_text: "Viết hàm tìm giá trị nhỏ nhất trong mảng.",
      level_id: 1,
      validation_rules: {
        language: "cpp",
        test_cases: [
          { input: "[5,2,8,1,9]", expected: 1, description: "Mảng ngẫu nhiên" },
          { input: "[3]", expected: 3, description: "Mảng 1 phần tử" },
          { input: "[-5,-2,-8]", expected: -8, description: "Mảng số âm" },
        ],
      },
      hints: ["Giả sử phần tử đầu là min", "So sánh với các phần tử còn lại"],
      tags: ["cpp", "array", "algorithm"],
    },
    {
      question_text: "Viết hàm sắp xếp mảng tăng dần (Bubble Sort).",
      level_id: 2,
      validation_rules: {
        language: "cpp",
        test_cases: [
          {
            input: "[5,2,8,1]",
            expected: "[1,2,5,8]",
            description: "Mảng ngẫu nhiên",
          },
          { input: "[1]", expected: "[1]", description: "Mảng 1 phần tử" },
        ],
      },
      hints: ["So sánh từng cặp phần tử liền kề", "Đổi chỗ nếu sai thứ tự"],
      tags: ["cpp", "sorting", "algorithm"],
    },
  ],
};

// ============ MAIN ============

async function main() {
  console.log("🚀 TẠO CÂU HỎI VÀ QUIZ LUYỆN CODE (JS, C, C++)\n");

  try {
    await login();
    await findCourse();
    await getLOs();

    console.log("\n📝 BƯỚC 1: TẠO CÂU HỎI CODE EXERCISE\n");

    const created = { javascript: [], c: [], cpp: [] };

    console.log("🟨 JavaScript...");
    for (const q of CODE_QUESTIONS.javascript) {
      const id = await createCodeQuestion(q);
      created.javascript.push(id);
      console.log(`   ✅ ID ${id}`);
    }

    console.log("🔵 C...");
    for (const q of CODE_QUESTIONS.c) {
      const id = await createCodeQuestion(q);
      created.c.push(id);
      console.log(`   ✅ ID ${id}`);
    }

    console.log("🟣 C++...");
    for (const q of CODE_QUESTIONS.cpp) {
      const id = await createCodeQuestion(q);
      created.cpp.push(id);
      console.log(`   ✅ ID ${id}`);
    }

    console.log("\n📦 BƯỚC 2: TẠO QUIZ LUYỆN CODE\n");

    const q1 = await createCodePracticeQuiz(
      "Luyện Code JavaScript - Cơ bản",
      created.javascript.slice(0, 3)
    );
    console.log(`✅ Quiz JS Cơ bản (ID: ${q1.quiz_id})`);

    const q2 = await createCodePracticeQuiz(
      "Luyện Code JavaScript - Nâng cao",
      created.javascript
    );
    console.log(`✅ Quiz JS Nâng cao (ID: ${q2.quiz_id})`);

    const q3 = await createCodePracticeQuiz("Luyện Code C", created.c);
    console.log(`✅ Quiz C (ID: ${q3.quiz_id})`);

    const q4 = await createCodePracticeQuiz("Luyện Code C++", created.cpp);
    console.log(`✅ Quiz C++ (ID: ${q4.quiz_id})`);

    console.log("\n✅ HOÀN THÀNH!");
    console.log(
      `   JS: ${created.javascript.length} câu (${created.javascript.join(
        ", "
      )})`
    );
    console.log(`   C: ${created.c.length} câu (${created.c.join(", ")})`);
    console.log(
      `   C++: ${created.cpp.length} câu (${created.cpp.join(", ")})`
    );
    console.log("\n🔗 http://localhost:3000/code-practice");
  } catch (error) {
    console.error("❌ LỖI:", error.message);
    process.exit(1);
  }
}

main();

// src/app.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const socket = require("./socket");
const { setGlobalIO } = require("./controllers/quizController");

dotenv.config();

const app = express();
const server = http.createServer(app);

// Cấu hình CORS
const corsOptions = {
  origin: [
    "https://34.126.186.132",
    "https://stardust.id.vn",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://frontend:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
    "http://localhost:3006",
    "http://localhost:3007",
    "http://localhost:3008",
    "http://localhost:3009",
    "http://localhost:3010",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:3004",
    "http://127.0.0.1:3005",
    "http://127.0.0.1:3006",
    "http://127.0.0.1:3007",
    "http://127.0.0.1:3008",
    "http://127.0.0.1:3009",
    "http://127.0.0.1:3010",
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));

// Body parser middleware - MUST be before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Khởi tạo socket.io với server
const io = socket.init(server);

// Đảm bảo quizRealtimeService được khởi tạo đúng
setGlobalIO(io);

// Initialize LeaderboardService with Socket.IO
const { initializeSocket } = require("./services/leaderboardService");
initializeSocket(io);

// Initialize Quiz Racing Controller with Socket.IO
const QuizRacingController = require("./controllers/quizRacingController");
const quizRacingController = new QuizRacingController(io);

// Initialize Answer Choice Stats Controller after importing routes
// (will be called after routes are imported)

// Thêm socket.io vào app để có thể truy cập từ các controller
app.set("io", io);

// Import các routes
const questionRoutes = require("./routes/questionRoutes");
const enhancedQuestionRoutes = require("./routes/enhancedQuestionRoutes");
const programRoutes = require("./routes/programRoutes");
const trainingBatchRoutes = require("./routes/trainingBatchRoutes");
const roleRoutes = require("./routes/roleRoutes");
const userRoutes = require("./routes/userRoutes");
const poRoutes = require("./routes/poRoutes");
const ploRoutes = require("./routes/ploRoutes");
const posPlosRoutes = require("./routes/posPlosRoutes");
const courseRoutes = require("./routes/courseRoutes");
const studentCourseRoutes = require("./routes/studentCourseRoutes");
const typeSubjectRoutes = require("./routes/typeSubjectRoutes");
const groupRoutes = require("./routes/groupRoutes");
const typeOfKnowledgeRoutes = require("./routes/typeOfKnowledgeRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const loRoutes = require("./routes/loRoutes");
const questionTypeRoutes = require("./routes/questionTypeRoutes");
const levelRoutes = require("./routes/levelRoutes");
const quizRoutes = require("./routes/quizRoutes");
const quizQuestionRoutes = require("./routes/quizQuestionRoutes");
const answerRoutes = require("./routes/answerRoutes");
const quizResultRoutes = require("./routes/quizResultRoutes");
const courseResultRoutes = require("./routes/courseResultRoutes");
const tienQuyetRoutes = require("./routes/tienQuyetRoutes");
const learningAnalyticsRoutes = require("./routes/learningAnalyticsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const chapterRoutes = require("./routes/chapterRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");
const gamificationRoutes = require("./routes/gamificationRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");
const gamificationLevelRoutes = require("./routes/gamificationLevel");
const titleRoutes = require("./routes/title");
const quizModeRoutes = require("./routes/quizModeRoutes");
const achievementRoutes = require("./routes/achievementRoutes");
const dynamicScoringRoutes = require("./routes/dynamicScoringRoutes");
const progressRoutes = require("./routes/progressRoutes");
const adaptiveQuizRoutes = require("./routes/adaptiveQuizRoutes");
const advancedAnalyticsRoutes = require("./routes/advancedAnalyticsRoutes");
const teacherAnalyticsRoutes = require("./routes/teacherAnalyticsRoutes");
const learningOutcomeRoutes = require("./routes/learningOutcomeRoutes");
const currencyRoutes = require("./routes/currencyRoutes");
const avatarCustomizationRoutes = require("./routes/avatarCustomizationRoutes");
const eggRewardRoutes = require("./routes/eggRewardRoutes");
const emojiRoutes = require("./routes/emojiRoutes");
const socialRoutes = require("./routes/socialRoutes");
// const skillRoutes = require("./routes/skillRoutes"); // REMOVED: Skills system deprecated
const quizRacingRoutes = require("./routes/quizRacingRoutes");
const courseGradeRoutes = require("./routes/courseGradeRoutes");
const practiceRoutes = require("./routes/practiceRoutes");
const practiceRecommendationRoutes = require("./routes/practiceRecommendationRoutes");
const courseAnalyticsRoutes = require("./routes/courseAnalyticsRoutes");
const migrationRoutes = require("./routes/migrationRoutes");
const learningPathRoutes = require("./routes/learningPathRoutes");
const {
  router: answerChoiceStatsRouter,
  initializeController: initAnswerChoiceStatsController,
} = require("./routes/answerChoiceStatsRoutes");
const levelProgressRoutes = require("./routes/levelProgressRoutes");
const shopRoutes = require("./routes/shopRoutes");
// NEW ROUTES
const semesterRoutes = require("./routes/semesterRoutes");
const codeSubmissionRoutes = require("./routes/codeSubmissionRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const aiTutorRoutes = require("./routes/aiTutorRoutes");

// Setup routes
// Mount enhanced question routes BEFORE generic question routes to avoid ':id' capturing 'enhanced'
app.use("/api/questions", enhancedQuestionRoutes); // enhanced endpoints (/enhanced)
app.use("/api/questions", questionRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/training-batches", trainingBatchRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pos", poRoutes);
app.use("/api/plos", ploRoutes);
app.use("/api/pos-plos", posPlosRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/courses", courseGradeRoutes); // Routes cho quản lý cột điểm
app.use("/api/student-courses", studentCourseRoutes);
app.use("/api/type-subjects", typeSubjectRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/type-of-knowledges", typeOfKnowledgeRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/los", loRoutes);
app.use("/api/question-types", questionTypeRoutes);
app.use("/api/levels", levelRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/quiz-questions", quizQuestionRoutes);
app.use("/api/answers", answerRoutes);
app.use("/api/quiz-results", quizResultRoutes);
app.use("/api/course-results", courseResultRoutes);
app.use("/api/tienquyets", tienQuyetRoutes);
app.use("/api/learning-analytics", learningAnalyticsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chapters", chapterRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use("/api/gamification", gamificationRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/gamification-level", gamificationLevelRoutes);
app.use("/api/titles", titleRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/scoring", dynamicScoringRoutes);
app.use("/api/currency", currencyRoutes);
app.use("/api/level-progress", levelProgressRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/avatar", avatarCustomizationRoutes);
app.use("/api/eggs", eggRewardRoutes);
app.use("/api/emojis", emojiRoutes);
app.use("/api/social", socialRoutes);
// app.use("/api/skills", skillRoutes); // REMOVED: Skills system deprecated
app.use("/api/quiz-racing", quizRacingRoutes);
app.use("/api/racing", quizRacingRoutes); // Alias cho frontend compatibility
app.use("/api/progress", progressRoutes);
app.use("/api/quizzes/adaptive", adaptiveQuizRoutes);
app.use("/api/advanced-analytics", advancedAnalyticsRoutes);
app.use("/api/teacher-analytics", teacherAnalyticsRoutes);
app.use("/api/learning-outcomes", learningOutcomeRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/practice-recommendations", practiceRecommendationRoutes);
app.use("/api/courses", courseAnalyticsRoutes);
app.use("/api/learning-path", learningPathRoutes);
app.use("/api/quizzes", answerChoiceStatsRouter); // Answer Choice Statistics routes
app.use("/api/quiz-modes", quizModeRoutes);
// NEW ROUTES FOR SEMESTER AND ASSIGNMENT MANAGEMENT
app.use("/api/semesters", semesterRoutes);
app.use("/api/assignments", assignmentRoutes);

// CODE SUBMISSION ROUTES FOR CEREBRAS AI ANALYSIS
app.use("/api/code-submissions", codeSubmissionRoutes);

// AI TUTOR ROUTES - Trợ lý học lập trình
app.use("/api/ai-tutor", aiTutorRoutes);

// TEACHER CODE ANALYTICS ROUTES
const teacherCodeAnalyticsRoutes = require("./routes/teacherCodeAnalyticsRoutes");
app.use("/api/teacher/code-analytics", teacherCodeAnalyticsRoutes);

// Initialize Answer Choice Stats Controller after all routes are loaded
initAnswerChoiceStatsController(io);

// Migration API for dual support during transition
app.use("/api/migration", migrationRoutes);

// Static serving for uploaded media (questions & answers)
const path = require("path");
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    setHeaders: (res) => {
      // Long cache; filenames are content-addressed by timestamp
      res.set("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

// Test Socket.IO route
app.get("/api/test-socket", (req, res) => {
  const io = req.app.get("io");
  io.emit("testEvent", { message: "Test message from server" });
  res.json({ message: "Test event sent" });
});

// Xử lý lỗi 404
app.use((req, res, next) => {
  res.status(404).json({ error: "Route không tồn tại" });
});

// Xử lý lỗi server
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ error: "Lỗi server", details: err.message });
});

module.exports = server;

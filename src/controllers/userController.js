const { User, Role, Course, StudentCourse, QuizResult, CourseResult } = require('../models');
const { sequelize } = require('../models');
const jwt = require('jsonwebtoken')
const XLSX = require('xlsx');
const { Op, literal } = require('sequelize');
// Lấy danh sách tất cả người dùng (hỗ trợ lọc theo role và từ khóa q)
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, role, q } = req.query;
        const offset = (page - 1) * limit;

        // Optional filters
        const where = {};
        if (q) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${q}%` } },
                { email: { [Op.iLike]: `%${q}%` } }
            ];
        }

        const roleInclude = { model: Role, attributes: ['role_id', 'name'] };
        if (role) {
            roleInclude.where = { name: { [Op.iLike]: role } };
            roleInclude.required = true; // apply filter
        }

        const users = await User.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['user_id', 'ASC']],
            include: [
                roleInclude,
                { model: Course, attributes: ['course_id', 'name'] },
                { model: QuizResult, attributes: ['result_id', 'score'] },
                { model: CourseResult, attributes: ['result_id', 'average_score'] },
            ],
        });

        res.status(200).json({
            success: true,
            data: {
                totalItems: users.count,
                totalPages: Math.ceil(users.count / limit),
                currentPage: parseInt(page),
                users: users.rows,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách người dùng',
            error: error.message
        });
    }
};

// Danh sách giáo viên (admin-only sử dụng endpoint này)
exports.getTeachers = async (req, res) => {
    try {
        req.query.role = 'teacher';
        return exports.getAllUsers(req, res);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách giáo viên', error: error.message });
    }
};

// Danh sách sinh viên (admin/teacher có thể dùng tùy route)
exports.getStudents = async (req, res) => {
    try {
        req.query.role = 'student';
        return exports.getAllUsers(req, res);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách sinh viên', error: error.message });
    }
};

// Lấy thông tin chi tiết một người dùng
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, {
            include: [
                { model: Role, attributes: ['role_id', 'name'] },
                { model: Course, attributes: ['course_id', 'name'] },
                { model: QuizResult, attributes: ['result_id', 'score'] },
                { model: CourseResult, attributes: ['result_id', 'average_score'] },
            ],
        });

        if (!user) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin người dùng',
            error: error.message
        });
    }
};


// Cập nhật thông tin một người dùng
exports.updateUser = async (req, res) => {
    try {
        const user_id = req.params.id; // route uses :id
        const { name, email, password } = req.body;

        // Sử dụng trực tiếp model được import thay vì req.models để tránh undefined
        const user = await User.findByPk(user_id, {
            include: [{ model: Role, as: 'Role' }],
        });
        if (!user) {
            return res.status(404).json({ error: 'Người dùng không tồn tại' });
        }

        // Kiểm tra quyền
        if (req.roleName === 'student' && req.user.user_id !== parseInt(user_id)) {
            return res.status(403).json({ error: 'Bạn chỉ có thể cập nhật thông tin của chính mình' });
        }
        if (req.roleName === 'teacher' && user.Role.name !== 'student') {
            return res.status(403).json({ error: 'Giảng viên chỉ có thể cập nhật thông tin của học viên' });
        }

        if (name) user.name = name;
        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ where: { email } });
            if (existingEmail) {
                return res.status(400).json({ error: 'Email đã tồn tại' });
            }
            user.email = email;
        }
        // KHÔNG cho phép đổi mật khẩu qua endpoint updateUser để đảm bảo an toàn
        // - User tự đổi: dùng POST /api/users/change-password
        // - Admin/Teacher reset: dùng PUT /api/users/:id/password
        if (typeof password !== 'undefined') {
            return res.status(400).json({ 
                error: 'Không được đổi mật khẩu qua API này. Vui lòng dùng /api/users/change-password (tự đổi) hoặc /api/users/:id/password (admin/teacher reset).'
            });
        }

        await user.save();

        res.status(200).json({
            message: 'Cập nhật người dùng thành công',
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.Role.name,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi cập nhật người dùng', details: error.message });
    }
};

// Xóa một người dùng
exports.deleteUser = async (req, res) => {
    const { sequelize } = require('../models');
    const transaction = await sequelize.transaction();
    
    try {
        const userId = req.params.id;
        const user = await User.findByPk(userId);
        
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ 
                success: false,
                message: 'Người dùng không tồn tại' 
            });
        }

        // Kiểm tra xem user có phải là admin cuối cùng không
        if (user.role_id === 1) { // Giả sử role_id = 1 là admin
            const adminCount = await User.count({
                where: { role_id: 1 },
                transaction
            });
            
            if (adminCount <= 1) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Không thể xóa admin cuối cùng trong hệ thống'
                });
            }
        }

        // Xóa các records liên quan của user
        const { 
            QuizResult, 
            UserQuestionHistory, 
            StudentCourse, 
            Course,
            CourseResult 
        } = require('../models');

        // Xóa quiz results
        await QuizResult.destroy({
            where: { user_id: userId },
            transaction
        });

        // Xóa question history
        await UserQuestionHistory.destroy({
            where: { user_id: userId },
            transaction
        });

        // Xóa course results
        await CourseResult.destroy({
            where: { user_id: userId },
            transaction
        });

        // Xóa student course enrollments
        await StudentCourse.destroy({
            where: { user_id: userId },
            transaction
        });

        // NOTE: Không xóa courses mà user tạo ra, chỉ chuyển ownership nếu cần
        // Có thể cập nhật để chuyển courses cho admin khác
        const userCoursesCount = await Course.count({
            where: { user_id: userId },
            transaction
        });

        if (userCoursesCount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Không thể xóa user vì đang làm giảng viên cho ${userCoursesCount} course(s). Vui lòng chuyển quyền sở hữu courses trước.`
            });
        }

        // Xóa user
        await user.destroy({ transaction });
        await transaction.commit();
        
        res.status(200).json({ 
            success: true,
            message: 'Xóa người dùng thành công' 
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi xóa người dùng', 
            error: error.message 
        });
    }
};

require('dotenv').config();
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng cung cấp email và password' });
        }

        const user = await User.findOne({
            where: { email },
            include: [{ model: Role, as: 'Role' }],
        });
        if (!user) {
            return res.status(404).json({ error: 'Email không tồn tại' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Mật khẩu không đúng' });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET không được thiết lập trong biến môi trường');
        }

        const token = jwt.sign(
            { user_id: user.user_id, role: user.Role.name }, // Lưu vai trò vào token
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.Role.name,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi đăng nhập', details: error.message });
    }
};

exports.createAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin' });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email đã tồn tại' });
        }

        const adminRole = await Role.findOne({ where: { name: 'admin' } });
        if (!adminRole) {
            return res.status(500).json({ error: 'Vai trò admin không tồn tại' });
        }

        const admin = await User.create({
            name,
            email,
            password,
            role_id: adminRole.role_id,
        });

        res.status(201).json({
            message: 'Tạo admin thành công',
            user: {
                user_id: admin.user_id,
                name: admin.name,
                email: admin.email,
                role: 'admin',
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi tạo admin', details: error.message });
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin' });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email đã tồn tại' });
        }

        const teacherRole = await Role.findOne({ where: { name: 'teacher' } });
        if (!teacherRole) {
            return res.status(500).json({ error: 'Vai trò teacher không tồn tại' });
        }

        const teacher = await User.create({
            name,
            email,
            password,
            role_id: teacherRole.role_id,
        });

        res.status(201).json({
            message: 'Tạo giảng viên thành công',
            user: {
                user_id: teacher.user_id,
                name: teacher.name,
                email: teacher.email,
                role: 'teacher',
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi tạo giảng viên', details: error.message });
    }
};

exports.createStudent = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin bắt buộc (name, email)' });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email đã tồn tại' });
        }

        const studentRole = await Role.findOne({ where: { name: 'student' } });
        if (!studentRole) {
            return res.status(500).json({ error: 'Vai trò student không tồn tại' });
        }

        // Nếu không truyền password, mặc định dùng mã số sinh viên lấy từ email (phần trước @)
        let finalPassword = password;
        if (!finalPassword) {
            const emailLocal = String(email).split('@')[0];
            finalPassword = emailLocal; // để hook beforeCreate mã hóa
        }

        const student = await User.create({
            name,
            email,
            password: finalPassword,
            role_id: studentRole.role_id,
        });

        res.status(201).json({
            message: 'Tạo học viên thành công',
            user: {
                user_id: student.user_id,
                name: student.name,
                email: student.email,
                role: 'student',
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi tạo học viên', details: error.message });
    }
};

// Đổi mật khẩu cho chính mình (ưu tiên sinh viên, nhưng áp dụng cho mọi vai trò đăng nhập)
exports.changeMyPassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ success: false, error: 'Thiếu current_password hoặc new_password' });
        }

        // Kiểm tra độ mạnh cơ bản của mật khẩu mới
        if (String(new_password).length < 6) {
            return res.status(400).json({ success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
        }

        const user = await User.findByPk(req.user.user_id, { include: [{ model: Role, as: 'Role' }] });
        if (!user) {
            return res.status(404).json({ success: false, error: 'Người dùng không tồn tại' });
        }

        const isMatch = await user.comparePassword(current_password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Mật khẩu hiện tại không đúng' });
        }

        user.password = new_password; // sẽ được hash bởi hook beforeUpdate
        await user.save();

        return res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Lỗi khi đổi mật khẩu', details: error.message });
    }
};

// Admin/Teacher đổi mật khẩu cho người khác
// - Admin: có thể đổi mật khẩu cho bất kỳ vai trò nào (admin/teacher/student)
// - Teacher: chỉ được đổi mật khẩu cho student
exports.adminChangeUserPassword = async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const { new_password } = req.body;

        if (!new_password) {
            return res.status(400).json({ success: false, error: 'Thiếu new_password' });
        }
        if (String(new_password).length < 6) {
            return res.status(400).json({ success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
        }

        const targetUser = await User.findByPk(targetUserId, { include: [{ model: Role, as: 'Role' }] });
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'Người dùng mục tiêu không tồn tại' });
        }

        const requesterRole = req.roleName; // 'admin' | 'teacher' | 'student'

        if (requesterRole === 'student') {
            return res.status(403).json({ success: false, error: 'Sinh viên không có quyền đổi mật khẩu người khác' });
        }

        if (requesterRole === 'teacher' && targetUser.Role.name !== 'student') {
            return res.status(403).json({ success: false, error: 'Giảng viên chỉ được đổi mật khẩu cho sinh viên' });
        }

        // requesterRole === 'admin' thì cho phép tất cả
        targetUser.password = new_password; // hash bởi hook
        await targetUser.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật mật khẩu thành công',
            data: {
                user_id: targetUser.user_id,
                email: targetUser.email,
                role: targetUser.Role.name
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Lỗi khi cập nhật mật khẩu', details: error.message });
    }
};

exports.importStudents = async (req, res) => {
    console.log('🚀 Starting importStudents V3.0...');
    
    try {
        // ===== STEP 1: BASIC VALIDATION =====
        console.log('📋 Step 1: Basic validation...');
        
        if (!req.file) {
            console.log('❌ No file uploaded');
            return res.status(400).json({ 
                error: 'Vui lòng tải lên file Excel' 
            });
        }
        
        console.log('✅ File uploaded:', {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path
        });

        // ===== STEP 2: CHECK STUDENT ROLE =====
        console.log('📋 Step 2: Check student role...');
        
        const studentRole = await Role.findOne({
            where: { name: { [Op.iLike]: 'student' } },
        });
        if (!studentRole) {
            console.log('❌ Student role not found');
            return res.status(500).json({ error: 'Vai trò student không tồn tại' });
        }
        
        console.log('✅ Student role found:', {
            role_id: studentRole.role_id,
            name: studentRole.name
        });

        // ===== STEP 3: READ EXCEL FILE =====
        console.log('📋 Step 3: Read Excel file...');
        
        let workbook;
        try {
            workbook = XLSX.readFile(req.file.path);
            console.log('✅ Excel file read successfully');
        } catch (xlsxError) {
            console.log('❌ Failed to read Excel file:', xlsxError.message);
            return res.status(400).json({
                error: 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng file.',
                details: xlsxError.message
            });
        }
        
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('✅ Worksheet processed:', {
            sheetName: workbook.SheetNames[0],
            totalRows: rows.length,
            sampleRows: rows.slice(0, 3)
        });

        // ===== STEP 4: FIND DATA START ROW =====
        console.log('📋 Step 4: Finding data start row...');
        
        let dataStartRow = 11; // Default fallback
        
        // Tìm hàng chứa header "Mã SV" 
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const row = rows[i];
            if (row && Array.isArray(row)) {
                const rowStr = row.map(cell => cell ? cell.toString().toLowerCase() : '').join(' ');
                if (rowStr.includes('mã sv') || rowStr.includes('mã sinh viên')) {
                    dataStartRow = i + 1; // Dữ liệu bắt đầu từ hàng tiếp theo
                    console.log('✅ Found header at row:', i + 1);
                    break;
                }
            }
        }
        
        console.log('📍 Data starts from row:', dataStartRow + 1);

        const createdStudents = [];
        const skippedStudents = [];

        // ===== STEP 5: PROCESS STUDENT DATA =====
        console.log('📋 Step 5: Processing student data...');
        
        for (let i = dataStartRow; i < rows.length; i++) {
            const cells = rows[i];
            const rowIndex = i + 1;
            
            // Khai báo biến ngoài try để có thể dùng trong catch
            let maSV = '';
            let hoLot = '';
            let ten = '';
            let name = '';
            let email = '';
            
            try {
                // Kiểm tra cells có tồn tại không
                if (!cells || !Array.isArray(cells)) {
                    console.log(`⏭️  Skipping empty row ${rowIndex}`);
                    skippedStudents.push({
                        row: rowIndex,
                        reason: 'Hàng dữ liệu trống hoặc không hợp lệ'
                    });
                    continue;
                }

                // Trích xuất dữ liệu từ các cột
                maSV = cells[1] ? String(cells[1]).trim() : ''; // Cột "Mã SV" (cột 2) - dùng làm password
                hoLot = cells[2] ? String(cells[2]).trim() : ''; // Cột "Họ lót" (cột 3)
                ten = cells[3] ? String(cells[3]).trim() : ''; // Cột "Tên" (cột 4)
                
                console.log(`🔍 Processing row ${rowIndex}:`, { 
                    maSV, 
                    hoLot, 
                    ten,
                    cellsRaw: cells,
                    maSVType: typeof cells[1],
                    maSVValue: cells[1]
                });
                
                // Kiểm tra dữ liệu cơ bản
                if (!maSV || !hoLot || !ten) {
                    console.log(`⚠️  Row ${rowIndex}: Missing basic data - maSV: ${maSV}, hoLot: ${hoLot}, ten: ${ten}`);
                    skippedStudents.push({
                        row: rowIndex,
                        reason: 'Thiếu thông tin cơ bản (mã SV, họ lót, tên)',
                        data: { maSV, hoLot, ten }
                    });
                    continue;
                }

                // Tạo thông tin sinh viên
                name = `${hoLot} ${ten}`.trim(); // Kết hợp họ lót và tên
                email = `${maSV}@st.tvu.edu.vn`; // Email từ mã SV
                const password = maSV; // Password là mã SV

                // Kiểm tra email đã tồn tại chưa
                const existingUser = await User.findOne({ where: { email } });
                if (existingUser) {
                    console.log(`⚠️  Row ${rowIndex}: Email already exists - ${email}`);
                    skippedStudents.push({
                        row: rowIndex,
                        email,
                        reason: 'Email đã tồn tại',
                        data: { maSV, name, email }
                    });
                    continue;
                }

                // Tạo sinh viên mới
                console.log(`👤 Creating student:`, { 
                    name, 
                    email, 
                    password: maSV,
                    role_id: studentRole.role_id,
                    maSV_original: cells[1]
                });
                
                // Đảm bảo không có user_id trong object create
                const createData = {
                    name,
                    email,
                    password, // Mật khẩu là Mã SV, sẽ được mã hóa bởi hook
                    role_id: studentRole.role_id,
                    // Thêm giá trị mặc định cho các trường gamification
                    total_points: 0,
                    current_level: 1,
                    experience_points: 0,
                    gamification_stats: {
                        total_quizzes_completed: 0,
                        total_correct_answers: 0,
                        total_questions_answered: 0,
                        average_response_time: 0,
                        best_streak: 0,
                        current_streak: 0,
                        speed_bonus_earned: 0,
                        perfect_scores: 0
                    }
                };
                
                console.log(`📝 Create data:`, createData);
                
                try {
                    const student = await User.create(createData);

                    console.log(`✅ Created student ${student.user_id}: ${student.name}`);

                    createdStudents.push({
                        user_id: student.user_id,
                        name: student.name,
                        email: student.email,
                        role: 'student',
                    });
                } catch (createError) {
                    console.log(`💥 Create User Error:`, {
                        error: createError.message,
                        name: createError.name,
                        errors: createError.errors,
                        sql: createError.sql,
                        data: { name, email, role_id: studentRole.role_id }
                    });
                    
                    // Auto-fix sequence nếu gặp unique constraint error trên user_id
                    if (createError.name === 'SequelizeUniqueConstraintError' && 
                        createError.errors[0]?.path === 'user_id') {
                        try {
                            console.log('🔧 Attempting to fix sequence...');
                            const { sequelize } = require('../models');
                            await sequelize.query('SELECT setval(\'"Users_user_id_seq"\', (SELECT MAX(user_id) + 1 FROM "Users"))');
                            console.log('✅ Sequence fixed, retrying...');
                            
                            // Retry tạo user
                            const student = await User.create(createData);
                            console.log(`✅ Created student ${student.user_id}: ${student.name}`);
                            
                            createdStudents.push({
                                user_id: student.user_id,
                                name: student.name,
                                email: student.email,
                                role: 'student',
                            });
                            continue;
                        } catch (fixError) {
                            console.log('❌ Failed to auto-fix sequence:', fixError.message);
                        }
                    }
                    
                    skippedStudents.push({
                        row: rowIndex,
                        email,
                        reason: `Lỗi tạo user: ${createError.message}`,
                        data: { maSV, name, email }
                    });
                    continue;
                }
                
            } catch (rowError) {
                console.log(`❌ Error processing row ${rowIndex}:`, rowError.message);
                skippedStudents.push({
                    row: rowIndex,
                    reason: `Lỗi xử lý: ${rowError.message}`,
                    data: { maSV, hoLot, ten, name, email }
                });
            }
        }

        console.log('🎉 Import completed:', {
            created: createdStudents.length,
            skipped: skippedStudents.length
        });

        // Trả về kết quả
        res.status(200).json({
            message: 'Import sinh viên thành công',
            created: createdStudents,
            skipped: skippedStudents,
        });
        
    } catch (error) {
        console.log('💥 Fatal error in importStudents:', error);
        res.status(500).json({ 
            error: 'Lỗi khi import sinh viên', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        // ===== STEP 6: CLEANUP =====
        console.log('📋 Step 6: Cleanup...');
        if (req.file && req.file.path) {
            try {
                const fs = require('fs');
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                    console.log('✅ Uploaded file cleaned up');
                }
            } catch (cleanupError) {
                console.log('⚠️  Failed to cleanup file:', cleanupError.message);
            }
        }
    }
};

// Import sinh viên và tự động đăng ký vào khóa học
exports.importAndEnrollStudents = async (req, res) => {
    console.log('🚀 Starting importAndEnrollStudents V4.0 - Smart Enroll...');
    const transaction = await sequelize.transaction();

    try {
        // ===== STEP 1: BASIC VALIDATION =====
        console.log('📋 Step 1: Basic validation...');
        
        const { course_id } = req.query;
        
        if (!req.file) {
            console.log('❌ No file uploaded');
            await transaction.rollback();
            return res.status(400).json({ 
                error: 'Vui lòng tải lên file Excel' 
            });
        }
        
        if (!course_id) {
            console.log('❌ No course_id provided');
            await transaction.rollback();
            return res.status(400).json({ 
                error: 'course_id là bắt buộc để enroll sinh viên vào khóa học' 
            });
        }
        
        console.log('✅ File uploaded:', {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            course_id: course_id
        });

        // ===== STEP 2: CHECK COURSE AND ROLE =====
        console.log('📋 Step 2: Check course and student role...');
        
        // Kiểm tra khóa học tồn tại
        const course = await Course.findByPk(course_id);
        if (!course) {
            console.log('❌ Course not found');
            await transaction.rollback();
            return res.status(404).json({
                error: 'Khóa học không tồn tại'
            });
        }
        
        console.log('✅ Course found:', {
            course_id: course.course_id,
            name: course.name
        });
        
        const studentRole = await Role.findOne({
            where: { name: { [Op.iLike]: 'student' } },
        });
        if (!studentRole) {
            console.log('❌ Student role not found');
            await transaction.rollback();
            return res.status(500).json({ error: 'Vai trò student không tồn tại' });
        }
        
        console.log('✅ Student role found:', {
            role_id: studentRole.role_id,
            name: studentRole.name
        });

        // ===== STEP 3: READ EXCEL FILE =====
        console.log('📋 Step 3: Read Excel file...');
        
        let workbook;
        try {
            workbook = XLSX.readFile(req.file.path);
            console.log('✅ Excel file read successfully');
        } catch (xlsxError) {
            console.log('❌ Failed to read Excel file:', xlsxError.message);
            await transaction.rollback();
            return res.status(400).json({
                error: 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng file.',
                details: xlsxError.message
            });
        }
        
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('✅ Worksheet processed:', {
            sheetName: workbook.SheetNames[0],
            totalRows: rows.length,
            sampleRows: rows.slice(0, 3)
        });

        // ===== STEP 4: FIND DATA START ROW =====
        console.log('📋 Step 4: Finding data start row...');
        
        let dataStartRow = 11; // Default fallback
        
        // Tìm hàng chứa header "Mã SV" 
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const row = rows[i];
            if (row && Array.isArray(row)) {
                const rowStr = row.map(cell => cell ? cell.toString().toLowerCase() : '').join(' ');
                if (rowStr.includes('mã sv') || rowStr.includes('mã sinh viên')) {
                    dataStartRow = i + 1; // Dữ liệu bắt đầu từ hàng tiếp theo
                    console.log('✅ Found header at row:', i + 1);
                    break;
                }
            }
        }
        
        console.log('📍 Data starts from row:', dataStartRow + 1);

        const createdStudents = [];
        const skippedStudents = [];

        // ===== STEP 5: IMPORT STUDENTS =====
        console.log('📋 Step 5: Import students...');
        
        for (let i = dataStartRow; i < rows.length; i++) {
            const cells = rows[i];
            const rowIndex = i + 1;
            
            // Khai báo biến ngoài try để có thể dùng trong catch
            let maSV = '';
            let hoLot = '';
            let ten = '';
            let name = '';
            let email = '';
            
            try {
                // Kiểm tra cells có tồn tại không
                if (!cells || !Array.isArray(cells)) {
                    console.log(`⏭️  Skipping empty row ${rowIndex}`);
                    skippedStudents.push({
                        row: rowIndex,
                        reason: 'Hàng dữ liệu trống hoặc không hợp lệ'
                    });
                    continue;
                }

                // Trích xuất dữ liệu từ các cột
                maSV = cells[1] ? String(cells[1]).trim() : ''; // Cột "Mã SV" (cột 2) - dùng làm password
                hoLot = cells[2] ? String(cells[2]).trim() : ''; // Cột "Họ lót" (cột 3)
                ten = cells[3] ? String(cells[3]).trim() : ''; // Cột "Tên" (cột 4)
                
                console.log(`🔍 Processing row ${rowIndex}:`, { 
                    maSV, 
                    hoLot, 
                    ten,
                    cellsRaw: cells,
                    maSVType: typeof cells[1],
                    maSVValue: cells[1]
                });
                
                // Kiểm tra dữ liệu cơ bản
                if (!maSV || !hoLot || !ten) {
                    console.log(`⚠️  Row ${rowIndex}: Missing basic data - maSV: ${maSV}, hoLot: ${hoLot}, ten: ${ten}`);
                    skippedStudents.push({
                        row: rowIndex,
                        reason: 'Thiếu thông tin cơ bản (mã SV, họ lót, tên)',
                        data: { maSV, hoLot, ten }
                    });
                    continue;
                }

                // Tạo thông tin sinh viên
                name = `${hoLot} ${ten}`.trim(); // Kết hợp họ lót và tên
                email = `${maSV}@st.tvu.edu.vn`; // Email từ mã SV
                const password = maSV; // Password là mã SV

                // Kiểm tra email đã tồn tại chưa
                const existingUser = await User.findOne({ where: { email } });
                if (existingUser) {
                    console.log(`⚠️  Row ${rowIndex}: Email already exists - ${email}`);
                    skippedStudents.push({
                        row: rowIndex,
                        email,
                        reason: 'Email đã tồn tại',
                        data: { maSV, name, email }
                    });
                    continue;
                }

                // Tạo sinh viên mới
                console.log(`👤 Creating student:`, { 
                    name, 
                    email, 
                    password: maSV,
                    role_id: studentRole.role_id,
                    maSV_original: cells[1]
                });
                
                // Đảm bảo không có user_id trong object create
                const createData = {
                    name,
                    email,
                    password, // Mật khẩu là Mã SV, sẽ được mã hóa bởi hook
                    role_id: studentRole.role_id,
                    // Thêm giá trị mặc định cho các trường gamification
                    total_points: 0,
                    current_level: 1,
                    experience_points: 0,
                    gamification_stats: {
                        total_quizzes_completed: 0,
                        total_correct_answers: 0,
                        total_questions_answered: 0,
                        average_response_time: 0,
                        best_streak: 0,
                        current_streak: 0,
                        speed_bonus_earned: 0,
                        perfect_scores: 0
                    }
                };
                
                console.log(`📝 Create data:`, createData);
                
                try {
                    const student = await User.create(createData, { transaction });

                    console.log(`✅ Created student ${student.user_id}: ${student.name}`);

                    createdStudents.push({
                        user_id: student.user_id,
                        name: student.name,
                        email: student.email,
                        role: 'student',
                    });
                } catch (createError) {
                    console.log(`💥 Create User Error:`, {
                        error: createError.message,
                        name: createError.name,
                        errors: createError.errors,
                        sql: createError.sql,
                        data: { name, email, role_id: studentRole.role_id }
                    });
                    
                    // Auto-fix sequence nếu gặp unique constraint error trên user_id
                    if (createError.name === 'SequelizeUniqueConstraintError' && 
                        createError.errors[0]?.path === 'user_id') {
                        try {
                            console.log('🔧 Attempting to fix sequence...');
                            await sequelize.query('SELECT setval(\'"Users_user_id_seq"\', (SELECT MAX(user_id) + 1 FROM "Users"))', { transaction });
                            console.log('✅ Sequence fixed, retrying...');
                            
                            // Retry tạo user
                            const student = await User.create(createData, { transaction });
                            console.log(`✅ Created student ${student.user_id}: ${student.name}`);
                            
                            createdStudents.push({
                                user_id: student.user_id,
                                name: student.name,
                                email: student.email,
                                role: 'student',
                            });
                            continue;
                        } catch (fixError) {
                            console.log('❌ Failed to auto-fix sequence:', fixError.message);
                        }
                    }
                    
                    skippedStudents.push({
                        row: rowIndex,
                        email,
                        reason: `Lỗi tạo user: ${createError.message}`,
                        data: { maSV, name, email }
                    });
                    continue;
                }
                
            } catch (rowError) {
                console.log(`❌ Error processing row ${rowIndex}:`, rowError.message);
                skippedStudents.push({
                    row: rowIndex,
                    reason: `Lỗi xử lý: ${rowError.message}`,
                    data: { maSV, hoLot, ten, name, email }
                });
            }
        }

        console.log('🎉 Import completed:', {
            created: createdStudents.length,
            skipped: skippedStudents.length
        });

        // ===== STEP 6: ENROLL STUDENTS =====
        let enrollmentResult = null;
        
        if (createdStudents.length > 0) {
            console.log('📋 Step 6: Enroll students into course...');
            
            const userIds = createdStudents.map(s => s.user_id);

            // Kiểm tra sinh viên nào đã đăng ký khóa học này
            const existingEnrollments = await StudentCourse.findAll({
                where: {
                    user_id: userIds,
                    course_id: course_id
                },
                attributes: ['user_id'],
                transaction
            });

            const alreadyEnrolledIds = existingEnrollments.map(e => e.user_id);
            const newEnrollmentIds = userIds.filter(id => !alreadyEnrolledIds.includes(id));

            console.log(`📊 Enrollment status:`, {
                total_imported: userIds.length,
                already_enrolled: alreadyEnrolledIds.length,
                need_enrollment: newEnrollmentIds.length
            });

            if (newEnrollmentIds.length > 0) {
                // Tạo đăng ký mới
                const enrollmentData = newEnrollmentIds.map(userId => ({
                    user_id: userId,
                    course_id: course_id,
                    enrollment_date: new Date()
                }));

                const newEnrollments = await StudentCourse.bulkCreate(enrollmentData, {
                    transaction,
                    returning: true
                });

                console.log(`✅ Successfully enrolled ${newEnrollments.length} students`);

                enrollmentResult = {
                    course_id: parseInt(course_id),
                    course_name: course.name,
                    total_students_imported: createdStudents.length,
                    successful_enrollments: newEnrollments.length,
                    already_enrolled: alreadyEnrolledIds.length,
                    new_enrollments: newEnrollments.map(e => ({
                        enrollment_id: e.enrollment_id,
                        user_id: e.user_id,
                        student_name: createdStudents.find(s => s.user_id === e.user_id)?.name
                    })),
                    already_enrolled_ids: alreadyEnrolledIds
                };
            } else {
                enrollmentResult = {
                    course_id: parseInt(course_id),
                    course_name: course.name,
                    total_students_imported: createdStudents.length,
                    successful_enrollments: 0,
                    already_enrolled: alreadyEnrolledIds.length,
                    message: 'Tất cả sinh viên đã được đăng ký khóa học này trước đó'
                };
            }

            console.log('🎯 Enrollment completed:', enrollmentResult);
        } else {
            console.log('⚠️  No students imported, skipping enrollment');
        }

        await transaction.commit();

        // Trả về kết quả
        res.status(200).json({
            success: true,
            message: 'Import và enroll sinh viên thành công',
            import_result: {
                created: createdStudents,
                skipped: skippedStudents,
            },
            enrollment_result: enrollmentResult
        });
        
    } catch (error) {
        await transaction.rollback();
        console.log('💥 Fatal error in importAndEnrollStudents:', error);
        res.status(500).json({ 
            success: false,
            error: 'Lỗi khi import và enroll sinh viên', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        // ===== STEP 7: CLEANUP =====
        console.log('📋 Step 7: Cleanup...');
        if (req.file && req.file.path) {
            try {
                const fs = require('fs');
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                    console.log('✅ Uploaded file cleaned up');
                }
            } catch (cleanupError) {
                console.log('⚠️  Failed to cleanup file:', cleanupError.message);
            }
        }
    }
};





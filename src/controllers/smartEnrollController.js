const { User, Role, Course, StudentCourse, sequelize } = require('../models');
const XLSX = require('xlsx');
const { Op } = require('sequelize');

// ===== SMART IMPORT & ENROLL - VERSION 4.0 =====
// Nếu sinh viên đã tồn tại trong DB thì chỉ enroll, không tạo mới
exports.smartImportAndEnrollStudents = async (req, res) => {
    console.log('🚀 Starting smartImportAndEnrollStudents V4.0...');
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
            transaction
        });
        
        if (!studentRole) {
            console.log('❌ Student role not found');
            await transaction.rollback();
            return res.status(404).json({
                error: 'Role "student" không tồn tại trong hệ thống'
            });
        }

        // ===== STEP 3: READ EXCEL FILE =====
        console.log('📋 Step 3: Read Excel file...');
        
        const workbook = XLSX.readFile(req.file.path);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('✅ Worksheet processed:', {
            sheetName: workbook.SheetNames[0],
            totalRows: rows.length,
            sampleRows: rows.slice(0, 3)
        });

        // ===== STEP 4: FIND DATA START ROW =====
        console.log('📋 Step 4: Finding data start row...');
        
        let dataStartRow = 0; // assume first row unless detected differently

        // Heuristic header detection across first 20 rows
        const headerKeywordsSets = [
            ['mã', 'sv'],
            ['mã', 'sinh', 'viên'],
            ['username', 'email', 'password'],
            ['student_code']
        ];

        let detectedHeaderIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;
            const lowerCells = row.map(c => c ? c.toString().trim().toLowerCase() : '');
            const joined = lowerCells.join(' ');
            const matched = headerKeywordsSets.some(set => set.every(k => joined.includes(k)));
            if (matched) {
                detectedHeaderIndex = i;
                break;
            }
        }

        if (detectedHeaderIndex >= 0) {
            dataStartRow = detectedHeaderIndex + 1;
            console.log('✅ Detected header row at:', detectedHeaderIndex + 1);
        } else {
            // fallback: if first row has >3 textual columns treat it as header
            if (rows.length > 0 && Array.isArray(rows[0]) && rows[0].filter(c => !!c).length >= 3) {
                dataStartRow = 1;
                console.log('⚠️  Heuristic: using first row as header, data from row 2');
            } else {
                dataStartRow = 11; // legacy fallback
                console.log('⚠️  Fallback to legacy default row 12');
            }
        }

        console.log('📍 Data starts from row (1-based):', dataStartRow + 1);

        const processedStudents = [];
        const skippedStudents = [];
        const existingStudents = [];
        const newStudents = [];

        // ===== STEP 5: PROCESS STUDENTS (SMART MODE) =====
        console.log('📋 Step 5: Process students (smart mode)...');
        
        for (let i = dataStartRow; i < rows.length; i++) {
            const cells = rows[i];
            const rowIndex = i + 1;
            
            let maSV = '';
            let hoLot = '';
            let ten = '';
            let name = '';
            let email = '';
            
            try {
                // Kiểm tra cells có tồn tại không
                if (!cells || !Array.isArray(cells)) {
                    console.log(`⏭️  Skipping empty row ${rowIndex}`);
                    continue;
                }

                // Flexible column extraction: support two formats
                // Format A (original): index 1=Mã SV, 2=Họ lót, 3=Tên
                // Format B (CSV sample): 0=username,1=email,2=password,3=full_name,4=student_code
                if (cells.length >= 5 && /@/.test(String(cells[1]||''))) {
                    // Likely Format B
                    maSV = cells[4] ? String(cells[4]).trim() : (cells[0] ? String(cells[0]).trim() : '');
                    const fullName = cells[3] ? String(cells[3]).trim() : '';
                    if (fullName.includes(' ')) {
                        const parts = fullName.split(/\s+/);
                        ten = parts.pop();
                        hoLot = parts.join(' ');
                    } else {
                        ten = fullName;
                        hoLot = '';
                    }
                } else {
                    // Fallback Format A
                    maSV = cells[1] ? String(cells[1]).trim() : ''; 
                    hoLot = cells[2] ? String(cells[2]).trim() : ''; 
                    ten = cells[3] ? String(cells[3]).trim() : ''; 
                }
                
                console.log(`🔍 Processing row ${rowIndex}:`, { 
                    maSV, hoLot, ten
                });
                
                // Kiểm tra dữ liệu cơ bản
                if (!maSV || !hoLot || !ten) {
                    console.log(`⚠️  Row ${rowIndex}: Missing basic data`);
                    skippedStudents.push({
                        row: rowIndex,
                        reason: 'Thiếu thông tin cơ bản (mã SV, họ lót, tên)',
                        data: { maSV, hoLot, ten }
                    });
                    continue;
                }

                // Tạo thông tin sinh viên
                name = `${hoLot} ${ten}`.trim();
                email = `${maSV}@st.tvu.edu.vn`;
                const password = maSV;

                // ===== KIỂM TRA USER ĐÃ TỒN TẠI CHƯA =====
                const existingUser = await User.findOne({ 
                    where: { email },
                    transaction 
                });
                
                if (existingUser) {
                    console.log(`✅ Row ${rowIndex}: User exists - ${email}, will be enrolled`);
                    
                    existingStudents.push({
                        user_id: existingUser.user_id,
                        name: existingUser.name,
                        email: existingUser.email,
                        ma_sv: maSV,
                        action: 'enroll_existing'
                    });
                    
                    processedStudents.push({
                        user_id: existingUser.user_id,
                        name: existingUser.name,
                        email: existingUser.email,
                        role: 'student',
                        is_existing: true
                    });
                    
                    continue; // Không tạo mới, chỉ enroll
                }

                // ===== TẠO USER MỚI =====
                console.log(`👤 Creating new student:`, { name, email });
                
                const createData = {
                    name,
                    email,
                    password,
                    role_id: studentRole.role_id,
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
                
                try {
                    const student = await User.create(createData, { transaction });

                    console.log(`✅ Created student ${student.user_id}: ${student.name}`);

                    newStudents.push({
                        user_id: student.user_id,
                        name: student.name,
                        email: student.email,
                        ma_sv: maSV,
                        action: 'created_new'
                    });
                    
                    processedStudents.push({
                        user_id: student.user_id,
                        name: student.name,
                        email: student.email,
                        role: 'student',
                        is_existing: false
                    });
                    
                } catch (createError) {
                    console.log(`💥 Create User Error:`, createError.message);
                    
                    // Auto-fix sequence nếu cần
                    if (createError.name === 'SequelizeUniqueConstraintError' && 
                        createError.errors[0]?.path === 'user_id') {
                        try {
                            console.log('🔧 Attempting to fix sequence...');
                            await sequelize.query('SELECT setval(\'"Users_user_id_seq"\', (SELECT MAX(user_id) + 1 FROM "Users"))', { transaction });
                            console.log('✅ Sequence fixed, retrying...');
                            
                            const student = await User.create(createData, { transaction });
                            console.log(`✅ Created student ${student.user_id}: ${student.name}`);
                            
                            newStudents.push({
                                user_id: student.user_id,
                                name: student.name,
                                email: student.email,
                                ma_sv: maSV,
                                action: 'created_new'
                            });
                            
                            processedStudents.push({
                                user_id: student.user_id,
                                name: student.name,
                                email: student.email,
                                role: 'student',
                                is_existing: false
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

        console.log('🎉 Student processing completed:', {
            existing: existingStudents.length,
            new: newStudents.length,
            skipped: skippedStudents.length,
            total_to_enroll: processedStudents.length
        });

        // ===== STEP 6: ENROLL STUDENTS =====
        let enrollmentResult = null;
        
        if (processedStudents.length > 0) {
            console.log('📋 Step 6: Enroll students into course...');
            
            const userIds = processedStudents.map(s => s.user_id);

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
                total_processed: userIds.length,
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
                    successful_enrollments: newEnrollments.length,
                    already_enrolled: alreadyEnrolledIds.length,
                    existing_students_processed: existingStudents.length,
                    new_students_created: newStudents.length,
                    new_enrollments: newEnrollments.map(e => {
                        const student = processedStudents.find(s => s.user_id === e.user_id);
                        return {
                            enrollment_id: e.enrollment_id,
                            user_id: e.user_id,
                            student_name: student?.name || 'Unknown'
                        };
                    })
                };
            } else {
                enrollmentResult = {
                    course_id: parseInt(course_id),
                    course_name: course.name,
                    successful_enrollments: 0,
                    already_enrolled: alreadyEnrolledIds.length,
                    existing_students_processed: existingStudents.length,
                    new_students_created: newStudents.length,
                    message: 'Tất cả sinh viên đã được đăng ký khóa học này'
                };
            }
        } else {
            enrollmentResult = {
                course_id: parseInt(course_id),
                course_name: course.name,
                message: 'Không có sinh viên nào để enroll'
            };
        }

        // ===== STEP 7: COMMIT TRANSACTION =====
        await transaction.commit();
        console.log('✅ Transaction committed successfully');

        // ===== RETURN RESULTS =====
        const response = {
            message: 'Smart import và enrollment hoàn thành',
            processing_summary: {
                existing_users_enrolled: existingStudents.length,
                new_users_created: newStudents.length,
                skipped_rows: skippedStudents.length,
                total_processed: processedStudents.length
            },
            existing_students: existingStudents,
            new_students: newStudents,
            skipped_students: skippedStudents,
            enrollment_result: enrollmentResult
        };

        console.log('🎊 Smart Import & Enroll completed successfully!');
        return res.json(response);

    } catch (error) {
        console.log('💥 Fatal error in smartImportAndEnrollStudents:', error);
        await transaction.rollback();
        return res.status(500).json({
            error: 'Lỗi server trong quá trình import và enroll',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

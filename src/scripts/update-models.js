const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

// Đọc tất cả các file trong thư mục models
fs.readdirSync(modelsDir)
    .filter(file => {
        return (
            file.indexOf('.') !== 0 &&
            file !== 'index.js' &&
            file.slice(-3) === '.js'
        );
    })
    .forEach(file => {
        const filePath = path.join(modelsDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // Tìm và thay thế cấu hình primary key
        const primaryKeyRegex = /(\w+_id):\s*{\s*type:\s*DataTypes\.INTEGER,\s*primaryKey:\s*true,\s*autoIncrement:\s*true,?\s*}/g;

        if (primaryKeyRegex.test(content)) {
            content = content.replace(primaryKeyRegex, (match, idName) => {
                return `${idName}: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                autoIncrementIdentity: true
            }`;
            });

            // Ghi lại nội dung đã cập nhật
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    });

console.log('All models have been updated successfully!'); 
'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';

// Cấu hình Sequelize từ biến môi trường
const config = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: false,
  timezone: '+07:00', // Sử dụng timezone offset thay vì tên timezone
  define: {
    timestamps: false,
    underscored: true,
    freezeTableName: true,
    autoIncrementIdentity: true
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

const db = {};

let sequelize;
sequelize = new Sequelize(config.database, config.username, config.password, config);

fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1 &&
      file.indexOf('.bak') === -1
    );
  })
  .forEach(file => {
    try {
      const modelModule = require(path.join(__dirname, file));
      if (typeof modelModule !== 'function') {
        console.warn(`Warning: Model file ${file} does not export a function`);
        return;
      }
      const model = modelModule(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    } catch (error) {
      console.error(`Error loading model from file ${file}:`, error.message);
      throw error;
    }
  });

const QuizSession = require('./quiz_session')(sequelize);
const ChapterSection = require('./chapter_section')(sequelize, Sequelize.DataTypes);

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.QuizSession = QuizSession;
db.ChapterSection = ChapterSection;
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
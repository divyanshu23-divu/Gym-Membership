const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'ironpulse_super_secure_jwt_secret_college_mini_project_2026',
  JWT_EXPIRES_IN: '7d',
  DB_PATH: path.join(__dirname, '..', '..', 'database', 'ironpulse.db')
};

const { testConnection: testDbConnection } = require('../config/database');
const { testRedisConnection } = require('../config/redis');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const getHealthStatus = asyncHandler(async (req, res) => {
  const [dbStatus, redisStatus] = await Promise.all([
    testDbConnection(),
    testRedisConnection()
  ]);

  return successResponse(
    res,
    'WaChat AI Backend API is running',
    {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        server: 'UP',
        database: dbStatus ? 'CONNECTED' : 'DISCONNECTED',
        redis: redisStatus ? 'CONNECTED' : 'DISCONNECTED'
      },
      environment: process.env.NODE_ENV || 'development'
    },
    200
  );
});

module.exports = {
  getHealthStatus
};

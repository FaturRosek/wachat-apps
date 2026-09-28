const Redis = require('ioredis');
require('dotenv').config();

function sanitizeRedisUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  const match = str.match(/rediss?:\/\/[^\s"'`)]+/i);
  return match ? match[0] : str.replace(/^["']|["']$/g, '');
}

const rawRedisUrl = sanitizeRedisUrl(process.env.REDIS_URL);

const redisConfig = rawRedisUrl
  ? {
      url: rawRedisUrl,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 3) return null;
        const delay = Math.min(times * 100, 1000);
        return delay;
      }
    }
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 3) return null;
        const delay = Math.min(times * 100, 1000);
        return delay;
      }
    };

const createRedisConnection = () => {
  let client;
  if (redisConfig.url) {
    client = new Redis(redisConfig.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      }
    });
  } else {
    client = new Redis(redisConfig);
  }

  client.on('connect', () => {
    console.log('[Redis] Connection established');
  });

  client.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
      console.warn(`[Redis Warning] ${err.message}`);
    }
  });

  return client;
};

const testRedisConnection = async () => {
  let client;
  try {
    const opts = redisConfig.url
      ? redisConfig.url
      : {
          ...redisConfig,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          connectTimeout: 1500,
          lazyConnect: true
        };
    client = typeof opts === 'string'
      ? new Redis(opts, { lazyConnect: true, retryStrategy: () => null })
      : new Redis(opts);

    client.on('error', () => {});

    await client.connect();
    const ping = await client.ping();
    await client.quit();
    console.log(`[Redis] Connection test succeeded: PING -> ${ping}`);
    return true;
  } catch (error) {
    if (client) {
      try { client.disconnect(); } catch (e) {}
    }
    console.log(`[Redis Info] Redis is offline (optional service): ${error.message}`);
    return false;
  }
};

module.exports = {
  redisConfig,
  createRedisConnection,
  testRedisConnection
};

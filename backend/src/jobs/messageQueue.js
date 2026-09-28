const { Queue, Worker } = require('bullmq');
const { redisConfig } = require('../config/redis');

const QUEUE_NAME = 'whatsapp-dispatch-queue';
let dispatchQueue = null;
let dispatchWorker = null;
let isRedisActive = false;

try {
  const connection = redisConfig.url
    ? { url: redisConfig.url }
    : {
        host: redisConfig.host || '127.0.0.1',
        port: redisConfig.port || 6379,
        password: redisConfig.password || undefined,
        maxRetriesPerRequest: null
      };

  dispatchQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  });

  dispatchQueue.client.then(() => {
    isRedisActive = true;
  }).catch(() => {
    isRedisActive = false;
  });

  dispatchWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await executeDispatchTask(job.data);
    },
    { connection, concurrency: 2 }
  );

  dispatchWorker.on('completed', () => {});
  dispatchWorker.on('failed', () => {});
} catch (err) {
  isRedisActive = false;
}

async function executeDispatchTask(data) {
  const {
    jobId,
    userId,
    adminPhone,
    targetPhone,
    messages = [],
    intervalSeconds = 5,
    sessionName = 'default'
  } = data;

  const whatsappService = require('../services/whatsappService');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const textMsg = messages[i];

    try {
      await whatsappService.sendDirectMessage(
        targetPhone,
        textMsg,
        sessionName,
        userId
      );
      successCount++;
    } catch (err) {
      failCount++;
    }

    if (i < messages.length - 1) {
      const waitMs = Math.max(intervalSeconds, 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (adminPhone) {
    const reportText = `✅ *Laporan Pengiriman Selesai*\n\n` +
      `• Target: *${targetPhone}*\n` +
      `• Total Terkirim: *${successCount} / ${messages.length}*\n` +
      (failCount > 0 ? `• Gagal: *${failCount}*\n` : '') +
      `• Waktu: _${new Date().toLocaleTimeString('id-ID')}_\n\n` +
      `Semua pesan telah selesai diproses oleh Bot.`;

    try {
      await whatsappService.sendDirectMessage(adminPhone, reportText, sessionName, userId);
    } catch (adminReportErr) {}
  }
}

async function enqueueDispatch(data) {
  if (isRedisActive && dispatchQueue) {
    try {
      const job = await dispatchQueue.add('dispatch-job', data);
      return { type: 'BULLMQ', jobId: job.id };
    } catch (err) {}
  }

  setImmediate(() => {
    executeDispatchTask(data).catch(() => {});
  });

  return { type: 'IN_MEMORY', jobId: data.jobId || 'mem_' + Date.now() };
}

module.exports = {
  dispatchQueue,
  enqueueDispatch,
  executeDispatchTask
};

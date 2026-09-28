const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan dari IP ini. Silakan coba lagi setelah 1 menit.'
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak percobaan autentikasi. Silakan tunggu 15 menit sebelum mencoba lagi.'
  }
});

const pairingCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan pairing code WhatsApp. Silakan tunggu 15 menit.'
  }
});

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Batas frekuensi pengiriman pesan tercapai. Silakan jeda beberapa saat.'
  }
});

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Batas frekuensi pemanggilan fitur AI tercapai. Silakan coba sesaat lagi.'
  }
});

module.exports = {
  globalLimiter,
  authLimiter,
  pairingCodeLimiter,
  messageLimiter,
  aiLimiter
};

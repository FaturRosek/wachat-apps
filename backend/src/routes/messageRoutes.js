const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');
const { messageLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { sendOutboundMessageSchema } = require('../schemas/chatSchemas');

router.use(authMiddleware);

router.post('/', messageLimiter, validate(sendOutboundMessageSchema), MessageController.sendMessage);

module.exports = router;

const express = require('express');
const router = express.Router();
const WhatsappController = require('../controllers/whatsappController');
const authMiddleware = require('../middleware/authMiddleware');
const { pairingCodeLimiter, messageLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { pairingCodeSchema, sendTestMessageSchema } = require('../schemas/whatsappSchemas');

router.use(authMiddleware);

router.post('/connect', WhatsappController.startSession);
router.post('/pair-code', pairingCodeLimiter, validate(pairingCodeSchema), WhatsappController.requestPairingCode);
router.get('/status', WhatsappController.getStatus);
router.get('/groups', WhatsappController.getGroups);
router.post('/disconnect', WhatsappController.disconnect);
router.post('/send-test', messageLimiter, validate(sendTestMessageSchema), WhatsappController.sendTestMessage);

module.exports = router;

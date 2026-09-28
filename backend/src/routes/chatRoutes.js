const express = require('express');
const router = express.Router();
const multer = require('multer');
const ChatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');
const { messageLimiter, aiLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  sendChatMessageSchema,
  aiRewriteSchema,
  aiComposeSchema,
  aiVariationsSchema,
  aiContextSchema,
  aiSettingUpdateSchema,
  toggleAutoReplySchema,
  editChatMessageSchema,
  deleteForEveryoneSchema,
  deleteForMeSchema,
  togglePinSchema,
  toggleArchiveSchema
} = require('../schemas/chatSchemas');

const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }
});

router.use(authMiddleware);

router.get('/', ChatController.getChats);
router.post('/sync', ChatController.syncChats);
router.get('/logs/calls', ChatController.getCallLogs);
router.get('/view-once-media', ChatController.getViewOnceMedia);

router.post('/pin', validate(togglePinSchema), ChatController.togglePin);
router.post('/archive', validate(toggleArchiveSchema), ChatController.toggleArchive);

router.post('/send', messageLimiter, validate(sendChatMessageSchema), ChatController.sendMessage);
router.post('/send-media', messageLimiter, upload.single('file'), ChatController.sendMedia);
router.post('/send-voice', messageLimiter, upload.single('audio'), ChatController.sendVoiceNote);
router.post('/messages/edit', messageLimiter, validate(editChatMessageSchema), ChatController.editMessage);
router.post('/messages/delete-for-everyone', messageLimiter, validate(deleteForEveryoneSchema), ChatController.deleteForEveryone);
router.post('/messages/delete-for-me', messageLimiter, validate(deleteForMeSchema), ChatController.deleteForMe);

router.post('/ai/smart-suggestions', aiLimiter, validate(aiContextSchema), ChatController.getSmartSuggestions);
router.post('/ai/summarize', aiLimiter, validate(aiContextSchema), ChatController.summarizeChat);
router.post('/ai/rewrite', aiLimiter, validate(aiRewriteSchema), ChatController.rewriteMessage);
router.post('/ai/compose', aiLimiter, validate(aiComposeSchema), ChatController.composeMessage);
router.post('/ai/variations', aiLimiter, validate(aiVariationsSchema), ChatController.generateVariations);

router.get('/:jid/messages', ChatController.getChatMessages);
router.get('/:jid/ai-setting', ChatController.getAiSetting);
router.put('/:jid/ai-setting', validate(aiSettingUpdateSchema), ChatController.updateAiSetting);
router.patch('/:jid/toggle-auto-reply', validate(toggleAutoReplySchema), ChatController.toggleAutoReply);

module.exports = router;

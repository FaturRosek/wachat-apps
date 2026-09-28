const express = require('express');
const router = express.Router();
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const whatsappRoutes = require('./whatsappRoutes');
const messageRoutes = require('./messageRoutes');
const contactRoutes = require('./contactRoutes');
const chatRoutes = require('./chatRoutes');

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/chats', chatRoutes);
router.use('/messages', messageRoutes);
router.use('/contacts', contactRoutes);

router.get('/', (req, res) => {
  res.json({
    name: 'WaChat AI API',
    version: '1.0.0',
    status: 'online'
  });
});

module.exports = router;

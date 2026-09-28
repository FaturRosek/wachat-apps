const WhatsappService = require('../services/whatsappService');
const { formatPhoneNumber } = require('../utils/phoneValidator');
const { enqueueDispatch } = require('../jobs/messageQueue');

const MessageController = {
  async sendMessage(req, res, next) {
    try {
      const {
        phone,
        message,
        messages: customMessages,
        contactName,
        sessionName = 'default',
        repeatCount = 1,
        intervalSeconds = 5,
        useAiVariation = false
      } = req.body;

      if (!phone || (!message && (!customMessages || customMessages.length === 0))) {
        return res.status(400).json({
          success: false,
          message: 'Nomor/grup tujuan dan isi pesan wajib diisi'
        });
      }

      const count = parseInt(repeatCount, 10) || 1;
      const interval = Math.max(parseInt(intervalSeconds, 10) || 5, 1);
      const isGroup = typeof phone === 'string' && (phone.endsWith('@g.us') || phone.endsWith('@lid'));
      let cleanPhone = phone;

      if (!isGroup) {
        const phoneCheck = formatPhoneNumber(phone);
        if (!phoneCheck.isValid) {
          return res.status(400).json({
            success: false,
            message: phoneCheck.error || 'Format nomor telepon tidak valid'
          });
        }
        cleanPhone = phoneCheck.formattedPhone;
      }

      const primaryMessage = (Array.isArray(customMessages) && customMessages[0]) ? customMessages[0] : (message || '').trim();

      if (count <= 1 && !useAiVariation && (!customMessages || customMessages.length <= 1)) {
        const result = await WhatsappService.sendTextMessage(req.user.id, {
          toPhone: cleanPhone,
          messageText: primaryMessage,
          contactName,
          sessionName
        });

        return res.status(200).json({
          success: true,
          message: 'Pesan berhasil dikirim!',
          data: result
        });
      }

      let messageList = [];

      if (Array.isArray(customMessages) && customMessages.length > 0) {
        messageList = customMessages.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean);
      }

      if (messageList.length === 0 && useAiVariation) {
        try {
          const aiService = require('../services/aiService');
          const variations = await aiService.generateVariations(primaryMessage, count);
          if (Array.isArray(variations) && variations.length > 0) {
            messageList = variations;
          }
        } catch (e) {}
      }

      if (messageList.length === 0) {
        messageList = Array(count).fill(primaryMessage);
      }

      const dispatchJobId = 'job_' + Date.now();

      await enqueueDispatch({
        jobId: dispatchJobId,
        userId: req.user.id,
        targetPhone: cleanPhone,
        messages: messageList,
        intervalSeconds: interval,
        sessionName
      });

      const targetLabel = isGroup ? (contactName ? `Grup "${contactName}"` : 'Grup WhatsApp') : `+${cleanPhone}`;

      res.status(200).json({
        success: true,
        message: `Memulai pengiriman berulang sebanyak ${count}x ke ${targetLabel} dengan jeda ${interval} detik per pesan! 🚀`,
        data: {
          jobId: dispatchJobId,
          repeatCount: count,
          intervalSeconds: interval,
          targetPhone: cleanPhone,
          messages: messageList
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = MessageController;

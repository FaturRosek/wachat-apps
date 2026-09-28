const ContactModel = require('../models/contactModel');
const MessageModel = require('../models/messageModel');
const ChatAiSettingModel = require('../models/chatAiSettingModel');
const CallLogModel = require('../models/callLogModel');
const WhatsappSessionModel = require('../models/whatsappSessionModel');
const WhatsappService = require('../services/whatsappService');
const aiService = require('../services/aiService');
const { sanitizeJid } = require('../utils/phoneValidator');

const ChatController = {
  async getChats(req, res, next) {
    try {
      const { search = '', filter = 'all' } = req.query;
      const chats = await ContactModel.getChatsList(req.user.id, { search, filter });
      
      res.status(200).json({
        success: true,
        data: chats
      });
    } catch (error) {
      next(error);
    }
  },

  async getChatMessages(req, res, next) {
    try {
      const { jid: rawJid } = req.params;
      const jid = sanitizeJid(rawJid) || rawJid;
      const { limit = 100, offset = 0 } = req.query;

      await ContactModel.resetUnread(req.user.id, jid);

      const messages = await MessageModel.getByChatJid(
        req.user.id,
        jid,
        parseInt(limit, 10),
        parseInt(offset, 10)
      );

      const contact = await ContactModel.findByJid(req.user.id, jid);
      const aiSetting = await ChatAiSettingModel.getByJid(req.user.id, jid);

      if (contact && !contact.avatar_url) {
        WhatsappService.fetchProfilePicture(req.user.id, 'default', jid).catch(() => {});
      }

      if (Array.isArray(messages)) {
        for (const m of messages) {
          if ((m.media_type === 'view_once' || m.raw_data?.isViewOnce) && !m.media_url && m.message_id) {
            WhatsappService.requestMissingMedia(req.user.id, 'default', m.message_id, m.remote_jid || jid).catch(() => {});
          }
        }
      }

      res.status(200).json({
        success: true,
        data: {
          jid,
          contact,
          aiSetting,
          messages
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async sendMessage(req, res, next) {
    try {
      const { jid, message, quotedMessageId = null, sessionName = 'default' } = req.body;

      if (!jid || !message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'JID penerima dan isi pesan wajib diisi'
        });
      }

      const result = await WhatsappService.sendChatMessage(req.user.id, {
        jid,
        text: message,
        quotedMessageId,
        sessionName
      });

      res.status(200).json({
        success: true,
        message: 'Pesan terkirim!',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async sendVoiceNote(req, res, next) {
    try {
      const { jid, quotedMessageId = null, sessionName = 'default' } = req.body;
      const file = req.file;

      if (!jid || !file) {
        return res.status(400).json({
          success: false,
          message: 'JID penerima dan file rekaman audio wajib disertakan'
        });
      }

      const result = await WhatsappService.sendVoiceNote(req.user.id, {
        jid,
        audioBuffer: file.buffer,
        mimetype: file.mimetype || 'audio/ogg; codecs=opus',
        quotedMessageId,
        sessionName
      });

      res.status(200).json({
        success: true,
        message: 'Voice Note berhasil dikirim!',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async sendMedia(req, res, next) {
    try {
      const { jid, caption = '', isViewOnce = false, quotedMessageId = null, sessionName = 'default' } = req.body;
      const file = req.file;

      if (!jid || !file) {
        return res.status(400).json({
          success: false,
          message: 'JID penerima dan file lampiran wajib disertakan'
        });
      }

      const result = await WhatsappService.sendMediaMessage(req.user.id, {
        jid,
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        caption,
        isViewOnce: isViewOnce === 'true' || isViewOnce === true || isViewOnce === 1,
        quotedMessageId,
        sessionName
      });

      res.status(200).json({
        success: true,
        message: 'File berhasil dikirim!',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async editMessage(req, res, next) {
    try {
      const { jid, messageId, newText, sessionName = 'default' } = req.body;

      const result = await WhatsappService.editChatMessage(req.user.id, {
        jid,
        messageId,
        newText,
        sessionName
      });

      res.status(200).json({
        success: true,
        message: 'Pesan berhasil diedit',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteForEveryone(req, res, next) {
    try {
      const { jid, messageId, sessionName = 'default' } = req.body;

      const result = await WhatsappService.deleteMessageForEveryone(req.user.id, {
        jid,
        messageId,
        sessionName
      });

      res.status(200).json({
        success: true,
        message: 'Pesan berhasil ditarik untuk semua orang',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteForMe(req, res, next) {
    try {
      const { messageId } = req.body;

      const result = await WhatsappService.deleteMessageForMe(req.user.id, {
        messageId
      });

      res.status(200).json({
        success: true,
        message: 'Pesan berhasil dihapus untuk Anda',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async togglePin(req, res, next) {
    try {
      const { jid: rawJid, pinned } = req.body;
      const jid = sanitizeJid(rawJid) || rawJid;
      await WhatsappService.modifyChatPin(req.user.id, { jid, pinned });
      const contact = await ContactModel.togglePin(req.user.id, jid, pinned);
      
      const socketService = require('../services/socketService');
      socketService.emitToUser(req.user.id, 'chats_updated', {});

      res.status(200).json({
        success: true,
        message: pinned ? 'Chat disematkan' : 'Sematkan chat dilepas',
        data: contact
      });
    } catch (error) {
      next(error);
    }
  },

  async toggleArchive(req, res, next) {
    try {
      const { jid: rawJid, archived } = req.body;
      const jid = sanitizeJid(rawJid) || rawJid;
      await WhatsappService.modifyChatArchive(req.user.id, { jid, archived });
      const contact = await ContactModel.toggleArchive(req.user.id, jid, archived);
      
      const socketService = require('../services/socketService');
      socketService.emitToUser(req.user.id, 'chats_updated', {});

      res.status(200).json({
        success: true,
        message: archived ? 'Chat diarsipkan' : 'Chat dikeluarkan dari arsip',
        data: contact
      });
    } catch (error) {
      next(error);
    }
  },

  async getSmartSuggestions(req, res, next) {
    try {
      const { jid } = req.body;
      if (!jid) {
        return res.status(400).json({ success: false, message: 'JID diperlukan' });
      }

      const chatHistory = await MessageModel.getRecentChatContext(req.user.id, jid, 8);
      const lastMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].content : '';

      const suggestions = await aiService.generateSmartReplies(chatHistory, lastMsg);

      res.status(200).json({
        success: true,
        data: { suggestions }
      });
    } catch (error) {
      next(error);
    }
  },

  async summarizeChat(req, res, next) {
    try {
      const { jid } = req.body;
      if (!jid) {
        return res.status(400).json({ success: false, message: 'JID diperlukan' });
      }

      const chatHistory = await MessageModel.getRecentChatContext(req.user.id, jid, 25);
      const summary = await aiService.summarizeChat(chatHistory);

      res.status(200).json({
        success: true,
        data: { summary }
      });
    } catch (error) {
      next(error);
    }
  },

  async rewriteMessage(req, res, next) {
    try {
      const { text, tone = 'friendly' } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, message: 'Teks pesan diperlukan' });
      }

      const rewritten = await aiService.rewriteMessage(text, tone);

      res.status(200).json({
        success: true,
        data: { rewritten }
      });
    } catch (error) {
      next(error);
    }
  },

  async composeMessage(req, res, next) {
    try {
      const { prompt, tone = 'friendly', recipientName = '', customInstruction = '' } = req.body;
      if (!prompt || prompt.trim() === '') {
        return res.status(400).json({ success: false, message: 'Prompt atau draf pesan diperlukan' });
      }

      const generatedText = await aiService.composeMessage({
        prompt,
        tone,
        recipientName,
        customInstruction
      });

      res.status(200).json({
        success: true,
        data: {
          generatedText,
          prompt,
          tone
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async generateVariations(req, res, next) {
    try {
      const { message, count = 1, tone = 'friendly', recipientName = '' } = req.body;
      if (!message || message.trim() === '') {
        return res.status(400).json({ success: false, message: 'Isi pesan diperlukan' });
      }

      const totalCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 20);
      const variations = await aiService.generateVariations(message.trim(), totalCount, tone, recipientName);

      res.status(200).json({
        success: true,
        data: {
          variations: Array.isArray(variations) && variations.length > 0 ? variations : [message.trim()]
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getAiSetting(req, res, next) {
    try {
      const { jid: rawJid } = req.params;
      const jid = sanitizeJid(rawJid) || rawJid;
      const setting = await ChatAiSettingModel.getByJid(req.user.id, jid);
      res.status(200).json({
        success: true,
        data: setting || {
          jid,
          auto_reply_enabled: false,
          disable_after_one_reply: false,
          reply_mode: 'ai',
          static_reply_text: '',
          custom_prompt: '',
          tone: 'friendly',
          notes: ''
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateAiSetting(req, res, next) {
    try {
      const { jid: rawJid } = req.params;
      const jid = sanitizeJid(rawJid) || rawJid;
      const { autoReplyEnabled, disableAfterOneReply = false, replyMode = 'ai', staticReplyText = null, customPrompt = '', tone = 'friendly', notes = '' } = req.body;

      const updated = await ChatAiSettingModel.upsert(req.user.id, jid, {
        autoReplyEnabled: !!autoReplyEnabled,
        disableAfterOneReply: !!disableAfterOneReply,
        replyMode,
        staticReplyText: staticReplyText ? staticReplyText.trim() : null,
        customPrompt,
        tone,
        notes
      });

      const socketService = require('../services/socketService');
      socketService.emitToUser(req.user.id, 'ai_setting_updated', updated);
      socketService.emitToUser(req.user.id, 'chats_updated', {});

      res.status(200).json({
        success: true,
        message: 'Pengaturan Auto-Reply & AI Chat berhasil disimpan!',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  async toggleAutoReply(req, res, next) {
    try {
      const { jid: rawJid } = req.params;
      const jid = sanitizeJid(rawJid) || rawJid;
      const { enabled } = req.body;

      const updated = await ChatAiSettingModel.toggleAutoReply(req.user.id, jid, !!enabled);

      res.status(200).json({
        success: true,
        message: `Auto-Reply AI ${enabled ? 'Diaktifkan 🤖' : 'Dinonaktifkan'}`,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  },

  async getCallLogs(req, res, next) {
    try {
      const session = await WhatsappSessionModel.getByUserId(req.user.id);
      if (!session || session.status !== 'CONNECTED') {
        return res.status(200).json({
          success: true,
          data: []
        });
      }

      const calls = await CallLogModel.getAllByUser(req.user.id);
      res.status(200).json({
        success: true,
        data: calls
      });
    } catch (error) {
      next(error);
    }
  },

  async syncChats(req, res, next) {
    try {
      const session = await WhatsappSessionModel.getByUserId(req.user.id);
      if (!session || session.status !== 'CONNECTED') {
        return res.status(400).json({
          success: false,
          message: 'WhatsApp belum terhubung. Silakan hubungkan WhatsApp terlebih dahulu.'
        });
      }

      const result = await WhatsappService.syncGroupsAndChats(req.user.id);
      const updatedChats = await ContactModel.getChatsList(req.user.id);
      res.status(200).json({
        success: true,
        message: 'Grup WhatsApp dan daftar chat berhasil disinkronkan!',
        data: {
          syncResult: result,
          chats: updatedChats
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getViewOnceMedia(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 100, offset = 0, mediaType, search } = req.query;

      const mediaList = await MessageModel.getViewOnceMedia(userId, {
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
        mediaType,
        search
      });

      res.status(200).json({
        success: true,
        data: {
          items: mediaList,
          total: mediaList.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = ChatController;

const ContactService = require('../services/contactService');
const ContactModel = require('../models/contactModel');
const WhatsappSessionModel = require('../models/whatsappSessionModel');
const WhatsappService = require('../services/whatsappService');

const ContactController = {
  async getContacts(req, res, next) {
    try {
      const { search, type = 'personal', limit = 500, offset = 0 } = req.query;
      const { rows, total } = await ContactService.getContacts(req.user.id, {
        search,
        type,
        limit: Math.min(parseInt(limit, 10) || 500, 2000),
        offset: parseInt(offset, 10) || 0
      });

      res.status(200).json({
        success: true,
        data: {
          contacts: rows,
          total,
          count: rows.length
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async syncContacts(req, res, next) {
    try {
      await ContactModel.syncContactsFromMessages(req.user.id).catch(() => {});

      const session = await WhatsappSessionModel.getByUserId(req.user.id);
      let waSynced = false;
      if (session && session.status === 'CONNECTED') {
        await WhatsappService.syncGroupsAndChats(req.user.id).catch(() => {});
        waSynced = true;
      }

      const { type = 'personal', limit = 500 } = req.query;
      const { rows, total } = await ContactService.getContacts(req.user.id, {
        type,
        limit: Math.min(parseInt(limit, 10) || 500, 2000),
        offset: 0
      });

      res.status(200).json({
        success: true,
        message: 'Kontak berhasil disinkronkan!',
        data: {
          contacts: rows,
          total,
          count: rows.length,
          waSynced
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getContactById(req, res, next) {
    try {
      const { id } = req.params;
      const contact = await ContactService.getContactById(id, req.user.id);

      res.status(200).json({
        success: true,
        data: { contact }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = ContactController;

const WhatsappService = require('../services/whatsappService');

const WhatsappController = {
  async startSession(req, res, next) {
    try {
      const sessionName = req.body.sessionName || 'default';
      const forceRestart = req.body.forceRestart || false;
      const method = req.body.method || (req.body.phoneNumber ? 'code' : 'qr');
      const phoneNumber = req.body.phoneNumber || null;

      let result;
      if (method === 'code' && phoneNumber) {
        result = await WhatsappService.requestPairingCode(req.user.id, phoneNumber, sessionName);
      } else {
        result = await WhatsappService.initSession(req.user.id, sessionName, forceRestart);
      }

      res.status(200).json({
        success: true,
        message: result.status === 'CONNECTED'
          ? 'WhatsApp session is already connected'
          : result.status === 'PAIRING_CODE'
          ? 'WhatsApp pairing code generated. Enter the code in your WhatsApp mobile app.'
          : 'WhatsApp session initialized. Scan QR code to connect.',
        data: {
          status: result.status,
          phoneNumber: result.phoneNumber,
          pairingPhone: result.pairingPhone,
          pairingCode: result.pairingCode,
          qrCode: result.qrImage,
          sessionName
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async requestPairingCode(req, res, next) {
    try {
      const { phoneNumber, sessionName = 'default' } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Nomor WhatsApp (phoneNumber) wajib diisi untuk pairing code'
        });
      }

      const result = await WhatsappService.requestPairingCode(req.user.id, phoneNumber, sessionName);

      res.status(200).json({
        success: true,
        message: result.status === 'CONNECTED'
          ? 'WhatsApp session is already connected'
          : 'Kode pairing WhatsApp berhasil dibuat. Masukkan kode di aplikasi WhatsApp HP.',
        data: {
          status: result.status,
          pairingCode: result.pairingCode,
          pairingPhone: result.pairingPhone,
          phoneNumber: result.phoneNumber,
          sessionName
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getStatus(req, res, next) {
    try {
      const sessionName = req.query.sessionName || 'default';
      const statusData = await WhatsappService.getSessionStatus(req.user.id, sessionName);

      res.status(200).json({
        success: true,
        data: statusData
      });
    } catch (error) {
      next(error);
    }
  },

  async getGroups(req, res, next) {
    try {
      const sessionName = req.query.sessionName || 'default';
      const groups = await WhatsappService.getGroups(req.user.id, sessionName);

      res.status(200).json({
        success: true,
        data: {
          groups,
          count: groups.length
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async disconnect(req, res, next) {
    try {
      const sessionName = req.body.sessionName || 'default';
      const result = await WhatsappService.disconnectSession(req.user.id, sessionName);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          status: result.status,
          sessionName
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async sendTestMessage(req, res, next) {
    try {
      const { toPhone, messageText, sessionName = 'default' } = req.body;
      if (!toPhone) {
        return res.status(400).json({
          success: false,
          message: 'Recipient phone number (toPhone) is required'
        });
      }

      const text = messageText || 'Halo! Ini adalah pesan uji coba dari WaChat AI. Koneksi WhatsApp Personal berhasil terhubung! 🚀';
      const result = await WhatsappService.sendTextMessage(req.user.id, {
        toPhone,
        messageText: text,
        sessionName
      });

      res.status(200).json({
        success: true,
        message: 'Test WhatsApp message sent successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = WhatsappController;

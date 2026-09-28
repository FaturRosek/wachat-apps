const { z } = require('zod');

const pairingCodeSchema = z.object({
  phoneNumber: z
    .string({ required_error: 'Nomor WhatsApp (phoneNumber) wajib diisi' })
    .trim()
    .min(5, 'Nomor WhatsApp minimal 5 digit')
    .max(25, 'Nomor WhatsApp maksimal 25 digit'),
  sessionName: z.string().trim().optional().default('default')
});

const sendTestMessageSchema = z.object({
  toPhone: z
    .string({ required_error: 'Nomor penerima (toPhone) wajib diisi' })
    .trim()
    .min(5, 'Nomor penerima minimal 5 digit')
    .max(30, 'Nomor penerima tidak valid'),
  messageText: z.string().trim().max(1000).optional(),
  sessionName: z.string().trim().optional().default('default')
});

module.exports = {
  pairingCodeSchema,
  sendTestMessageSchema
};

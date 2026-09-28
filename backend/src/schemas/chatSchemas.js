const { z } = require('zod');

const sendChatMessageSchema = z.object({
  jid: z
    .string({ required_error: 'JID penerima wajib diisi' })
    .trim()
    .min(3, 'JID penerima tidak valid'),
  message: z
    .string({ required_error: 'Isi pesan wajib diisi' })
    .trim()
    .min(1, 'Isi pesan tidak boleh kosong')
    .max(4096, 'Isi pesan maksimal 4096 karakter'),
  quotedMessageId: z.string().trim().optional().nullable(),
  sessionName: z.string().trim().optional().default('default')
});

const sendOutboundMessageSchema = z.object({
  phone: z
    .string({ required_error: 'Nomor/grup tujuan wajib diisi' })
    .trim()
    .min(3, 'Nomor/grup tujuan tidak valid'),
  message: z
    .string({ required_error: 'Isi pesan wajib diisi' })
    .trim()
    .min(1, 'Isi pesan tidak boleh kosong')
    .max(4096, 'Isi pesan maksimal 4096 karakter'),
  messages: z.array(z.string().min(1).max(4096)).optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  sessionName: z.string().trim().optional().default('default'),
  repeatCount: z
    .union([z.number(), z.string()])
    .transform((val) => parseInt(String(val), 10) || 1)
    .pipe(z.number().int().min(1).max(20, 'Maksimal repetisi pesan adalah 20 kali'))
    .optional()
    .default(1),
  intervalSeconds: z
    .union([z.number(), z.string()])
    .transform((val) => parseInt(String(val), 10) || 5)
    .pipe(z.number().int().min(1, 'Interval minimal 1 detik').max(60, 'Interval maksimal 60 detik'))
    .optional()
    .default(5),
  useAiVariation: z.boolean().optional().default(false)
});

const aiToneEnum = z.enum([
  'friendly',
  'formal',
  'professional',
  'casual',
  'santai',
  'romantic',
  'romantis',
  'humorous',
  'concise',
  'short',
  'persuasive',
  'sales',
  'apology',
  'reminder'
]);

const aiVariationsSchema = z.object({
  message: z
    .string({ required_error: 'Isi pesan diperlukan' })
    .trim()
    .min(1, 'Isi pesan tidak boleh kosong')
    .max(4000, 'Isi pesan maksimal 4000 karakter'),
  count: z
    .union([z.number(), z.string()])
    .transform((val) => parseInt(String(val), 10) || 1)
    .pipe(z.number().int().min(1).max(20))
    .optional()
    .default(1),
  tone: aiToneEnum.optional().default('friendly'),
  recipientName: z.string().trim().max(100).optional().default('')
});

const aiRewriteSchema = z.object({
  text: z
    .string({ required_error: 'Teks pesan diperlukan' })
    .trim()
    .min(1, 'Teks pesan tidak boleh kosong')
    .max(4000, 'Teks pesan maksimal 4000 karakter'),
  tone: aiToneEnum.optional().default('friendly')
});

const aiComposeSchema = z.object({
  prompt: z
    .string({ required_error: 'Prompt / draf pesan diperlukan' })
    .trim()
    .min(1, 'Prompt / draf pesan tidak boleh kosong')
    .max(4000, 'Prompt maksimal 4000 karakter'),
  tone: aiToneEnum.optional().default('friendly'),
  recipientName: z.string().trim().max(100).optional().default(''),
  customInstruction: z.string().trim().max(1000).optional().default('')
});

const aiContextSchema = z.object({
  jid: z
    .string({ required_error: 'JID diperlukan' })
    .trim()
    .min(3, 'JID tidak valid')
});

const aiSettingUpdateSchema = z.object({
  autoReplyEnabled: z.boolean().optional().default(false),
  disableAfterOneReply: z.boolean().optional().default(false),
  replyMode: z.enum(['ai', 'static']).optional().default('ai'),
  staticReplyText: z.string().trim().max(2000).optional().nullable(),
  customPrompt: z.string().trim().max(3000).optional().default(''),
  tone: aiToneEnum.optional().default('friendly'),
  notes: z.string().trim().max(1000).optional().default('')
});

const toggleAutoReplySchema = z.object({
  enabled: z.boolean({ required_error: 'Status enabled wajib boolean' })
});

const editChatMessageSchema = z.object({
  jid: z.string({ required_error: 'JID penerima wajib diisi' }).trim().min(3),
  messageId: z.string({ required_error: 'Message ID wajib diisi' }).trim().min(1),
  newText: z.string({ required_error: 'Teks pesan baru wajib diisi' }).trim().min(1).max(4096),
  sessionName: z.string().trim().optional().default('default')
});

const deleteForEveryoneSchema = z.object({
  jid: z.string({ required_error: 'JID penerima wajib diisi' }).trim().min(3),
  messageId: z.string({ required_error: 'Message ID wajib diisi' }).trim().min(1),
  sessionName: z.string().trim().optional().default('default')
});

const deleteForMeSchema = z.object({
  messageId: z.string({ required_error: 'Message ID wajib diisi' }).trim().min(1)
});

const togglePinSchema = z.object({
  jid: z.string({ required_error: 'JID diperlukan' }).trim().min(3),
  pinned: z.boolean({ required_error: 'Status pinned wajib boolean' })
});

const toggleArchiveSchema = z.object({
  jid: z.string({ required_error: 'JID diperlukan' }).trim().min(3),
  archived: z.boolean({ required_error: 'Status archived wajib boolean' })
});

module.exports = {
  sendChatMessageSchema,
  sendOutboundMessageSchema,
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
};



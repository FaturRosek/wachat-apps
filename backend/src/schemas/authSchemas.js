const { z } = require('zod');

const registerSchema = z.object({
  name: z
    .string({ required_error: 'Nama wajib diisi' })
    .trim()
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter'),
  email: z
    .string({ required_error: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .email('Format email tidak valid'),
  password: z
    .string({ required_error: 'Password wajib diisi' })
    .min(8, 'Password minimal 8 karakter demi keamanan')
    .max(128, 'Password maksimal 128 karakter')
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi' })
    .trim()
    .toLowerCase()
    .email('Format email tidak valid'),
  password: z
    .string({ required_error: 'Password wajib diisi' })
    .min(1, 'Password tidak boleh kosong')
});

module.exports = {
  registerSchema,
  loginSchema
};

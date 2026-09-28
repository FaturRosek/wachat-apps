export function formatPhoneNumber(phone) {
  if (!phone) return { isValid: false, error: 'Nomor telepon wajib diisi' };
  let clean = String(phone).replace(/[^0-9]/g, '');

  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  } else if (clean.startsWith('8')) {
    clean = '628' + clean.substring(1);
  }

  if (clean.length < 9 || clean.length > 16) {
    return {
      isValid: false,
      error: 'Panjang nomor telepon harus antara 9 - 15 digit',
      formattedPhone: clean,
    };
  }

  return {
    isValid: true,
    formattedPhone: clean,
    displayPhone: `+${clean}`,
  };
}

export function formatDisplayPhone(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/[^0-9]/g, '');
  if (clean.startsWith('62') && clean.length >= 10) {
    return `+62 ${clean.slice(2, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
  }
  return `+${clean}`;
}

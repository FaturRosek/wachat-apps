const formatPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      formattedPhone: null,
      error: 'Phone number or group ID must be a non-empty string'
    };
  }

  const trimmed = phone.trim();

  if (trimmed.includes('@g.us')) {
    const groupId = trimmed.split('@g.us')[0].replace(/[^0-9-]/g, '');
    if (groupId) {
      return {
        isValid: true,
        formattedPhone: `${groupId}@g.us`,
        isGroup: true,
        error: null
      };
    }
  }

  let cleaned = trimmed.replace(/[^0-9+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.substring(2);
  } else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13) {
    cleaned = '62' + cleaned;
  }

  if (!/^\d{8,25}$/.test(cleaned)) {
    return {
      isValid: false,
      formattedPhone: null,
      error: 'Invalid phone number format. Must be between 8 and 25 digits.'
    };
  }

  return {
    isValid: true,
    formattedPhone: cleaned,
    isGroup: false,
    error: null
  };
};

const sanitizeJid = (jid) => {
  if (!jid || typeof jid !== 'string') return null;
  const trimmed = jid.trim();

  if (trimmed.includes('@g.us')) {
    const groupId = trimmed.split('@g.us')[0].replace(/[^0-9-]/g, '');
    return groupId ? `${groupId}@g.us` : null;
  }

  if (trimmed.includes('@lid')) {
    const lidId = trimmed.split('@lid')[0].replace(/[^0-9]/g, '');
    return lidId ? `${lidId}@lid` : null;
  }

  if (trimmed.includes('@broadcast') || trimmed.includes('@newsletter')) {
    return trimmed;
  }

  let userPart = trimmed;
  if (trimmed.includes('@s.whatsapp.net')) {
    userPart = trimmed.split('@s.whatsapp.net')[0].split(':')[0];
  } else if (trimmed.includes('@')) {
    userPart = trimmed.split('@')[0];
  }

  const phoneRes = formatPhoneNumber(userPart);
  if (phoneRes.isValid) {
    if (phoneRes.isGroup) return phoneRes.formattedPhone;
    return `${phoneRes.formattedPhone}@s.whatsapp.net`;
  }

  return null;
};

module.exports = {
  formatPhoneNumber,
  sanitizeJid
};


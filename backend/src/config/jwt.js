require('dotenv').config();

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[CRITICAL SECURITY ERROR] JWT_SECRET must be set in production environment variables!');
      process.exit(1);
    }
    console.warn('[SECURITY WARNING] JWT_SECRET is not set in .env. Using development fallback. DO NOT USE IN PRODUCTION!');
    return 'wachat_ai_dev_insecure_jwt_secret_change_me_in_production_12345';
  }

  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    console.warn('[SECURITY WARNING] JWT_SECRET should be at least 32 characters long for production security.');
  }

  return secret;
};

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN
};

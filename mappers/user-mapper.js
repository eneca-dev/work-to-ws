// Маппер пользователей: UUID → email

const supabase = require('../services/supabase');
const wsWriter = require('../services/worksection-writer');
const logger = require('../utils/logger');

// Кэш email-ов для оптимизации
const emailCache = new Map();

// Кэш WS пользователей (загружается один раз)
let wsUsersCache = null;

async function loadWsUsers() {
  if (wsUsersCache === null) {
    logger.info('Loading Worksection users...');
    const users = await wsWriter.getUsers();
    wsUsersCache = new Set(users.map(u => u.email.toLowerCase()));
    logger.info(`Loaded ${wsUsersCache.size} WS users`);
  }
  return wsUsersCache;
}

async function getEmailByUserId(userId) {
  if (!userId) return null;

  // Проверяем кэш
  if (emailCache.has(userId)) {
    return emailCache.get(userId);
  }

  const email = await supabase.getEmailByUserId(userId);

  if (!email) {
    logger.warning(`User not found in Supabase: ${userId}`);
    emailCache.set(userId, null);
    return null;
  }

  // Проверяем существует ли email в Worksection
  const wsUsers = await loadWsUsers();
  const emailLower = email.toLowerCase();

  if (!wsUsers.has(emailLower)) {
    logger.warning(`User ${email} (${userId}) exists in Supabase but NOT in Worksection → will use NOONE`);
    emailCache.set(userId, null);
    return null;  // Вернем null чтобы установился NOONE
  }

  // Email существует и в Supabase и в WS
  logger.info(`User mapped: ${userId} -> ${email}`);
  emailCache.set(userId, email);
  return email;
}

function clearCache() {
  emailCache.clear();
  wsUsersCache = null;  // Сбрасываем и WS кэш
}

module.exports = {
  getEmailByUserId,
  clearCache,
};

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  downloadContentFromMessage,
  downloadMediaMessage,
  extractMessageContent,
  ALL_WA_PATCH_NAMES,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const WhatsappSessionModel = require("../models/whatsappSessionModel");
const ContactModel = require("../models/contactModel");
const MessageModel = require("../models/messageModel");
const UserModel = require("../models/userModel");
const ChatAiSettingModel = require("../models/chatAiSettingModel");
const CallLogModel = require("../models/callLogModel");
const aiService = require("./aiService");
const socketService = require("./socketService");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const { enqueueDispatch } = require("../jobs/messageQueue");
const { formatPhoneNumber, sanitizeJid } = require("../utils/phoneValidator");

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const SESSIONS_BASE_DIR = path.join(__dirname, "../../sessions");
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

if (!fs.existsSync(SESSIONS_BASE_DIR)) {
  fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let cachedWAVersion = null;

async function getWAVersion() {
  if (cachedWAVersion) return cachedWAVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedWAVersion = version;
    return version;
  } catch (e) {
    return [2, 3000, 1043857760];
  }
}

function convertToOpusOgg(inputBuffer) {
  return new Promise((resolve) => {
    const tempIn = path.join(UPLOADS_DIR, `temp_in_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
    const tempOut = path.join(UPLOADS_DIR, `temp_out_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`);

    fs.writeFileSync(tempIn, inputBuffer);

    ffmpeg(tempIn)
      .inputOptions([
        "-err_detect ignore_err",
        "-fflags +discardcorrupt"
      ])
      .noVideo()
      .audioCodec("libopus")
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate("32k")
      .outputOptions([
        "-compression_level 10",
        "-frame_duration 60",
        "-application voip",
        "-packet_loss 0",
        "-avoid_negative_ts make_zero",
        "-map_metadata -1"
      ])
      .toFormat("ogg")
      .save(tempOut)
      .on("end", () => {
        try {
          const oggBuffer = fs.readFileSync(tempOut);
          try { fs.unlinkSync(tempIn); } catch (e) {}
          try { fs.unlinkSync(tempOut); } catch (e) {}
          resolve(oggBuffer);
        } catch (readErr) {
          try { fs.unlinkSync(tempIn); } catch (e) {}
          try { fs.unlinkSync(tempOut); } catch (e) {}
          resolve(inputBuffer);
        }
      })
      .on("error", () => {
        try { fs.unlinkSync(tempIn); } catch (e) {}
        try { fs.unlinkSync(tempOut); } catch (e) {}
        resolve(inputBuffer);
      });
  });
}

class WhatsappService {
  constructor() {
    this.sessions = new Map();
    this.processedMessageIds = new Map();
    this.recentSentMessages = new Map();
    this.autoReplyLock = new Set();
    this.startUploadsCleanupJob();
  }

  startUploadsCleanupJob() {
    const cleanupOldFiles = () => {
      try {
        if (!fs.existsSync(UPLOADS_DIR)) return;
        const now = Date.now();
        const maxAgeMs = 4 * 60 * 60 * 1000;
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
          if (file === '.gitkeep') continue;
          const filePath = path.join(UPLOADS_DIR, file);
          try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAgeMs) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {}
        }
      } catch (e) {
        console.warn('[Uploads Cleanup Warning]:', e.message);
      }
    };

    cleanupOldFiles();
    setInterval(cleanupOldFiles, 30 * 60 * 1000);
  }

  getSessionKey(userId, sessionName = "default") {
    return `${userId}_${sessionName}`;
  }

  getSessionDir(userId, sessionName = "default") {
    const sessionDir = path.join(SESSIONS_BASE_DIR, `${userId}_${sessionName}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  resolveLidToPhone(userId, sessionName = "default", jid) {
    if (!jid) return { jid: "", phone: "" };
    if (!jid.endsWith("@lid")) {
      const isGroup = jid.endsWith("@g.us");
      const phone = isGroup ? jid : jid.replace(/[^0-9]/g, "");
      const cleanJid = isGroup ? jid : `${phone}@s.whatsapp.net`;
      return { jid: cleanJid, phone };
    }

    const lidNum = jid.split("@")[0];
    const sessionDir = this.getSessionDir(userId, sessionName);
    const revFile = path.join(sessionDir, `lid-mapping-${lidNum}_reverse.json`);

    if (fs.existsSync(revFile)) {
      try {
        const phoneRaw = JSON.parse(fs.readFileSync(revFile, "utf8"));
        if (phoneRaw) {
          const clean = String(phoneRaw).replace(/[^0-9]/g, "");
          if (clean) {
            return {
              jid: `${clean}@s.whatsapp.net`,
              phone: clean,
            };
          }
        }
      } catch (e) {}
    }

    return { jid, phone: lidNum };
  }

  async backupSessionFilesToDb(userId, sessionName = "default", sessionDir) {
    try {
      if (!fs.existsSync(sessionDir)) return;
      const credPath = path.join(sessionDir, "creds.json");
      if (!fs.existsSync(credPath)) return;

      const files = fs.readdirSync(sessionDir);
      const bundle = {};
      for (const f of files) {
        if (f.endsWith(".json")) {
          const fullPath = path.join(sessionDir, f);
          try {
            bundle[f] = fs.readFileSync(fullPath, "utf8");
          } catch (e) {}
        }
      }

      if (bundle["creds.json"]) {
        await WhatsappSessionModel.updateStatus(userId, undefined, {
          sessionName,
          sessionData: { authBundle: bundle, backedUpAt: new Date().toISOString() },
        });

        try {
          const { getRedisClient } = require("../config/redis");
          const redis = getRedisClient();
          if (redis && redis.status === "ready") {
            await redis.set(`wa_session_bundle:${userId}_${sessionName}`, JSON.stringify(bundle), "EX", 30 * 24 * 60 * 60);
          }
        } catch (redisErr) {}
      }
    } catch (err) {
      console.warn(`[WhatsApp - ${userId}] Backup session warning:`, err.message);
    }
  }

  debouncedBackupSession(userId, sessionName = "default", sessionDir) {
    const key = `${userId}_${sessionName}`;
    if (!this.backupDebounceTimers) {
      this.backupDebounceTimers = new Map();
    }
    if (this.backupDebounceTimers.has(key)) {
      clearTimeout(this.backupDebounceTimers.get(key));
    }
    const timer = setTimeout(() => {
      this.backupDebounceTimers.delete(key);
      this.backupSessionFilesToDb(userId, sessionName, sessionDir).catch(() => {});
    }, 2500);
    this.backupDebounceTimers.set(key, timer);
  }

  async restoreSessionFilesFromDb(userId, sessionName = "default", sessionDir) {
    try {
      const credPath = path.join(sessionDir, "creds.json");
      let isCredValid = false;
      if (fs.existsSync(credPath) && fs.statSync(credPath).size > 20) {
        try {
          const parsed = JSON.parse(fs.readFileSync(credPath, "utf8"));
          if (parsed && (parsed.registered || parsed.me)) {
            isCredValid = true;
          }
        } catch (e) {}
      }
      if (isCredValid) return true;

      try {
        const { getRedisClient } = require("../config/redis");
        const redis = getRedisClient();
        if (redis && redis.status === "ready") {
          const cached = await redis.get(`wa_session_bundle:${userId}_${sessionName}`);
          if (cached) {
            const bundle = JSON.parse(cached);
            if (bundle && bundle["creds.json"]) {
              if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
              for (const [filename, content] of Object.entries(bundle)) {
                fs.writeFileSync(path.join(sessionDir, filename), content, "utf8");
              }
              console.log(`[WhatsApp - ${userId}] Sesi WhatsApp berhasil dipulihkan dari Redis cache.`);
              return true;
            }
          }
        }
      } catch (redisErr) {}

      const dbSession = await WhatsappSessionModel.getByUserId(userId, sessionName);
      const bundle = dbSession?.session_data?.authBundle;
      if (bundle && bundle["creds.json"]) {
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
        for (const [filename, content] of Object.entries(bundle)) {
          fs.writeFileSync(path.join(sessionDir, filename), content, "utf8");
        }
        console.log(`[WhatsApp - ${userId}] Sesi WhatsApp berhasil dipulihkan dari database PostgreSQL.`);
        return true;
      }
      return false;
    } catch (err) {
      console.warn(`[WhatsApp - ${userId}] Restore session error:`, err.message);
      return false;
    }
  }

  async clearSessionBackup(userId, sessionName = "default") {
    try {
      const { getRedisClient } = require("../config/redis");
      const redis = getRedisClient();
      if (redis && redis.status === "ready") {
        await redis.del(`wa_session_bundle:${userId}_${sessionName}`);
      }
    } catch (e) {}
  }

  async initSession(userId, sessionName = "default", forceRestart = false, pairingPhone = null) {
    const key = this.getSessionKey(userId, sessionName);
    const existing = this.sessions.get(key);

    let cleanPairingPhone = null;
    if (pairingPhone) {
      const v = formatPhoneNumber(pairingPhone);
      if (!v.isValid) {
        const err = new Error(v.error || "Format nomor WhatsApp tidak valid");
        err.statusCode = 400;
        throw err;
      }
      cleanPairingPhone = v.formattedPhone;
    }

    if (existing && !forceRestart && existing.status === "CONNECTED") {
      return {
        status: "CONNECTED",
        phoneNumber: existing.phoneNumber,
        pairingPhone: null,
        pairingCode: null,
        qr: null,
        qrImage: null,
      };
    }

    if (
      existing &&
      !forceRestart &&
      cleanPairingPhone &&
      existing.status === "PAIRING_CODE" &&
      existing.pairingCode &&
      existing.pairingPhone === cleanPairingPhone
    ) {
      return {
        status: "PAIRING_CODE",
        phoneNumber: null,
        pairingPhone: existing.pairingPhone,
        pairingCode: existing.pairingCode,
        qr: null,
        qrImage: null,
      };
    }

    if (
      existing &&
      !forceRestart &&
      !cleanPairingPhone &&
      existing.status === "SCAN_QR" &&
      existing.qrImage
    ) {
      return {
        status: "SCAN_QR",
        phoneNumber: null,
        pairingPhone: null,
        pairingCode: null,
        qr: existing.qr,
        qrImage: existing.qrImage,
      };
    }

    if (existing) {
      existing.destroyed = true;
      if (existing.sock) {
        try {
          existing.sock.ev.removeAllListeners();
          existing.sock.end();
        } catch (e) {}
      }
      this.sessions.delete(key);
    }

    const sessionDir = this.getSessionDir(userId, sessionName);

    if (forceRestart) {
      try {
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          fs.mkdirSync(sessionDir, { recursive: true });
        }
      } catch (e) {
        console.error("[WhatsApp] Error resetting session dir:", e.message);
      }
      await this.clearSessionBackup(userId, sessionName);
    } else {
      await this.restoreSessionFilesFromDb(userId, sessionName, sessionDir);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const version = await getWAVersion();

    const existingDb = await WhatsappSessionModel.getByUserId(userId, sessionName);
    const registeredPhone = state.creds?.me?.id
      ? state.creds.me.id.split(":")[0].replace(/[^0-9]/g, "")
      : (existingDb?.phone_number || existing?.phoneNumber || null);

    const initialStatus = cleanPairingPhone
      ? "PAIRING_CODE"
      : (existing?.reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING");

    await WhatsappSessionModel.upsert(userId, {
      sessionName,
      status: initialStatus,
      phoneNumber: cleanPairingPhone || registeredPhone || null,
      qrCode: null,
      sessionData: cleanPairingPhone ? { pairingPhone: cleanPairingPhone } : (existingDb?.session_data || null),
    });

    const sessionState = {
      sock: null,
      status: initialStatus,
      qr: null,
      qrImage: null,
      pairingPhone: cleanPairingPhone,
      pairingCode: null,
      pairingPromise: null,
      phoneNumber: cleanPairingPhone || registeredPhone || null,
      reconnectAttempts: existing?.reconnectAttempts || 0,
      destroyed: false,
      manualDisconnect: false,
      contacts: existing?.contacts || new Map(),
    };
    this.sessions.set(key, sessionState);

    const logger = pino({ level: "silent" });

    let sock;
    try {
      sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        shouldSyncHistoryMessage: (historyMsg) => {
          const oneWeekAgoSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
          const msgTimestamp = Number(historyMsg?.messageTimestamp || 0);
          return !msgTimestamp || msgTimestamp >= oneWeekAgoSec;
        },
        shouldIgnoreJid: () => false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
          if (key && key.id) {
            const cached = this.recentSentMessages.get(key.id);
            if (cached) return cached;

            const msg = await MessageModel.getById(key.id, userId);
            if (msg) {
              if (msg.raw_data?.protoMessage) {
                return msg.raw_data.protoMessage;
              }
              if (msg.media_type === "voice" || msg.media_type === "audio") {
                const audioPath = msg.media_url ? path.join(UPLOADS_DIR, path.basename(msg.media_url)) : null;
                if (audioPath && fs.existsSync(audioPath)) {
                  try {
                    const isPtt = msg.media_type === "voice" || !!msg.raw_data?.isPtt;
                    const duration = msg.raw_data?.duration || msg.raw_data?.seconds || 1;
                    return {
                      audioMessage: {
                        url: audioPath,
                        mimetype: "audio/ogg; codecs=opus",
                        ptt: isPtt,
                        seconds: duration,
                      }
                    };
                  } catch (e) {}
                }
              }
              if (msg.media_type === "image") {
                const imgPath = msg.media_url ? path.join(UPLOADS_DIR, path.basename(msg.media_url)) : null;
                if (imgPath && fs.existsSync(imgPath)) {
                  return {
                    imageMessage: {
                      caption: msg.media_caption || msg.content || "",
                    }
                  };
                }
              }
              if (msg.media_type === "video") {
                const vidPath = msg.media_url ? path.join(UPLOADS_DIR, path.basename(msg.media_url)) : null;
                if (vidPath && fs.existsSync(vidPath)) {
                  return {
                    videoMessage: {
                      caption: msg.media_caption || msg.content || "",
                    }
                  };
                }
              }
              if (msg.media_type === "text" || !msg.media_type) {
                return { conversation: msg.content || "" };
              }
            }
          }
          return undefined;
        },
      });
    } catch (sockErr) {
      console.error(`[WhatsApp - ${userId}] makeWASocket error:`, sockErr.message);
      this.sessions.delete(key);
      await WhatsappSessionModel.updateStatus(userId, "DISCONNECTED", { sessionName });
      throw sockErr;
    }

    sessionState.sock = sock;
    sock.ev.on("creds.update", async () => {
      await saveCreds();
      this.debouncedBackupSession(userId, sessionName, sessionDir);
    });

    const targetPairPhone = cleanPairingPhone;

    if (!sock.authState.creds.registered && targetPairPhone) {
      sessionState.pairingPromise = (async () => {
        await new Promise((r) => setTimeout(r, 1500));
        if (sessionState.destroyed || !sessionState.sock) {
          throw new Error("Sesi WhatsApp dibatalkan");
        }
        if (sessionState.sock.authState.creds.registered) {
          return null;
        }

        try {
          const rawCode = await sessionState.sock.requestPairingCode(targetPairPhone);
          const formattedCode = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
          sessionState.pairingCode = formattedCode;
          sessionState.status = "PAIRING_CODE";

          await WhatsappSessionModel.updateStatus(userId, "PAIRING_CODE", {
            phoneNumber: targetPairPhone,
            sessionName,
            sessionData: {
              pairingCode: formattedCode,
              pairingPhone: targetPairPhone,
            },
            qrCode: null,
          });

          socketService.emitToUser(userId, "wa_status", {
            status: "PAIRING_CODE",
            pairingCode: formattedCode,
            pairingPhone: targetPairPhone,
          });

          return formattedCode;
        } catch (pairErr) {
          console.error(`[WhatsApp - ${userId}] requestPairingCode error:`, pairErr.message);
          throw pairErr;
        }
      })();
    }

    sock.ev.on("connection.update", async (update) => {
      if (sessionState.destroyed) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr && !sessionState.pairingPhone) {
        sessionState.status = "SCAN_QR";
        sessionState.reconnectAttempts = 0;
        sessionState.qr = qr;

        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
          });
          sessionState.qrImage = qrDataUrl;

          await WhatsappSessionModel.updateStatus(userId, "SCAN_QR", {
            qrCode: qrDataUrl,
            sessionName,
            sessionData: null,
          });

          socketService.emitToUser(userId, "wa_status", {
            status: "SCAN_QR",
            qrCode: qrDataUrl,
          });
        } catch (err) {
          console.error("[WhatsApp] Gagal generate QR image:", err.message);
        }

        return;
      }

      if (connection === "open") {
        const userJid = sock.user?.id || "";
        const rawPhone = userJid.split(":")[0]?.replace(/[^0-9]/g, "") || userJid.split("@")[0]?.replace(/[^0-9]/g, "");

        sessionState.status = "CONNECTED";
        sessionState.qr = null;
        sessionState.qrImage = null;
        sessionState.pairingCode = null;
        sessionState.pairingPhone = null;
        sessionState.phoneNumber = rawPhone;
        sessionState.reconnectAttempts = 0;
        cachedWAVersion = null;

        this.backupSessionFilesToDb(userId, sessionName, sessionDir).catch(() => {});

        try {
          await WhatsappSessionModel.updateStatus(userId, "CONNECTED", {
            phoneNumber: rawPhone,
            qrCode: null,
            sessionName,
          });
        } catch (dbErr) {
          console.error("[WhatsApp] DB update CONNECTED error:", dbErr.message);
        }

        socketService.emitToUser(userId, "wa_status", {
          status: "CONNECTED",
          phoneNumber: rawPhone,
        });

        this.syncGroupsAndChats(userId, sessionName).catch((syncErr) => {
          console.warn(`[WhatsApp - ${userId}] Initial groups sync warning:`, syncErr.message);
        });

        return;
      }

      if (connection === "close") {
        if (sessionState.destroyed && sessionState.manualDisconnect) {
          return;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.status;
        const errorMessage = lastDisconnect?.error?.message || "Connection closed";
        console.warn(`[WhatsApp - ${userId}] Connection closed. Status code: ${statusCode}, Reason: ${errorMessage}`);

        const isRegistered = !!(sock?.authState?.creds?.registered || sock?.authState?.creds?.me);

        const isExplicitLogout = (statusCode === DisconnectReason.loggedOut || statusCode === 401);

        if (isExplicitLogout) {
          console.warn(`[WhatsApp - ${userId}] Sesi WhatsApp telah di-logout dari perangkat HP.`);
          sessionState.destroyed = true;
          this.sessions.delete(key);

          try {
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          } catch (e) {}
          await this.clearSessionBackup(userId, sessionName);

          try {
            await WhatsappSessionModel.updateStatus(userId, "DISCONNECTED", {
              phoneNumber: null,
              qrCode: null,
              sessionData: null,
              sessionName,
            });
          } catch (e) {}

          socketService.emitToUser(userId, "wa_status", {
            status: "DISCONNECTED",
            phoneNumber: null,
          });
          return;
        }

        if (!isRegistered && !sessionState.pairingPhone) {
          console.log(`[WhatsApp - ${userId}] Sesi belum terdaftar. Menunggu scan QR / pairing ulang.`);
          sessionState.destroyed = true;
          this.sessions.delete(key);

          try {
            await WhatsappSessionModel.updateStatus(userId, "DISCONNECTED", {
              qrCode: null,
              sessionName,
            });
          } catch (e) {}

          socketService.emitToUser(userId, "wa_status", {
            status: "DISCONNECTED",
            phoneNumber: null,
          });
          return;
        }

        const isRestart = statusCode === DisconnectReason.restartRequired || statusCode === 515;
        const currentAttempts = isRestart ? 0 : (sessionState.reconnectAttempts || 0) + 1;
        if (!isRestart && currentAttempts > 6) {
          console.warn(`[WhatsApp - ${userId}] Telah mencapai batas maksimal percobaan reconnect (${currentAttempts - 1}x). Beralih ke status DISCONNECTED.`);
          sessionState.destroyed = true;
          this.sessions.delete(key);

          try {
            await WhatsappSessionModel.updateStatus(userId, "DISCONNECTED", {
              qrCode: null,
              sessionName,
            });
          } catch (e) {}

          socketService.emitToUser(userId, "wa_status", {
            status: "DISCONNECTED",
            phoneNumber: sessionState.phoneNumber,
          });
          return;
        }

        sessionState.destroyed = true;
        sessionState.status = "RECONNECTING";
        sessionState.reconnectAttempts = currentAttempts;
        sessionState.qr = null;
        sessionState.qrImage = null;

        const currentPhone = sessionState.phoneNumber;

        try {
          await WhatsappSessionModel.updateStatus(userId, "RECONNECTING", {
            qrCode: null,
            sessionName,
          });
        } catch (e) {}

        socketService.emitToUser(userId, "wa_status", {
          status: "RECONNECTING",
          phoneNumber: currentPhone,
        });

        let delay = 2000;
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          delay = 1000;
        } else {
          delay = Math.min(20000, 2000 * Math.pow(1.4, currentAttempts - 1));
        }

        this.sessions.delete(key);

        console.log(`[WhatsApp - ${userId}] Auto-reconnect dijadwalkan dalam ${Math.round(delay)}ms (Percobaan #${currentAttempts}/6)...`);

        setTimeout(() => {
          if (!this.sessions.has(key) && !sessionState.manualDisconnect) {
            this.initSession(userId, sessionName, false, sessionState.pairingPhone).catch((err) => {
              console.error(`[WhatsApp - ${userId}] Reconnect attempt #${currentAttempts} error:`, err.message);
            });
          }
        }, delay);
        return;
      }
    });

    sock.ev.on("messaging-history.set", async ({ chats, contacts, messages, isLatest, syncType }) => {
      try {
        const oneWeekAgoSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c && (c.id || c.phone)) {
              const cId = c.id || c.phone;
              sessionState.contacts.set(cId, { ...(sessionState.contacts.get(cId) || {}), ...c });
            }
            await this._processContactObject(userId, sessionName, c);
          }
        }

        if (Array.isArray(chats)) {
          for (const c of chats) {
            const convTime = c.conversationTimestamp ? Number(c.conversationTimestamp) : 0;
            const recvTime = c.lastMessageRecvTimestamp ? Number(c.lastMessageRecvTimestamp) : 0;
            const unread = Number(c.unreadCount || 0);
            const isPinned = c.pinned !== undefined && c.pinned !== null && c.pinned !== 0 && c.pinned !== false;
            const isArchived = !!(c.archive || c.archived);
            if (convTime >= oneWeekAgoSec || recvTime >= oneWeekAgoSec || unread > 0 || isPinned || isArchived) {
              await this._processChatObject(userId, sessionName, c);
            }
          }
        }

        if (Array.isArray(messages)) {
          for (const m of messages) {
            const parsed = this._unwrapWAMessage(m);
            const msgTs = parsed?.timestamp ? Number(parsed.timestamp) : 0;
            if (!msgTs || msgTs >= oneWeekAgoSec) {
              await this._processMessageObject(userId, sessionName, m);
            }
          }
        }

        await this.syncGroupsAndChats(userId, sessionName).catch(() => {});
        await this.syncAvatars(userId, sessionName).catch(() => {});
        await ContactModel.syncContactNamesFromHistory(userId).catch(() => {});
        await ContactModel.syncLastMessagesFromHistory(userId);

        socketService.emitToUser(userId, "chat_sync_complete", { count: (chats?.length || 0) + (contacts?.length || 0) });
        socketService.emitToUser(userId, "chats_updated", {});
      } catch (histErr) {
        console.error(`[WhatsApp - ${userId}] History sync error:`, histErr.message);
      }
    });

    sock.ev.on("chats.upsert", async (chats) => {
      for (const c of chats) {
        await this._processChatObject(userId, sessionName, c);
      }
      await ContactModel.syncLastMessagesFromHistory(userId);
      socketService.emitToUser(userId, "chats_updated", {});
    });

    sock.ev.on("chats.update", async (chatUpdates) => {
      for (const c of chatUpdates) {
        await this._processChatObject(userId, sessionName, c);
      }
      await ContactModel.syncLastMessagesFromHistory(userId);
      socketService.emitToUser(userId, "chats_updated", {});
    });

    sock.ev.on("contacts.upsert", async (contacts) => {
      for (const c of contacts) {
        if (c && (c.id || c.phone)) {
          const cId = c.id || c.phone;
          sessionState.contacts.set(cId, { ...(sessionState.contacts.get(cId) || {}), ...c });
        }
        await this._processContactObject(userId, sessionName, c);
      }
      socketService.emitToUser(userId, "chats_updated", {});
    });

    sock.ev.on("contacts.update", async (contactUpdates) => {
      for (const c of contactUpdates) {
        if (c && (c.id || c.phone)) {
          const cId = c.id || c.phone;
          sessionState.contacts.set(cId, { ...(sessionState.contacts.get(cId) || {}), ...c });
        }
        await this._processContactObject(userId, sessionName, c);
      }
      socketService.emitToUser(userId, "chats_updated", {});
    });

    sock.ev.on("lid-mapping.update", (mapping) => {
      try {
        const list = Array.isArray(mapping) ? mapping : [mapping];
        for (const item of list) {
          if (item && item.lid && item.pn) {
            const lidNum = item.lid.replace(/[^0-9]/g, "");
            const pnNum = item.pn.replace(/[^0-9]/g, "");
            if (lidNum && pnNum) {
              sessionState.lidMap = sessionState.lidMap || new Map();
              sessionState.lidMap.set(lidNum, pnNum);
              sessionState.lidMap.set(item.lid, `${pnNum}@s.whatsapp.net`);
              try {
                const sessionDir = this.getSessionDir(userId, sessionName);
                const revFile = path.join(sessionDir, `lid-mapping-${lidNum}_reverse.json`);
                fs.writeFileSync(revFile, JSON.stringify(pnNum));
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      for (const msg of messages) {
        await this._processMessageObject(userId, sessionName, msg);
      }
    });

    sock.ev.on("messages.update", async (updates) => {
      for (const update of updates) {
        const messageId = update.key?.id;
        if (!messageId) continue;

        const isRevoked = update.update?.messageStubType === 1 || update.update?.messageStubType === 2 || (update.update?.message === null && update.update?.key);
        if (isRevoked) {
          await MessageModel.markAsRevoked(userId, messageId);
          socketService.emitToUser(userId, "message_revoked", {
            messageId,
            remoteJid: update.key?.remoteJid,
          });
          continue;
        }

        const editProto = update.update?.message?.protocolMessage?.editedMessage || update.update?.message?.editedMessage;
        if (editProto) {
          const unwrapped = this._unwrapWAMessage(editProto);
          const editedText = unwrapped.proto?.conversation || unwrapped.proto?.extendedTextMessage?.text || "";
          if (editedText) {
            const updated = await MessageModel.updateContent(userId, messageId, editedText);
            socketService.emitToUser(userId, "message_edited", {
              messageId,
              newContent: editedText,
              remoteJid: update.key?.remoteJid,
              rawData: updated?.raw_data || { isEdited: true },
            });
            continue;
          }
        }

        const statusMap = {
          1: "PENDING",
          2: "SENT",
          3: "DELIVERED",
          4: "READ",
          5: "PLAYED",
        };
        const status = statusMap[update.update?.status];
        if (status) {
          await MessageModel.updateStatusByMessageId(userId, messageId, status);
          socketService.emitToUser(userId, "message_status_update", {
            messageId,
            status,
            remoteJid: update.key?.remoteJid,
          });
        }

        if (update.update?.message) {
          const rawWrapper = {
            key: update.key,
            message: update.update.message,
            messageTimestamp: update.update.messageTimestamp || Math.floor(Date.now() / 1000)
          };
          await this._processMessageObject(userId, sessionName, rawWrapper).catch(() => {});
        }
      }
    });

    sock.ev.on("presence.update", ({ id, presences }) => {
      let cleanJid = id;
      if (id && id.endsWith("@lid")) {
        const resolved = this.resolveLidToPhone(userId, sessionName, id);
        if (resolved?.jid) cleanJid = resolved.jid;
      }
      socketService.emitToUser(userId, "presence_update", {
        jid: cleanJid,
        presences,
      });
    });

    sock.ev.on("call", async (calls) => {
      for (const call of calls) {
        if (call.status === "offer") {
          const callerJid = call.from;
          const callerPhone = callerJid.replace(/[^0-9]/g, "");

          socketService.emitToUser(userId, "incoming_call", {
            callId: call.id,
            callerJid,
            callerPhone,
            isVideo: call.isVideo,
            timestamp: new Date(),
          });

          await CallLogModel.create({
            userId,
            callerJid,
            callerPhone,
            callType: call.isVideo ? "video" : "audio",
            status: "MISSED",
          });
        }
      }
    });

    return {
      status: sessionState.status,
      phoneNumber: sessionState.phoneNumber,
      qr: sessionState.qr,
      qrImage: sessionState.qrImage,
    };
  }

  async downloadAndSaveMedia(messageContent, mediaType, messageId, rawMessage = null, sock = null) {
    try {
      if (!messageContent || !messageId) return null;
      let targetContent = messageContent;
      if (targetContent.viewOnceMessage) targetContent = targetContent.viewOnceMessage.message || targetContent.viewOnceMessage;
      if (targetContent.viewOnceMessageV2) targetContent = targetContent.viewOnceMessageV2.message || targetContent.viewOnceMessageV2;
      if (targetContent.viewOnceMessageV2Extension) targetContent = targetContent.viewOnceMessageV2Extension.message || targetContent.viewOnceMessageV2Extension;
      if (targetContent.imageMessage) targetContent = targetContent.imageMessage;
      else if (targetContent.videoMessage) targetContent = targetContent.videoMessage;
      else if (targetContent.audioMessage) targetContent = targetContent.audioMessage;
      else if (targetContent.documentMessage) targetContent = targetContent.documentMessage;
      else if (targetContent.stickerMessage) targetContent = targetContent.stickerMessage;

      let detectedType = mediaType;
      if (detectedType === "view_once" || !["image", "video", "audio", "document", "voice", "sticker"].includes(detectedType)) {
        if (targetContent.mimetype?.startsWith("video/")) detectedType = "video";
        else if (targetContent.mimetype?.startsWith("audio/")) detectedType = "audio";
        else if (targetContent.mimetype?.startsWith("image/")) detectedType = "image";
        else detectedType = "image";
      }

      const ext = (detectedType === "voice" || detectedType === "audio") ? "ogg" : (detectedType === "image" ? "jpg" : (detectedType === "video" ? "mp4" : "bin"));
      const filename = `media_${messageId}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        return `/uploads/${filename}`;
      }

      const type = (detectedType === "voice" || detectedType === "audio") ? "audio" : detectedType;
      let buffer = null;

      try {
        const stream = await downloadContentFromMessage(targetContent, type);
        let chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        if (chunks.length > 0) {
          buffer = Buffer.concat(chunks);
        }
      } catch (streamErr) {
        console.warn(`[Download Warning - downloadContentFromMessage]: ${streamErr.message}`);
      }

      if ((!buffer || buffer.length === 0) && rawMessage) {
        try {
          const rawPayload = rawMessage.message ? rawMessage : { key: rawMessage.key, message: rawMessage };
          const ctx = sock?.updateMediaMessage ? { reuploadRequest: sock.updateMediaMessage.bind(sock) } : undefined;
          buffer = await downloadMediaMessage(rawPayload, 'buffer', {}, ctx);
        } catch (rawErr) {
          console.warn(`[Download Warning - downloadMediaMessage]: ${rawErr.message}`);
        }
      }

      if (!buffer || buffer.length === 0) {
        return null;
      }

      fs.writeFileSync(filePath, buffer);
      return `/uploads/${filename}`;
    } catch (err) {
      console.warn("[WhatsApp Media Download Warning]:", err.message);
      return null;
    }
  }

  async fetchProfilePicture(userId, sessionName = "default", rawJid) {
    const jid = sanitizeJid(rawJid);
    if (!jid || jid.includes("@newsletter") || jid.includes("status@broadcast") || jid === "0@s.whatsapp.net") {
      return null;
    }
    if ((jid.match(/@/g) || []).length !== 1) {
      return null;
    }
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);
    if (!session || !session.sock || session.status !== "CONNECTED") {
      return null;
    }

    try {
      let url = await session.sock.profilePictureUrl(jid, 'image').catch(() => null);
      if (!url) {
        url = await session.sock.profilePictureUrl(jid, 'preview').catch(() => null);
      }
      if (url) {
        await ContactModel.updateAvatar(userId, jid, url);
        socketService.emitToUser(userId, "chat_avatar_update", { jid, avatarUrl: url });
        return url;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async syncAvatars(userId, sessionName = "default") {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);
    if (!session || !session.sock || session.status !== "CONNECTED") {
      return;
    }

    try {
      const contactsToFetch = await ContactModel.getContactsWithoutAvatar(userId, 50);
      if (!contactsToFetch || contactsToFetch.length === 0) return;

      for (let i = 0; i < contactsToFetch.length; i += 4) {
        const batch = contactsToFetch.slice(i, i + 4);
        await Promise.all(
          batch.map(async (c) => {
            const targetJid = c.jid || (c.is_group ? c.phone : `${c.phone}@s.whatsapp.net`);
            if (targetJid) {
              await this.fetchProfilePicture(userId, sessionName, targetJid).catch(() => {});
            }
          })
        );
        if (i + 4 < contactsToFetch.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      socketService.emitToUser(userId, "chats_updated", {});
    } catch (err) {
      console.error(`[WhatsApp - ${userId}] Error syncing avatars:`, err.message);
    }
  }

  async syncGroupsAndChats(userId, sessionName = "default") {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);
    if (!session || !session.sock || session.status !== "CONNECTED") {
      return { success: false, message: "WhatsApp belum terhubung" };
    }

    try {
      let groupCount = 0;
      try {
        const groupsMap = await session.sock.groupFetchAllParticipating();
        const groupList = Object.values(groupsMap);
        groupCount = groupList.length;

        for (const g of groupList) {
          let avatarUrl = null;
          try {
            avatarUrl = await session.sock.profilePictureUrl(g.id, 'image').catch(() => null);
            if (!avatarUrl) {
              avatarUrl = await session.sock.profilePictureUrl(g.id, 'preview').catch(() => null);
            }
          } catch (e) {}

          await ContactModel.upsertGroup(userId, {
            jid: g.id,
            name: g.subject || "Grup WhatsApp",
            avatarUrl,
            desc: g.desc || "",
          });
        }
      } catch (grpErr) {
        console.warn(`[WhatsApp - ${userId}] Error fetching groups:`, grpErr.message);
      }

      if (session.contacts && session.contacts.size > 0) {
        for (const c of session.contacts.values()) {
          await this._processContactObject(userId, sessionName, c);
        }
      }

      await this.syncAvatars(userId, sessionName).catch(() => {});
      await ContactModel.syncContactNamesFromHistory(userId).catch(() => {});
      await ContactModel.syncLastMessagesFromHistory(userId);
      socketService.emitToUser(userId, "chat_sync_complete", { count: groupCount });
      socketService.emitToUser(userId, "chats_updated", {});
      return { success: true, count: groupCount };
    } catch (err) {
      console.error(`[WhatsApp - ${userId}] Error syncing groups and contacts:`, err.message);
      return { success: false, error: err.message };
    }
  }

  findMediaInObject(obj, allowQuoted = false) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.imageMessage) return { type: 'image', media: obj.imageMessage };
    if (obj.videoMessage) return { type: 'video', media: obj.videoMessage };
    if (obj.audioMessage) return { type: 'audio', media: obj.audioMessage };
    if (obj.documentMessage) return { type: 'document', media: obj.documentMessage };
    if (obj.stickerMessage) return { type: 'sticker', media: obj.stickerMessage };

    if (obj.mimetype && (obj.url || obj.directPath || obj.mediaKey || obj.fileSha256)) {
      if (obj.mimetype.startsWith('image/')) return { type: 'image', media: obj };
      if (obj.mimetype.startsWith('video/')) return { type: 'video', media: obj };
      if (obj.mimetype.startsWith('audio/')) return { type: 'audio', media: obj };
      return { type: 'document', media: obj };
    }

    for (const key of Object.keys(obj)) {
      if (!allowQuoted && (key === 'contextInfo' || key === 'quotedMessage')) continue;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const found = this.findMediaInObject(obj[key], allowQuoted);
        if (found) return found;
      }
    }
    return null;
  }

  _unwrapWAMessage(raw) {
    if (!raw) return null;
    const msg = raw.message?.message ? raw.message : (raw.message ? raw : null);
    const key = raw.key || msg?.key;
    if (!key || !key.remoteJid) return null;

    let isViewOnce = !!(key.isViewOnce || raw.isViewOnce || raw.key?.isViewOnce);
    const rawStr = JSON.stringify(raw.message || {});
    if (
      rawStr.includes('"viewOnceMessage"') ||
      rawStr.includes('"viewOnceMessageV2"') ||
      rawStr.includes('"viewOnceMessageV2Extension"') ||
      rawStr.includes('"viewOnce":true') ||
      rawStr.includes('"isViewOnce":true')
    ) {
      isViewOnce = true;
    }

    let m = raw.message || raw;
    for (let i = 0; i < 15; i++) {
      if (!m || typeof m !== 'object') break;

      if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) {
        isViewOnce = true;
      }

      if (m.viewOnceMessage) {
        m = m.viewOnceMessage.message || m.viewOnceMessage;
        continue;
      }
      if (m.viewOnceMessageV2) {
        m = m.viewOnceMessageV2.message || m.viewOnceMessageV2;
        continue;
      }
      if (m.viewOnceMessageV2Extension) {
        m = m.viewOnceMessageV2Extension.message || m.viewOnceMessageV2Extension;
        continue;
      }
      if (m.ephemeralMessage) {
        m = m.ephemeralMessage.message || m.ephemeralMessage;
        continue;
      }
      if (m.documentWithCaptionMessage) {
        m = m.documentWithCaptionMessage.message || m.documentWithCaptionMessage;
        continue;
      }
      if (m.deviceSentMessage) {
        m = m.deviceSentMessage.message || m.deviceSentMessage;
        continue;
      }
      if (m.botInvokeMessage) {
        m = m.botInvokeMessage.message || m.botInvokeMessage;
        continue;
      }
      if (m.editedMessage) {
        m = m.editedMessage.message?.protocolMessage?.editedMessage || m.editedMessage.message || m.editedMessage;
        continue;
      }
      if (m.templateMessage) {
        m = m.templateMessage.hydratedTemplate || m.templateMessage.hydratedFourRowTemplate || m.templateMessage;
        continue;
      }
      if (m.interactiveMessage) {
        m = m.interactiveMessage.header || m.interactiveMessage.body || m.interactiveMessage;
        continue;
      }
      if (m.message && typeof m.message === 'object') {
        m = m.message;
        continue;
      }

      break;
    }

    if (m?.imageMessage?.viewOnce || m?.videoMessage?.viewOnce || m?.audioMessage?.viewOnce) {
      isViewOnce = true;
    }

    return {
      key,
      remoteJid: key.remoteJid,
      fromMe: !!key.fromMe,
      messageId: key.id,
      participant: key.participant,
      pushName: msg?.pushName || raw.pushName || null,
      timestamp: msg?.messageTimestamp || raw.messageTimestamp || null,
      proto: m,
      isViewOnce,
    };
  }

  async _processContactObject(userId, sessionName, c) {
    if (!c) return;
    let rawId = c.id || c.phoneNumber || c.phone || "";
    if (!rawId && c.lid) rawId = c.lid;
    if (!rawId) return;

    if (rawId.includes("status@broadcast") || rawId.includes("@newsletter") || rawId === "0@s.whatsapp.net") {
      return;
    }

    let isGroup = rawId.endsWith("@g.us");
    let cleanPhone = isGroup ? rawId : rawId.replace(/[^0-9]/g, "");
    let cleanJid = isGroup ? rawId : `${cleanPhone}@s.whatsapp.net`;

    if (c.phoneNumber && !isGroup) {
      cleanPhone = String(c.phoneNumber).replace(/[^0-9]/g, "");
      cleanJid = `${cleanPhone}@s.whatsapp.net`;
    } else if (rawId.endsWith("@lid") || (c.lid && !cleanJid.endsWith("@s.whatsapp.net"))) {
      const targetLid = rawId.endsWith("@lid") ? rawId : c.lid;
      const resolved = this.resolveLidToPhone(userId, sessionName, targetLid);
      if (resolved.jid.endsWith("@s.whatsapp.net")) {
        cleanJid = resolved.jid;
        cleanPhone = resolved.phone;
      } else if (c.phoneNumber) {
        cleanPhone = String(c.phoneNumber).replace(/[^0-9]/g, "");
        cleanJid = `${cleanPhone}@s.whatsapp.net`;
      } else {
        const key = this.getSessionKey(userId, sessionName);
        const session = this.sessions.get(key);
        const lidNum = targetLid.replace(/[^0-9]/g, "");
        if (session?.lidMap?.has(lidNum)) {
          cleanPhone = session.lidMap.get(lidNum);
          cleanJid = `${cleanPhone}@s.whatsapp.net`;
        } else {
          return;
        }
      }
    }

    const savedName = c.name && c.name.trim() ? c.name.trim() : null;
    const pushName = (c.notify || c.verifiedName) && (c.notify || c.verifiedName).trim() ? (c.notify || c.verifiedName).trim() : null;
    const avatarUrl = c.imgUrl || null;

    await ContactModel.upsertContact(userId, {
      jid: cleanJid,
      phone: cleanPhone,
      savedName,
      pushName,
      avatarUrl,
      isGroup,
    });
  }

  async _processChatObject(userId, sessionName, c) {
    if (!c || (!c.id && !c.phone)) return;
    let rawId = c.id || c.phone || "";
    if (rawId.includes("status@broadcast") || rawId.includes("@newsletter") || rawId === "0@s.whatsapp.net") {
      return;
    }

    let isGroup = rawId.endsWith("@g.us");
    let cleanPhone = isGroup ? rawId : rawId.replace(/[^0-9]/g, "");
    let cleanJid = isGroup ? rawId : `${cleanPhone}@s.whatsapp.net`;

    if (rawId.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, rawId);
      if (resolved.jid.endsWith("@s.whatsapp.net")) {
        cleanJid = resolved.jid;
        cleanPhone = resolved.phone;
      } else {
        return;
      }
    }

    const name = c.name || (isGroup ? "Grup WhatsApp" : `+${cleanPhone}`);
    const unreadCount = typeof c.unreadCount === "number" ? c.unreadCount : 0;
    const lastMessageTime = c.conversationTimestamp 
      ? new Date(Number(c.conversationTimestamp) * 1000) 
      : (c.lastMessageRecvTimestamp ? new Date(Number(c.lastMessageRecvTimestamp) * 1000) : null);

    let lastMessageText = null;

    if (Array.isArray(c.messages) && c.messages.length > 0) {
      const latestMsg = c.messages[c.messages.length - 1];
      const parsed = this._unwrapWAMessage(latestMsg);
      if (parsed && parsed.proto) {
        const text = parsed.proto.conversation || parsed.proto.extendedTextMessage?.text || (parsed.proto.imageMessage ? "📷 Foto" : (parsed.proto.videoMessage ? "🎥 Video" : null));
        if (text) {
          if (parsed.fromMe) {
            lastMessageText = `✓ ${text}`;
          } else if (isGroup && parsed.pushName && parsed.pushName !== "Kontak") {
            lastMessageText = `~ ${parsed.pushName}: ${text}`;
          } else {
            lastMessageText = text;
          }
        }
      }
    }

    let isPinned = undefined;
    let pinnedAt = undefined;
    if (c.pinned !== undefined) {
      if (c.pinned === null || c.pinned === 0 || c.pinned === false) {
        isPinned = false;
        pinnedAt = null;
      } else {
        isPinned = true;
        pinnedAt = typeof c.pinned === "number" && c.pinned > 0
          ? (c.pinned > 10000000000 ? new Date(c.pinned) : new Date(c.pinned * 1000))
          : new Date();
      }
    }

    let isArchived = undefined;
    if (c.archived !== undefined) {
      isArchived = !!c.archived;
    } else if (c.archive !== undefined) {
      isArchived = !!c.archive;
    }

    await ContactModel.upsertChat(userId, {
      jid: cleanJid,
      name,
      phone: cleanPhone,
      isGroup,
      unreadCount,
      lastMessageText,
      lastMessageTime,
      isPinned,
      pinnedAt,
      isArchived,
    });
  }

  async _processMessageObject(userId, sessionName, raw) {
    const parsed = this._unwrapWAMessage(raw);
    if (!parsed || !parsed.remoteJid) return;

    let { remoteJid, fromMe, messageId, pushName, timestamp, proto, participant, isViewOnce } = parsed;

    if (remoteJid.includes("@newsletter") || remoteJid === "0@s.whatsapp.net") {
      return;
    }

    if (!proto && raw) {
      const unwrapped = this._unwrapWAMessage(raw);
      proto = unwrapped?.proto;
      if (unwrapped?.isViewOnce) isViewOnce = true;
    }

    const keySession = this.sessions.get(this.getSessionKey(userId, sessionName));
    const currentSock = keySession?.sock || null;
    const foundMedia = this.findMediaInObject(proto, false) || this.findMediaInObject(raw, false);

    const contextInfo =
      proto?.extendedTextMessage?.contextInfo ||
      proto?.imageMessage?.contextInfo ||
      proto?.videoMessage?.contextInfo ||
      proto?.audioMessage?.contextInfo ||
      proto?.documentMessage?.contextInfo ||
      proto?.stickerMessage?.contextInfo ||
      raw?.message?.extendedTextMessage?.contextInfo ||
      raw?.message?.imageMessage?.contextInfo ||
      raw?.message?.videoMessage?.contextInfo ||
      raw?.message?.viewOnceMessage?.message?.imageMessage?.contextInfo ||
      raw?.message?.viewOnceMessage?.message?.videoMessage?.contextInfo ||
      raw?.message?.viewOnceMessageV2?.message?.imageMessage?.contextInfo ||
      raw?.message?.viewOnceMessageV2?.message?.videoMessage?.contextInfo ||
      raw?.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
      null;

    const qProto = contextInfo?.quotedMessage || null;
    const quotedMedia = qProto ? this.findMediaInObject(qProto, true) : null;

    if (contextInfo && contextInfo.stanzaId) {
      const targetQuotedId = contextInfo.stanzaId;
      try {
        let quotedDbMsg = await MessageModel.getById(targetQuotedId, userId).catch(() => null);

        if (quotedMedia && quotedMedia.media && (!quotedDbMsg || !quotedDbMsg.media_url)) {
          const qMediaType = quotedMedia.type || "image";
          const savedUrl = await this.downloadAndSaveMedia(
            quotedMedia.media,
            qMediaType,
            targetQuotedId,
            raw,
            currentSock
          );

          if (savedUrl) {
            const fallbackContent = qMediaType === "video" ? "👁️ Video Sekali Lihat" : "👁️ Foto Sekali Lihat";
            const updatedQuoted = await MessageModel.updateMedia(userId, targetQuotedId, {
              mediaUrl: savedUrl,
              mediaType: qMediaType,
              content: (quotedDbMsg?.content && !quotedDbMsg.content.includes("Sekali Lihat")) ? quotedDbMsg.content : fallbackContent,
              mediaCaption: quotedDbMsg?.media_caption || "Pesan Sekali Lihat",
            });

            if (updatedQuoted) {
              quotedDbMsg = updatedQuoted;
              socketService.emitToUser(userId, "message_edited", {
                messageId: updatedQuoted.message_id || targetQuotedId,
                newContent: updatedQuoted.content,
                mediaUrl: updatedQuoted.media_url,
                mediaType: updatedQuoted.media_type,
                mediaCaption: updatedQuoted.media_caption,
                remoteJid: updatedQuoted.remote_jid || remoteJid,
                rawData: updatedQuoted.raw_data,
                message: updatedQuoted,
              });
              socketService.emitToUser(userId, "message_updated", {
                message: updatedQuoted,
                remoteJid: updatedQuoted.remote_jid || remoteJid,
              });
              socketService.emitToUser(userId, "message_new", {
                message: updatedQuoted,
                remoteJid: updatedQuoted.remote_jid || remoteJid,
              });
            }
          }
        }

        const isQuotedVo = quotedDbMsg?.media_type === "view_once" || quotedDbMsg?.raw_data?.isViewOnce;
        if (isQuotedVo && (!quotedDbMsg || !quotedDbMsg.media_url)) {
          const pJid = quotedDbMsg?.from_me ? undefined : (contextInfo.participant || (quotedDbMsg?.phone ? `${quotedDbMsg.phone}@s.whatsapp.net` : undefined));
          this.requestMissingMedia(userId, sessionName, targetQuotedId, remoteJid, pJid, !!quotedDbMsg?.from_me).catch(() => {});
        }
      } catch (qErr) {
        console.warn(`[WhatsApp - ${userId}] Error processing quoted media for ${targetQuotedId}:`, qErr.message);
      }
    }

    if (messageId) {
      const cacheKey = `${userId}_${messageId}`;
      if (this.processedMessageIds.has(cacheKey) && !foundMedia && !quotedMedia) {
        return;
      }
      this.processedMessageIds.set(cacheKey, Date.now());
      if (this.processedMessageIds.size > 2000) {
        const now = Date.now();
        for (const [k, v] of this.processedMessageIds.entries()) {
          if (now - v > 300000) this.processedMessageIds.delete(k);
        }
      }
    }

    if (remoteJid.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, remoteJid);
      remoteJid = resolved.jid;
    }

    if (remoteJid.includes("status@broadcast")) {
      return;
    }

    const protocolMsg = raw.message?.protocolMessage || proto?.protocolMessage;
    if (protocolMsg) {
      if (protocolMsg.type === 0 && protocolMsg.key?.id) {
        const targetId = protocolMsg.key.id;
        await MessageModel.markAsRevoked(userId, targetId);
        socketService.emitToUser(userId, "message_revoked", {
          messageId: targetId,
          remoteJid: protocolMsg.key.remoteJid || remoteJid,
        });
        return;
      }
      if (protocolMsg.type === 14 && protocolMsg.key?.id) {
        const targetId = protocolMsg.key.id;
        const editedProto = protocolMsg.editedMessage;
        let editedText = "";
        if (editedProto) {
          const unwrapped = this._unwrapWAMessage(editedProto);
          editedText = unwrapped.proto?.conversation || unwrapped.proto?.extendedTextMessage?.text || "";
        }
        if (editedText) {
          const updated = await MessageModel.updateContent(userId, targetId, editedText);
          socketService.emitToUser(userId, "message_edited", {
            messageId: targetId,
            newContent: editedText,
            remoteJid: protocolMsg.key.remoteJid || remoteJid,
            rawData: updated?.raw_data || { isEdited: true },
          });
        }
        return;
      }
    }

    const msgTimeSec = Number(timestamp || Date.now() / 1000);
    const oneWeekAgoSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    if (msgTimeSec < oneWeekAgoSec) {
      return;
    }

    const isGroup = remoteJid.endsWith("@g.us");
    const rawPhone = isGroup ? remoteJid : remoteJid.replace(/[^0-9]/g, "");
    const senderName = pushName || (fromMe ? "Saya" : (isGroup ? "Anggota Grup" : `+${rawPhone}`));

    let textContent = "";
    let mediaType = "text";
    let mediaUrl = null;
    let mediaCaption = null;

    if (foundMedia) {
      const { type, media } = foundMedia;
      const isVo = !!(isViewOnce || media?.viewOnce || media?.isViewOnce);
      if (type === "image") {
        textContent = media.caption || (isVo ? "👁️ Foto (Sekali Lihat)" : "📷 Foto");
        mediaType = "image";
        mediaCaption = media.caption || (isVo ? "👁️ Foto Sekali Lihat" : null);
        mediaUrl = await this.downloadAndSaveMedia(media, "image", messageId, raw, currentSock);
      } else if (type === "video") {
        textContent = media.caption || (isVo ? "👁️ Video (Sekali Lihat)" : "🎥 Video");
        mediaType = "video";
        mediaCaption = media.caption || (isVo ? "👁️ Video Sekali Lihat" : null);
        mediaUrl = await this.downloadAndSaveMedia(media, "video", messageId, raw, currentSock);
      } else if (type === "audio") {
        textContent = media.ptt ? "🎤 Pesan Suara" : "🎵 Audio";
        mediaType = media.ptt ? "voice" : "audio";
        mediaCaption = media.ptt ? "Pesan Suara" : "Audio";
        mediaUrl = await this.downloadAndSaveMedia(media, "audio", messageId, raw, currentSock);
      } else if (type === "document") {
        textContent = `📄 ${media.fileName || media.caption || "Dokumen"}`;
        mediaType = "document";
        mediaCaption = media.fileName || media.caption;
        mediaUrl = await this.downloadAndSaveMedia(media, "document", messageId, raw, currentSock);
      } else if (type === "sticker") {
        textContent = "🎨 Stiker";
        mediaType = "sticker";
      }
    } else if (proto?.conversation) {
      textContent = proto.conversation;
    } else if (proto?.extendedTextMessage) {
      textContent = proto.extendedTextMessage.text || "";
    } else if (proto?.contactMessage) {
      textContent = `👤 ${proto.contactMessage.displayName || "Kontak"}`;
      mediaType = "contact";
    } else if (proto?.contactsArrayMessage) {
      textContent = "👥 Kontak";
      mediaType = "contact";
    } else if (proto?.locationMessage) {
      textContent = `📍 ${proto.locationMessage.name || "Lokasi"}`;
      mediaType = "location";
    } else if (proto?.liveLocationMessage) {
      textContent = "📍 Lokasi Terkini";
      mediaType = "location";
    } else if (proto?.pollCreationMessage || proto?.pollCreationMessageV3) {
      textContent = `📊 Polling: ${proto.pollCreationMessage?.name || proto.pollCreationMessageV3?.name || "Polling"}`;
      mediaType = "poll";
    } else if (proto?.groupInviteMessage) {
      textContent = `✉️ Undangan Grup: ${proto.groupInviteMessage.groupName || "Grup"}`;
      mediaType = "invite";
    }

    const isVoDetected = !!(isViewOnce || parsed?.isViewOnce || raw?.key?.isViewOnce || parsed?.key?.isViewOnce || raw?.isViewOnce);

    if (!textContent && isVoDetected) {
      textContent = "👁️ Foto / Video (Sekali Lihat)";
      mediaType = "view_once";
      mediaCaption = "Pesan Sekali Lihat";
    }

    if (!foundMedia && isVoDetected && currentSock && typeof currentSock.requestPlaceholderResend === "function" && messageId) {
      const cleanKey = {
        remoteJid: raw.key?.remoteJid || remoteJid,
        fromMe: !!(raw.key?.fromMe ?? fromMe),
        id: messageId,
        participant: raw.key?.participant || participant || undefined,
      };
      currentSock.requestPlaceholderResend(cleanKey, raw).catch((err) => {
        console.warn(`[WhatsApp - ${userId}] requestPlaceholderResend error for ${messageId}:`, err.message);
      });
    }

    if (!textContent && mediaType === "text") return;

    if (!fromMe && !isGroup && pushName && pushName.trim() && pushName !== "Kontak" && pushName !== "Saya") {
      await ContactModel.updatePushName(userId, remoteJid, pushName.trim());
    }

    let quotedMessageData = null;
    if (contextInfo && (contextInfo.stanzaId || contextInfo.quotedMessage)) {
      const unwrappedQ = qProto?.viewOnceMessage?.message || qProto?.viewOnceMessageV2?.message || qProto?.viewOnceMessageV2Extension?.message || qProto || {};
      let qText = unwrappedQ.conversation || unwrappedQ.extendedTextMessage?.text;
      let qMediaType = "text";
      if (!qText) {
        if (unwrappedQ.imageMessage) {
          qMediaType = "image";
          qText = unwrappedQ.imageMessage.caption || "📷 Foto";
        } else if (unwrappedQ.videoMessage) {
          qMediaType = "video";
          qText = unwrappedQ.videoMessage.caption || "🎥 Video";
        } else if (unwrappedQ.audioMessage) {
          qMediaType = unwrappedQ.audioMessage.ptt ? "voice" : "audio";
          qText = unwrappedQ.audioMessage.ptt ? "🎤 Pesan Suara" : "🎵 Audio";
        } else if (unwrappedQ.documentMessage) {
          qMediaType = "document";
          qText = `📄 ${unwrappedQ.documentMessage.fileName || unwrappedQ.documentMessage.caption || "Dokumen"}`;
        } else if (unwrappedQ.stickerMessage) {
          qMediaType = "sticker";
          qText = "🎨 Stiker";
        } else if (unwrappedQ.contactMessage) {
          qMediaType = "contact";
          qText = `👤 ${unwrappedQ.contactMessage.displayName || "Kontak"}`;
        } else if (unwrappedQ.locationMessage) {
          qMediaType = "location";
          qText = `📍 ${unwrappedQ.locationMessage.name || "Lokasi"}`;
        }
      }

      const qParticipant = contextInfo.participant || "";
      const qPhone = qParticipant ? qParticipant.replace(/[^0-9]/g, "") : "";
      const myPhone = keySession?.phoneNumber || (keySession?.sock?.user?.id ? keySession.sock.user.id.split(":")[0] : "");
      const isQFromMe = (myPhone && qPhone && qPhone === myPhone) || (fromMe && !contextInfo.participant);

      quotedMessageData = {
        messageId: contextInfo.stanzaId || null,
        senderJid: qParticipant || null,
        senderPhone: qPhone || null,
        senderName: isQFromMe ? "Saya" : (qPhone ? `+${qPhone}` : "Kontak"),
        fromMe: isQFromMe,
        content: qText || "Pesan",
        mediaType: qMediaType,
      };
    }

    try {
      const contact = await ContactModel.findOrCreate(userId, {
        savedName: null,
        pushName: (!fromMe && pushName) ? pushName.trim() : null,
        phone: rawPhone,
        jid: remoteJid,
        isGroup,
      });

      if (!contact) return;

      const savedMessage = await MessageModel.create({
        userId,
        contactId: contact.id,
        phone: rawPhone,
        remoteJid,
        messageId,
        senderName,
        content: textContent,
        mediaType,
        mediaUrl,
        mediaCaption,
        quotedMessage: quotedMessageData,
        rawData: {
          ...(isVoDetected ? { isViewOnce: true } : {}),
          ...(raw?.message ? { protoMessage: raw.message } : {}),
        },
        direction: fromMe ? "OUTGOING" : "INCOMING",
        status: fromMe ? "SENT" : "DELIVERED",
        fromMe,
        sentAt: new Date(Number(timestamp || Date.now() / 1000) * 1000),
      });

      let displaySnippet = textContent;
      if (fromMe) {
        displaySnippet = `✓ ${textContent}`;
      } else if (isGroup) {
        let senderLabel = senderName;
        if (participant) {
          const pPhone = participant.replace(/[^0-9]/g, "");
          const senderContact = await ContactModel.findByPhone(userId, pPhone).catch(() => null);
          if (senderContact && senderContact.name && senderContact.saved_name) {
            senderLabel = senderContact.saved_name;
          }
        }
        if (senderLabel && senderLabel !== "Kontak" && senderLabel !== "Anggota Grup") {
          displaySnippet = `${senderLabel}: ${textContent}`;
        }
      }

      await ContactModel.updateLastMessage(userId, remoteJid, {
        text: displaySnippet,
        timestamp: savedMessage.sent_at,
        incrementUnread: !fromMe,
      });

      socketService.emitToUser(userId, "message_new", {
        message: savedMessage,
        contact,
        remoteJid,
      });

      if (mediaUrl) {
        socketService.emitToUser(userId, "message_edited", {
          messageId: savedMessage.message_id || savedMessage.id,
          newContent: savedMessage.content,
          mediaUrl: savedMessage.media_url,
          mediaType: savedMessage.media_type,
          mediaCaption: savedMessage.media_caption,
          remoteJid: savedMessage.remote_jid || remoteJid,
          rawData: savedMessage.raw_data,
          message: savedMessage,
        });

        socketService.emitToUser(userId, "message_updated", {
          message: savedMessage,
          remoteJid: savedMessage.remote_jid || remoteJid,
        });
      }

      socketService.emitToUser(userId, "chat_update", {
        jid: remoteJid,
        lastMessage: displaySnippet,
        lastMessageTime: savedMessage.sent_at,
        unreadIncrement: !fromMe,
      });

      if (!fromMe && !isGroup) {
        await this._handleAutoReplyLogic(userId, sessionName, remoteJid, rawPhone, senderName, textContent);
      }
    } catch (err) {
      console.error(`[WhatsApp - ${userId}] Error processing message:`, err.message);
    }
  }

  async _handleAutoReplyLogic(userId, sessionName, remoteJid, senderPhone, senderName, incomingText) {
    try {
      const replyLockKey = `${userId}_${remoteJid}`;
      if (this.autoReplyLock.has(replyLockKey)) {
        return;
      }
      this.autoReplyLock.add(replyLockKey);

      try {
        const hasAdminEnv = (process.env.ADMIN_PHONE_NUMBERS || "").trim().length > 0;
        if (hasAdminEnv && this._isAdminNumber(senderPhone)) {
          if (incomingText.toLowerCase().includes("kirim") || incomingText.toLowerCase().includes("bantuan") || incomingText.toLowerCase().includes("status")) {
            const aiResult = await aiService.parseAndGenerate(incomingText);

            if (aiResult.action === "SEND_DISPATCH" && aiResult.targetPhone && Array.isArray(aiResult.messages) && aiResult.messages.length > 0) {
              const ackMsg = aiResult.replyToAdmin ||
                `🚀 *Memulai Pengiriman Pesan*\n• Target: ${aiResult.targetPhone}\n• Jumlah: ${aiResult.messages.length} pesan\n• Jeda: ${aiResult.intervalSeconds || 5}s per pesan`;

              await this.sendDirectMessage(senderPhone, ackMsg, sessionName, userId);

              const dispatchJobId = 'job_' + Date.now();

              await enqueueDispatch({
                jobId: dispatchJobId,
                userId,
                adminPhone: senderPhone,
                targetPhone: aiResult.targetPhone,
                messages: aiResult.messages,
                intervalSeconds: aiResult.intervalSeconds || 5,
                sessionName,
              });
              return;
            }
          }
        }

        let aiSetting = await ChatAiSettingModel.getByJid(userId, remoteJid);
        if (!aiSetting && senderPhone) {
          aiSetting = await ChatAiSettingModel.getByJid(userId, senderPhone);
        }

        if (aiSetting && (aiSetting.auto_reply_enabled || aiSetting.autoReplyEnabled)) {
          let replyText = null;

          if (aiSetting.reply_mode === 'static' && aiSetting.static_reply_text && aiSetting.static_reply_text.trim()) {
            replyText = aiSetting.static_reply_text.trim();
          } else {
            const chatContext = await MessageModel.getRecentChatContext(userId, remoteJid, 8);
            replyText = await aiService.generateAutoReply(
              aiSetting.custom_prompt,
              chatContext,
              incomingText,
              senderName || senderPhone
            );
          }

          if (replyText) {
            await new Promise((r) => setTimeout(r, 1200));
            await this.sendChatMessage(userId, {
              jid: remoteJid,
              text: replyText,
              sessionName,
            });

            if (aiSetting.disable_after_one_reply) {
              try {
                const updatedSetting = await ChatAiSettingModel.toggleAutoReply(userId, aiSetting.jid || remoteJid, false);
                socketService.emitToUser(userId, 'ai_setting_updated', updatedSetting);
                socketService.emitToUser(userId, 'chats_updated', {});
              } catch (toggleErr) {
                console.warn(`[WhatsApp - ${userId}] Error auto-deactivating AI setting:`, toggleErr.message);
              }
            }
          }
        }
      } finally {
        setTimeout(() => {
          this.autoReplyLock.delete(replyLockKey);
        }, 4000);
      }
    } catch (aiErr) {
      console.error(`[WhatsApp - ${userId}] Auto-reply error:`, aiErr.message);
    }
  }

  async sendChatMessage(userId, { jid, text, quotedMessageId = null, sessionName = "default" }) {
    if (!jid || !text || text.trim() === "") {
      throw new Error("JID dan teks pesan diperlukan");
    }

    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    if (!session || session.status !== "CONNECTED" || !session.sock) {
      throw new Error("WhatsApp Anda belum terhubung. Silakan hubungkan WhatsApp terlebih dahulu.");
    }

    const cleanJidRaw = sanitizeJid(jid);
    if (!cleanJidRaw) {
      throw new Error("Format JID penerima tidak valid");
    }

    const isGroup = cleanJidRaw.endsWith("@g.us");
    let cleanJid = cleanJidRaw;
    let cleanPhone = isGroup ? cleanJidRaw : cleanJidRaw.replace(/[^0-9]/g, "");

    if (cleanJidRaw.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, cleanJidRaw);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    }

    const contact = await ContactModel.findOrCreate(userId, {
      name: isGroup ? "Grup WhatsApp" : `+${cleanPhone}`,
      phone: cleanPhone,
      jid: cleanJid,
      isGroup,
    });

    let quotedPayload = undefined;
    let quotedMessageData = null;

    if (quotedMessageId) {
      const origMsg = await MessageModel.getById(quotedMessageId, userId);
      if (origMsg) {
        const isOrigFromMe = !!origMsg.from_me;
        let participant = undefined;
        if (isGroup) {
          if (isOrigFromMe) {
            participant = session.sock.user?.id ? session.sock.user.id.split(":")[0] + "@s.whatsapp.net" : undefined;
          } else if (origMsg.phone) {
            participant = `${String(origMsg.phone).replace(/[^0-9]/g, "")}@s.whatsapp.net`;
          }
        }

        let origContent = { conversation: origMsg.content || "" };
        const isVo = origMsg.media_type === "view_once" || origMsg.raw_data?.isViewOnce;
        const isVid = origMsg.media_type === "video" || (typeof origMsg.content === 'string' && origMsg.content.toLowerCase().includes("video"));
        if (isVo) {
          if (isVid) {
            origContent = {
              viewOnceMessage: {
                message: {
                  videoMessage: { caption: origMsg.media_caption || origMsg.content || "" }
                }
              }
            };
          } else {
            origContent = {
              viewOnceMessage: {
                message: {
                  imageMessage: { caption: origMsg.media_caption || origMsg.content || "" }
                }
              }
            };
          }
        } else if (origMsg.media_type === "image") {
          origContent = { imageMessage: { caption: origMsg.content || "" } };
        } else if (origMsg.media_type === "video") {
          origContent = { videoMessage: { caption: origMsg.content || "" } };
        } else if (origMsg.media_type === "voice" || origMsg.media_type === "audio") {
          origContent = { audioMessage: { ptt: origMsg.media_type === "voice" } };
        } else if (origMsg.media_type === "document") {
          origContent = { documentMessage: { fileName: origMsg.content || "Dokumen" } };
        }

        quotedPayload = {
          key: {
            remoteJid: cleanJid,
            fromMe: isOrigFromMe,
            id: origMsg.message_id || origMsg.id,
            participant,
          },
          message: origContent,
        };

        if (isVo || !origMsg.media_url) {
          this.requestMissingMedia(
            userId,
            sessionName,
            origMsg.message_id || origMsg.id,
            cleanJid,
            origMsg.from_me ? undefined : (origMsg.phone ? `${origMsg.phone}@s.whatsapp.net` : undefined),
            !!origMsg.from_me
          ).catch(() => {});
        }

        quotedMessageData = {
          messageId: origMsg.message_id || origMsg.id,
          senderName: isOrigFromMe ? "Saya" : (origMsg.sender_name || (origMsg.phone ? `+${origMsg.phone}` : "Kontak")),
          senderPhone: origMsg.phone || null,
          content: origMsg.content || "",
          mediaType: origMsg.media_type || "text",
          fromMe: isOrigFromMe,
        };
      }
    }

    const sendOptions = quotedPayload ? { quoted: quotedPayload } : {};
    const sent = await session.sock.sendMessage(cleanJid, {
      text: text.trim(),
    }, sendOptions);

    if (sent?.key?.id) {
      this.processedMessageIds.set(`${userId}_${sent.key.id}`, Date.now());
      if (sent?.message) {
        this.recentSentMessages.set(sent.key.id, sent.message);
      }
    }

    const savedMessage = await MessageModel.create({
      userId,
      contactId: contact?.id || null,
      phone: cleanPhone,
      remoteJid: cleanJid,
      messageId: sent?.key?.id,
      senderName: "Saya",
      content: text.trim(),
      quotedMessage: quotedMessageData,
      rawData: { protoMessage: sent?.message || null },
      direction: "OUTGOING",
      status: "SENT",
      fromMe: true,
      sentAt: new Date(),
    });

    await ContactModel.updateLastMessage(userId, cleanJid, {
      text: text.trim(),
      timestamp: new Date(),
      incrementUnread: false,
    });

    socketService.emitToUser(userId, "message_new", {
      message: savedMessage,
      contact,
      remoteJid: cleanJid,
    });

    return savedMessage;
  }

  async editChatMessage(userId, { jid, messageId, newText, sessionName = "default" }) {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    if (!session || session.status !== "CONNECTED" || !session.sock) {
      throw new Error("WhatsApp Anda belum terhubung.");
    }

    const isGroup = jid.endsWith("@g.us");
    let cleanJid = jid;
    let cleanPhone = isGroup ? jid : jid.replace(/[^0-9]/g, "");

    if (jid.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, jid);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    } else if (!isGroup && !jid.includes("@")) {
      cleanJid = `${cleanPhone}@s.whatsapp.net`;
    }

    const editKey = {
      remoteJid: cleanJid,
      fromMe: true,
      id: messageId,
    };

    await session.sock.sendMessage(cleanJid, {
      text: newText.trim(),
      edit: editKey,
    });

    const updated = await MessageModel.updateContent(userId, messageId, newText.trim());

    socketService.emitToUser(userId, "message_edited", {
      messageId,
      newContent: newText.trim(),
      remoteJid: cleanJid,
      rawData: updated?.raw_data || { isEdited: true },
    });

    return updated || { messageId, content: newText.trim() };
  }

  async deleteMessageForEveryone(userId, { jid, messageId, sessionName = "default" }) {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    if (!session || session.status !== "CONNECTED" || !session.sock) {
      throw new Error("WhatsApp Anda belum terhubung.");
    }

    const isGroup = jid.endsWith("@g.us");
    let cleanJid = jid;
    let cleanPhone = isGroup ? jid : jid.replace(/[^0-9]/g, "");

    if (jid.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, jid);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    } else if (!isGroup && !jid.includes("@")) {
      cleanJid = `${cleanPhone}@s.whatsapp.net`;
    }

    const deleteKey = {
      remoteJid: cleanJid,
      fromMe: true,
      id: messageId,
    };

    await session.sock.sendMessage(cleanJid, {
      delete: deleteKey,
    });

    const updated = await MessageModel.markAsRevoked(userId, messageId);

    socketService.emitToUser(userId, "message_revoked", {
      messageId,
      remoteJid: cleanJid,
    });

    return { success: true, messageId };
  }

  async deleteMessageForMe(userId, { messageId }) {
    await MessageModel.deleteByIdOrMessageId(userId, messageId);

    socketService.emitToUser(userId, "message_deleted_for_me", {
      messageId,
    });

    return { success: true, messageId };
  }

  async modifyChatPin(userId, { jid, pinned, sessionName = "default" }) {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    const isGroup = typeof jid === "string" && jid.endsWith("@g.us");
    let cleanJid = jid;
    let cleanPhone = isGroup ? jid : (jid ? String(jid).replace(/[^0-9]/g, "") : "");

    if (typeof jid === "string" && jid.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, jid);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    } else if (!isGroup && jid && !jid.includes("@")) {
      cleanJid = `${cleanPhone}@s.whatsapp.net`;
    }

    if (session && session.status === "CONNECTED" && session.sock) {
      try {
        await session.sock.chatModify({ pin: !!pinned }, cleanJid);
      } catch (err) {
        console.warn(`[WhatsApp - ${userId}] Error syncing chat pin:`, err.message);
      }
    }
  }

  async modifyChatArchive(userId, { jid, archived, sessionName = "default" }) {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    const isGroup = typeof jid === "string" && jid.endsWith("@g.us");
    let cleanJid = jid;
    let cleanPhone = isGroup ? jid : (jid ? String(jid).replace(/[^0-9]/g, "") : "");

    if (typeof jid === "string" && jid.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, jid);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    } else if (!isGroup && jid && !jid.includes("@")) {
      cleanJid = `${cleanPhone}@s.whatsapp.net`;
    }

    if (session && session.status === "CONNECTED" && session.sock) {
      try {
        let lastMessages = undefined;
        try {
          const msgs = await MessageModel.getByChatJid(userId, cleanJid, 1, 0);
          if (msgs && msgs.length > 0 && msgs[0].message_id) {
            const latest = msgs[0];
            lastMessages = [{
              key: {
                id: latest.message_id,
                remoteJid: cleanJid,
                fromMe: !!latest.from_me,
                participant: latest.sender_phone && cleanJid.endsWith("@g.us") ? `${latest.sender_phone}@s.whatsapp.net` : undefined
              },
              messageTimestamp: Math.floor(new Date(latest.sent_at || latest.created_at).getTime() / 1000)
            }];
          }
        } catch (e) {}

        await session.sock.chatModify({
          archive: !!archived,
          lastMessages
        }, cleanJid);
      } catch (err) {
        console.warn(`[WhatsApp - ${userId}] Error syncing chat archive:`, err.message);
      }
    }
  }

  async requestMissingMedia(userId, sessionName = "default", messageId, remoteJid, participant = undefined, fromMe = false) {
    if (!messageId) return;
    const cleanJid = sanitizeJid(remoteJid);
    if (!cleanJid || (cleanJid.match(/@/g) || []).length !== 1) return;

    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);
    if (!session || !session.sock || session.status !== "CONNECTED") return;

    let targetFromMe = !!fromMe;
    let targetParticipant = participant ? (sanitizeJid(participant) || participant) : undefined;

    try {
      const msgInDb = await MessageModel.getById(messageId, userId).catch(() => null);
      if (msgInDb) {
        targetFromMe = !!msgInDb.from_me;
        if (!targetParticipant && msgInDb.phone && cleanJid.endsWith("@g.us")) {
          targetParticipant = `${String(msgInDb.phone).replace(/[^0-9]/g, "")}@s.whatsapp.net`;
        }
      }
    } catch (e) {}

    const cleanKey = {
      remoteJid: cleanJid,
      fromMe: targetFromMe,
      id: messageId,
      participant: targetParticipant,
    };
    try {
      if (typeof session.sock.requestPlaceholderResend === "function") {
        await session.sock.requestPlaceholderResend(cleanKey).catch(() => {});
      }
      if (!targetFromMe) {
        const isGroup = cleanJid.endsWith("@g.us");
        const node = {
          tag: "message",
          attrs: {
            id: messageId,
            from: cleanJid,
            type: isGroup ? "group" : "chat",
            t: Math.floor(Date.now() / 1000).toString(),
          },
          content: [
            {
              tag: "unavailable",
              attrs: { type: "view_once" }
            }
          ]
        };
        if (isGroup && targetParticipant) {
          node.attrs.participant = targetParticipant;
        }

        if (typeof session.sock.sendRetryRequest === "function") {
          await session.sock.sendRetryRequest(node, true).catch(() => {});
        } else if (typeof session.sock.sendNode === "function") {
          const regId = session.sock.authState?.creds?.registrationId;
          if (regId) {
            const regBuffer = Buffer.alloc(4);
            regBuffer.writeUInt32BE(regId, 0);
            const retryReceipt = {
              tag: "receipt",
              attrs: {
                id: messageId,
                type: "retry",
                to: cleanJid,
              },
              content: [
                {
                  tag: "retry",
                  attrs: {
                    count: "1",
                    id: messageId,
                    t: Math.floor(Date.now() / 1000).toString(),
                    v: "1",
                    error: "0",
                  },
                },
                {
                  tag: "registration",
                  attrs: {},
                  content: regBuffer,
                },
              ],
            };
            if (isGroup && targetParticipant) {
              retryReceipt.attrs.participant = targetParticipant;
            }
            await session.sock.sendNode(retryReceipt).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn(`[WhatsApp - ${userId}] requestMissingMedia error for ${messageId}:`, e.message);
    }
  }

  async requestPairingCode(userId, rawPhone, sessionName = "default") {
    const validation = formatPhoneNumber(rawPhone);
    if (!validation.isValid) {
      const error = new Error(
        validation.error || "Format nomor WhatsApp tidak valid. Gunakan format 08xxx atau 628xxx.",
      );
      error.statusCode = 400;
      throw error;
    }

    const cleanPhone = validation.formattedPhone;
    const key = this.getSessionKey(userId, sessionName);
    const existing = this.sessions.get(key);

    if (existing && existing.status === "CONNECTED" && existing.sock) {
      return {
        status: "CONNECTED",
        phoneNumber: existing.phoneNumber,
        pairingPhone: null,
        pairingCode: null,
      };
    }

    await this.initSession(userId, sessionName, true, cleanPhone);
    const sessionState = this.sessions.get(key);

    if (sessionState && sessionState.pairingPromise) {
      try {
        const code = await sessionState.pairingPromise;
        return {
          status: "PAIRING_CODE",
          pairingCode: code,
          pairingPhone: cleanPhone,
        };
      } catch (err) {
        throw new Error(`Gagal meminta kode pairing dari WhatsApp: ${err.message}`);
      }
    }

    return {
      status: sessionState?.status || "CONNECTING",
      pairingCode: sessionState?.pairingCode || null,
      pairingPhone: cleanPhone,
    };
  }

  async getSessionStatus(userId, sessionName = "default") {
    const key = this.getSessionKey(userId, sessionName);
    const sessionState = this.sessions.get(key);

    const dbSession = await WhatsappSessionModel.getByUserId(
      userId,
      sessionName,
    );

    if (sessionState && !sessionState.destroyed) {
      return {
        status: sessionState.status,
        phoneNumber:
          sessionState.phoneNumber || dbSession?.phone_number || null,
        pairingPhone:
          sessionState.pairingPhone || dbSession?.session_data?.pairingPhone || null,
        pairingCode:
          sessionState.pairingCode || dbSession?.session_data?.pairingCode || null,
        qrCode: sessionState.qrImage || null,
        sessionName,
        updatedAt: dbSession?.updated_at || new Date(),
      };
    }

    const sessionDir = path.join(SESSIONS_BASE_DIR, `${userId}_${sessionName}`);
    const credPath = path.join(sessionDir, "creds.json");
    let isCredValid = false;
    if (fs.existsSync(credPath) && fs.statSync(credPath).size > 20) {
      try {
        const parsed = JSON.parse(fs.readFileSync(credPath, "utf8"));
        if (parsed && (parsed.registered || parsed.me)) {
          isCredValid = true;
        }
      } catch (e) {}
    }

    if (!isCredValid) {
      await this.restoreSessionFilesFromDb(userId, sessionName, sessionDir);
    }

    if (fs.existsSync(credPath)) {
      try {
        const credData = JSON.parse(fs.readFileSync(credPath, "utf8"));
        if (credData.registered || credData.me) {
          const rawPhone = credData.me?.id
            ? credData.me.id.split(":")[0].replace(/[^0-9]/g, "")
            : dbSession?.phone_number || null;

          if (!this.sessions.has(key)) {
            this.initSession(userId, sessionName).catch((err) => {
              console.error(`[WhatsApp - ${userId}] Auto-init failed:`, err.message);
            });
          }

          return {
            status: "CONNECTING",
            phoneNumber: rawPhone,
            pairingPhone: null,
            pairingCode: null,
            qrCode: null,
            sessionName,
            updatedAt: dbSession?.updated_at || new Date(),
          };
        }
      } catch (e) {}
    }

    if (dbSession && (dbSession.status === "CONNECTED" || dbSession.status === "RECONNECTING")) {
      try {
        await WhatsappSessionModel.updateStatus(userId, "DISCONNECTED", {
          phoneNumber: null,
          qrCode: null,
          sessionData: null,
          sessionName,
        });
      } catch (e) {}
      return {
        status: "DISCONNECTED",
        phoneNumber: null,
        pairingPhone: null,
        pairingCode: null,
        qrCode: null,
        sessionName,
        updatedAt: new Date(),
      };
    }

    if (dbSession && dbSession.status === "PAIRING_CODE" && dbSession.session_data?.pairingCode) {
      return {
        status: "PAIRING_CODE",
        phoneNumber: null,
        pairingPhone: dbSession.session_data?.pairingPhone || dbSession.phone_number || null,
        pairingCode: dbSession.session_data?.pairingCode || null,
        qrCode: null,
        sessionName: dbSession.session_name,
        updatedAt: dbSession.updated_at,
      };
    }

    return {
      status: "DISCONNECTED",
      phoneNumber: null,
      pairingPhone: null,
      pairingCode: null,
      qrCode: null,
      sessionName,
      updatedAt: null,
    };
  }

  async disconnectSession(userId, sessionName = "default") {
    const key = this.getSessionKey(userId, sessionName);
    const sessionState = this.sessions.get(key);

    if (sessionState) {
      sessionState.manualDisconnect = true;
      sessionState.destroyed = true;
      sessionState.status = "DISCONNECTED";
      sessionState.pairingCode = null;
      sessionState.pairingPhone = null;
      sessionState.qr = null;
      sessionState.qrImage = null;
      sessionState.phoneNumber = null;

      if (sessionState.sock) {
        try {
          sessionState.sock.ev.removeAllListeners();
          await sessionState.sock.logout().catch(() => {});
        } catch (err) {}
        try {
          sessionState.sock.end(new Error("Manual user disconnect"));
        } catch (e) {}
      }
      this.sessions.delete(key);
    }

    for (const cacheKey of this.processedMessageIds.keys()) {
      if (cacheKey.startsWith(`${userId}_`)) {
        this.processedMessageIds.delete(cacheKey);
      }
    }
    for (const lockKey of this.autoReplyLock.keys()) {
      if (lockKey.startsWith(`${userId}_`)) {
        this.autoReplyLock.delete(lockKey);
      }
    }

    const sessionDir = path.join(SESSIONS_BASE_DIR, `${userId}_${sessionName}`);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (delErr) {
      console.error(`[WhatsApp - ${userId}] Error removing session dir:`, delErr.message);
    }
    await this.clearSessionBackup(userId, sessionName);

    try {
      await WhatsappSessionModel.updateStatus(userId, "DISCONNECTED", {
        phoneNumber: null,
        qrCode: null,
        sessionData: null,
        sessionName,
      });
    } catch (dbErr) {
      console.error(`[WhatsApp - ${userId}] Error updating session status to DISCONNECTED:`, dbErr.message);
    }

    try {
      await MessageModel.deleteAllByUser(userId);
      await ContactModel.deleteAllByUser(userId);
      await CallLogModel.deleteAllByUser(userId);
      await ChatAiSettingModel.deleteAllByUser(userId);
      console.log(`[WhatsApp - ${userId}] All user chats, contacts, messages, and call logs wiped on disconnect.`);
    } catch (wipeErr) {
      console.error(`[WhatsApp - ${userId}] Error wiping user chat data on disconnect:`, wipeErr.message);
    }

    socketService.emitToUser(userId, "wa_status", {
      status: "DISCONNECTED",
      phoneNumber: null,
      pairingCode: null,
      qrCode: null,
    });
    socketService.emitToUser(userId, "chats_updated", { reset: true });
    socketService.emitToUser(userId, "chat_reset", {});

    return {
      status: "DISCONNECTED",
      message: "Koneksi WhatsApp diputus dan seluruh data chat, kontak & pesan telah di-reset bersih.",
    };
  }

  async getGroups(userId, sessionName = "default") {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    if (!session || session.status !== "CONNECTED" || !session.sock) {
      throw new Error("WhatsApp Anda belum terhubung. Silakan hubungkan nomor WhatsApp Anda terlebih dahulu.");
    }

    try {
      const groupsMap = await session.sock.groupFetchAllParticipating();
      const groups = Object.values(groupsMap).map((g) => ({
        id: g.id,
        subject: g.subject || "Grup WhatsApp",
        participantsCount: g.participants ? g.participants.length : 0,
        creation: g.creation ? new Date(g.creation * 1000) : null,
        owner: g.owner || g.subjectOwner || null,
        desc: g.desc || "",
      }));

      groups.sort((a, b) => a.subject.localeCompare(b.subject));
      return groups;
    } catch (err) {
      throw new Error(`Gagal mengambil daftar grup WhatsApp: ${err.message}`);
    }
  }

  async sendTextMessage(
    userId,
    { toPhone, messageText, contactName = null, sessionName = "default" },
  ) {
    return this.sendChatMessage(userId, {
      jid: toPhone,
      text: messageText,
      sessionName,
    });
  }

  _isAdminNumber(phone) {
    const rawAdminEnv = process.env.ADMIN_PHONE_NUMBERS || "";
    const adminList = rawAdminEnv
      .split(",")
      .map((p) => p.trim().replace(/[^0-9]/g, ""))
      .filter(Boolean);

    if (adminList.length === 0) return true;

    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const formatted = formatPhoneNumber(cleanPhone);
    const target = formatted.isValid ? formatted.formattedPhone : cleanPhone;

    return adminList.some((admin) => {
      const f = formatPhoneNumber(admin);
      const adminStandard = f.isValid ? f.formattedPhone : admin;
      return (
        target === adminStandard ||
        target.endsWith(admin) ||
        admin.endsWith(target)
      );
    });
  }

  async sendDirectMessage(
    toPhone,
    messageText,
    sessionName = "default",
    userId = null,
  ) {
    let activeSock = null;
    let activeUserId = userId;

    if (userId) {
      const key = this.getSessionKey(userId, sessionName);
      const session = this.sessions.get(key);
      if (session && session.status === "CONNECTED" && session.sock) {
        activeSock = session.sock;
      }
    }

    if (!activeSock && !userId) {
      for (const [key, session] of this.sessions.entries()) {
        if (session.status === "CONNECTED" && session.sock) {
          activeSock = session.sock;
          activeUserId = key.split("_")[0];
          break;
        }
      }
    }

    if (!activeSock) {
      throw new Error("WhatsApp Bot untuk akun ini belum terhubung (CONNECTED).");
    }

    const cleanJidRaw = sanitizeJid(toPhone);
    if (!cleanJidRaw) {
      throw new Error("Nomor atau JID tujuan tidak valid");
    }

    const isGroup = cleanJidRaw.endsWith("@g.us");
    const cleanPhone = isGroup ? cleanJidRaw : cleanJidRaw.replace(/[^0-9]/g, "");
    const jid = cleanJidRaw;

    const sent = await activeSock.sendMessage(jid, {
      text: messageText.trim(),
    });

    if (activeUserId) {
      try {
        const contact = await ContactModel.findOrCreate(activeUserId, {
          name: isGroup ? "Grup WhatsApp" : `+${cleanPhone}`,
          phone: cleanPhone,
          jid,
          isGroup,
        });

        await MessageModel.create({
          userId: activeUserId,
          contactId: contact?.id || null,
          phone: cleanPhone,
          remoteJid: jid,
          messageId: sent?.key?.id,
          senderName: "Saya",
          content: messageText.trim(),
          direction: "OUTGOING",
          status: "SENT",
          fromMe: true,
          sentAt: new Date(),
        });

        await ContactModel.updateLastMessage(activeUserId, jid, {
          text: messageText.trim(),
          timestamp: new Date(),
          incrementUnread: false,
        });
      } catch (dbErr) {
        console.error("[WhatsApp Direct Save Error]:", dbErr.message);
      }
    }

    return {
      messageId: sent?.key?.id,
      status: "SENT",
    };
  }

  async sendMediaMessage(userId, { jid, fileBuffer, fileName, mimeType, caption = '', isViewOnce = false, quotedMessageId = null, sessionName = "default" }) {
    if (!jid) {
      throw new Error("JID tujuan diperlukan");
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("File tidak boleh kosong");
    }

    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);

    if (!session || session.status !== "CONNECTED" || !session.sock) {
      throw new Error("WhatsApp Anda belum terhubung. Silakan hubungkan WhatsApp terlebih dahulu.");
    }

    const cleanJidRaw = sanitizeJid(jid);
    if (!cleanJidRaw) {
      throw new Error("Format JID penerima tidak valid");
    }

    const isGroup = cleanJidRaw.endsWith("@g.us");
    let cleanJid = cleanJidRaw;
    let cleanPhone = isGroup ? cleanJidRaw : cleanJidRaw.replace(/[^0-9]/g, "");

    if (cleanJidRaw.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, cleanJidRaw);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    }

    const isVo = (isViewOnce === true || isViewOnce === "true" || isViewOnce === 1);

    let mediaType = "document";
    const typeStr = (mimeType || "").toLowerCase();
    const nameStr = (fileName || "").toLowerCase();

    if (typeStr.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(nameStr)) {
      mediaType = "image";
    } else if (typeStr.startsWith("video/") || /\.(mp4|mov|mkv|avi|webm)$/i.test(nameStr)) {
      mediaType = "video";
    } else if (typeStr.startsWith("audio/") || /\.(mp3|ogg|wav|m4a|aac)$/i.test(nameStr)) {
      mediaType = "audio";
    }

    let sendPayload = {};
    console.log(`[WhatsApp - ${userId}] Sending media message (${mediaType}, isViewOnce: ${isVo}) to ${cleanJid}`);
    if (mediaType === "image") {
      sendPayload = {
        image: fileBuffer,
        caption: caption && caption.trim() ? caption.trim() : undefined,
        mimetype: mimeType || "image/jpeg",
        viewOnce: isVo ? true : undefined,
      };
    } else if (mediaType === "video") {
      sendPayload = {
        video: fileBuffer,
        caption: caption && caption.trim() ? caption.trim() : undefined,
        mimetype: mimeType || "video/mp4",
        viewOnce: isVo ? true : undefined,
      };
    } else if (mediaType === "audio") {
      sendPayload = {
        audio: fileBuffer,
        mimetype: mimeType || "audio/mp4",
        ptt: false,
      };
    } else {
      sendPayload = {
        document: fileBuffer,
        mimetype: mimeType || "application/octet-stream",
        fileName: fileName || "Dokumen",
        caption: caption && caption.trim() ? caption.trim() : undefined,
      };
    }

    let quotedPayload = undefined;
    let quotedMessageData = null;

    if (quotedMessageId) {
      const origMsg = await MessageModel.getById(quotedMessageId, userId);
      if (origMsg) {
        const isOrigFromMe = !!origMsg.from_me;
        let participant = undefined;
        if (isGroup) {
          if (isOrigFromMe) {
            participant = session.sock.user?.id ? session.sock.user.id.split(":")[0] + "@s.whatsapp.net" : undefined;
          } else if (origMsg.phone) {
            participant = `${String(origMsg.phone).replace(/[^0-9]/g, "")}@s.whatsapp.net`;
          }
        }

        let origContent = { conversation: origMsg.content || "" };
        const isVoQuoted = origMsg.media_type === "view_once" || origMsg.raw_data?.isViewOnce;
        const isVidQuoted = origMsg.media_type === "video" || (typeof origMsg.content === 'string' && origMsg.content.toLowerCase().includes("video"));
        if (isVoQuoted) {
          if (isVidQuoted) {
            origContent = {
              viewOnceMessage: {
                message: {
                  videoMessage: { caption: origMsg.media_caption || origMsg.content || "" }
                }
              }
            };
          } else {
            origContent = {
              viewOnceMessage: {
                message: {
                  imageMessage: { caption: origMsg.media_caption || origMsg.content || "" }
                }
              }
            };
          }
        } else if (origMsg.media_type === "image") {
          origContent = { imageMessage: { caption: origMsg.content || "" } };
        } else if (origMsg.media_type === "video") {
          origContent = { videoMessage: { caption: origMsg.content || "" } };
        } else if (origMsg.media_type === "voice" || origMsg.media_type === "audio") {
          origContent = { audioMessage: { ptt: origMsg.media_type === "voice" } };
        } else if (origMsg.media_type === "document") {
          origContent = { documentMessage: { fileName: origMsg.content || "Dokumen" } };
        }

        quotedPayload = {
          key: {
            remoteJid: cleanJid,
            fromMe: isOrigFromMe,
            id: origMsg.message_id || origMsg.id,
            participant,
          },
          message: origContent,
        };

        if (isVoQuoted || !origMsg.media_url) {
          this.requestMissingMedia(
            userId,
            sessionName,
            origMsg.message_id || origMsg.id,
            cleanJid,
            origMsg.from_me ? undefined : (origMsg.phone ? `${origMsg.phone}@s.whatsapp.net` : undefined),
            !!origMsg.from_me
          ).catch(() => {});
        }

        quotedMessageData = {
          messageId: origMsg.message_id || origMsg.id,
          senderName: isOrigFromMe ? "Saya" : (origMsg.sender_name || (origMsg.phone ? `+${origMsg.phone}` : "Kontak")),
          senderPhone: origMsg.phone || null,
          content: origMsg.content || "",
          mediaType: origMsg.media_type || "text",
          fromMe: isOrigFromMe,
        };
      }
    }

    const sendOptions = quotedPayload ? { quoted: quotedPayload } : {};
    const sent = await session.sock.sendMessage(cleanJid, sendPayload, sendOptions);

    if (sent?.key?.id) {
      this.processedMessageIds.set(`${userId}_${sent.key.id}`, Date.now());
      if (sent?.message) {
        this.recentSentMessages.set(sent.key.id, sent.message);
      }
    }

    const messageId = sent?.key?.id || `out_${Date.now()}`;
    if (sent?.message && messageId) {
      this.recentSentMessages.set(messageId, sent.message);
    }
    const ext = path.extname(fileName || "").replace(".", "") || (mediaType === "image" ? "jpg" : (mediaType === "video" ? "mp4" : (mediaType === "audio" ? "mp3" : "bin")));
    const filename = `media_${messageId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    try {
      fs.writeFileSync(filePath, fileBuffer);
    } catch (e) {}

    const mediaUrl = `/uploads/${filename}`;

    const contact = await ContactModel.findOrCreate(userId, {
      name: isGroup ? "Grup WhatsApp" : `+${cleanPhone}`,
      phone: cleanPhone,
      jid: cleanJid,
      isGroup,
    });

    const displayContent = caption && caption.trim()
      ? caption.trim()
      : (mediaType === "image" ? (isVo ? "👁️ Foto (Sekali Lihat)" : "📷 Foto") : (mediaType === "video" ? (isVo ? "👁️ Video (Sekali Lihat)" : "🎥 Video") : (mediaType === "audio" ? "🎵 Audio" : `📄 ${fileName || "Dokumen"}`)));

    const savedMessage = await MessageModel.create({
      userId,
      contactId: contact?.id || null,
      phone: cleanPhone,
      remoteJid: cleanJid,
      messageId,
      senderName: "Saya",
      content: displayContent,
      mediaType: isVo ? "view_once" : mediaType,
      mediaUrl,
      mediaCaption: caption && caption.trim() ? caption.trim() : (isVo ? (mediaType === "video" ? "👁️ Video Sekali Lihat" : "👁️ Foto Sekali Lihat") : (mediaType === "document" ? fileName : null)),
      quotedMessage: quotedMessageData,
      rawData: isVo ? { isViewOnce: true, protoMessage: sent?.message || null } : { protoMessage: sent?.message || null },
      direction: "OUTGOING",
      status: "SENT",
      fromMe: true,
      sentAt: new Date(),
    });

    await ContactModel.updateLastMessage(userId, cleanJid, {
      text: `✓ ${displayContent}`,
      timestamp: new Date(),
      incrementUnread: false,
    });

    socketService.emitToUser(userId, "message_new", {
      message: savedMessage,
      contact,
      remoteJid: cleanJid,
    });

    socketService.emitToUser(userId, "chat_update", {
      jid: cleanJid,
      lastMessage: `✓ ${displayContent}`,
      lastMessageTime: new Date(),
      unreadIncrement: false,
    });

    return savedMessage;
  }

  async sendVoiceNote(userId, { jid, audioBuffer, mimetype = 'audio/ogg; codecs=opus', quotedMessageId = null, sessionName = 'default', duration = null }) {
    const key = this.getSessionKey(userId, sessionName);
    const session = this.sessions.get(key);
    if (!session || !session.sock || session.status !== "CONNECTED") {
      throw new Error("WhatsApp belum terhubung");
    }

    const cleanJidRaw = sanitizeJid(jid);
    if (!cleanJidRaw) {
      throw new Error("Format JID penerima tidak valid");
    }

    const isGroup = cleanJidRaw.endsWith("@g.us");
    let cleanJid = cleanJidRaw;
    let cleanPhone = isGroup ? cleanJidRaw : cleanJidRaw.replace(/[^0-9]/g, "");

    if (cleanJidRaw.endsWith("@lid")) {
      const resolved = this.resolveLidToPhone(userId, sessionName, cleanJidRaw);
      cleanJid = resolved.jid;
      cleanPhone = resolved.phone;
    }

    let finalBuffer = audioBuffer;
    try {
      finalBuffer = await convertToOpusOgg(audioBuffer);
    } catch (convErr) {}

    let durationSeconds = Number(duration) > 0 ? Math.round(Number(duration)) : 1;
    let waveform = null;
    try {
      const mm = require("music-metadata");
      const meta = await mm.parseBuffer(finalBuffer, "audio/ogg");
      if (meta?.format?.duration && meta.format.duration > 0) {
        durationSeconds = Math.max(1, Math.round(meta.format.duration));
      }
    } catch (e) {}

    try {
      const { getAudioWaveform } = require("@whiskeysockets/baileys/lib/Utils/messages-media.js");
      waveform = await getAudioWaveform(finalBuffer);
    } catch (e) {}

    const sendPayload = {
      audio: finalBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
      seconds: durationSeconds,
    };
    if (waveform && waveform.length === 64) {
      sendPayload.waveform = new Uint8Array(waveform);
    }

    let quotedPayload = undefined;
    let quotedMessageData = null;

    if (quotedMessageId) {
      const origMsg = await MessageModel.getById(quotedMessageId, userId);
      if (origMsg) {
        const isOrigFromMe = !!origMsg.from_me;
        let participant = undefined;
        if (isGroup) {
          if (isOrigFromMe) {
            participant = session.sock.user?.id ? session.sock.user.id.split(":")[0] + "@s.whatsapp.net" : undefined;
          } else if (origMsg.phone) {
            participant = `${String(origMsg.phone).replace(/[^0-9]/g, "")}@s.whatsapp.net`;
          }
        }

        let origContent = { conversation: origMsg.content || "" };
        const isVoQuoted = origMsg.media_type === "view_once" || origMsg.raw_data?.isViewOnce;
        const isVidQuoted = origMsg.media_type === "video" || (typeof origMsg.content === 'string' && origMsg.content.toLowerCase().includes("video"));
        if (isVoQuoted) {
          if (isVidQuoted) {
            origContent = {
              viewOnceMessage: {
                message: {
                  videoMessage: { caption: origMsg.media_caption || origMsg.content || "" }
                }
              }
            };
          } else {
            origContent = {
              viewOnceMessage: {
                message: {
                  imageMessage: { caption: origMsg.media_caption || origMsg.content || "" }
                }
              }
            };
          }
        } else if (origMsg.media_type === "image") {
          origContent = { imageMessage: { caption: origMsg.content || "" } };
        } else if (origMsg.media_type === "video") {
          origContent = { videoMessage: { caption: origMsg.content || "" } };
        } else if (origMsg.media_type === "voice" || origMsg.media_type === "audio") {
          origContent = { audioMessage: { ptt: origMsg.media_type === "voice" } };
        } else if (origMsg.media_type === "document") {
          origContent = { documentMessage: { fileName: origMsg.content || "Dokumen" } };
        }

        quotedPayload = {
          key: {
            remoteJid: cleanJid,
            fromMe: isOrigFromMe,
            id: origMsg.message_id || origMsg.id,
            participant,
          },
          message: origContent,
        };

        if (isVoQuoted || !origMsg.media_url) {
          this.requestMissingMedia(
            userId,
            sessionName,
            origMsg.message_id || origMsg.id,
            cleanJid,
            origMsg.from_me ? undefined : (origMsg.phone ? `${origMsg.phone}@s.whatsapp.net` : undefined),
            !!origMsg.from_me
          ).catch(() => {});
        }

        quotedMessageData = {
          messageId: origMsg.message_id || origMsg.id,
          senderName: isOrigFromMe ? "Saya" : (origMsg.sender_name || (origMsg.phone ? `+${origMsg.phone}` : "Kontak")),
          senderPhone: origMsg.phone || null,
          content: origMsg.content || "",
          mediaType: origMsg.media_type || "text",
          fromMe: isOrigFromMe,
        };
      }
    }

    const sendOptions = quotedPayload ? { quoted: quotedPayload } : {};
    const sent = await session.sock.sendMessage(cleanJid, sendPayload, sendOptions);

    if (sent?.key?.id) {
      this.processedMessageIds.set(`${userId}_${sent.key.id}`, Date.now());
      if (sent?.message) {
        this.recentSentMessages.set(sent.key.id, sent.message);
      }
    }

    const messageId = sent?.key?.id || `vn_${Date.now()}`;
    if (sent?.message && messageId) {
      this.recentSentMessages.set(messageId, sent.message);
    }
    const filename = `vn_${messageId}.ogg`;
    const filePath = path.join(UPLOADS_DIR, filename);
    try {
      fs.writeFileSync(filePath, finalBuffer);
    } catch (e) {}

    const mediaUrl = `/uploads/${filename}`;

    const contact = await ContactModel.findOrCreate(userId, {
      name: isGroup ? "Grup WhatsApp" : `+${cleanPhone}`,
      phone: cleanPhone,
      jid: cleanJid,
      isGroup,
    });

    const savedMessage = await MessageModel.create({
      userId,
      contactId: contact?.id || null,
      phone: cleanPhone,
      remoteJid: cleanJid,
      messageId,
      senderName: "Saya",
      content: "🎤 Pesan Suara",
      mediaType: "voice",
      mediaUrl,
      mediaCaption: "Pesan Suara",
      quotedMessage: quotedMessageData,
      rawData: {
        duration: durationSeconds,
        seconds: durationSeconds,
        isPtt: true,
        protoMessage: sent?.message || null,
      },
      direction: "OUTGOING",
      status: "SENT",
      fromMe: true,
      sentAt: new Date(),
    });

    await ContactModel.updateLastMessage(userId, cleanJid, {
      text: "✓ 🎤 Pesan Suara",
      timestamp: new Date(),
      incrementUnread: false,
    });

    socketService.emitToUser(userId, "message_new", {
      message: savedMessage,
      contact,
      remoteJid: cleanJid,
    });

    socketService.emitToUser(userId, "chat_update", {
      jid: cleanJid,
      lastMessage: "✓ 🎤 Pesan Suara",
      lastMessageTime: new Date(),
      unreadIncrement: false,
    });

    return savedMessage;
  }

  async restoreAllSavedSessions() {
    try {
      const sessionMap = new Map();

      try {
        const dbSessions = await WhatsappSessionModel.getAllSessions();
        for (const s of dbSessions) {
          sessionMap.set(`${s.user_id}_${s.session_name}`, {
            userId: s.user_id,
            sessionName: s.session_name,
            status: s.status,
          });
        }
      } catch (e) {}

      if (fs.existsSync(SESSIONS_BASE_DIR)) {
        const dirs = fs.readdirSync(SESSIONS_BASE_DIR, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory()) {
            const lastUnderscore = dir.name.lastIndexOf("_");
            const userId = lastUnderscore !== -1 ? dir.name.substring(0, lastUnderscore) : dir.name;
            const sessionName = lastUnderscore !== -1 ? dir.name.substring(lastUnderscore + 1) : "default";
            const credPath = path.join(SESSIONS_BASE_DIR, dir.name, "creds.json");

            if (fs.existsSync(credPath)) {
              try {
                const credData = JSON.parse(fs.readFileSync(credPath, "utf8"));
                if (credData.registered || credData.me) {
                  sessionMap.set(`${userId}_${sessionName}`, {
                    userId,
                    sessionName,
                    status: "CONNECTED",
                  });
                }
              } catch (e) {}
            }
          }
        }
      }

      for (const session of sessionMap.values()) {
        const sessionDir = path.join(
          SESSIONS_BASE_DIR,
          `${session.userId}_${session.sessionName}`,
        );

        try {
          const userExists = await UserModel.findById(session.userId);
          if (!userExists) {
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            continue;
          }
        } catch (uErr) {
          continue;
        }

        await this.restoreSessionFilesFromDb(session.userId, session.sessionName, sessionDir);

        const credPath = path.join(sessionDir, "creds.json");
        const hasCredFile = fs.existsSync(credPath);

        if (hasCredFile) {
          try {
            const credData = JSON.parse(fs.readFileSync(credPath, "utf8"));
            if (credData.registered || credData.me) {
              this.initSession(session.userId, session.sessionName).catch((err) => {
                console.error(`[WhatsApp] Failed restoring session for user ${session.userId}:`, err.message);
              });
              continue;
            }
          } catch (e) {}
        }

        if (session.status === "CONNECTED" || session.status === "RECONNECTING") {
          await WhatsappSessionModel.updateStatus(session.userId, "DISCONNECTED", {
            sessionName: session.sessionName,
            phoneNumber: null,
            qrCode: null,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Error during restoreAllSavedSessions:", err.message);
    }
  }
}

const whatsappServiceInstance = new WhatsappService();
module.exports = whatsappServiceInstance;

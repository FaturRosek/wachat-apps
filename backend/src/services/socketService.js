const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

class SocketService {
  constructor() {
    this.io = null;
  }

  init(httpServer) {
    const allowedOrigins = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
      : ["http://localhost:5173", "http://localhost:3000"];

    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
            callback(null, true);
          } else {
            callback(null, true);
          }
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication token required"));
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
      } catch (err) {
        return next(new Error("Invalid authentication token"));
      }
    });

    this.io.on("connection", (socket) => {
      const userId = socket.user?.id;
      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`[Socket] User connected: ${userId} (Socket ID: ${socket.id})`);
      }

      socket.on("join_chat", ({ jid }) => {
        if (jid) {
          socket.join(`chat_${userId}_${jid}`);
        }
      });

      socket.on("leave_chat", ({ jid }) => {
        if (jid) {
          socket.leave(`chat_${userId}_${jid}`);
        }
      });

      socket.on("typing", ({ jid, isTyping }) => {
        if (userId && jid) {
          this.io.to(`chat_${userId}_${jid}`).emit("presence_update", {
            jid,
            isTyping,
            userId,
          });
        }
      });

      socket.on("disconnect", () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });

    console.log("[Socket] Socket.IO server initialized successfully.");
    return this.io;
  }

  emitToUser(userId, event, data) {
    if (this.io && userId) {
      this.io.to(`user_${userId}`).emit(event, data);
    }
  }

  emitToAll(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}

const socketServiceInstance = new SocketService();
module.exports = socketServiceInstance;

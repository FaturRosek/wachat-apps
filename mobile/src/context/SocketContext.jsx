import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getSocketUrl } from '../config/env';
import { getAuthToken } from '../api/apiClient';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, apiHost } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const token = getAuthToken();
    if (!token) return;

    const newSocket = io(getSocketUrl(), {
      auth: { token },
      query: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      timeout: 15000,
    });

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('incoming_call', (callData) => {
      if (callData) setIncomingCall(callData);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [userId, apiHost]);

  const onEvent = useMemo(
    () => (event, callback) => {
      if (!socket) return () => {};
      socket.on(event, callback);
      return () => socket.off(event, callback);
    },
    [socket]
  );

  const emitEvent = (event, data) => {
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
  };

  return (
    <SocketContext.Provider
      value={{ socket, isConnected, incomingCall, setIncomingCall, onEvent, emitEvent }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}

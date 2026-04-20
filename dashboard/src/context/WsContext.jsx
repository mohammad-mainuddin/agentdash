import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useSettings } from "./SettingsContext";

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const { wsUrl } = useSettings();
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${wsUrl}/dashboard`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[WS] Connected to AgentDash server");
    };

    ws.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }
      for (const fn of listenersRef.current) fn(event);
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[WS] Disconnected — reconnecting in 3s");
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  return (
    <WsContext.Provider value={{ connected, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export const useWs = () => useContext(WsContext);

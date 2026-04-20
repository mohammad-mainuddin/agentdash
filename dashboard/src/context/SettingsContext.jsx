import React, { createContext, useContext, useState, useEffect } from "react";

const SettingsContext = createContext(null);

const DEFAULT_SERVER = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:4242`
  : "http://localhost:4242";

export function SettingsProvider({ children }) {
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem("agentdash_server") || DEFAULT_SERVER
  );
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("agentdash_dark") !== "false"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const updateServer = (url) => {
    setServerUrl(url);
    localStorage.setItem("agentdash_server", url);
  };

  const toggleDark = () => {
    setDarkMode((d) => {
      localStorage.setItem("agentdash_dark", String(!d));
      return !d;
    });
  };

  const wsUrl = serverUrl.replace(/^http/, "ws");

  return (
    <SettingsContext.Provider value={{ serverUrl, wsUrl, darkMode, updateServer, toggleDark }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

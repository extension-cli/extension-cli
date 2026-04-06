import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";

type EventBridgeStatus = {
  total?: number;
  registered?: number;
  emittedCount?: number;
  lastEmittedAt?: number | null;
};

type DaemonBridgeStatus = {
  endpoint?: string;
  connected?: boolean;
  reconnecting?: boolean;
};

type PopupStatus = {
  connected?: boolean;
  reconnecting?: boolean;
  bridges?: {
    daemonWebSocket?: DaemonBridgeStatus;
    tabsEvents?: EventBridgeStatus;
    tabGroupsEvents?: EventBridgeStatus;
    windowsEvents?: EventBridgeStatus;
    historyEvents?: EventBridgeStatus;
    sessionsEvents?: EventBridgeStatus;
    bookmarksEvents?: EventBridgeStatus;
  };
};

type PermissionName = "bookmarks" | "history" | "sessions";
type PermissionBadge =
  | "Checking"
  | "Granted"
  | "Not granted"
  | "Denied"
  | "Requesting..."
  | "Removing..."
  | "Error";

const PERMISSIONS: PermissionName[] = ["bookmarks", "history", "sessions"];
const DOCS_URL = "https://github.com/extension-cli/extension-cli";
const SKILL_INSTALL_URL =
  "https://github.com/extension-cli/extension-cli#skill-install-one-command";
const DEFAULT_ENDPOINT = "ws://127.0.0.1:19883/ext";

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function renderBridgeCount(status: EventBridgeStatus | undefined): string {
  const total = asNumber(status?.total, 0);
  const registered = asNumber(status?.registered, 0);
  return total > 0 ? `${registered}/${total}` : "N/A";
}

function renderLastTimestamp(value: number | null | undefined): string {
  if (!value) return "never";
  return new Date(value).toLocaleTimeString();
}

function statusClass(ok: boolean): string {
  return ok ? "ok" : "warn";
}

function containsPermission(name: PermissionName): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.permissions.contains({ permissions: [name] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

function requestPermission(name: PermissionName): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ permissions: [name] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

function removePermission(name: PermissionName): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.permissions.remove({ permissions: [name] }, (removed) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(Boolean(removed));
    });
  });
}

function queryStatus(): Promise<PopupStatus | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getStatus" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve(null);
        return;
      }
      resolve(response as PopupStatus);
    });
  });
}

function PopupApp() {
  const [popupStatus, setPopupStatus] = useState<PopupStatus | null>(null);
  const [permissionState, setPermissionState] = useState<
    Record<PermissionName, PermissionBadge>
  >({
    bookmarks: "Checking",
    history: "Checking",
    sessions: "Checking",
  });

  async function refreshStatus() {
    const status = await queryStatus();
    setPopupStatus(status);
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    async function refreshPermissions() {
      for (const permission of PERMISSIONS) {
        try {
          const granted = await containsPermission(permission);
          setPermissionState((prev) => ({
            ...prev,
            [permission]: granted ? "Granted" : "Not granted",
          }));
        } catch {
          setPermissionState((prev) => ({
            ...prev,
            [permission]: "Error",
          }));
        }
      }
    }
    void refreshPermissions();
  }, []);

  const computed = useMemo(() => {
    const daemonBridge = popupStatus?.bridges?.daemonWebSocket;
    const tabsEvents = popupStatus?.bridges?.tabsEvents;
    const tabGroupsEvents = popupStatus?.bridges?.tabGroupsEvents;
    const windowsEvents = popupStatus?.bridges?.windowsEvents;
    const historyEvents = popupStatus?.bridges?.historyEvents;
    const sessionsEvents = popupStatus?.bridges?.sessionsEvents;
    const bookmarksEvents = popupStatus?.bridges?.bookmarksEvents;

    const tabsTotal = asNumber(tabsEvents?.total, 0);
    const tabsRegistered = asNumber(tabsEvents?.registered, 0);
    const tabGroupsTotal = asNumber(tabGroupsEvents?.total, 0);
    const tabGroupsRegistered = asNumber(tabGroupsEvents?.registered, 0);
    const windowsTotal = asNumber(windowsEvents?.total, 0);
    const windowsRegistered = asNumber(windowsEvents?.registered, 0);
    const historyTotal = asNumber(historyEvents?.total, 0);
    const historyRegistered = asNumber(historyEvents?.registered, 0);
    const sessionsTotal = asNumber(sessionsEvents?.total, 0);
    const sessionsRegistered = asNumber(sessionsEvents?.registered, 0);
    const bookmarksTotal = asNumber(bookmarksEvents?.total, 0);
    const bookmarksRegistered = asNumber(bookmarksEvents?.registered, 0);

    const tabsReady = tabsTotal > 0 && tabsRegistered === tabsTotal;
    const tabGroupsReady =
      tabGroupsTotal > 0 && tabGroupsRegistered === tabGroupsTotal;
    const windowsReady = windowsTotal > 0 && windowsRegistered === windowsTotal;
    const historyReady = historyTotal > 0 && historyRegistered === historyTotal;
    const sessionsReady =
      sessionsTotal > 0 && sessionsRegistered === sessionsTotal;
    const bookmarksReady =
      bookmarksTotal > 0 && bookmarksRegistered === bookmarksTotal;

    return {
      daemonBridge,
      tabsEvents,
      tabGroupsEvents,
      windowsEvents,
      historyEvents,
      sessionsEvents,
      bookmarksEvents,
      tabsReady,
      tabGroupsReady,
      windowsReady,
      historyReady,
      sessionsReady,
      bookmarksReady,
    };
  }, [popupStatus]);

  async function grantPermission(permission: PermissionName) {
    setPermissionState((prev) => ({ ...prev, [permission]: "Requesting..." }));
    try {
      const granted = await requestPermission(permission);
      setPermissionState((prev) => ({
        ...prev,
        [permission]: granted ? "Granted" : "Denied",
      }));
      await refreshStatus();
    } catch {
      setPermissionState((prev) => ({ ...prev, [permission]: "Error" }));
    }
  }

  async function revokePermission(permission: PermissionName) {
    setPermissionState((prev) => ({ ...prev, [permission]: "Removing..." }));
    try {
      await removePermission(permission);
      const granted = await containsPermission(permission);
      setPermissionState((prev) => ({
        ...prev,
        [permission]: granted ? "Granted" : "Not granted",
      }));
      await refreshStatus();
    } catch {
      setPermissionState((prev) => ({ ...prev, [permission]: "Error" }));
    }
  }

  const isConnected = Boolean(popupStatus?.connected);
  const isReconnecting = Boolean(popupStatus?.reconnecting);
  const disconnected = !popupStatus || (!isConnected && !isReconnecting);
  const statusText = isConnected
    ? "Connected to daemon"
    : isReconnecting
      ? "Reconnecting..."
      : "No daemon connected";
  const dotClass = isConnected
    ? "connected"
    : isReconnecting
      ? "connecting"
      : "disconnected";

  const endpoint = computed.daemonBridge?.endpoint || DEFAULT_ENDPOINT;
  const bridgeMeta = popupStatus
    ? `endpoint=${endpoint} | tabs=${renderBridgeCount(computed.tabsEvents)} (emit=${asNumber(computed.tabsEvents?.emittedCount, 0)}, last=${renderLastTimestamp(computed.tabsEvents?.lastEmittedAt)}) | tabGroups=${renderBridgeCount(computed.tabGroupsEvents)} (emit=${asNumber(computed.tabGroupsEvents?.emittedCount, 0)}, last=${renderLastTimestamp(computed.tabGroupsEvents?.lastEmittedAt)}) | windows=${renderBridgeCount(computed.windowsEvents)} (emit=${asNumber(computed.windowsEvents?.emittedCount, 0)}, last=${renderLastTimestamp(computed.windowsEvents?.lastEmittedAt)}) | history=${renderBridgeCount(computed.historyEvents)} (emit=${asNumber(computed.historyEvents?.emittedCount, 0)}, last=${renderLastTimestamp(computed.historyEvents?.lastEmittedAt)}) | sessions=${renderBridgeCount(computed.sessionsEvents)} (emit=${asNumber(computed.sessionsEvents?.emittedCount, 0)}, last=${renderLastTimestamp(computed.sessionsEvents?.lastEmittedAt)}) | bookmarks=${renderBridgeCount(computed.bookmarksEvents)} (emit=${asNumber(computed.bookmarksEvents?.emittedCount, 0)}, last=${renderLastTimestamp(computed.bookmarksEvents?.lastEmittedAt)})`
    : "Unable to query background service worker status.";

  return (
    <main className="popup">
      <header className="header">
        <img src="/icons/icon-48.png" alt="extension-cli" />
        <h1>Extension CLI</h1>
      </header>

      <section className="status-row">
        <span className={`dot ${dotClass}`} />
        <span className="status-text">
          <strong>{statusText}</strong>
        </span>
      </section>

      {disconnected && (
        <section className="hint">
          This is normal. The extension connects automatically when you run any{" "}
          <code>extension-cli</code> command.
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Connections</h2>
        <div className="item">
          <span>Daemon WebSocket</span>
          <span
            className={`badge ${statusClass(Boolean(computed.daemonBridge?.connected))}`}
          >
            {computed.daemonBridge?.connected
              ? "Connected"
              : computed.daemonBridge?.reconnecting
                ? "Reconnecting"
                : "Disconnected"}
          </span>
        </div>
        <div className="item">
          <span>
            <code>chrome.tabs</code> events bridge
          </span>
          <span className={`badge ${statusClass(computed.tabsReady)}`}>
            {renderBridgeCount(computed.tabsEvents)}
          </span>
        </div>
        <div className="item">
          <span>
            <code>chrome.tabGroups</code> events bridge
          </span>
          <span className={`badge ${statusClass(computed.tabGroupsReady)}`}>
            {renderBridgeCount(computed.tabGroupsEvents)}
          </span>
        </div>
        <div className="item">
          <span>
            <code>chrome.windows</code> events bridge
          </span>
          <span className={`badge ${statusClass(computed.windowsReady)}`}>
            {renderBridgeCount(computed.windowsEvents)}
          </span>
        </div>
        <div className="item">
          <span>
            <code>chrome.history</code> events bridge
          </span>
          <span className={`badge ${statusClass(computed.historyReady)}`}>
            {renderBridgeCount(computed.historyEvents)}
          </span>
        </div>
        <div className="item">
          <span>
            <code>chrome.sessions</code> events bridge
          </span>
          <span className={`badge ${statusClass(computed.sessionsReady)}`}>
            {renderBridgeCount(computed.sessionsEvents)}
          </span>
        </div>
        <div className="item">
          <span>
            <code>chrome.bookmarks</code> events bridge
          </span>
          <span className={`badge ${statusClass(computed.bookmarksReady)}`}>
            {renderBridgeCount(computed.bookmarksEvents)}
          </span>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Privacy Permissions</h2>
        {PERMISSIONS.map((permission) => {
          const value = permissionState[permission];
          const granted = value === "Granted";
          return (
            <div className="perm-row" key={permission}>
              <span>
                <code>{permission}</code>
              </span>
              <div className="perm-actions">
                <span className={`badge ${statusClass(granted)}`}>{value}</span>
                <button
                  className="btn"
                  onClick={() => {
                    void grantPermission(permission);
                  }}
                >
                  Grant
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    void revokePermission(permission);
                  }}
                >
                  Revoke
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <footer className="footer">
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          Documentation
        </a>
        {" · "}
        <a href={SKILL_INSTALL_URL} target="_blank" rel="noreferrer">
          Install Skills
        </a>
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Popup root element not found");
}

createRoot(root).render(<PopupApp />);

// Query connection status from background service worker
chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
  const dot = document.getElementById('dot');
  const status = document.getElementById('status');
  const hint = document.getElementById('hint');
  const daemonWsBadge = document.getElementById('daemonWsBadge');
  const tabsEventsBadge = document.getElementById('tabsEventsBadge');
  const tabGroupsEventsBadge = document.getElementById('tabGroupsEventsBadge');
  const windowsEventsBadge = document.getElementById('windowsEventsBadge');
  const historyEventsBadge = document.getElementById('historyEventsBadge');
  const sessionsEventsBadge = document.getElementById('sessionsEventsBadge');
  const bookmarksEventsBadge = document.getElementById('bookmarksEventsBadge');
  const bridgeMeta = document.getElementById('bridgeMeta');

  const setBadge = (el, ok, text) => {
    if (!el) return;
    el.className = `badge ${ok ? 'ok' : 'warn'}`;
    el.textContent = text;
  };

  if (chrome.runtime.lastError || !resp) {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
    setBadge(daemonWsBadge, false, 'Offline');
    setBadge(tabsEventsBadge, false, 'Unknown');
    setBadge(tabGroupsEventsBadge, false, 'Unknown');
    setBadge(windowsEventsBadge, false, 'Unknown');
    setBadge(historyEventsBadge, false, 'Unknown');
    setBadge(sessionsEventsBadge, false, 'Unknown');
    setBadge(bookmarksEventsBadge, false, 'Unknown');
    if (bridgeMeta) bridgeMeta.textContent = 'Unable to query background service worker status.';
    return;
  }

  const daemonBridge = resp.bridges?.daemonWebSocket || {};
  const tabsEvents = resp.bridges?.tabsEvents || {};
  const tabGroupsEvents = resp.bridges?.tabGroupsEvents || {};
  const windowsEvents = resp.bridges?.windowsEvents || {};
  const historyEvents = resp.bridges?.historyEvents || {};
  const sessionsEvents = resp.bridges?.sessionsEvents || {};
  const bookmarksEvents = resp.bridges?.bookmarksEvents || {};

  if (resp.connected) {
    dot.className = 'dot connected';
    status.innerHTML = '<strong>Connected to daemon</strong>';
    hint.style.display = 'none';
  } else if (resp.reconnecting) {
    dot.className = 'dot connecting';
    status.innerHTML = '<strong>Reconnecting...</strong>';
    hint.style.display = 'none';
  } else {
    dot.className = 'dot disconnected';
    status.innerHTML = '<strong>No daemon connected</strong>';
    hint.style.display = 'block';
  }

  const daemonReady = !!daemonBridge.connected;
  const daemonText = daemonReady ? 'Connected' : (daemonBridge.reconnecting ? 'Reconnecting' : 'Disconnected');
  setBadge(daemonWsBadge, daemonReady, daemonText);

  const registered = Number(tabsEvents.registered || 0);
  const total = Number(tabsEvents.total || 0);
  const tabsReady = total > 0 && registered === total;
  const tabsText = total > 0 ? `${registered}/${total}` : 'N/A';
  setBadge(tabsEventsBadge, tabsReady, tabsText);

  const groupRegistered = Number(tabGroupsEvents.registered || 0);
  const groupTotal = Number(tabGroupsEvents.total || 0);
  const groupReady = groupTotal > 0 && groupRegistered === groupTotal;
  const groupText = groupTotal > 0 ? `${groupRegistered}/${groupTotal}` : 'N/A';
  setBadge(tabGroupsEventsBadge, groupReady, groupText);

  const windowRegistered = Number(windowsEvents.registered || 0);
  const windowTotal = Number(windowsEvents.total || 0);
  const windowReady = windowTotal > 0 && windowRegistered === windowTotal;
  const windowText = windowTotal > 0 ? `${windowRegistered}/${windowTotal}` : 'N/A';
  setBadge(windowsEventsBadge, windowReady, windowText);

  const historyRegistered = Number(historyEvents.registered || 0);
  const historyTotal = Number(historyEvents.total || 0);
  const historyReady = historyTotal > 0 && historyRegistered === historyTotal;
  const historyText = historyTotal > 0 ? `${historyRegistered}/${historyTotal}` : 'N/A';
  setBadge(historyEventsBadge, historyReady, historyText);

  const sessionsRegistered = Number(sessionsEvents.registered || 0);
  const sessionsTotal = Number(sessionsEvents.total || 0);
  const sessionsReady = sessionsTotal > 0 && sessionsRegistered === sessionsTotal;
  const sessionsText = sessionsTotal > 0 ? `${sessionsRegistered}/${sessionsTotal}` : 'N/A';
  setBadge(sessionsEventsBadge, sessionsReady, sessionsText);

  const bookmarksRegistered = Number(bookmarksEvents.registered || 0);
  const bookmarksTotal = Number(bookmarksEvents.total || 0);
  const bookmarksReady = bookmarksTotal > 0 && bookmarksRegistered === bookmarksTotal;
  const bookmarksText = bookmarksTotal > 0 ? `${bookmarksRegistered}/${bookmarksTotal}` : 'N/A';
  setBadge(bookmarksEventsBadge, bookmarksReady, bookmarksText);

  if (bridgeMeta) {
    const endpoint = daemonBridge.endpoint || 'ws://127.0.0.1:19883/ext';
    const emitted = Number(tabsEvents.emittedCount || 0);
    const lastTabs = tabsEvents.lastEmittedAt
      ? new Date(tabsEvents.lastEmittedAt).toLocaleTimeString()
      : 'never';
    const groupEmitted = Number(tabGroupsEvents.emittedCount || 0);
    const lastGroups = tabGroupsEvents.lastEmittedAt
      ? new Date(tabGroupsEvents.lastEmittedAt).toLocaleTimeString()
      : 'never';
    const windowEmitted = Number(windowsEvents.emittedCount || 0);
    const lastWindows = windowsEvents.lastEmittedAt
      ? new Date(windowsEvents.lastEmittedAt).toLocaleTimeString()
      : 'never';
    const historyEmitted = Number(historyEvents.emittedCount || 0);
    const lastHistory = historyEvents.lastEmittedAt
      ? new Date(historyEvents.lastEmittedAt).toLocaleTimeString()
      : 'never';
    const sessionsEmitted = Number(sessionsEvents.emittedCount || 0);
    const lastSessions = sessionsEvents.lastEmittedAt
      ? new Date(sessionsEvents.lastEmittedAt).toLocaleTimeString()
      : 'never';
    const bookmarksEmitted = Number(bookmarksEvents.emittedCount || 0);
    const lastBookmarks = bookmarksEvents.lastEmittedAt
      ? new Date(bookmarksEvents.lastEmittedAt).toLocaleTimeString()
      : 'never';
    bridgeMeta.textContent =
      `endpoint=${endpoint} | tabs=${registered}/${total} (emit=${emitted}, last=${lastTabs}) | ` +
      `tabGroups=${groupRegistered}/${groupTotal} (emit=${groupEmitted}, last=${lastGroups}) | ` +
      `windows=${windowRegistered}/${windowTotal} (emit=${windowEmitted}, last=${lastWindows}) | ` +
      `history=${historyRegistered}/${historyTotal} (emit=${historyEmitted}, last=${lastHistory}) | ` +
      `sessions=${sessionsRegistered}/${sessionsTotal} (emit=${sessionsEmitted}, last=${lastSessions}) | ` +
      `bookmarks=${bookmarksRegistered}/${bookmarksTotal} (emit=${bookmarksEmitted}, last=${lastBookmarks})`;
  }
});

function setBadge(el, ok, text) {
  if (!el) return;
  el.className = `badge ${ok ? 'ok' : 'warn'}`;
  el.textContent = text;
}

function containsPermission(name) {
  return new Promise((resolve, reject) => {
    chrome.permissions.contains({ permissions: [name] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(!!granted);
    });
  });
}

function requestPermission(name) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ permissions: [name] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(!!granted);
    });
  });
}

function removePermission(name) {
  return new Promise((resolve, reject) => {
    chrome.permissions.remove({ permissions: [name] }, (removed) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(!!removed);
    });
  });
}

async function refreshPermissionBadges() {
  const names = ['bookmarks', 'history', 'sessions'];
  for (const name of names) {
    const badge = document.getElementById(`perm-${name}`);
    if (!badge) continue;
    try {
      const granted = await containsPermission(name);
      setBadge(badge, granted, granted ? 'Granted' : 'Not granted');
    } catch {
      setBadge(badge, false, 'Error');
    }
  }
}

function wirePermissionButtons() {
  const names = ['bookmarks', 'history', 'sessions'];
  for (const name of names) {
    const grantBtn = document.getElementById(`grant-${name}`);
    const revokeBtn = document.getElementById(`revoke-${name}`);
    const badge = document.getElementById(`perm-${name}`);
    if (!grantBtn || !revokeBtn || !badge) continue;

    grantBtn.addEventListener('click', async () => {
      setBadge(badge, false, 'Requesting...');
      try {
        const granted = await requestPermission(name);
        setBadge(badge, granted, granted ? 'Granted' : 'Denied');
      } catch {
        setBadge(badge, false, 'Error');
      }
    });

    revokeBtn.addEventListener('click', async () => {
      setBadge(badge, false, 'Removing...');
      try {
        await removePermission(name);
        const granted = await containsPermission(name);
        setBadge(badge, granted, granted ? 'Granted' : 'Not granted');
      } catch {
        setBadge(badge, false, 'Error');
      }
    });
  }
}

wirePermissionButtons();
void refreshPermissionBadges();

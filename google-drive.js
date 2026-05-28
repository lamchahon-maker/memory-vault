/* ========================================
   Memory — Google Drive Integration
   Handles auth, upload, download, sync
   ======================================== */

// ──── Config ────
const GDRIVE_CONFIG = {
  // ฝัง Client ID และ API Key ให้ผู้ใช้เลย
  CLIENT_ID: '140003183086-gim18025bvc0bq420jabgfokf1qgaijn.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCmtRsOEbYrjYUUHdxjD52yVhawvZwiP58',
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  FOLDER_NAME: 'Memory-Vault',
  METADATA_FILE: 'memory-vault-metadata.json',
};

// ──── State ────
let gdriveReady = false;
let gdriveUser = null;
let gdriveFolderId = null;
let tokenClient = null;
let isSyncing = false;

// ──── Load Status from localStorage ────
function loadGDriveConfig() {
  const saved = localStorage.getItem('memory-gdrive-config');
  if (saved) {
    try {
      const config = JSON.parse(saved);
      if (config.clientId) GDRIVE_CONFIG.CLIENT_ID = config.clientId;
      if (config.apiKey) GDRIVE_CONFIG.API_KEY = config.apiKey;
    } catch(e) {}
  }
}

function saveGDriveConfig() {
  localStorage.setItem('memory-gdrive-config', JSON.stringify({
    clientId: GDRIVE_CONFIG.CLIENT_ID,
    apiKey: GDRIVE_CONFIG.API_KEY,
  }));
}

// ──── Init Google APIs ────
function initGoogleDrive() {
  loadGDriveConfig();
  updateDriveUI();

  if (!GDRIVE_CONFIG.CLIENT_ID || !GDRIVE_CONFIG.API_KEY) {
    console.log('Google Drive: No credentials configured');
    return;
  }

  // Load GAPI
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.onload = () => {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: GDRIVE_CONFIG.API_KEY,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        console.log('Google Drive: GAPI client initialized');
        initGIS();
      } catch (err) {
        console.error('Google Drive: GAPI init failed', err);
        showToast('ไม่สามารถเชื่อมต่อ Google Drive ได้', 'error');
      }
    });
  };
  document.head.appendChild(gapiScript);
}

function initGIS() {
  const gisScript = document.createElement('script');
  gisScript.src = 'https://accounts.google.com/gsi/client';
  gisScript.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CONFIG.CLIENT_ID,
      scope: GDRIVE_CONFIG.SCOPES,
      callback: handleAuthResponse,
    });
    gdriveReady = true;
    updateDriveUI();

    // Check if we have a saved token
    const savedToken = localStorage.getItem('memory-gdrive-token');
    if (savedToken) {
      try {
        const tokenData = JSON.parse(savedToken);
        gapi.client.setToken(tokenData);
        gdriveUser = { name: tokenData.userName || 'User' };
        updateDriveUI();
        console.log('Google Drive: Restored session');
      } catch(e) {
        localStorage.removeItem('memory-gdrive-token');
      }
    }
  };
  document.head.appendChild(gisScript);
}

// ──── Auth ────
function handleAuthResponse(resp) {
  if (resp.error) {
    console.error('Google Drive: Auth error', resp);
    showToast('การเข้าสู่ระบบ Google ล้มเหลว', 'error');
    return;
  }

  // Save token
  const token = gapi.client.getToken();
  token.userName = 'Google User';
  localStorage.setItem('memory-gdrive-token', JSON.stringify(token));

  gdriveUser = { name: 'Google User' };
  updateDriveUI();
  showToast('เชื่อมต่อ Google Drive สำเร็จ!', 'success');

  // Fetch user info
  fetchUserInfo();
}

async function fetchUserInfo() {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` }
    });
    const data = await resp.json();
    gdriveUser = {
      name: data.name || data.email || 'Google User',
      email: data.email,
      picture: data.picture,
    };

    // Update saved token with user name
    const token = gapi.client.getToken();
    token.userName = gdriveUser.name;
    localStorage.setItem('memory-gdrive-token', JSON.stringify(token));

    updateDriveUI();
  } catch(e) {
    console.log('Could not fetch user info:', e);
  }
}

function signInDrive() {
  if (!gdriveReady) {
    showGDriveSetupModal();
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function signOutDrive() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken(null);
  }
  localStorage.removeItem('memory-gdrive-token');
  gdriveUser = null;
  gdriveFolderId = null;
  updateDriveUI();
  showToast('ออกจาก Google Drive แล้ว', 'info');
}

// ──── UI Update ────
function updateDriveUI() {
  const btn = document.getElementById('gdrive-btn');
  const statusDot = document.getElementById('gdrive-status-dot');
  const statusText = document.getElementById('gdrive-status-text');
  const syncBtn = document.getElementById('gdrive-sync-btn');
  const signOutBtn = document.getElementById('gdrive-signout');
  const userInfo = document.getElementById('gdrive-user-info');
  const userName = document.getElementById('gdrive-user-name');
  const setupHint = document.getElementById('gdrive-setup-hint');

  if (!btn) return;

  if (gdriveUser) {
    // Connected
    statusDot.className = 'gdrive-status-dot connected';
    statusText.textContent = 'เชื่อมต่อแล้ว';
    syncBtn.classList.remove('hidden');
    signOutBtn.classList.remove('hidden');
    userInfo.classList.remove('hidden');
    userName.textContent = gdriveUser.name;
    if (setupHint) setupHint.classList.add('hidden');
  } else if (gdriveReady) {
    // Ready but not connected
    statusDot.className = 'gdrive-status-dot ready';
    statusText.textContent = 'พร้อมเชื่อมต่อ';
    syncBtn.classList.add('hidden');
    signOutBtn.classList.add('hidden');
    userInfo.classList.add('hidden');
    if (setupHint) setupHint.classList.add('hidden');
  } else {
    // Not configured
    statusDot.className = 'gdrive-status-dot';
    statusText.textContent = 'ยังไม่ได้ตั้งค่า';
    syncBtn.classList.add('hidden');
    signOutBtn.classList.add('hidden');
    userInfo.classList.add('hidden');
    if (setupHint) setupHint.classList.remove('hidden');
  }
}

// ──── Google Drive Folder ────
async function ensureDriveFolder() {
  if (gdriveFolderId) return gdriveFolderId;

  try {
    // Search for existing folder
    const searchResp = await gapi.client.drive.files.list({
      q: `name='${GDRIVE_CONFIG.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (searchResp.result.files && searchResp.result.files.length > 0) {
      gdriveFolderId = searchResp.result.files[0].id;
      return gdriveFolderId;
    }

    // Create folder if not exists
    const createResp = await gapi.client.drive.files.create({
      resource: {
        name: GDRIVE_CONFIG.FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    gdriveFolderId = createResp.result.id;
    return gdriveFolderId;
  } catch(err) {
    console.error('Error ensuring Drive folder:', err);
    throw err;
  }
}

// ──── Sync: Upload all to Drive ────
async function syncToDrive() {
  if (!gdriveUser || isSyncing) return;

  isSyncing = true;
  const syncBtn = document.getElementById('gdrive-sync-btn');
  if (syncBtn) {
    syncBtn.classList.add('syncing');
    syncBtn.querySelector('span').textContent = 'กำลัง Sync...';
  }

  try {
    const folderId = await ensureDriveFolder();
    const files = await getAllFiles();

    // Create metadata JSON with all file info (without binary data)
    const metadata = files.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      parentId: f.parentId || null,
      isFolder: f.isFolder || false,
      storedAt: f.storedAt,
      lastModified: f.lastModified,
    }));

    // Upload metadata file
    await uploadFileToDrive(
      GDRIVE_CONFIG.METADATA_FILE,
      JSON.stringify({ version: 1, files: metadata, syncedAt: new Date().toISOString() }),
      'application/json',
      folderId
    );

    // Upload actual files (only non-folders with content)
    let uploadCount = 0;
    for (const file of files) {
      if (file.isFolder) continue;

      let content = '';
      let mimeType = file.type || 'application/octet-stream';

      if (file.textContent !== undefined) {
        content = file.textContent;
      } else if (file.dataURL) {
        content = file.dataURL;
        mimeType = 'text/plain'; // Store dataURL as text
      } else if (file.binaryData) {
        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(file.binaryData);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        content = btoa(binary);
        mimeType = 'text/plain'; // Store base64 as text
      } else {
        continue;
      }

      await uploadFileToDrive(
        `file_${file.id}_${file.name}`,
        content,
        mimeType,
        folderId
      );
      uploadCount++;
    }

    showToast(`Sync สำเร็จ! อัปโหลด ${uploadCount} ไฟล์ไป Google Drive`, 'success');
  } catch(err) {
    console.error('Sync error:', err);
    showToast('Sync ล้มเหลว: ' + (err.result?.error?.message || err.message || 'Unknown error'), 'error');
  } finally {
    isSyncing = false;
    if (syncBtn) {
      syncBtn.classList.remove('syncing');
      syncBtn.querySelector('span').textContent = 'Sync';
    }
  }
}

// ──── Sync: Download from Drive ────
async function syncFromDrive() {
  if (!gdriveUser || isSyncing) return;

  isSyncing = true;
  const syncBtn = document.getElementById('gdrive-sync-btn');
  if (syncBtn) {
    syncBtn.classList.add('syncing');
    syncBtn.querySelector('span').textContent = 'กำลังดึงข้อมูล...';
  }

  try {
    const folderId = await ensureDriveFolder();

    // Find metadata file
    const metaSearch = await gapi.client.drive.files.list({
      q: `name='${GDRIVE_CONFIG.METADATA_FILE}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
    });

    if (!metaSearch.result.files || metaSearch.result.files.length === 0) {
      showToast('ไม่พบข้อมูลบน Google Drive — ลอง Sync ขึ้นก่อน', 'info');
      return;
    }

    // Download metadata
    const metaFile = metaSearch.result.files[0];
    const metaContent = await downloadFileFromDrive(metaFile.id);
    const metaData = JSON.parse(metaContent);

    // Download each file
    let downloadCount = 0;
    for (const fileMeta of metaData.files) {
      // Search for file in Drive
      const fileSearch = await gapi.client.drive.files.list({
        q: `name='file_${fileMeta.id}_${fileMeta.name}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
      });

      const fileObj = { ...fileMeta };

      if (fileMeta.isFolder) {
        // Just save folder metadata
        await saveFile(fileObj);
        downloadCount++;
        continue;
      }

      if (fileSearch.result.files && fileSearch.result.files.length > 0) {
        const driveFile = fileSearch.result.files[0];
        const content = await downloadFileFromDrive(driveFile.id);

        const ext = fileMeta.name.split('.').pop()?.toLowerCase() || '';

        if (isTextFile(ext)) {
          fileObj.textContent = content;
        } else if (isImageFile(ext)) {
          fileObj.dataURL = content;
        } else if (ext === 'pdf') {
          // Decode base64 back to ArrayBuffer
          const binary = atob(content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          fileObj.binaryData = bytes.buffer;
        } else {
          fileObj.dataURL = content;
        }

        await saveFile(fileObj);
        downloadCount++;
      }
    }

    showToast(`ดึงข้อมูลสำเร็จ! โหลด ${downloadCount} รายการจาก Google Drive`, 'success');
    await refreshFiles();
  } catch(err) {
    console.error('Restore error:', err);
    showToast('ดึงข้อมูลล้มเหลว: ' + (err.result?.error?.message || err.message || 'Unknown error'), 'error');
  } finally {
    isSyncing = false;
    if (syncBtn) {
      syncBtn.classList.remove('syncing');
      syncBtn.querySelector('span').textContent = 'Sync';
    }
  }
}

// ──── Drive File Operations ────
async function uploadFileToDrive(fileName, content, mimeType, folderId) {
  // Check if file already exists and update it
  const searchResp = await gapi.client.drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  });

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    mimeType: mimeType,
  };

  if (searchResp.result.files && searchResp.result.files.length > 0) {
    // Update existing file
    const fileId = searchResp.result.files[0].id;
    const multipartBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify({ name: fileName }) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;

    await gapi.client.request({
      path: `/upload/drive/v3/files/${fileId}`,
      method: 'PATCH',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: multipartBody,
    });
  } else {
    // Create new file
    metadata.parents = [folderId];
    const multipartBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;

    await gapi.client.request({
      path: '/upload/drive/v3/files',
      method: 'POST',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: multipartBody,
    });
  }
}

async function downloadFileFromDrive(fileId) {
  const resp = await gapi.client.drive.files.get({
    fileId: fileId,
    alt: 'media',
  });
  return resp.body;
}

// ──── Setup Modal ────
function showGDriveSetupModal() {
  const modal = document.getElementById('gdrive-setup-modal');
  const clientIdInput = document.getElementById('gdrive-client-id-input');
  const apiKeyInput = document.getElementById('gdrive-api-key-input');

  if (GDRIVE_CONFIG.CLIENT_ID) clientIdInput.value = GDRIVE_CONFIG.CLIENT_ID;
  if (GDRIVE_CONFIG.API_KEY) apiKeyInput.value = GDRIVE_CONFIG.API_KEY;

  modal.classList.remove('hidden');
}

function hideGDriveSetupModal() {
  document.getElementById('gdrive-setup-modal').classList.add('hidden');
}

function saveGDriveSetup() {
  const clientId = document.getElementById('gdrive-client-id-input').value.trim();
  const apiKey = document.getElementById('gdrive-api-key-input').value.trim();

  if (!clientId || !apiKey) {
    showToast('กรุณากรอก Client ID และ API Key', 'error');
    return;
  }

  GDRIVE_CONFIG.CLIENT_ID = clientId;
  GDRIVE_CONFIG.API_KEY = apiKey;
  saveGDriveConfig();
  hideGDriveSetupModal();
  showToast('บันทึกการตั้งค่าแล้ว — กำลังเชื่อมต่อ...', 'success');

  // Re-init Google APIs
  initGoogleDrive();
}

// ──── Real-time Auto-Sync ────
let autoSyncTimer = null;
let autoSyncEnabled = true; // Can toggle off if desired

function scheduleAutoSync() {
  // Only auto-sync if user is connected to Drive
  if (!gdriveUser || !autoSyncEnabled) return;

  // Debounce: wait 2 seconds after last change before syncing
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncInBackground();
  }, 2000);
}

async function autoSyncInBackground() {
  if (!gdriveUser || isSyncing) return;

  isSyncing = true;
  
  // Show subtle sync indicator on the Drive button
  const statusDot = document.getElementById('gdrive-status-dot');
  if (statusDot) statusDot.className = 'gdrive-status-dot syncing-pulse';

  try {
    const folderId = await ensureDriveFolder();
    const files = await getAllFiles();

    // Upload metadata
    const metadata = files.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      parentId: f.parentId || null,
      isFolder: f.isFolder || false,
      storedAt: f.storedAt,
      lastModified: f.lastModified,
    }));

    await uploadFileToDrive(
      GDRIVE_CONFIG.METADATA_FILE,
      JSON.stringify({ version: 1, files: metadata, syncedAt: new Date().toISOString() }),
      'application/json',
      folderId
    );

    // Upload actual files
    for (const file of files) {
      if (file.isFolder) continue;

      let content = '';
      let mimeType = file.type || 'application/octet-stream';

      if (file.textContent !== undefined) {
        content = file.textContent;
      } else if (file.dataURL) {
        content = file.dataURL;
        mimeType = 'text/plain';
      } else if (file.binaryData) {
        const bytes = new Uint8Array(file.binaryData);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        content = btoa(binary);
        mimeType = 'text/plain';
      } else {
        continue;
      }

      await uploadFileToDrive(
        `file_${file.id}_${file.name}`,
        content,
        mimeType,
        folderId
      );
    }

    showToast('Auto-sync สำเร็จ ☁️', 'success');
  } catch(err) {
    console.error('Auto-sync error:', err);
    // Silent fail — don't bother user with errors on background sync
  } finally {
    isSyncing = false;
    if (statusDot && gdriveUser) {
      statusDot.className = 'gdrive-status-dot connected';
    }
  }
}


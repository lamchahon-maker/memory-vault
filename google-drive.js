/* ========================================
   Memory — Google Drive Integration
   Handles auth, upload, download, sync
   v2: Incremental sync, parallel ops, auto-retry
   ======================================== */

// ──── Config ────
const GDRIVE_CONFIG = {
  // ฝัง Client ID และ API Key ให้ผู้ใช้เลย
  CLIENT_ID: '140003183086-gim18025bvc0bq420jabgfokf1qgaijn.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCmtRsOEbYrjYUUHdxjD52yVhawvZwiP58',
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  FOLDER_NAME: 'Memory-Vault',
  METADATA_FILE: 'memory-vault-metadata.json',
  MAX_CONCURRENT: 4,   // จำนวนไฟล์ที่อัปโหลด/ดาวน์โหลดพร้อมกัน
  MAX_RETRIES: 3,      // จำนวนครั้งที่ retry เมื่อเน็ตหลุด
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

// ──── Sync Snapshot (สำหรับ Incremental Sync) ────
function getLastSyncSnapshot() {
  try {
    const raw = localStorage.getItem('memory-gdrive-sync-snapshot');
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveLastSyncSnapshot(files) {
  const snapshot = {};
  for (const f of files) {
    snapshot[f.id] = {
      size: f.size,
      lastModified: f.lastModified || f.storedAt,
    };
  }
  localStorage.setItem('memory-gdrive-sync-snapshot', JSON.stringify(snapshot));
}

// ──── Retry Helper ────
async function withRetry(fn, retries = GDRIVE_CONFIG.MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch(err) {
      if (attempt >= retries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.warn(`Retry ${attempt + 1}/${retries} after ${delay}ms:`, err.message || err);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ──── Parallel Runner ────
async function runParallel(tasks, concurrency, onProgress) {
  let completed = 0;
  const total = tasks.length;
  const results = [];

  async function runNext(iterator) {
    for (const [index, task] of iterator) {
      results[index] = await task();
      completed++;
      if (onProgress) onProgress(completed, total);
    }
  }

  const iterator = tasks.entries();
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(runNext(iterator));
  }
  await Promise.all(workers);
  return results;
}

// ──── Init Google APIs ────
function initGoogleDrive() {
  // loadGDriveConfig(); // ปิดการโหลดจาก localStorage เพราะเราฝังคีย์ไว้แล้ว
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

// ──── Sync: Upload to Drive (Incremental + Parallel) ────
async function syncToDrive() {
  if (!gdriveUser || isSyncing) return;

  isSyncing = true;
  const syncBtn = document.getElementById('gdrive-sync-btn');
  if (syncBtn) {
    syncBtn.classList.add('syncing');
    syncBtn.querySelector('span').textContent = 'กำลังคำนวณ...';
  }

  try {
    const folderId = await ensureDriveFolder();
    const files = await getAllFiles();
    const lastSnapshot = getLastSyncSnapshot();

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

    // Upload metadata file (always)
    await withRetry(() => uploadFileToDrive(
      GDRIVE_CONFIG.METADATA_FILE,
      JSON.stringify({ version: 2, files: metadata, syncedAt: new Date().toISOString() }),
      'application/json',
      folderId
    ));

    // Filter: only upload files that are new or changed (Incremental Sync)
    const uploadableFiles = files.filter(f => {
      if (f.isFolder) return false;
      if (!f.textContent && !f.dataURL && !f.binaryData) return false;
      const prev = lastSnapshot[f.id];
      if (!prev) return true; // ไฟล์ใหม่
      // ตรวจ size หรือ lastModified เปลี่ยนไหม
      if (prev.size !== f.size) return true;
      const curMod = f.lastModified || f.storedAt;
      if (prev.lastModified !== curMod) return true;
      return false;
    });

    const totalFiles = uploadableFiles.length;
    if (totalFiles === 0) {
      showToast('ไฟล์ทั้งหมดเป็นปัจจุบันแล้ว ☁️', 'success');
      saveLastSyncSnapshot(files);
      return;
    }

    if (syncBtn) syncBtn.querySelector('span').textContent = `0/${totalFiles}`;

    // Build upload tasks
    const tasks = uploadableFiles.map(file => () => {
      let content;
      let mimeType = file.type || 'application/octet-stream';

      if (file.textContent !== undefined) {
        content = file.textContent;
        mimeType = 'text/plain';
      } else if (file.dataURL) {
        content = file.dataURL;
        mimeType = 'text/plain';
      } else if (file.binaryData) {
        content = new Blob([file.binaryData], { type: mimeType });
      }

      return withRetry(() => uploadFileToDrive(
        `file_${file.id}_${file.name}`,
        content,
        mimeType,
        folderId
      ));
    });

    // Run in parallel
    await runParallel(tasks, GDRIVE_CONFIG.MAX_CONCURRENT, (done, total) => {
      if (syncBtn) syncBtn.querySelector('span').textContent = `${done}/${total}`;
    });

    saveLastSyncSnapshot(files);
    showToast(`Sync สำเร็จ! อัปโหลด ${totalFiles} ไฟล์ไป Google Drive`, 'success');
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

// ──── Sync: Download from Drive (Skip existing + Parallel + Retry) ────
async function syncFromDrive() {
  if (!gdriveUser || isSyncing) return;

  isSyncing = true;
  const restoreBtn = document.getElementById('gdrive-restore-btn');
  if (restoreBtn) {
    restoreBtn.classList.add('syncing');
    restoreBtn.querySelector('span').textContent = 'กำลังคำนวณ...';
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
    const metaContent = await withRetry(() => downloadFileFromDrive(metaFile.id));
    const metaData = JSON.parse(metaContent);

    // Get existing local files for comparison
    const localFiles = await getAllFiles();
    const localMap = {};
    for (const lf of localFiles) {
      localMap[lf.id] = { size: lf.size, lastModified: lf.lastModified || lf.storedAt };
    }

    // Separate folders (save sequentially, quick) and files (download in parallel)
    const folders = metaData.files.filter(f => f.isFolder);
    const fileEntries = metaData.files.filter(f => !f.isFolder);

    // Save folders first
    for (const folderMeta of folders) {
      await saveFile({ ...folderMeta });
    }

    // Filter out files that already exist locally with same size & date (Skip Existing)
    const filesToDownload = fileEntries.filter(f => {
      const local = localMap[f.id];
      if (!local) return true; // ไม่มีในเครื่อง — ต้องโหลด
      if (local.size !== f.size) return true;
      const remoteMod = f.lastModified || f.storedAt;
      if (local.lastModified !== remoteMod) return true;
      return false;
    });

    const totalFiles = filesToDownload.length;
    const skippedCount = fileEntries.length - totalFiles;

    if (totalFiles === 0) {
      showToast(`ไฟล์ทั้งหมดเป็นปัจจุบันแล้ว (ข้าม ${skippedCount} ไฟล์) ☁️`, 'success');
      await refreshFiles();
      return;
    }

    if (restoreBtn) restoreBtn.querySelector('span').textContent = `0/${totalFiles}`;

    // Build download tasks
    const tasks = filesToDownload.map(fileMeta => async () => {
      // Search for file in Drive (with retry)
      const fileSearch = await withRetry(() => gapi.client.drive.files.list({
        q: `name='file_${fileMeta.id}_${fileMeta.name}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
      }));

      const fileObj = { ...fileMeta };

      if (fileSearch.result.files && fileSearch.result.files.length > 0) {
        const driveFile = fileSearch.result.files[0];
        const ext = fileMeta.name.split('.').pop()?.toLowerCase() || '';

        if (isTextFile(ext) || isImageFile(ext)) {
          const content = await withRetry(() => downloadFileFromDrive(driveFile.id));
          if (isTextFile(ext)) {
            fileObj.textContent = content;
          } else {
            fileObj.dataURL = content;
          }
        } else {
          fileObj.binaryData = await withRetry(() => downloadBinaryFromDrive(driveFile.id));
        }

        await saveFile(fileObj);
      }
    });

    // Run in parallel
    let failCount = 0;
    const safeTasks = tasks.map(task => async () => {
      try {
        await task();
      } catch(e) {
        failCount++;
        console.error('Download failed after retries:', e);
      }
    });

    await runParallel(safeTasks, GDRIVE_CONFIG.MAX_CONCURRENT, (done, total) => {
      if (restoreBtn) restoreBtn.querySelector('span').textContent = `${done}/${total}`;
    });

    let msg = `ดึงข้อมูลสำเร็จ! โหลด ${totalFiles - failCount} รายการ`;
    if (skippedCount > 0) msg += ` (ข้าม ${skippedCount} ไฟล์ที่มีอยู่แล้ว)`;
    if (failCount > 0) msg += ` ⚠️ ล้มเหลว ${failCount} ไฟล์`;
    showToast(msg, failCount > 0 ? 'error' : 'success');
    await refreshFiles();
  } catch(err) {
    console.error('Restore error:', err);
    showToast('ดึงข้อมูลล้มเหลว: ' + (err.result?.error?.message || err.message || 'Unknown error'), 'error');
  } finally {
    isSyncing = false;
    const restoreBtn = document.getElementById('gdrive-restore-btn');
    if (restoreBtn) {
      restoreBtn.classList.remove('syncing');
      restoreBtn.querySelector('span').textContent = 'ดึงจาก Drive';
    }
  }
}

// ──── Drive File Operations ────
async function uploadFileToDrive(fileName, content, mimeType, folderId) {
  // Check if file already exists
  const searchResp = await gapi.client.drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  });

  const fileId = (searchResp.result.files && searchResp.result.files.length > 0) ? searchResp.result.files[0].id : null;
  const token = gapi.client.getToken().access_token;
  
  // Use Resumable Upload (รองรับไฟล์ใหญ่กว่า 5MB)
  const metadata = fileId ? { name: fileName } : { name: fileName, parents: [folderId] };
  const uploadUrl = fileId ? 
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable` : 
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;

  // 1. ขอ URL สำหรับอัปโหลด
  const initRes = await fetch(uploadUrl, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!initRes.ok) throw new Error('Failed to init resumable upload');
  const location = initRes.headers.get('Location');

  // 2. อัปโหลดข้อมูลจริง
  const uploadRes = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: content
  });

  if (!uploadRes.ok) throw new Error('Failed to upload file content');
}

async function downloadFileFromDrive(fileId) {
  const resp = await gapi.client.drive.files.get({
    fileId: fileId,
    alt: 'media',
  });
  return resp.body;
}

// ดาวน์โหลดไฟล์ binary (วิดีโอ, PDF, โมเดล 3D) เป็น ArrayBuffer ตรงๆ
async function downloadBinaryFromDrive(fileId) {
  const token = gapi.client.getToken().access_token;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!resp.ok) throw new Error('Binary download failed');
  return await resp.arrayBuffer();
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

// ──── Real-time Auto-Sync (Incremental + Parallel) ────
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
    const lastSnapshot = getLastSyncSnapshot();

    // Upload metadata (always)
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

    await withRetry(() => uploadFileToDrive(
      GDRIVE_CONFIG.METADATA_FILE,
      JSON.stringify({ version: 2, files: metadata, syncedAt: new Date().toISOString() }),
      'application/json',
      folderId
    ));

    // Only upload changed files (Incremental)
    const changedFiles = files.filter(f => {
      if (f.isFolder) return false;
      const prev = lastSnapshot[f.id];
      if (!prev) return true;
      if (prev.size !== f.size) return true;
      const curMod = f.lastModified || f.storedAt;
      if (prev.lastModified !== curMod) return true;
      return false;
    });

    if (changedFiles.length > 0) {
      const tasks = changedFiles.map(file => () => {
        let content = '';
        let mimeType = file.type || 'application/octet-stream';

        if (file.textContent !== undefined) {
          content = file.textContent;
        } else if (file.dataURL) {
          content = file.dataURL;
          mimeType = 'text/plain';
        } else if (file.binaryData) {
          content = new Blob([file.binaryData], { type: mimeType });
        } else {
          return Promise.resolve();
        }

        return withRetry(() => uploadFileToDrive(
          `file_${file.id}_${file.name}`,
          content,
          mimeType,
          folderId
        ));
      });

      await runParallel(tasks, GDRIVE_CONFIG.MAX_CONCURRENT);
    }

    saveLastSyncSnapshot(files);
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

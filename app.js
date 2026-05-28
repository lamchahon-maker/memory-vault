/* ========================================
   Memory — File Vault
   App Logic: IndexedDB, Preview, UI
   ======================================== */

// ──── IndexedDB Setup ────
const DB_NAME = 'MemoryVault';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('storedAt', 'storedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFiles() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFile(fileObj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(fileObj);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ──── Utilities ────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear() + 543; // Buddhist Era
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year} · ${hours}:${mins}`;
}

function getExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFileCategory(ext) {
  const map = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css', less: 'css',
    js: 'js', ts: 'js', jsx: 'js', tsx: 'js', mjs: 'js',
    json: 'json',
    png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img', svg: 'img', bmp: 'img', ico: 'img',
    pdf: 'pdf',
    mp4: 'video', webm: 'video', ogg: 'video', mov: 'video',
    txt: 'txt', md: 'txt', log: 'txt', csv: 'txt', xml: 'txt', yml: 'txt', yaml: 'txt',
    glb: 'model3d', gltf: 'model3d', fbx: 'model3d', usdz: 'model3d', obj: 'model3d', stl: 'model3d',
  };
  return map[ext] || 'other';
}

function getMimeType(ext) {
  const map = {
    html: 'text/html', htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript', ts: 'application/javascript',
    json: 'application/json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
    pdf: 'application/pdf',
    txt: 'text/plain', md: 'text/plain', log: 'text/plain',
    csv: 'text/csv', xml: 'text/xml',
    yml: 'text/yaml', yaml: 'text/yaml',
    glb: 'model/gltf-binary', gltf: 'model/gltf+json', usdz: 'model/vnd.usdz+zip', fbx: 'application/octet-stream', obj: 'text/plain', stl: 'model/stl',
  };
  return map[ext] || 'application/octet-stream';
}

function isTextFile(ext) {
  const textExts = ['html','htm','css','scss','sass','less','js','ts','jsx','tsx','mjs','json','txt','md','log','csv','xml','yml','yaml','svg','py','rb','php','java','c','cpp','h','go','rs','sh','bat','ps1','sql','toml','ini','cfg','env'];
  return textExts.includes(ext);
}

function isImageFile(ext) {
  return ['png','jpg','jpeg','gif','webp','svg','bmp','ico'].includes(ext);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ──── App State ────
let allFiles = [];
let currentFolderId = null; // null = root
let breadcrumbPath = [{ id: null, name: 'หน้าแรก' }];
let selectedFileId = null;
let deleteTargetId = null;
let itemToMoveId = null;
let currentSortMode = localStorage.getItem('memory-sort-mode') || 'date'; // date, name, size

// ──── PIN Lock ────
const PIN_STORAGE_KEY = 'memory-pin';
const PIN_LOCK_TIMEOUT = 10 * 60 * 1000; // 10 นาที
let lockTimer = null;
let isLocked = false;

function initPinLock() {
  const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
  if (savedPin) {
    showLockScreen();
    startLockTimer();
  }
}

function setupPin(pin) {
  localStorage.setItem(PIN_STORAGE_KEY, pin);
  showToast('PIN Lock ตั้งค่าแล้ว', 'success');
}

function showLockScreen() {
  isLocked = true;
  let overlay = document.getElementById('pin-lock-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pin-lock-overlay';
    overlay.innerHTML = `
      <div class="pin-lock-box">
        <div class="pin-lock-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2>Memory Locked</h2>
        <p>กรุณาใส่ PIN เพื่อปลดล็อก</p>
        <div class="pin-input-wrap">
          <input type="password" id="pin-input" class="pin-input" maxlength="10" placeholder="••••••" inputmode="numeric" autocomplete="off">
        </div>
        <div id="pin-error" class="pin-error"></div>
        <button class="pin-submit-btn" onclick="verifyPin()">Unlock</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const pinInput = document.getElementById('pin-input');
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyPin();
    });
  }
  overlay.classList.remove('hidden');
  setTimeout(() => {
    const pinInput = document.getElementById('pin-input');
    if (pinInput) { pinInput.value = ''; pinInput.focus(); }
  }, 200);
}

function verifyPin() {
  const input = document.getElementById('pin-input');
  const error = document.getElementById('pin-error');
  if (!input) return;
  const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
  if (input.value === savedPin) {
    isLocked = false;
    document.getElementById('pin-lock-overlay').classList.add('hidden');
    error.textContent = '';
    resetLockTimer();
  } else {
    error.textContent = 'PIN ไม่ถูกต้อง';
    input.value = '';
    input.focus();
    // Shake animation
    const box = document.querySelector('.pin-lock-box');
    box.classList.add('shake');
    setTimeout(() => box.classList.remove('shake'), 500);
  }
}

function startLockTimer() {
  resetLockTimer();
  // Listen for user activity
  ['mousemove', 'keydown', 'touchstart', 'click'].forEach(evt => {
    document.addEventListener(evt, resetLockTimer, { passive: true });
  });
}

function resetLockTimer() {
  if (lockTimer) clearTimeout(lockTimer);
  const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
  if (!savedPin) return;
  lockTimer = setTimeout(() => {
    if (!isLocked) showLockScreen();
  }, PIN_LOCK_TIMEOUT);
}

// ──── DOM Elements ────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const loadingScreen = $('#loading-screen');
const app = $('#app');
const fileInput = $('#file-input');
const uploadBtn = $('#upload-btn');
const themeToggle = $('#theme-toggle');
const searchInput = $('#search-input');
const typeFilter = $('#type-filter');
const fileList = $('#file-list');
const fileCount = $('#file-count');
const breadcrumbItems = $('#breadcrumb-items');
const emptySidebar = $('#empty-sidebar');
const previewContent = $('#preview-content');
const emptyPreview = $('#empty-preview');
const dropOverlay = $('#drop-overlay');
const detailsContent = $('#details-content');
const emptyDetails = $('#empty-details');
const closeDetailsBtn = $('#close-details');
const downloadBtn = $('#download-btn');
const deleteBtn = $('#delete-btn');
const moveBtn = $('#move-btn');

// Modals
const deleteModal = $('#delete-modal');
const deleteModalFilename = $('#delete-modal-filename');
const cancelDeleteBtn = $('#cancel-delete');
const confirmDeleteBtn = $('#confirm-delete');

const folderModal = $('#folder-modal');
const newFolderBtn = $('#new-folder-btn');
const cancelFolderBtn = $('#cancel-folder');
const confirmFolderBtn = $('#confirm-folder');
const folderNameInput = $('#folder-name-input');

const moveModal = $('#move-modal');
const moveFolderList = $('#move-folder-list');
const cancelMoveBtn = $('#cancel-move');

const toastContainer = $('#toast-container');

// ──── Theme ────
function initTheme() {
  const saved = localStorage.getItem('memory-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('memory-theme', next);
}

// ──── Toast ────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2800);
}

// ──── File & Folder Navigation ────
function navigateToFolder(id, name) {
  currentFolderId = id;
  
  if (id === null) {
    breadcrumbPath = [{ id: null, name: 'หน้าแรก' }];
  } else {
    // Check if we're clicking backward in breadcrumb
    const index = breadcrumbPath.findIndex(p => p.id === id);
    if (index !== -1) {
      breadcrumbPath = breadcrumbPath.slice(0, index + 1);
    } else {
      breadcrumbPath.push({ id, name });
    }
  }

  // Clear selection and preview when navigating
  clearSelection();
  searchInput.value = '';
  refreshFiles();
}

function renderBreadcrumbs() {
  breadcrumbItems.innerHTML = '';
  breadcrumbPath.forEach((item, index) => {
    const isLast = index === breadcrumbPath.length - 1;
    
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = '/';
      breadcrumbItems.appendChild(sep);
    }

    const btn = document.createElement('button');
    btn.className = `breadcrumb-btn${isLast ? ' active' : ''}`;
    
    if (item.id === null) {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>${item.name}`;
    } else {
      btn.textContent = item.name;
    }

    if (!isLast) {
      btn.addEventListener('click', () => navigateToFolder(item.id, item.name));
    }
    
    breadcrumbItems.appendChild(btn);
  });
}

function clearSelection() {
  selectedFileId = null;
  $$('.file-item').forEach(el => el.classList.remove('active'));
  detailsContent.classList.add('hidden');
  emptyDetails.classList.remove('hidden');
  previewContent.innerHTML = '';
  previewContent.classList.add('hidden');
  emptyPreview.classList.remove('hidden');
}

// ──── File List Rendering ────
function renderFileList(items) {
  fileList.innerHTML = '';
  fileCount.textContent = items.length;

  if (items.length === 0) {
    emptySidebar.classList.remove('hidden');
    fileList.classList.add('hidden');
  } else {
    emptySidebar.classList.add('hidden');
    fileList.classList.remove('hidden');
  }

  // Sort: Folders first, then files by selected mode
  items.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    switch (currentSortMode) {
      case 'name': 
        return (a.name || '').localeCompare(b.name || '', 'th');
      case 'size': 
        return (b.size || 0) - (a.size || 0);
      case 'date':
      default: 
        return new Date(b.storedAt || 0) - new Date(a.storedAt || 0);
    }
  });

  items.forEach((file, index) => {
    const isFolder = file.isFolder;
    const safeName = file.name || 'ไม่มีชื่อ';
    const ext = isFolder ? '' : getExtension(safeName);
    const cat = isFolder ? 'folder' : getFileCategory(ext);
    
    const item = document.createElement('div');
    item.className = `file-item${file.id === selectedFileId ? ' active' : ''}`;
    item.setAttribute('data-id', file.id);
    item.style.animationDelay = `${index * 0.03}s`;

    let iconHtml = '';
    if (isFolder) {
      iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>`;
    } else {
      iconHtml = ext || '?';
    }

    item.innerHTML = `
      <div class="file-item-icon ${cat}">${iconHtml}</div>
      <div class="file-item-info">
        <div class="file-item-name" title="${safeName}">${safeName}</div>
        <div class="file-item-meta">${isFolder ? 'โฟลเดอร์' : formatFileSize(file.size)}</div>
      </div>
      ${isFolder ? `<svg class="folder-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>` : ''}
    `;

    // ──── Drag to Move ────
    item.draggable = true;
    
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', file.id);
      e.dataTransfer.effectAllowed = 'move';
      item.style.opacity = '0.5';
    });
    
    item.addEventListener('dragend', () => {
      item.style.opacity = '1';
    });

    if (isFolder) {
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('active'); // highlight folder
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('active');
      });
      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('active');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== file.id) {
          // Check if dragging a folder into its own child
          const isDesc = isDescendant(file.id, draggedId);
          if (!isDesc) {
            itemToMoveId = draggedId;
            await moveItemTo(file.id);
          } else {
            showToast('ย้ายโฟลเดอร์ไม่ได้', 'error');
          }
        }
      });
    }

    item.addEventListener('click', (e) => {
      // Double click or enter folder
      if (isFolder && e.detail === 2) {
        navigateToFolder(file.id, file.name);
      } else {
        selectFile(file.id);
      }
    });

    fileList.appendChild(item);
  });
}

function isDescendant(folderId, targetId) {
  if (folderId === targetId) return true;
  const folder = allFiles.find(f => f.id === folderId);
  if (!folder || !folder.parentId) return false;
  return isDescendant(folder.parentId, targetId);
}

// ──── Trash / Recycle Bin ────
let isViewingTrash = false;

async function softDeleteFile(fileId) {
  const file = await getFile(fileId);
  if (!file) return;
  file.inTrash = true;
  file.deletedAt = new Date().toISOString();
  file._originalParentId = file.parentId; // จำตำแหน่งเดิมเพื่อกู้คืน
  await saveFile(file);
}

async function softDeleteRecursive(fileId) {
  const file = allFiles.find(f => f.id === fileId);
  if (!file) return;
  if (file.isFolder) {
    const children = allFiles.filter(f => f.parentId === fileId);
    for (const child of children) {
      await softDeleteRecursive(child.id);
    }
  }
  await softDeleteFile(fileId);
}

async function restoreFromTrash(fileId) {
  const file = await getFile(fileId);
  if (!file) return false;
  file.inTrash = false;
  file.deletedAt = null;
  // กู้คืนไปตำแหน่งเดิม ถ้าโฟลเดอร์เดิมยังอยู่
  if (file._originalParentId) {
    const parentExists = allFiles.find(f => f.id === file._originalParentId && !f.inTrash);
    file.parentId = parentExists ? file._originalParentId : null;
  }
  delete file._originalParentId;
  await saveFile(file);
  return true;
}

async function permanentDeleteFile(fileId) {
  await deleteFile(fileId);
}

async function cleanupTrash() {
  const now = Date.now();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const allData = await getAllFiles();
  let cleaned = 0;
  for (const f of allData) {
    if (f.inTrash && f.deletedAt) {
      const elapsed = now - new Date(f.deletedAt).getTime();
      if (elapsed >= THREE_DAYS_MS) {
        await deleteFile(f.id);
        cleaned++;
      }
    }
  }
  if (cleaned > 0) {
    console.log(`Trash cleanup: permanently deleted ${cleaned} expired items`);
  }
}

function getTrashFiles() {
  return allFiles.filter(f => f.inTrash);
}

function getTrashTimeRemaining(deletedAt) {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  const remaining = THREE_DAYS_MS - elapsed;
  if (remaining <= 0) return 'กำลังจะถูกลบถาวร';
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  if (hours >= 24) return `เหลือ ${Math.floor(hours / 24)} วัน`;
  return `เหลือ ${hours} ชั่วโมง`;
}

function toggleTrashView() {
  isViewingTrash = !isViewingTrash;
  const trashBtn = document.getElementById('trash-toggle-btn');
  const sidebarTitle = document.querySelector('.sidebar-header h3');
  
  if (isViewingTrash) {
    if (trashBtn) trashBtn.classList.add('active');
    if (sidebarTitle) sidebarTitle.textContent = 'ถังขยะ';
    clearSelection();
    renderTrashList();
  } else {
    if (trashBtn) trashBtn.classList.remove('active');
    if (sidebarTitle) sidebarTitle.textContent = 'ไฟล์ทั้งหมด';
    clearSelection();
    refreshFiles();
  }
}

function renderTrashList() {
  const trashFiles = getTrashFiles();
  fileList.innerHTML = '';
  fileCount.textContent = trashFiles.length;

  if (trashFiles.length === 0) {
    emptySidebar.classList.remove('hidden');
    emptySidebar.querySelector('p').textContent = 'ถังขยะว่างเปล่า';
    emptySidebar.querySelector('span').textContent = 'ไฟล์ที่ลบจะอยู่ที่นี่ 3 วัน ก่อนลบถาวร';
    fileList.classList.add('hidden');
    return;
  }

  emptySidebar.classList.add('hidden');
  fileList.classList.remove('hidden');

  trashFiles.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  trashFiles.forEach((file, index) => {
    const ext = file.isFolder ? '' : getExtension(file.name);
    const cat = file.isFolder ? 'folder' : getFileCategory(ext);
    const remaining = getTrashTimeRemaining(file.deletedAt);

    const item = document.createElement('div');
    item.className = 'file-item trash-item';
    item.setAttribute('data-id', file.id);
    item.style.animationDelay = `${index * 0.03}s`;

    let iconHtml = file.isFolder
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
      : (ext || '?');

    item.innerHTML = `
      <div class="file-item-icon ${cat}" style="opacity:0.5">${iconHtml}</div>
      <div class="file-item-info">
        <div class="file-item-name" title="${file.name}">${file.name}</div>
        <div class="file-item-meta" style="color:var(--accent)">${remaining}</div>
      </div>
      <div class="trash-actions">
        <button class="trash-restore-btn" title="กู้คืน" onclick="event.stopPropagation(); handleRestoreFile('${file.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button class="trash-perma-delete-btn" title="ลบถาวร" onclick="event.stopPropagation(); handlePermanentDelete('${file.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    fileList.appendChild(item);
  });
}

async function handleRestoreFile(fileId) {
  const file = allFiles.find(f => f.id === fileId);
  if (!file) return;

  // If it's a folder, restore children too
  if (file.isFolder) {
    const children = allFiles.filter(f => f.inTrash && f._originalParentId === fileId);
    for (const child of children) {
      await restoreFromTrash(child.id);
    }
  }

  await restoreFromTrash(fileId);
  showToast(`กู้คืน "${file.name}" สำเร็จ`, 'success');
  allFiles = await getAllFiles();
  renderTrashList();
  scheduleAutoSync();
}

async function handlePermanentDelete(fileId) {
  const file = allFiles.find(f => f.id === fileId);
  if (!file) return;
  await permanentDeleteFile(fileId);
  showToast(`ลบ "${file.name}" ถาวรแล้ว`, 'info');
  allFiles = await getAllFiles();
  renderTrashList();
}

// ──── Search & Filter ────
function handleSearch() {
  const query = searchInput.value.trim().toLowerCase();
  const filterType = typeFilter.value;
  
  // Decide which pool of files to use
  // กรองไฟล์ที่อยู่ในถังขยะออก
  let pool = allFiles.filter(f => !f.inTrash);
  if (!query && filterType === 'all') {
    // If no text search and no filter, only show items in current folder
    pool = pool.filter(f => f.parentId === currentFolderId);
  }

  // Apply filters
  const results = pool.filter(f => {
    // 1. Text Query Match
    const safeName = f.name || '';
    const matchQuery = !query || safeName.toLowerCase().includes(query);
    
    // 2. Type Match
    let matchType = true;
    if (filterType !== 'all') {
      if (filterType === 'folder') {
        matchType = f.isFolder;
      } else {
        if (f.isFolder) {
          matchType = false;
        } else {
          const ext = getExtension(safeName);
          const cat = getFileCategory(ext);
          
          if (filterType === 'image') {
            matchType = (cat === 'img');
          } else if (filterType === 'code') {
            matchType = ['html', 'css', 'js', 'json'].includes(cat);
          } else if (filterType === 'document') {
            matchType = ['pdf', 'txt'].includes(cat);
          } else if (filterType === 'video') {
            matchType = (cat === 'video');
          } else if (filterType === 'model3d') {
            matchType = (cat === 'model3d');
          } else {
            matchType = (cat === filterType);
          }
        }
      }
    }

    return matchQuery && matchType;
  });

  renderFileList(results);
}

// ──── File Selection & Preview ────
async function selectFile(id) {
  selectedFileId = id;
  const file = await getFile(id);
  if (!file) return;

  // Highlight active in list
  $$('.file-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-id') === id);
  });

  // Show details
  showDetails(file);

  // Show preview
  await showPreview(file);
}

function showDetails(file) {
  const ext = getExtension(file.name);
  const cat = getFileCategory(ext);

  // Update Folder Actions
  if (file.isFolder) {
    downloadBtn.classList.add('hidden');
  } else {
    downloadBtn.classList.remove('hidden');
  }
  
  // Prevent moving root if we ever allowed selecting it (we don't, but safety)
  moveBtn.classList.remove('hidden');

  const aiAnalysisWrap = document.getElementById('ai-analysis-wrap');
  if (aiAnalysisWrap) {
    if (file.isFolder) {
      aiAnalysisWrap.style.display = 'none';
    } else {
      aiAnalysisWrap.style.display = 'flex';
      document.getElementById('ai-analyze-text').textContent = 'AI วิเคราะห์เนื้อหา';
      document.getElementById('ai-analyze-btn').style.opacity = '1';
    }
  }

  detailsContent.classList.remove('hidden');
  emptyDetails.classList.add('hidden');

  let iconHtml = ext || '?';
  if (file.isFolder) {
    iconHtml = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>`;
  }

  $('#detail-icon').className = `detail-icon file-item-icon ${file.isFolder ? 'folder' : cat}`;
  $('#detail-icon').innerHTML = iconHtml;
  $('#detail-name').textContent = file.name;
  $('#detail-type').textContent = file.isFolder ? 'โฟลเดอร์' : (file.type || getMimeType(ext));
  $('#detail-size').textContent = file.isFolder ? '—' : formatFileSize(file.size);
  
  // Find location name
  let locationName = 'หน้าแรก';
  if (file.parentId) {
    const parentFolder = allFiles.find(f => f.id === file.parentId);
    if (parentFolder) locationName = parentFolder.name;
  }
  $('#detail-location').textContent = locationName;
  
  $('#detail-date').textContent = formatDate(file.storedAt);
  $('#detail-modified').textContent = file.lastModified ? formatDate(file.lastModified) : '—';
  $('#detail-ext').textContent = file.isFolder ? '—' : (ext ? `.${ext}` : 'ไม่มีนามสกุล');
}

async function showPreview(file) {
  previewContent.innerHTML = '';
  emptyPreview.classList.add('hidden');
  previewContent.classList.remove('hidden');

  if (file.isFolder) {
    previewContent.innerHTML = `
      <div class="empty-state-preview">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.4" style="color: #f59e0b">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <h3 style="margin-top: 16px;">${file.name}</h3>
        <p>ดับเบิ้ลคลิกเพื่อเปิดโฟลเดอร์</p>
        <button class="btn-primary" style="margin-top: 16px;" onclick="navigateToFolder('${file.id}', '${file.name}')">เปิดโฟลเดอร์</button>
      </div>
    `;
    return;
  }

  const ext = getExtension(file.name);
  const cat = getFileCategory(ext);

  // Video Preview
  if (cat === 'video') {
    let src = '';
    if (file.dataURL) {
      src = file.dataURL;
    } else if (file.binaryData) {
      const blob = new Blob([file.binaryData], { type: getMimeType(ext) });
      src = URL.createObjectURL(blob);
    }

    if (src) {
      previewContent.innerHTML = `
        <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#000; border-radius:8px; overflow:hidden;">
          <video controls autoplay style="max-width:100%; max-height:100%; outline:none;" src="${src}">
            เบราว์เซอร์ของคุณไม่รองรับการเล่นวิดีโอ
          </video>
        </div>
      `;
    } else {
      previewContent.innerHTML = `<div class="empty-state-preview"><h3>ไม่สามารถโหลดวิดีโอได้</h3></div>`;
    }
    return;
  }

  // 3D Model Preview (glb, gltf)
  if (ext === 'glb' || ext === 'gltf') {
    let src = '';
    if (file.dataURL) {
      src = file.dataURL;
    } else if (file.binaryData) {
      const blob = new Blob([file.binaryData], { type: getMimeType(ext) });
      src = URL.createObjectURL(blob);
    }
    
    if (src) {
      previewContent.innerHTML = `
        <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#222; border-radius:8px;">
          <model-viewer src="${src}" auto-rotate camera-controls style="width:100%; height:100%; outline:none;" alt="A 3D model of ${file.name}"></model-viewer>
        </div>
      `;
    } else {
      previewContent.innerHTML = `<div class="empty-state-preview"><h3>ไม่สามารถโหลด 3D Model ได้</h3></div>`;
    }
    return;
  }

  // HTML Preview — check for paired CSS
  if (ext === 'html' || ext === 'htm') {
    let htmlContent = file.textContent || '';
    let cssContent = '';

    // Look for a matching CSS file in the same folder
    const baseName = file.name.replace(/\.(html|htm)$/i, '');
    const cssFile = allFiles.find(f => {
      const n = f.name.toLowerCase();
      const inSameFolder = f.parentId === file.parentId;
      return inSameFolder && (n === baseName.toLowerCase() + '.css' || n === 'style.css' || n === 'styles.css');
    });

    if (cssFile) {
      const fullCss = await getFile(cssFile.id);
      cssContent = fullCss?.textContent || '';
    }

    // Inject CSS into HTML if not already linked
    let finalHtml = htmlContent;
    if (cssContent) {
      if (finalHtml.includes('</head>')) {
        finalHtml = finalHtml.replace('</head>', `<style>${cssContent}</style></head>`);
      } else if (finalHtml.includes('<html')) {
        finalHtml = finalHtml.replace(/(<html[^>]*>)/, `$1<head><style>${cssContent}</style></head>`);
      } else {
        finalHtml = `<style>${cssContent}</style>${finalHtml}`;
      }
    }

    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '0';
    iframe.style.background = '#fff';
    previewContent.appendChild(iframe);

    // Use srcdoc for safety
    iframe.srcdoc = finalHtml;
    return;
  }

  // Image Preview
  if (isImageFile(ext)) {
    const wrap = document.createElement('div');
    wrap.className = 'preview-img-wrap';
    const img = document.createElement('img');
    img.src = file.dataURL;
    img.alt = file.name;
    wrap.appendChild(img);
    previewContent.appendChild(wrap);
    return;
  }

  // PDF Preview
  if (ext === 'pdf') {
    const blob = new Blob([file.binaryData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.className = 'pdf-preview';
    iframe.src = url;
    previewContent.appendChild(iframe);
    return;
  }

  // Text / Code Preview
  if (isTextFile(ext) || file.textContent) {
    const pre = document.createElement('div');
    pre.className = 'text-preview';
    const lines = (file.textContent || '').split('\n');
    lines.forEach((line, i) => {
      const lineEl = document.createElement('div');
      const numSpan = document.createElement('span');
      numSpan.className = 'line-number';
      numSpan.textContent = i + 1;
      lineEl.appendChild(numSpan);
      lineEl.appendChild(document.createTextNode(line || ' '));
      pre.appendChild(lineEl);
    });
    previewContent.appendChild(pre);
    return;
  }

  // Unsupported file — show generic
  previewContent.innerHTML = `
    <div class="empty-state-preview">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <h3>${file.name}</h3>
      <p>ไม่สามารถแสดงตัวอย่างไฟล์นี้ได้ — กดดาวน์โหลดเพื่อเปิดไฟล์</p>
    </div>
  `;
}

// ──── Upload Progress Overlay ────
function showUploadProgress(fileName, percent) {
  let overlay = document.getElementById('upload-progress-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'upload-progress-overlay';
    overlay.innerHTML = `
      <div class="upload-progress-box">
        <div class="upload-progress-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="upload-progress-text" id="upload-progress-text">กำลังอัปโหลด...</div>
        <div class="upload-progress-filename" id="upload-progress-filename"></div>
        <div class="upload-progress-bar-wrap">
          <div class="upload-progress-bar" id="upload-progress-bar"></div>
        </div>
        <div class="upload-progress-percent" id="upload-progress-percent">0%</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('hidden');
  document.getElementById('upload-progress-filename').textContent = fileName;
  document.getElementById('upload-progress-bar').style.width = percent + '%';
  document.getElementById('upload-progress-percent').textContent = percent + '%';
}

function hideUploadProgress() {
  const overlay = document.getElementById('upload-progress-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 400);
  }
}

// ──── Upload Files ────
async function handleUpload(fileListInput) {
  const files = Array.from(fileListInput);
  if (files.length === 0) return;

  const totalFiles = files.length;
  let count = 0;

  showUploadProgress(files[0].name, 0);

  for (const file of files) {
    const ext = getExtension(file.name);

    // แสดง % ก่อนเริ่มอ่านไฟล์
    const percentStart = Math.round((count / totalFiles) * 100);
    showUploadProgress(file.name, percentStart);

    const fileObj = {
      id: generateId(),
      name: file.name,
      type: file.type || getMimeType(ext),
      size: file.size,
      parentId: currentFolderId,
      isFolder: false,
      storedAt: new Date().toISOString(),
      lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    };

    // Store text content for text files
    if (isTextFile(ext)) {
      fileObj.textContent = await readFileAsText(file);
    }

    // Store dataURL for images
    if (isImageFile(ext)) {
      fileObj.dataURL = await readFileAsDataURL(file);
    }

    // Store binary for PDF, Video, and 3D Models
    const binaryExts = ['pdf', 'glb', 'gltf', 'fbx', 'usdz', 'obj', 'stl', 'mp4', 'webm', 'ogg', 'mov'];
    if (binaryExts.includes(ext)) {
      fileObj.binaryData = await readFileAsArrayBuffer(file);
    }

    // For non-text, non-image, non-binary: store as dataURL for download
    if (!isTextFile(ext) && !isImageFile(ext) && !binaryExts.includes(ext)) {
      fileObj.dataURL = await readFileAsDataURL(file);
    }

    await saveFile(fileObj);
    count++;

    // อัปเดต %
    const percentDone = Math.round((count / totalFiles) * 100);
    showUploadProgress(file.name, percentDone);
  }

  hideUploadProgress();
  showToast(`อัปโหลด ${count} ไฟล์สำเร็จ`, 'success');
  await refreshFiles();
  scheduleAutoSync();
}

// ──── Download File ────
async function handleDownload() {
  if (!selectedFileId) return;
  const file = await getFile(selectedFileId);
  if (!file) return;

  let blob;
  const ext = getExtension(file.name);

  if (file.textContent !== undefined) {
    blob = new Blob([file.textContent], { type: file.type || 'text/plain' });
  } else if (file.binaryData) {
    blob = new Blob([file.binaryData], { type: file.type });
  } else if (file.dataURL) {
    const res = await fetch(file.dataURL);
    blob = await res.blob();
  } else {
    showToast('ไม่สามารถดาวน์โหลดไฟล์ได้', 'error');
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`ดาวน์โหลด "${file.name}" สำเร็จ`, 'success');
}

// ──── Delete File ────
function showDeleteModal() {
  if (!selectedFileId) return;
  deleteTargetId = selectedFileId;
  const file = allFiles.find(f => f.id === selectedFileId);
  if (!file) return;
  deleteModalFilename.textContent = file.name;
  deleteModal.classList.remove('hidden');
}

function hideDeleteModal() {
  deleteModal.classList.add('hidden');
  deleteTargetId = null;
}

async function confirmDeleteFile() {
  if (!deleteTargetId) return;
  const file = allFiles.find(f => f.id === deleteTargetId);
  const name = file?.name || 'ไฟล์';

  // Soft delete: ย้ายลงถังขยะแทนลบถาวร
  await softDeleteRecursive(deleteTargetId);

  if (selectedFileId === deleteTargetId || 
     (file?.isFolder && breadcrumbPath.some(p => p.id === deleteTargetId))) {
    
    // If we deleted the folder we are currently inside, go to root
    if (breadcrumbPath.some(p => p.id === deleteTargetId)) {
      currentFolderId = null;
      breadcrumbPath = [{ id: null, name: 'หน้าแรก' }];
    }

    clearSelection();
  }

  hideDeleteModal();
  showToast(`ย้าย "${name}" ไปถังขยะแล้ว (กู้คืนได้ 3 วัน)`, 'info');
  await refreshFiles();
  scheduleAutoSync();
}

// ──── Create Folder ────
function showFolderModal() {
  folderNameInput.value = '';
  folderModal.classList.remove('hidden');
  setTimeout(() => folderNameInput.focus(), 100);
}

function hideFolderModal() {
  folderModal.classList.add('hidden');
}

async function confirmCreateFolder() {
  const name = folderNameInput.value.trim();
  if (!name) return;

  const folderObj = {
    id: generateId(),
    name: name,
    type: 'folder',
    size: 0,
    parentId: currentFolderId,
    isFolder: true,
    storedAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };

  await saveFile(folderObj);
  hideFolderModal();
  showToast(`สร้างโฟลเดอร์ "${name}" สำเร็จ`, 'success');
  await refreshFiles();
  scheduleAutoSync();
}

// ──── Move to Folder ────
function showMoveModal() {
  if (!selectedFileId) return;
  
  const fileToMove = allFiles.find(f => f.id === selectedFileId);
  if (!fileToMove) return;
  
  itemToMoveId = selectedFileId;
  renderMoveFolderList();
  moveModal.classList.remove('hidden');
}

function hideMoveModal() {
  moveModal.classList.add('hidden');
  itemToMoveId = null;
}

function renderMoveFolderList() {
  moveFolderList.innerHTML = '';
  
  const fileToMove = allFiles.find(f => f.id === itemToMoveId);
  
  const availableFolders = allFiles.filter(f => f.isFolder && !isDescendant(f.id, itemToMoveId));

  
  // Root option
  addMoveItem(null, 'หน้าแรก', fileToMove?.parentId === null, true);

  // Subfolders
  availableFolders.forEach(folder => {
    addMoveItem(folder.id, folder.name, fileToMove?.parentId === folder.id, false);
  });
}

function addMoveItem(id, name, isCurrentLocation, isRoot) {
  const item = document.createElement('div');
  item.className = `move-folder-item${isRoot ? ' root-item' : ''}`;
  
  const icon = isRoot 
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  item.innerHTML = `
    ${icon}
    <span>${name}</span>
    ${isCurrentLocation ? `<span style="margin-left: auto; font-size: 0.75rem; color: var(--text-tertiary);">(ที่อยู่ปัจจุบัน)</span>` : ''}
  `;

  if (!isCurrentLocation) {
    item.addEventListener('click', () => moveItemTo(id));
  } else {
    item.style.opacity = '0.5';
    item.style.cursor = 'default';
  }

  moveFolderList.appendChild(item);
}

async function moveItemTo(targetFolderId) {
  if (!itemToMoveId) return;
  
  const fileToMove = allFiles.find(f => f.id === itemToMoveId);
  if (!fileToMove) return;

  fileToMove.parentId = targetFolderId;
  await saveFile(fileToMove);
  
  hideMoveModal();
  clearSelection();
  showToast(`ย้ายไฟล์สำเร็จ`, 'success');
  await refreshFiles();
  scheduleAutoSync();
}

// ──── Sort ────
function changeSortMode(mode) {
  currentSortMode = mode;
  localStorage.setItem('memory-sort-mode', mode);
  if (isViewingTrash) {
    renderTrashList();
  } else {
    handleSearch();
  }
}

// ──── Rename ────
function showRenameModal() {
  if (!selectedFileId) return;
  const file = allFiles.find(f => f.id === selectedFileId);
  if (!file) return;
  let modal = document.getElementById('rename-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rename-modal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-icon modal-icon-accent">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <h3>เปลี่ยนชื่อ</h3>
        <div class="modal-input-wrap">
          <input type="text" id="rename-input" class="modal-input" placeholder="ชื่อใหม่..." autocomplete="off" maxlength="200">
        </div>
        <div class="modal-actions">
          <button class="btn-outline" onclick="hideRenameModal()">ยกเลิก</button>
          <button class="btn-primary" onclick="confirmRename()">เปลี่ยนชื่อ</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) hideRenameModal(); });
    document.getElementById('rename-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmRename();
    });
  }
  document.getElementById('rename-input').value = file.name;
  modal.classList.remove('hidden');
  setTimeout(() => {
    const input = document.getElementById('rename-input');
    input.focus();
    // เลือกชื่อไฟล์โดยไม่รวมนามสกุล
    const dotIndex = file.name.lastIndexOf('.');
    input.setSelectionRange(0, dotIndex > 0 && !file.isFolder ? dotIndex : file.name.length);
  }, 100);
}

function hideRenameModal() {
  const modal = document.getElementById('rename-modal');
  if (modal) modal.classList.add('hidden');
}

async function confirmRename() {
  if (!selectedFileId) return;
  const input = document.getElementById('rename-input');
  const newName = input.value.trim();
  if (!newName) return;
  const file = await getFile(selectedFileId);
  if (!file) return;
  file.name = newName;
  file.lastModified = new Date().toISOString();
  await saveFile(file);
  hideRenameModal();
  showToast(`เปลี่ยนชื่อเป็น "${newName}" แล้ว`, 'success');
  await refreshFiles();
  await selectFile(selectedFileId);
  scheduleAutoSync();
}

// ──── Refresh File List ────
async function refreshFiles() {
  allFiles = await getAllFiles();
  renderBreadcrumbs();
  handleSearch(); 
}

// ──── Drag & Drop ────
let dragCounter = 0;

function handleDragEnter(e) {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.remove('hidden');
}

function handleDragOver(e) {
  e.preventDefault();
}

function handleDragLeave(e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
  }
}

function handleDrop(e) {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.add('hidden');

  if (e.dataTransfer.files.length > 0) {
    handleUpload(e.dataTransfer.files);
  }
}

// ──── Event Listeners ────
function initEvents() {
  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Upload
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    handleUpload(e.target.files);
    fileInput.value = '';
  });

  // Google Drive dropdown toggle
  const gdriveBtn = document.getElementById('gdrive-btn');
  const gdriveDropdown = document.getElementById('gdrive-dropdown');
  const gdriveSetupModal = document.getElementById('gdrive-setup-modal');

  gdriveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    gdriveDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!gdriveDropdown.classList.contains('hidden') && !e.target.closest('.gdrive-wrap')) {
      gdriveDropdown.classList.add('hidden');
    }
  });

  // Restore btn visibility when connected
  const gdriveRestoreBtn = document.getElementById('gdrive-restore-btn');
  const observer = new MutationObserver(() => {
    const syncBtn = document.getElementById('gdrive-sync-btn');
    if (syncBtn && !syncBtn.classList.contains('hidden')) {
      gdriveRestoreBtn.classList.remove('hidden');
    }
  });
  const syncBtnEl = document.getElementById('gdrive-sync-btn');
  if (syncBtnEl) observer.observe(syncBtnEl, { attributes: true, attributeFilter: ['class'] });

  // Create Folder
  newFolderBtn.addEventListener('click', showFolderModal);
  cancelFolderBtn.addEventListener('click', hideFolderModal);
  confirmFolderBtn.addEventListener('click', confirmCreateFolder);
  folderNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmCreateFolder();
  });

  // Search & Filter
  searchInput.addEventListener('input', handleSearch);
  typeFilter.addEventListener('change', handleSearch);

  // Close details
  closeDetailsBtn.addEventListener('click', clearSelection);

  // Download
  downloadBtn.addEventListener('click', handleDownload);

  // Move
  moveBtn.addEventListener('click', showMoveModal);
  cancelMoveBtn.addEventListener('click', hideMoveModal);

  // Delete
  deleteBtn.addEventListener('click', showDeleteModal);
  cancelDeleteBtn.addEventListener('click', hideDeleteModal);
  confirmDeleteBtn.addEventListener('click', confirmDeleteFile);
  
  // Modals click outside
  const aiSetupModal = document.getElementById('ai-setup-modal');
  if (aiSetupModal) {
    aiSetupModal.addEventListener('click', (e) => {
      if (e.target === aiSetupModal) hideAiSetupModal();
    });
  }

  // Close modals on overlay click
  [deleteModal, folderModal, moveModal, gdriveSetupModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === deleteModal) hideDeleteModal();
      if (e.target === folderModal) hideFolderModal();
      if (e.target === moveModal) hideMoveModal();
      if (e.target === gdriveSetupModal) hideGDriveSetupModal();
    });
  });

  // Drag and drop on the whole app
  const mainLayout = document.querySelector('.main-layout');
  mainLayout.addEventListener('dragenter', handleDragEnter);
  mainLayout.addEventListener('dragover', handleDragOver);
  mainLayout.addEventListener('dragleave', handleDragLeave);
  mainLayout.addEventListener('drop', handleDrop);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
      if (!deleteModal.classList.contains('hidden')) hideDeleteModal();
      if (!folderModal.classList.contains('hidden')) hideFolderModal();
      if (!moveModal.classList.contains('hidden')) hideMoveModal();
      if (!gdriveSetupModal.classList.contains('hidden')) hideGDriveSetupModal();
      if (!gdriveDropdown.classList.contains('hidden')) gdriveDropdown.classList.add('hidden');
    }
    // Ctrl+F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
  });
}

// ──── Loading Screen ────
function hideLoadingScreen() {
  return new Promise((resolve) => {
    setTimeout(() => {
      loadingScreen.classList.add('fade-out');
      app.classList.remove('hidden');
      setTimeout(resolve, 500);
    }, 1400);
  });
}

// ──── Init ────
async function init() {
  initTheme();

  // ตั้ง PIN ครั้งแรกอัตโนมัติ
  if (!localStorage.getItem(PIN_STORAGE_KEY)) {
    setupPin('031124');
  }
  // เช็ค PIN Lock ก่อนแสดงแอป
  initPinLock();

  initEvents();

  // Set initial sort mode UI
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.value = currentSortMode;
  }

  // Load files from IndexedDB
  await refreshFiles();

  // ลบไฟล์ในถังขยะที่เกิน 3 วันอัตโนมัติ
  await cleanupTrash();

  // Init Google Drive
  initGoogleDrive();

  // Init AI Assistant
  if (isAiConfigured()) {
    const dot = document.querySelector('.ai-fab-dot');
    if (dot) dot.classList.add('connected');
  }

  // Hide loading screen
  await hideLoadingScreen();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

/* ========================================
   Memory — AI Assistant (Groq / Llama 3)
   Smart file search & management via chat
   ======================================== */

// ──── Config ────
const AI_STORAGE_KEY = 'memory-ai-key';
const GEMINI_STORAGE_KEY = 'memory-gemini-key';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.5-flash';

// API Key จะถูกเก็บใน localStorage เท่านั้น — ไม่มี hardcode ใน source code
let groqApiKey = ((typeof APP_CONFIG !== 'undefined' && APP_CONFIG.GROQ_API_KEY) ? APP_CONFIG.GROQ_API_KEY : (localStorage.getItem(AI_STORAGE_KEY) || '')).trim();
let geminiApiKey = ((typeof APP_CONFIG !== 'undefined' && APP_CONFIG.GEMINI_API_KEY) ? APP_CONFIG.GEMINI_API_KEY : (localStorage.getItem(GEMINI_STORAGE_KEY) || '')).trim();
let customEndpoint = (localStorage.getItem('memory-ai-endpoint') || '').trim();
let customModel = (localStorage.getItem('memory-ai-model') || '').trim();
let aiChatHistory = [];
let isAiThinking = false;

// ──── AI Setup Modal & Key Management ────
function showAiSetupModal() {
  document.getElementById('groq-api-key-input').value = groqApiKey;
  document.getElementById('gemini-api-key-input').value = geminiApiKey;

  const endpointInput = document.getElementById('ai-endpoint-input');
  if (endpointInput) endpointInput.value = customEndpoint;

  const modelInput = document.getElementById('ai-model-input');
  if (modelInput) modelInput.value = customModel;

  document.getElementById('ai-setup-modal').classList.remove('hidden');
}

function hideAiSetupModal() {
  document.getElementById('ai-setup-modal').classList.add('hidden');
}

function saveAiSetup() {
  const gKey = document.getElementById('groq-api-key-input').value.trim();
  const gemKey = document.getElementById('gemini-api-key-input').value.trim();

  const endpointInput = document.getElementById('ai-endpoint-input');
  const modelInput = document.getElementById('ai-model-input');

  customEndpoint = endpointInput ? endpointInput.value.trim() : '';
  customModel = modelInput ? modelInput.value.trim() : '';

  groqApiKey = gKey;
  geminiApiKey = gemKey;

  localStorage.setItem(AI_STORAGE_KEY, groqApiKey);
  localStorage.setItem(GEMINI_STORAGE_KEY, geminiApiKey);
  localStorage.setItem('memory-ai-endpoint', customEndpoint);
  localStorage.setItem('memory-ai-model', customModel);

  hideAiSetupModal();
  showToast('บันทึกการตั้งค่า AI สำเร็จ', 'success');

  showAiWelcomeMessage();
}

function isAiConfigured() {
  return !!groqApiKey || !!customEndpoint || !!geminiApiKey;
}

// ──── Build File Index for AI ────
function buildFileIndex() {
  const files = allFiles || [];
  return files.map(f => {
    const ext = getExtension(f.name);
    const cat = getFileCategory(ext);
    const info = {
      id: f.id,
      name: f.name,
      type: cat,
      extension: ext || 'none',
      size: f.size ? formatFileSize(f.size) : 'unknown',
      sizeBytes: f.size || 0,
      isFolder: !!f.isFolder,
      parentId: f.parentId || 'root',
      storedAt: f.storedAt || '',
      lastModified: f.lastModified || '',
    };
    // Add tags and pin status
    info.tags = f.tags || [];
    info.isPinned = !!f.isPinned;
    return info;
  });
}

function buildFolderTree() {
  const files = allFiles || [];
  const folders = files.filter(f => f.isFolder);
  return folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId || 'root' }));
}

// ──── Tool Definitions for Function Calling ────
const AI_TOOLS = [
  {
    name: 'search_and_filter_files',
    description: 'ค้นหาและกรองไฟล์ตามเงื่อนไข เช่น ชื่อไฟล์ ประเภท ขนาด วันที่ หรือเนื้อหา ผลลัพธ์จะแสดงในรายการไฟล์ทันที',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'คำค้นหาจากชื่อไฟล์เท่านั้น ห้ามใส่ชื่อประเภทไฟล์ (เช่น "วิดีโอ", "รูป") ลงมาในนี้ ให้ปล่อยว่างถ้าไม่ได้ระบุชื่อไฟล์ชัดเจน' },
        fileType: { type: 'string', enum: ['all', 'folder', 'image', 'video', 'document', 'code', 'model3d', 'other'], description: 'ประเภทไฟล์ที่ต้องการค้นหา' },
      },
      required: [],
    },
  },
  {
    name: 'open_file',
    description: 'เปิดไฟล์เพื่อดูตัวอย่าง (Preview) โดยระบุ file ID',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์ที่ต้องการเปิด' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'navigate_to_folder',
    description: 'เปิดโฟลเดอร์เพื่อดูไฟล์ข้างใน',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'ID ของโฟลเดอร์ (ใส่ "root" เพื่อกลับหน้าแรก)' },
      },
      required: ['folderId'],
    },
  },
  {
    name: 'create_folder',
    description: 'สร้างโฟลเดอร์ใหม่',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'ชื่อโฟลเดอร์ที่ต้องการสร้าง' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_text_file',
    description: 'สร้างไฟล์ข้อความใหม่ (txt, md, html, css, js, json, csv ฯลฯ) พร้อมเขียนเนื้อหาลงไป เช่น เมื่อผู้ใช้บอกให้ "จด: ..."',
    parameters: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'ชื่อไฟล์พร้อมนามสกุล เช่น memo.txt, note.md, index.html' },
        content: { type: 'string', description: 'เนื้อหาที่ต้องการเขียนลงในไฟล์' },
      },
      required: ['fileName', 'content'],
    },
  },
  {
    name: 'add_tag',
    description: 'เพิ่มแท็กให้กับไฟล์',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์' },
        tag: { type: 'string', description: 'ชื่อแท็ก (ไม่ต้องมี #)' },
      },
      required: ['fileId', 'tag'],
    },
  },
  {
    name: 'remove_tag',
    description: 'ลบแท็กออกจากไฟล์',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์' },
        tag: { type: 'string', description: 'ชื่อแท็ก (ไม่ต้องมี #)' },
      },
      required: ['fileId', 'tag'],
    },
  },
  {
    name: 'pin_file',
    description: 'ปักหมุดไฟล์',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'unpin_file',
    description: 'ยกเลิกปักหมุดไฟล์',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'move_files',
    description: 'ย้ายไฟล์หลายไฟล์ไปยังโฟลเดอร์อื่นพร้อมกัน',
    parameters: {
      type: 'object',
      properties: {
        fileIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'รายชื่อ ID ของไฟล์ทั้งหมดที่ต้องการย้าย'
        },
        targetFolderId: { type: 'string', description: 'ID ของโฟลเดอร์ปลายทาง (ใส่ "root" เพื่อย้ายไปหน้าแรก)' },
      },
      required: ['fileIds', 'targetFolderId'],
    },
  },
  {
    name: 'create_folder_and_move_files',
    description: 'สร้างโฟลเดอร์ใหม่ และย้ายไฟล์เข้าไปในโฟลเดอร์นั้นทันที (ใช้เมื่อผู้ใช้สั่งให้สร้างโฟลเดอร์และย้ายไฟล์เข้าพร้อมกัน)',
    parameters: {
      type: 'object',
      properties: {
        folderName: { type: 'string', description: 'ชื่อโฟลเดอร์ใหม่ที่ต้องการสร้าง' },
        fileIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'รายชื่อ ID ของไฟล์ทั้งหมดที่ต้องการย้ายเข้าไป'
        },
      },
      required: ['folderName', 'fileIds'],
    },
  },
  {
    name: 'delete_file',
    description: 'ลบไฟล์หรือโฟลเดอร์ (ย้ายลงถังขยะ กู้คืนได้ภายใน 3 วัน)',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์ที่ต้องการลบ' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'view_trash',
    description: 'ดูรายการไฟล์ในถังขยะทั้งหมด',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'restore_file',
    description: 'กู้คืนไฟล์จากถังขยะกลับมาที่ตำแหน่งเดิม',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์ที่ต้องการกู้คืนจากถังขยะ' },
      },
      required: ['fileId'],
    },
  },
];

// ──── Execute AI Tool Calls ────
async function executeAiTool(toolName, args) {
  switch (toolName) {
    case 'search_and_filter_files': {
      const { keyword, fileType } = args;
      // Set the type filter dropdown
      const targetType = (fileType && fileType !== 'all') ? fileType : 'all';
      const filterEl = document.getElementById('type-filter');
      if (filterEl) filterEl.value = targetType;

      // Update custom UI
      const optionBtn = document.querySelector(`.custom-filter-option[data-value="${targetType}"]`);
      if (optionBtn) {
        document.querySelectorAll('.custom-filter-option').forEach(opt => opt.classList.remove('active'));
        optionBtn.classList.add('active');
        const text = optionBtn.querySelector('span').textContent;
        const svg = optionBtn.querySelector('svg');
        const textEl = document.getElementById('custom-filter-text');
        const iconEl = document.getElementById('custom-filter-icon');
        if (textEl) textEl.textContent = text;
        if (iconEl && svg) iconEl.innerHTML = svg.outerHTML;
      }
      // Set search input
      const searchEl = document.getElementById('search-input');
      if (searchEl) searchEl.value = keyword || '';
      // Trigger search
      handleSearch();
      // Count results
      const visibleItems = document.querySelectorAll('.file-item:not(.hidden)');
      return { success: true, resultCount: visibleItems.length, message: `พบ ${visibleItems.length} ไฟล์ที่ตรงเงื่อนไข` };
    }

    case 'open_file': {
      const { fileId } = args;
      const file = await getFile(fileId);
      if (!file) return { success: false, message: 'ไม่พบไฟล์นี้' };
      // Navigate to parent folder first if needed
      if (file.parentId !== currentFolderId) {
        if (file.parentId) {
          const parent = allFiles.find(f => f.id === file.parentId);
          if (parent) navigateToFolder(parent.id, parent.name);
        } else {
          navigateToFolder(null, 'หน้าแรก');
        }
        await new Promise(r => setTimeout(r, 300));
      }
      await selectFile(fileId);
      return { success: true, message: `เปิดไฟล์ "${file.name}" แล้ว` };
    }

    case 'navigate_to_folder': {
      let { folderId } = args;
      if (folderId === 'root') {
        breadcrumbPath = [{ id: null, name: 'หน้าแรก' }];
        currentFolderId = null;
        await refreshFiles();
        return { success: true, message: 'กลับไปหน้าแรกแล้ว' };
      }
      const folder = allFiles.find(f => f.id === folderId && f.isFolder);
      if (!folder) return { success: false, message: 'ไม่พบโฟลเดอร์นี้' };
      navigateToFolder(folder.id, folder.name);
      return { success: true, message: `เปิดโฟลเดอร์ "${folder.name}" แล้ว` };
    }

    case 'create_folder': {
      const { name } = args;
      const folderObj = {
        id: generateId(),
        name: name,
        isFolder: true,
        parentId: currentFolderId,
        storedAt: new Date().toISOString(),
      };
      await saveFile(folderObj);
      showToast(`สร้างโฟลเดอร์ "${name}" สำเร็จ`, 'success');
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `สร้างโฟลเดอร์ "${name}" แล้ว`, folderId: folderObj.id };
    }

    case 'move_files': {
      const { fileIds, targetFolderId } = args;
      if (!Array.isArray(fileIds)) return { success: false, message: 'fileIds ต้องเป็น array' };

      let movedCount = 0;
      for (const id of fileIds) {
        const fileToMove = allFiles.find(f => f.id === id);
        if (fileToMove) {
          fileToMove.parentId = targetFolderId === 'root' ? null : targetFolderId;
          await saveFile(fileToMove);
          movedCount++;
        }
      }

      showToast(`ย้ายไฟล์สำเร็จ ${movedCount} รายการ`, 'success');
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `ย้ายไฟล์สำเร็จ ${movedCount} รายการ` };
    }

    case 'create_folder_and_move_files': {
      const { folderName, fileIds } = args;
      if (!Array.isArray(fileIds)) return { success: false, message: 'fileIds ต้องเป็น array' };

      // 1. Create folder
      const folderObj = {
        id: generateId(),
        name: folderName,
        isFolder: true,
        parentId: currentFolderId,
        storedAt: new Date().toISOString(),
      };
      await saveFile(folderObj);

      // 2. Move files
      let movedCount = 0;
      for (const id of fileIds) {
        const fileToMove = allFiles.find(f => f.id === id);
        if (fileToMove) {
          fileToMove.parentId = folderObj.id;
          await saveFile(fileToMove);
          movedCount++;
        }
      }

      showToast(`สร้างโฟลเดอร์ "${folderName}" และย้ายไฟล์สำเร็จ ${movedCount} รายการ`, 'success');
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `สร้างโฟลเดอร์ "${folderName}" และย้ายไฟล์ลงไป ${movedCount} รายการเรียบร้อยแล้ว` };
    }

    case 'create_text_file': {
      const { fileName, content } = args;
      const ext = getExtension(fileName);
      const fileObj = {
        id: generateId(),
        name: fileName,
        type: getMimeType(ext) || 'text/plain',
        size: new Blob([content]).size,
        parentId: currentFolderId,
        isFolder: false,
        storedAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        textContent: content,
      };
      await saveFile(fileObj);
      showToast(`สร้างไฟล์ "${fileName}" สำเร็จ`, 'success');
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `สร้างไฟล์ "${fileName}" แล้ว`, fileId: fileObj.id };
    }

    case 'delete_file': {
      const { fileId } = args;
      const fileToDelete = allFiles.find(f => f.id === fileId);
      if (!fileToDelete) return { success: false, message: 'ไม่พบไฟล์นี้' };
      await softDeleteRecursive(fileId);
      showToast(`ย้าย "${fileToDelete.name}" ไปถังขยะแล้ว`, 'info');
      clearSelection();
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `ย้าย "${fileToDelete.name}" ไปถังขยะแล้ว (กู้คืนได้ภายใน 3 วัน)` };
    }

    case 'view_trash': {
      const trashFiles = getTrashFiles();
      if (trashFiles.length === 0) return { success: true, message: 'ถังขยะว่างเปล่า', files: [] };
      const list = trashFiles.map(f => ({
        id: f.id, name: f.name, isFolder: !!f.isFolder,
        deletedAt: f.deletedAt, remaining: getTrashTimeRemaining(f.deletedAt),
      }));
      // เปิดหน้าถังขยะให้ผู้ใช้เห็นด้วย
      if (!isViewingTrash) toggleTrashView();
      return { success: true, message: `มี ${trashFiles.length} รายการในถังขยะ`, files: list };
    }

    case 'restore_file': {
      const { fileId } = args;
      const fileToRestore = allFiles.find(f => f.id === fileId && f.inTrash);
      if (!fileToRestore) return { success: false, message: 'ไม่พบไฟล์นี้ในถังขยะ' };
      await handleRestoreFile(fileId);
      return { success: true, message: `กู้คืน "${fileToRestore.name}" สำเร็จ` };
    }

    case 'add_tag': {
      const { fileId, tag } = args;
      if (typeof addTag !== 'function') return { success: false, message: 'addTag not available' };
      await addTag(fileId, tag);
      return { success: true, message: `เพิ่มแท็ก #${tag} ให้ไฟล์แล้ว` };
    }

    case 'remove_tag': {
      const { fileId, tag } = args;
      if (typeof removeTag !== 'function') return { success: false, message: 'removeTag not available' };
      await removeTag(fileId, tag);
      return { success: true, message: `ลบแท็ก #${tag} ออกจากไฟล์แล้ว` };
    }

    case 'pin_file': {
      const { fileId } = args;
      const file = await getFile(fileId);
      if (!file) return { success: false, message: 'ไม่พบไฟล์' };
      file.isPinned = true;
      file.lastModified = new Date().toISOString();
      await saveFile(file);
      await refreshFiles();
      return { success: true, message: `ปักหมุดไฟล์ "${file.name}" แล้ว` };
    }

    case 'unpin_file': {
      const { fileId } = args;
      const file = await getFile(fileId);
      if (!file) return { success: false, message: 'ไม่พบไฟล์' };
      file.isPinned = false;
      file.lastModified = new Date().toISOString();
      await saveFile(file);
      await refreshFiles();
      return { success: true, message: `เลิกปักหมุดไฟล์ "${file.name}" แล้ว` };
    }

    default:
      return { success: false, message: `ไม่รู้จักคำสั่ง ${toolName}` };
  }
}

// ──── Call Groq API ────
async function callGroq(userMessage) {
  if (!groqApiKey && !customEndpoint) throw new Error('ยังไม่ได้ตั้งค่า API Key หรือ Custom Endpoint');

  const fileIndex = buildFileIndex();
  const folderTree = buildFolderTree();

  // Truncate to prevent payload size from exceeding Groq API limits (ERR_FAILED)
  const maxFiles = 150;
  let fileIndexString = JSON.stringify(fileIndex.slice(0, maxFiles), null, 0);
  if (fileIndex.length > maxFiles) fileIndexString += `\n... (มีไฟล์อีก ${fileIndex.length - maxFiles} ไฟล์ที่ถูกซ่อนไว้)`;

  const systemInstruction = `คุณคือ "Memory AI" — ผู้ช่วยอัจฉริยะประจำแอปเก็บไฟล์ส่วนตัวชื่อ Memory
คุณมีหน้าที่ช่วยผู้ใช้ค้นหา จัดการ และทำความเข้าใจไฟล์ที่เก็บไว้ในระบบ

กฎสำคัญ:
1. ตอบเป็นภาษาไทยเสมอ ใช้ภาษาสุภาพ เป็นกันเอง
2. เมื่อผู้ใช้ขอค้นหาไฟล์ ให้ใช้ tools ที่มีเพื่อดำเนินการให้ทันที ห้ามปฏิเสธ
3. ระวัง! ถ้าผู้ใช้สั่ง "หาไฟล์วิดีโอ" หรือ "หารูปภาพ" ให้ใช้ \`fileType\` เท่านั้น ห้ามใส่คำว่า "วิดีโอ" หรือ "รูปภาพ" ลงใน \`keyword\` (keyword ใช้สำหรับชื่อไฟล์เท่านั้น)
4. ถ้าผู้ใช้สั่งสร้างโฟลเดอร์พร้อมกับย้ายไฟล์เข้าไป ให้ใช้ \`create_folder_and_move_files\` 
5. **ห้ามพิมพ์โค้ด JSON ดิบ หรือแท็ก XML เช่น <function> ลงในแชทเด็ดขาด** คุณต้องเรียกใช้เครื่องมือผ่านระบบ Tool Calling เท่านั้น
6. เมื่อลบไฟล์ ไฟล์จะถูกย้ายไปถังขยะ (กู้คืนได้ 3 วัน)
7. ตอบกระชับ ไม่เยิ่นเย้อ ใช้ emoji เล็กน้อย

ข้อมูลระบบปัจจุบัน:
- โฟลเดอร์ที่กำลังเปิดอยู่: ${currentFolderId || 'หน้าแรก (root)'}
- จำนวนไฟล์ทั้งหมด: ${fileIndex.length}

รายการไฟล์ทั้งหมดในระบบ (สูงสุด ${maxFiles} ไฟล์ล่าสุด):
${fileIndexString}

โครงสร้างโฟลเดอร์:
${JSON.stringify(folderTree.slice(0, 50), null, 0)}`;

  // Build messages array
  const messages = [
    { role: 'system', content: systemInstruction }
  ];

  // Add chat history (last 10 messages)
  const recentHistory = aiChatHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.text });
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  // Build tools for API
  const tools = AI_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }
  }));

  let modelName = 'llama-3.3-70b-versatile';
  let targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
  let useCorsProxy = true;

  // Auto-detect OpenRouter API key
  if (groqApiKey.startsWith('sk-or-')) {
    modelName = customModel || 'google/gemini-2.5-flash:free';
    targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
    useCorsProxy = false; // OpenRouter supports CORS natively
  }

  // Override with Custom Endpoint if provided (Local AI)
  if (customEndpoint) {
    targetUrl = customEndpoint;
    modelName = customModel || 'qwen2.5:7b';
    useCorsProxy = false; // Usually local servers handle their own CORS
  }

  const body = {
    model: modelName,
    messages: messages,
    tools: tools,
    temperature: 0.7,
    max_tokens: 1024,
  };

  const url = useCorsProxy ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;

  const reqHeaders = {
    'Content-Type': 'application/json',
    'HTTP-Referer': window.location.href, // Required by OpenRouter
    'X-Title': 'Memory Vault' // Required by OpenRouter
  };

  // Add Authorization if API key exists (Local AI might not need it, but safe to send dummy or real)
  if (groqApiKey) {
    reqHeaders['Authorization'] = `Bearer ${groqApiKey}`;
  } else if (customEndpoint) {
    reqHeaders['Authorization'] = 'Bearer local'; // Some local APIs require any string
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error: ${res.status}`);
  }

  let data = await res.json();
  let choice = data.choices?.[0];
  if (!choice) throw new Error('ไม่ได้รับการตอบกลับจาก AI');

  let message = choice.message;
  let responseText = message.content || '';
  let iterations = 0;

  // Check for function calls (support chained tool calls up to 5 times)
  while (message.tool_calls && message.tool_calls.length > 0 && iterations < 5) {
    iterations++;
    messages.push(message); // add assistant message with tool_calls ONCE

    for (const toolCall of message.tool_calls) {
      const { name, arguments: argsString } = toolCall.function;
      const args = JSON.parse(argsString || '{}');
      const result = await executeAiTool(name, args);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: name,
        content: JSON.stringify(result)
      });
    }

    const followUpBody = { ...body, messages: messages };
    const followUpRes = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(followUpBody),
    });

    if (!followUpRes.ok) {
      const err = await followUpRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `API Error: ${followUpRes.status}`);
    }

    data = await followUpRes.json();
    choice = data.choices?.[0];
    message = choice.message;
    if (message.content) {
      responseText += (responseText ? '\n' : '') + message.content;
    }
  }

  return responseText || 'ดำเนินการเรียบร้อยแล้วครับ ✅';
}

// ──── Call Gemini Native API ────
async function callGeminiNative(userMessage) {
  if (!geminiApiKey) throw new Error('ยังไม่ได้ตั้งค่า Gemini API Key');

  const fileIndex = buildFileIndex();
  const folderTree = buildFolderTree();

  const maxFiles = 150;
  let fileIndexString = JSON.stringify(fileIndex.slice(0, maxFiles), null, 0);
  if (fileIndex.length > maxFiles) fileIndexString += `\n... (มีไฟล์อีก ${fileIndex.length - maxFiles} ไฟล์ที่ถูกซ่อนไว้)`;

  const systemInstructionText = `คุณคือ "Memory AI" — ผู้ช่วยอัจฉริยะประจำแอปเก็บไฟล์ส่วนตัวชื่อ Memory
คุณมีความสามารถในการจัดการไฟล์ ค้นหา และวิเคราะห์ข้อมูลในเครื่องของผู้ใช้
จงตอบคำถามเป็นภาษาไทยอย่างเป็นธรรมชาติ สุภาพ เป็นกันเอง
หากผู้ใช้สั่งให้จัดการไฟล์ ให้เรียกใช้ Tool ที่มีให้

ข้อมูลไฟล์ทั้งหมดในระบบ (JSON):
${fileIndexString}

ข้อมูลโฟลเดอร์ทั้งหมด (JSON):
${JSON.stringify(folderTree)}

เวลาปัจจุบัน: ${new Date().toLocaleString('th-TH')}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

  const contents = [];
  for (const msg of aiChatHistory) {
    contents.push({
      role: msg.role === 'bot' || msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  // Convert tool types to uppercase for Gemini API
  const geminiTools = JSON.parse(JSON.stringify(AI_TOOLS));
  const convertTypes = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.type && typeof obj.type === 'string') {
      obj.type = obj.type.toUpperCase();
    }
    if (obj.properties) {
      for (const key in obj.properties) convertTypes(obj.properties[key]);
    }
    if (obj.items) convertTypes(obj.items);
  };
  geminiTools.forEach(t => {
    if (t.parameters) convertTypes(t.parameters);
  });

  const body = {
    systemInstruction: { parts: [{ text: systemInstructionText }] },
    contents: contents,
    tools: [{ functionDeclarations: geminiTools }]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API Error: ${res.status}`);
  }

  let data = await res.json();
  let candidate = data.candidates?.[0];
  if (!candidate) throw new Error('ไม่ได้รับการตอบกลับจาก Gemini');

  let responseText = '';
  let iterations = 0;

  while (candidate?.content?.parts?.some(p => p.functionCall) && iterations < 5) {
    iterations++;
    const toolParts = candidate.content.parts.filter(p => p.functionCall);
    contents.push(candidate.content);

    const functionResponses = [];
    for (const tPart of toolParts) {
      const fn = tPart.functionCall;
      const name = fn.name;
      const args = fn.args || {};
      const result = await executeAiTool(name, args);
      functionResponses.push({
        functionResponse: {
          name: name,
          response: { result: result }
        }
      });
    }
    
    contents.push({ role: 'user', parts: functionResponses });

    const followUpRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: body.systemInstruction,
        contents: contents,
        tools: body.tools
      })
    });

    if (!followUpRes.ok) {
      const err = await followUpRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API Error: ${followUpRes.status}`);
    }

    data = await followUpRes.json();
    candidate = data.candidates?.[0];
  }

  if (candidate?.content?.parts) {
    responseText = candidate.content.parts.filter(p => p.text).map(p => p.text).join('\n');
  }

  return responseText || 'ดำเนินการเรียบร้อยแล้วครับ ✅';
}


// ──── Chat UI Logic ────
function toggleAiChat() {
  const panel = document.getElementById('ai-chat-panel');
  const btn = document.getElementById('ai-chat-fab');
  if (!panel) return;

  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  } else {
    panel.classList.remove('hidden');
    btn.classList.add('active');
    // Focus input
    const input = document.getElementById('ai-chat-input');
    if (input) setTimeout(() => input.focus(), 200);
    // Show setup if not configured
    if (!isAiConfigured()) {
      showAiSetupInChat();
    }
  }
}

function showAiSetupInChat() {
  const messagesEl = document.getElementById('ai-chat-messages');
  if (!messagesEl) return;
  messagesEl.innerHTML = `
    <div class="ai-msg ai-msg-bot">
      <div class="ai-msg-bubble">
        สวัสดีครับ! 🤖 ผมคือ <strong>Memory AI</strong> (Powered by Groq & Gemini)<br><br>
          เพื่อเริ่มใช้งาน กรุณาตั้งค่า API Key (ฟรี) ก่อนครับ
          <div style="margin-top:12px;">
            <button class="ai-key-save-btn" style="width: 100%;" onclick="showAiSetupModal()">ตั้งค่า API Keys</button>
          </div>
        </div>
      </div>
  `;
}

function showAiWelcomeMessage() {
  const messagesEl = document.getElementById('ai-chat-messages');
  if (messagesEl) {
    messagesEl.innerHTML = '';
    appendAiMessage('bot', 'พร้อมใช้งานแล้วครับ! 🎉 ลองถามอะไรผมก็ได้เลย เช่น:\n• "หาไฟล์รูปภาพทั้งหมดให้หน่อย"\n• "เปิดโฟลเดอร์ My Projects"\n• "วิเคราะห์ไฟล์ (Gemini)"');
  }
  // Update FAB indicator
  const dot = document.querySelector('.ai-fab-dot');
  if (dot) dot.classList.add('connected');
}

function appendAiMessage(role, text) {
  const messagesEl = document.getElementById('ai-chat-messages');
  if (!messagesEl) return;

  const wrapper = document.createElement('div');
  wrapper.className = `ai-msg ai-msg-${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  // Simple markdown-like: **bold**, \n to <br>
  bubble.innerHTML = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showAiThinking() {
  const messagesEl = document.getElementById('ai-chat-messages');
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg-bot';
  el.id = 'ai-thinking';
  el.innerHTML = '<div class="ai-msg-bubble ai-thinking"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeAiThinking() {
  const el = document.getElementById('ai-thinking');
  if (el) el.remove();
}

async function handleAiSend() {
  if (isAiThinking) return;
  const input = document.getElementById('ai-chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  if (!isAiConfigured()) {
    showAiSetupInChat();
    return;
  }

  input.value = '';
  appendAiMessage('user', msg);
  aiChatHistory.push({ role: 'user', text: msg });

  isAiThinking = true;
  showAiThinking();

  try {
    let reply;
    if (geminiApiKey) {
      reply = await callGeminiNative(msg);
    } else {
      reply = await callGroq(msg);
    }
    removeAiThinking();
    appendAiMessage('bot', reply);
    aiChatHistory.push({ role: 'model', text: reply });
  } catch (err) {
    removeAiThinking();
    appendAiMessage('bot', `❌ เกิดข้อผิดพลาด: ${ err.message }`);
  } finally {
    isAiThinking = false;
  }
}

function handleAiKeyPress(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleAiSend();
  }
}

// ──── Gemini Integration (File Analysis) ────
async function analyzeFileWithGemini() {
  if (!geminiApiKey) {
    showToast('กรุณาตั้งค่า Gemini API Key ก่อนใช้งาน', 'error');
    showAiSetupModal();
    return;
  }
  
  if (!selectedFileId) return;
  const file = await getFile(selectedFileId);
  if (!file || file.isFolder) return;

  // Toggle button state
  const btn = document.getElementById('ai-analyze-btn');
  const txt = document.getElementById('ai-analyze-text');
  btn.style.opacity = '0.7';
  txt.textContent = 'กำลังวิเคราะห์...';

  try {
    let prompt = "วิเคราะห์ไฟล์นี้ให้หน่อย และบอกว่ามันคืออะไร มีเนื้อหาสำคัญอย่างไร สรุปมาให้กระชับและเข้าใจง่าย";
    let payload = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    if (file.textContent) {
      // Text file
      payload.contents[0].parts.push({ text: `\n\nเนื้อหาไฟล์: \n${ file.textContent }` });
    } else if (file.data) {
      // Base64 file (Image, etc)
      const base64Data = file.data.split(',')[1];
      if (base64Data) {
        payload.contents[0].parts.push({
          inlineData: {
            mimeType: file.type || 'image/jpeg',
            data: base64Data
          }
        });
      }
    } else {
      throw new Error('ไม่สามารถอ่านข้อมูลไฟล์นี้ได้');
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error: ${errText}`);
  }

  const data = await res.json();
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'ไม่สามารถวิเคราะห์ได้';

  // Show result in a modal or chat
  const chatPanel = document.getElementById('ai-chat-panel');
  if (chatPanel && chatPanel.classList.contains('hidden')) {
    toggleAiChat();
  }
  appendAiMessage('bot', `**ผลการวิเคราะห์ไฟล์ "${file.name}":**\n\n${resultText}`);

} catch (error) {
  console.error(error);
  showToast('เกิดข้อผิดพลาดในการวิเคราะห์', 'error');
} finally {
  btn.style.opacity = '1';
  txt.textContent = 'AI วิเคราะห์เนื้อหา';
}
}

// ──── Voice Search ────
let recognition = null;
function startVoiceSearch() {
  const btn = document.getElementById('ai-voice-btn');
  const input = document.getElementById('ai-chat-input');

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('เบราว์เซอร์นี้ไม่รองรับการค้นหาด้วยเสียง', 'error');
    return;
  }

  if (btn.classList.contains('recording')) {
    if (recognition) recognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'th-TH'; // รองรับภาษาไทย
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () {
    btn.classList.add('recording');
    input.placeholder = 'กำลังฟัง...';
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;

    // Auto send
    setTimeout(() => {
      handleAiSend();
    }, 500);
  };

  recognition.onerror = function (event) {
    console.error("Speech recognition error", event.error);
    showToast('เกิดข้อผิดพลาดในการรับเสียง', 'error');
    btn.classList.remove('recording');
    input.placeholder = 'พิมพ์ข้อความ...';
  };

  recognition.onend = function () {
    btn.classList.remove('recording');
    input.placeholder = 'พิมพ์ข้อความ...';
  };

  recognition.start();
}

// ========================================
// Spotlight Omnibar — J.A.R.V.I.S. Mode
// ========================================

function openSpotlight() {
  const overlay = document.getElementById('spotlight-overlay');
  const input = document.getElementById('spotlight-input');
  const actions = document.getElementById('spotlight-actions');
  const response = document.getElementById('spotlight-response');
  if (!overlay) return;

  // Reset state
  if (input) input.value = '';
  if (actions) actions.classList.remove('hidden');
  if (response) {
    response.classList.add('hidden');
    document.getElementById('spotlight-response-content').innerHTML = '';
  }

  overlay.classList.remove('hidden');
  setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeSpotlight() {
  const overlay = document.getElementById('spotlight-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function closeSpotlightOnOverlay(e) {
  if (e.target === e.currentTarget) closeSpotlight();
}

function handleSpotlightKeyPress(e) {
  if (e.key === 'Escape') {
    closeSpotlight();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendSpotlightCommand();
  }
}

async function sendSpotlightCommand() {
  const input = document.getElementById('spotlight-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  if (!isAiConfigured()) {
    closeSpotlight();
    showAiSetupModal();
    showToast('กรุณาตั้งค่า API Key ก่อนใช้งาน Spotlight', 'error');
    return;
  }

  // Hide actions, show response area with thinking
  const actions = document.getElementById('spotlight-actions');
  const response = document.getElementById('spotlight-response');
  const content = document.getElementById('spotlight-response-content');

  if (actions) actions.classList.add('hidden');
  if (response) response.classList.remove('hidden');
  if (content) content.innerHTML = '<div class="spotlight-thinking"><span></span><span></span><span></span></div>';

  try {
    let reply;
    if (geminiApiKey) {
      reply = await callGeminiNative(msg);
    } else {
      reply = await callGroq(msg);
    }
    // Format response
    if (content) {
      content.innerHTML = reply
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    }
    // Also push to chat history
    aiChatHistory.push({ role: 'user', text: msg });
    aiChatHistory.push({ role: 'model', text: reply });
  } catch (err) {
    if (content) content.innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`;
  }
}

function spotlightQuickAction(command) {
  const input = document.getElementById('spotlight-input');
  if (input) input.value = command;
  sendSpotlightCommand();
}

function startSpotlightVoice() {
  const btn = document.getElementById('spotlight-voice-btn');
  const input = document.getElementById('spotlight-input');

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('เบราว์เซอร์นี้ไม่รองรับการสั่งด้วยเสียง', 'error');
    return;
  }

  if (btn.classList.contains('recording')) {
    if (recognition) recognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'th-TH';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () {
    btn.classList.add('recording');
    input.placeholder = '🎙️ กำลังฟัง...';
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    setTimeout(() => sendSpotlightCommand(), 300);
  };

  recognition.onerror = function () {
    btn.classList.remove('recording');
    input.placeholder = 'สั่งงาน Jarvis...';
  };

  recognition.onend = function () {
    btn.classList.remove('recording');
    input.placeholder = 'สั่งงาน Jarvis...';
  };

  recognition.start();
}

// ──── Global Keyboard Shortcut: Ctrl + Space ────
document.addEventListener('keydown', function (e) {
  // Ctrl + Space (or Cmd + Space on Mac)
  if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
    e.preventDefault();
    const overlay = document.getElementById('spotlight-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      closeSpotlight();
    } else {
      openSpotlight();
    }
  }
});

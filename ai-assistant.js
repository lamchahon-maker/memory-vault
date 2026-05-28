/* ========================================
   Memory — AI Assistant (Gemini)
   Smart file search & management via chat
   ======================================== */

// ──── Config ────
const AI_STORAGE_KEY = 'memory-gemini-key';
const GEMINI_MODEL = 'gemini-2.5-flash';
// ผู้ใช้ขอให้ฝัง API Key ลงในโค้ดเลย จะได้ไม่ต้องกรอกใหม่
let geminiApiKey = 'AIzaSyC_Rj51dAp56xWwKbxU634pyNGtzDSooww';
let aiChatHistory = [];
let isAiThinking = false;

// ──── Gemini API Key Management ────
function saveGeminiKey(key) {
  geminiApiKey = key.trim();
  localStorage.setItem(AI_STORAGE_KEY, geminiApiKey);
}

function getGeminiKey() {
  return geminiApiKey;
}

function isAiConfigured() {
  return !!geminiApiKey;
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
    // Add AI description if available
    if (f.aiDescription) info.aiDescription = f.aiDescription;
    // Add text snippet for code/text files (first 200 chars)
    if (f.textContent) info.textSnippet = f.textContent.substring(0, 300);
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
    name: 'move_file',
    description: 'ย้ายไฟล์ไปยังโฟลเดอร์อื่น',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์ที่ต้องการย้าย' },
        targetFolderId: { type: 'string', description: 'ID ของโฟลเดอร์ปลายทาง (ใส่ "root" เพื่อย้ายไปหน้าแรก)' },
      },
      required: ['fileId', 'targetFolderId'],
    },
  },
  {
    name: 'delete_file',
    description: 'ลบไฟล์หรือโฟลเดอร์',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'ID ของไฟล์ที่ต้องการลบ' },
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
      if (fileType && fileType !== 'all') {
        const filterEl = document.getElementById('type-filter');
        if (filterEl) filterEl.value = fileType;
      } else {
        const filterEl = document.getElementById('type-filter');
        if (filterEl) filterEl.value = 'all';
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
      return { success: true, message: `สร้างโฟลเดอร์ "${name}" แล้ว` };
    }

    case 'move_file': {
      const { fileId, targetFolderId } = args;
      const fileToMove = allFiles.find(f => f.id === fileId);
      if (!fileToMove) return { success: false, message: 'ไม่พบไฟล์นี้' };
      fileToMove.parentId = targetFolderId === 'root' ? null : targetFolderId;
      await saveFile(fileToMove);
      showToast('ย้ายไฟล์สำเร็จ', 'success');
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `ย้ายไฟล์ "${fileToMove.name}" แล้ว` };
    }

    case 'delete_file': {
      const { fileId } = args;
      const fileToDelete = allFiles.find(f => f.id === fileId);
      if (!fileToDelete) return { success: false, message: 'ไม่พบไฟล์นี้' };
      // If folder, delete children recursively
      if (fileToDelete.isFolder) {
        const deleteRecursive = async (fId) => {
          const children = allFiles.filter(f => f.parentId === fId);
          for (const child of children) {
            if (child.isFolder) await deleteRecursive(child.id);
            await deleteFile(child.id);
          }
          await deleteFile(fId);
        };
        await deleteRecursive(fileId);
      } else {
        await deleteFile(fileId);
      }
      showToast(`ลบ "${fileToDelete.name}" สำเร็จ`, 'info');
      clearSelection();
      await refreshFiles();
      scheduleAutoSync();
      return { success: true, message: `ลบ "${fileToDelete.name}" แล้ว` };
    }

    default:
      return { success: false, message: `ไม่รู้จักคำสั่ง ${toolName}` };
  }
}

// ──── Call Gemini API ────
async function callGemini(userMessage) {
  if (!geminiApiKey) throw new Error('ยังไม่ได้ตั้งค่า Gemini API Key');

  const fileIndex = buildFileIndex();
  const folderTree = buildFolderTree();

  const systemInstruction = `คุณคือ "Memory AI" — ผู้ช่วยอัจฉริยะประจำแอปเก็บไฟล์ส่วนตัวชื่อ Memory
คุณมีหน้าที่ช่วยผู้ใช้ค้นหา จัดการ และทำความเข้าใจไฟล์ที่เก็บไว้ในระบบ

กฎสำคัญ:
1. ตอบเป็นภาษาไทยเสมอ ใช้ภาษาสุภาพ เป็นกันเอง
2. เมื่อผู้ใช้ขอค้นหาไฟล์ ให้ใช้ tools ที่มีเพื่อดำเนินการให้ทันที
3. ระวัง! ถ้าผู้ใช้สั่ง "หาไฟล์วิดีโอ" หรือ "หารูปภาพ" ให้ใช้ \`fileType\` เท่านั้น **ห้ามใส่คำว่า "วิดีโอ" หรือ "รูปภาพ" ลงใน \`keyword\` เด็ดขาด** เพราะจะทำให้หาไฟล์ไม่เจอ (keyword ใช้สำหรับชื่อไฟล์เท่านั้น)
4. ถ้าหาไม่เจอ ให้บอกตรงๆ แล้วเสนอทางเลือก
5. ตอบกระชับ ไม่เยิ่นเย้อ ใช้ emoji เล็กน้อย

ข้อมูลระบบปัจจุบัน:
- โฟลเดอร์ที่กำลังเปิดอยู่: ${currentFolderId || 'หน้าแรก (root)'}
- จำนวนไฟล์ทั้งหมด: ${fileIndex.length}

รายการไฟล์ทั้งหมดในระบบ:
${JSON.stringify(fileIndex, null, 0)}

โครงสร้างโฟลเดอร์:
${JSON.stringify(folderTree, null, 0)}`;

  // Build messages
  const contents = [];

  // Add chat history (last 10 messages)
  const recentHistory = aiChatHistory.slice(-10);
  for (const msg of recentHistory) {
    contents.push({ role: msg.role, parts: [{ text: msg.text }] });
  }

  // Add current user message
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  // Build tools for API
  const tools = [{
    functionDeclarations: AI_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    tools,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API Error: ${res.status}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('ไม่ได้รับการตอบกลับจาก AI');

  // Check for function calls
  const parts = candidate.content?.parts || [];
  let responseText = '';
  let hadFunctionCall = false;

  for (const part of parts) {
    if (part.functionCall) {
      hadFunctionCall = true;
      const { name, args } = part.functionCall;
      const result = await executeAiTool(name, args || {});

      // Call Gemini again with function result
      const followUpContents = [...contents,
        { role: 'model', parts: [{ functionCall: { name, args: args || {} } }] },
        { role: 'user', parts: [{ functionResponse: { name, response: result } }] },
      ];

      const followUpBody = { ...body, contents: followUpContents };
      const followUpRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followUpBody),
      });

      if (followUpRes.ok) {
        const followUpData = await followUpRes.json();
        const followUpParts = followUpData.candidates?.[0]?.content?.parts || [];
        for (const fp of followUpParts) {
          if (fp.text) responseText += fp.text;
        }
      }
    }
    if (part.text) responseText += part.text;
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
        สวัสดีครับ! 🤖 ผมคือ <strong>Memory AI</strong><br><br>
        เพื่อเริ่มใช้งาน กรุณาตั้งค่า Gemini API Key ก่อนนะครับ<br>
        ไปที่ <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent);">Google AI Studio</a> แล้วกด Create API Key
        <div style="margin-top:12px;">
          <input type="text" id="ai-key-inline" class="ai-key-input" placeholder="วาง API Key ตรงนี้..." autocomplete="off">
          <button class="ai-key-save-btn" onclick="handleSaveAiKey()">บันทึก</button>
        </div>
      </div>
    </div>
  `;
}

function handleSaveAiKey() {
  const input = document.getElementById('ai-key-inline');
  if (!input || !input.value.trim()) return;
  saveGeminiKey(input.value.trim());
  showToast('ตั้งค่า AI สำเร็จ!', 'success');
  // Show welcome message
  const messagesEl = document.getElementById('ai-chat-messages');
  if (messagesEl) {
    messagesEl.innerHTML = '';
    appendAiMessage('bot', 'พร้อมใช้งานแล้วครับ! 🎉 ลองถามอะไรผมก็ได้เลย เช่น:\n• "หาไฟล์รูปภาพทั้งหมดให้หน่อย"\n• "เปิดโฟลเดอร์ My Projects"\n• "สร้างโฟลเดอร์ชื่อ Backup ให้หน่อย"');
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
    const reply = await callGemini(msg);
    removeAiThinking();
    appendAiMessage('bot', reply);
    aiChatHistory.push({ role: 'model', text: reply });
  } catch (err) {
    removeAiThinking();
    appendAiMessage('bot', `❌ เกิดข้อผิดพลาด: ${err.message}`);
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

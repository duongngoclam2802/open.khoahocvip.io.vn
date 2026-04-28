import { 
  auth, db, storage, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
  collection, getDocs, doc, setDoc, deleteDoc, addDoc, updateDoc, query, where, writeBatch,
  ref, uploadBytesResumable, getDownloadURL, getDoc, arrayUnion
} from './firebase-config.js';
import { supabaseClient } from './supabase-config.js';

// DOM Elements
const authLoading = document.getElementById('auth-loading');
const adminContent = document.getElementById('admin-content');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');

// Stats
const statTotalUsers = document.getElementById('stat-total-users');
const statTotalCourses = document.getElementById('stat-total-courses');
const statTotalLectures = document.getElementById('stat-total-lectures');
const statPendingQa = document.getElementById('stat-pending-qa');

let currentUser = null;
const ADMIN_EMAIL = 'duongngoclam28022008@gmail.com';

function hideAdminLoader() {
  if (authLoading) {
    authLoading.style.display = 'none';
    authLoading.classList.add('hidden');
  }
}

// Force-hide loader after 5s if Firebase is slow
const _adminLoaderTimeout = setTimeout(hideAdminLoader, 5000);

// Set persistence FIRST, then register auth listener
(async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch(e) {
    console.warn('setPersistence error:', e);
  }

  onAuthStateChanged(auth, async (user) => {
    clearTimeout(_adminLoaderTimeout);
    hideAdminLoader();

    if (user) {
      if (user.email.toLowerCase() !== ADMIN_EMAIL) {
        alert("Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p trang quáº£n trá»‹!");
        await signOut(auth);
        return;
      }
      currentUser = user;
      btnLogin.classList.add('hidden');
      btnLogout.classList.remove('hidden');
      userInfo.textContent = user.email;
      userInfo.classList.remove('hidden');
      adminContent.classList.remove('hidden');
      const btnManualActivate = document.getElementById('btn-manual-activate');
      if (btnManualActivate) btnManualActivate.classList.remove('hidden');
      loadData();
    } else {
      currentUser = null;
      btnLogin.classList.remove('hidden');
      btnLogout.classList.add('hidden');
      userInfo.classList.add('hidden');
      adminContent.classList.add('hidden');
      const btnManualActivate = document.getElementById('btn-manual-activate');
      if (btnManualActivate) btnManualActivate.classList.add('hidden');
    }
  }); // end onAuthStateChanged

})(); // end async IIFE

btnLogin.addEventListener('click', async () => { 
  try {
    await signInWithPopup(auth, googleProvider); 
  } catch (error) {
    console.error("Lá»—i Ä‘Äƒng nháº­p:", error);
    showToast("ÄÄƒng nháº­p tháº¥t báº¡i!", true);
  }
});
btnLogout.addEventListener('click', () => { signOut(auth); });

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  
  const existingIcon = toast.querySelector('svg') || toast.querySelector('i');
  if (existingIcon) existingIcon.remove();
  
  const newIcon = document.createElement('i');
  newIcon.setAttribute('data-lucide', isError ? 'alert-circle' : 'check-circle');
  newIcon.className = isError ? 'text-red-500 w-5 h-5' : 'text-green-500 w-5 h-5';
  toast.insertBefore(newIcon, msgEl);
  
  lucide.createIcons();
  
  msgEl.textContent = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

// Tabs Logic
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    const targetEl = e.target.closest('.admin-tab');
    document.querySelectorAll('.admin-tab').forEach(t => {
      t.classList.remove('active', 'text-primary', 'border-b-2', 'border-primary');
      t.classList.add('text-muted');
    });
    targetEl.classList.remove('text-muted');
    targetEl.classList.add('active', 'text-primary', 'border-b-2', 'border-primary');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(targetEl.dataset.target).classList.remove('hidden');
  });
});

// ----------------------------------------------------
// LOAD ALL DATA
// ----------------------------------------------------
async function loadData() {
  await Promise.allSettled([
    loadWhitelist().catch(e => console.error("Lá»—i táº£i Whitelist:", e)),
    loadCourses().catch(e => console.error("Lá»—i táº£i Courses:", e)),
    loadNews().catch(e => console.error("Lá»—i táº£i News:", e)),
    loadDocs().catch(e => console.error("Lá»—i táº£i Docs:", e)),
    loadDiscovery().catch(e => console.error("Lá»—i táº£i Discovery:", e)),
    loadQA().catch(e => console.error("Lá»—i táº£i QA:", e)),
    loadExams().catch(e => console.error("Lá»—i táº£i Exams:", e))
  ]);
}

// ==========================================
// 2. Whitelist
// ==========================================
async function loadWhitelist() {
  const container = document.getElementById('whitelist-container');
  container.innerHTML = '<div class="loader mx-auto mt-4"></div>';
  const snap = await getDocs(collection(db, "allowed_users"));
  statTotalUsers.textContent = snap.size;
  container.innerHTML = '';
  if (snap.empty) { container.innerHTML = '<p class="text-muted">ChÆ°a cÃ³ dá»¯ liá»‡u.</p>'; return; }
  
  snap.forEach(d => {
    const data = d.data();
    const isExp = data.expiresAt && new Date(data.expiresAt) < new Date();
    const expText = data.expiresAt ? `Háº¡n: ${new Date(data.expiresAt).toLocaleDateString('vi-VN')}` : 'VÄ©nh viá»…n';
    
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center py-2 px-3 bg-gray-50/50 dark:bg-slate-800/50 rounded-xl mb-2 border border-theme';
    div.innerHTML = `
      <div><p class="text-sm font-semibold text-main">${d.id}</p><span class="text-[10px] ${isExp ? 'text-red-500' : 'text-green-500'} font-bold">${expText}</span></div>
      <button class="text-red-500 p-2 hover:bg-red-50 rounded" onclick="deleteDocHandler('allowed_users', '${d.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    `;
    container.appendChild(div);
  });
  lucide.createIcons();
}

document.getElementById('form-whitelist').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rawEmails = document.getElementById('input-emails').value;
  const expiry = document.getElementById('input-expiry').value;
  const emails = rawEmails.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
  if (!emails) { showToast("KhÃ´ng tÃ¬m tháº¥y email!", true); return; }
  
  const payload = { addedAt: new Date().toISOString() };
  if (expiry) payload.expiresAt = new Date(`${expiry}T23:59:59`).toISOString();
  
  await Promise.all(emails.map(em => setDoc(doc(db, "allowed_users", em.toLowerCase()), payload)));
  document.getElementById('input-emails').value = '';
  showToast(`ÄÃ£ cáº¥p quyá»n cho ${emails.length} tÃ i khoáº£n`);
  loadWhitelist();
});

// ==========================================
// 3. Courses (Same logic as before, abbreviated)
// ==========================================
let currentCourses = [];
async function loadCourses() {
  const container = document.getElementById('courses-container');
  const snap = await getDocs(collection(db, "courses"));
  currentCourses = [];
  let totalLec = 0;
  container.innerHTML = '';
  
  snap.forEach(d => {
    const data = d.data(); data.id = d.id;
    currentCourses.push(data);
    let lecCount = 0;
    if(data.topics) data.topics.forEach(t => { if(t.lectures) { lecCount += t.lectures.length; totalLec += t.lectures.length; }});
    const thumb = data.thumbnailUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop';
    
    const div = document.createElement('div');
    div.className = 'glass-card bg-card p-4 rounded-2xl border border-theme flex flex-col gap-3';
    div.innerHTML = `
      <div class="h-32 rounded-xl overflow-hidden relative"><img src="${thumb}" class="w-full h-full object-cover"></div>
      <div><h3 class="font-bold text-main line-clamp-1">${data.title}</h3><p class="text-xs text-muted">${lecCount} bÃ i giáº£ng</p></div>
      <div class="flex gap-2 mt-auto pt-2 border-t border-theme">
        <button class="btn-secondary !py-1 !px-2 flex-1 text-xs font-bold" onclick="editCourse('${data.id}')">Sá»­a</button>
        <button class="btn-secondary !py-1 !px-2 flex-1 text-xs font-bold text-red-500" onclick="deleteDocHandler('courses', '${data.id}')">XÃ³a</button>
      </div>
    `;
    container.appendChild(div);
  });
  statTotalCourses.textContent = snap.size;
  statTotalLectures.textContent = totalLec;
}

window.deleteDocHandler = async (col, id) => {
  if(!confirm("Cháº¯c cháº¯n xÃ³a?")) return;
  await deleteDoc(doc(db, col, id));
  showToast("ÄÃ£ xÃ³a");
  loadData();
};

// ... Include Course Modal Logic here (Skipped for brevity but it is the same as previous) ...
// We just need the globals: editCourse, addTopic, etc.
let editingCourse = null;
const modalCourse = document.getElementById('modal-course');

document.getElementById('upload-thumbnail-input').addEventListener('change', async(e) => {
  const file = e.target.files[0]; if(!file) return;
  const progressContainer = document.getElementById('thumbnail-progress');
  const progressBar = progressContainer.querySelector('div');
  progressContainer.classList.remove('hidden');
  const uploadTask = uploadBytesResumable(ref(storage, `course_thumbnails/${Date.now()}_${file.name}`), file);
  uploadTask.on('state_changed', 
    (snap) => { progressBar.style.width = (snap.bytesTransferred / snap.totalBytes) * 100 + '%'; },
    (error) => { showToast("Lá»—i táº£i áº£nh", true); progressContainer.classList.add('hidden'); },
    async () => {
      document.getElementById('course-thumbnail').value = await getDownloadURL(uploadTask.snapshot.ref);
      showToast("Táº£i áº£nh xong");
      progressContainer.classList.add('hidden');
      if (window.editingCourse) window.editingCourse.thumbnailUrl = document.getElementById('course-thumbnail').value;
    }
  );
});

window.editCourse = (id) => {
  const course = currentCourses.find(c => c.id === id);
  if (!course) return;
  editingCourse = JSON.parse(JSON.stringify(course));
  if (!editingCourse.topics) editingCourse.topics = [];
  window.editingCourse = editingCourse;
  document.getElementById('modal-course-title').textContent = "Chá»‰nh Sá»­a KhÃ³a Há»c";
  document.getElementById('course-name').value = editingCourse.title || "";
  document.getElementById('course-thumbnail').value = editingCourse.thumbnailUrl || "";
  renderTopicsEditor();
  modalCourse.classList.remove('hidden'); setTimeout(() => modalCourse.classList.remove('opacity-0'), 10);
};

document.getElementById('btn-add-course').addEventListener('click', () => {
  editingCourse = { title: "", thumbnailUrl: "", topics: [] };
  window.editingCourse = editingCourse;
  document.getElementById('modal-course-title').textContent = "ThÃªm KhÃ³a Há»c Má»›i";
  document.getElementById('course-name').value = "";
  document.getElementById('course-thumbnail').value = "";
  renderTopicsEditor();
  modalCourse.classList.remove('hidden'); setTimeout(() => modalCourse.classList.remove('opacity-0'), 10);
});
document.getElementById('btn-close-modal').addEventListener('click', () => { modalCourse.classList.add('opacity-0'); setTimeout(() => modalCourse.classList.add('hidden'), 300); });
document.getElementById('btn-cancel-course').addEventListener('click', () => { modalCourse.classList.add('opacity-0'); setTimeout(() => modalCourse.classList.add('hidden'), 300); });

function renderTopicsEditor() {
  const container = document.getElementById('topics-editor-container');
  container.innerHTML = '';
  window.editingCourse.topics.forEach((topic, tIndex) => {
    const tDiv = document.createElement('div');
    tDiv.className = 'p-5 bg-card rounded-2xl border border-theme shadow-md glass-card mb-4 transition-all hover:border-primary/50';
    tDiv.innerHTML = `
      <div class="flex flex-col md:flex-row gap-3 mb-4 items-center">
        <div class="flex-1 flex items-center gap-3 w-full">
          <div class="p-2 bg-primary/10 text-primary rounded-lg hidden md:block"><i data-lucide="folder" class="w-5 h-5"></i></div>
          <input type="text" class="input-glass !py-2 flex-1 font-bold text-main" value="${(topic.title||'').replace(/"/g, '&quot;')}" placeholder="Nháº­p tÃªn chá»§ Ä‘á»..." data-action="update-topic-title" data-tindex="${tIndex}">
        </div>
        <div class="flex gap-2 w-full md:w-auto">
          <button class="btn-primary !py-2 !px-4 text-xs flex-1 md:flex-none flex items-center justify-center gap-2" data-action="add-lecture" data-tindex="${tIndex}">
            <i data-lucide="plus-circle" class="w-4 h-4 pointer-events-none"></i> ThÃªm bÃ i
          </button>
          <button class="btn-secondary text-red-500 !py-2 !px-3 hover:bg-red-50 dark:hover:bg-red-900/20" data-action="delete-topic" data-tindex="${tIndex}" title="XÃ³a chá»§ Ä‘á»">
            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
          </button>
        </div>
      </div>
      <div class="space-y-3 md:pl-12" id="lectures-${tIndex}"></div>
    `;
    container.appendChild(tDiv);
    
    const lContainer = tDiv.querySelector(`#lectures-${tIndex}`);
    if(topic.lectures) topic.lectures.forEach((lec, lIndex) => {
      const lDiv = document.createElement('div');
      lDiv.className = 'bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-theme relative group transition-all hover:shadow-md';
      lDiv.innerHTML = `
        <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-card border border-theme rounded-full flex items-center justify-center text-xs font-bold text-muted shadow-sm z-10 hidden md:flex">${lIndex + 1}</div>
        
        <div class="flex justify-between gap-2 mb-3">
          <div class="flex-1">
            <label class="text-[10px] uppercase font-bold text-muted tracking-wider mb-1 block">TÃªn bÃ i giáº£ng</label>
            <input type="text" class="input-glass !py-1.5 font-semibold" value="${(lec.title||'').replace(/"/g, '&quot;')}" placeholder="VD: BÃ i 1: Giá»›i thiá»‡u..." data-action="update-lec-title" data-tindex="${tIndex}" data-lindex="${lIndex}">
          </div>
          <button class="text-red-400 hover:text-red-600 p-2 transition-colors self-end" data-action="delete-lecture" data-tindex="${tIndex}" data-lindex="${lIndex}" title="XÃ³a bÃ i giáº£ng"><i data-lucide="x" class="w-5 h-5 pointer-events-none"></i></button>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="space-y-3">
            <div>
              <label class="text-[10px] uppercase font-bold text-muted tracking-wider block mb-1 flex items-center gap-1"><i data-lucide="youtube" class="w-3 h-3 text-red-500"></i> Video Youtube</label>
              <input type="text" class="input-glass !py-1.5 text-xs" placeholder="https://youtube.com/..." value="${lec.youtubeLink||''}" data-action="update-lec-yt" data-tindex="${tIndex}" data-lindex="${lIndex}">
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-muted tracking-wider block mb-1 flex items-center gap-1"><i data-lucide="file-text" class="w-3 h-3 text-blue-500"></i> File TÃ i liá»‡u (PDF)</label>
              <input type="text" class="input-glass !py-1.5 text-xs" placeholder="https://..." value="${lec.documentLink||''}" data-action="update-lec-doc" data-tindex="${tIndex}" data-lindex="${lIndex}">
            </div>
          </div>
          <div class="space-y-3 flex flex-col">
            <div class="flex-1">
              <label class="text-[10px] uppercase font-bold text-muted tracking-wider block mb-1">MÃ´ táº£ ngáº¯n</label>
              <textarea class="input-glass !py-1.5 text-xs h-[50px] resize-none" placeholder="TÃ³m táº¯t ná»™i dung bÃ i há»c..." data-action="update-lec-desc" data-tindex="${tIndex}" data-lindex="${lIndex}">${lec.description||''}</textarea>
            </div>
            
            <label class="flex items-center gap-3 p-2 bg-card border border-theme rounded-lg cursor-pointer w-max hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
              <div class="relative">
                <input type="checkbox" class="sr-only peer" ${lec.isFreeTrial?'checked':''} data-action="update-lec-free" data-tindex="${tIndex}" data-lindex="${lIndex}">
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
              </div>
              <span class="text-xs font-bold text-main">Cho phÃ©p há»c thá»­ (Free)</span>
            </label>
          </div>
        </div>
      `;
      lContainer.appendChild(lDiv);
    });
  });
  lucide.createIcons();
}

// Event Delegation for Topics Editor
document.getElementById('topics-editor-container').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const tIndex = parseInt(btn.dataset.tindex);
  const lIndex = parseInt(btn.dataset.lindex);

  if (action === 'add-lecture') {
    if(!window.editingCourse.topics[tIndex].lectures) window.editingCourse.topics[tIndex].lectures = [];
    window.editingCourse.topics[tIndex].lectures.push({ id: Math.random().toString(36).substr(2,9), title: "", youtubeLink: "", documentLink: "", description: "", isFreeTrial: false });
    renderTopicsEditor();
  } else if (action === 'delete-topic') {
    window.editingCourse.topics.splice(tIndex, 1);
    renderTopicsEditor();
  } else if (action === 'delete-lecture') {
    window.editingCourse.topics[tIndex].lectures.splice(lIndex, 1);
    renderTopicsEditor();
  }
});

document.getElementById('topics-editor-container').addEventListener('input', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const tIndex = parseInt(e.target.dataset.tindex);
  const lIndex = parseInt(e.target.dataset.lindex);
  const val = e.target.value;
  
  if (action === 'update-topic-title') {
    window.editingCourse.topics[tIndex].title = val;
  } else if (action === 'update-lec-title') {
    window.editingCourse.topics[tIndex].lectures[lIndex].title = val;
  } else if (action === 'update-lec-yt') {
    window.editingCourse.topics[tIndex].lectures[lIndex].youtubeLink = val;
  } else if (action === 'update-lec-doc') {
    window.editingCourse.topics[tIndex].lectures[lIndex].documentLink = val;
  } else if (action === 'update-lec-desc') {
    window.editingCourse.topics[tIndex].lectures[lIndex].description = val;
  }
});

document.getElementById('topics-editor-container').addEventListener('change', (e) => {
  const action = e.target.dataset.action;
  if (action === 'update-lec-free') {
    const tIndex = parseInt(e.target.dataset.tindex);
    const lIndex = parseInt(e.target.dataset.lindex);
    window.editingCourse.topics[tIndex].lectures[lIndex].isFreeTrial = e.target.checked;
  }
});

document.getElementById('btn-add-topic').addEventListener('click', () => {
  window.editingCourse.topics.push({ id: Math.random().toString(36).substr(2,9), title: "", lectures: [] });
  renderTopicsEditor();
});

document.getElementById('btn-save-course').addEventListener('click', async (e) => {
  try {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Äang lÆ°u...`;
    lucide.createIcons();
    
    window.editingCourse.title = document.getElementById('course-name').value || "KhÃ³a há»c chÆ°a Ä‘áº·t tÃªn";
    window.editingCourse.thumbnailUrl = document.getElementById('course-thumbnail').value;
    const payload = { 
      title: window.editingCourse.title, 
      thumbnailUrl: window.editingCourse.thumbnailUrl, 
      topics: window.editingCourse.topics, 
      updatedAt: new Date().toISOString() 
    };
    
    if(window.editingCourse.id) {
      await updateDoc(doc(db, "courses", window.editingCourse.id), payload);
    } else { 
      payload.createdAt = new Date().toISOString(); 
      await addDoc(collection(db, "courses"), payload); 
    }
    
    showToast("ÄÃ£ lÆ°u khÃ³a há»c thÃ nh cÃ´ng!");
    document.getElementById('btn-close-modal').click();
    loadCourses();
  } catch (error) {
    console.error("Lá»—i khi lÆ°u khÃ³a há»c:", error);
    showToast("CÃ³ lá»—i xáº£y ra khi lÆ°u! Xem console.", true);
  } finally {
    const btn = document.getElementById('btn-save-course');
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> LÆ°u KhÃ³a Há»c`;
    lucide.createIcons();
  }
});

// ==========================================
// 4. News
// ==========================================
async function loadNews() {
  const container = document.getElementById('news-container');
  const snap = await getDocs(collection(db, "news"));
  container.innerHTML = '';
  snap.forEach(d => {
    const data = d.data();
    const div = document.createElement('div');
    div.className = 'glass-card bg-card p-4 rounded-xl border border-theme flex gap-4';
    div.innerHTML = `
      ${data.imageUrl ? `<img src="${data.imageUrl}" class="w-20 h-20 object-cover rounded-lg">` : '<div class="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center"><i data-lucide="image" class="text-gray-300"></i></div>'}
      <div class="flex-1">
        <h4 class="font-bold text-main text-sm">${data.title}</h4>
        <p class="text-xs text-muted mb-2">${new Date(data.createdAt).toLocaleDateString()}</p>
        <button class="text-red-500 text-xs font-bold" onclick="deleteDocHandler('news', '${d.id}')">XÃ³a</button>
      </div>
    `;
    container.appendChild(div);
  });
  lucide.createIcons();
}
document.getElementById('form-news').addEventListener('submit', async(e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById('news-title').value,
    imageUrl: document.getElementById('news-image').value,
    content: document.getElementById('news-content').value,
    createdAt: new Date().toISOString()
  };
  await addDoc(collection(db, "news"), payload);
  showToast("ÄÃ£ Ä‘Äƒng tin");
  e.target.reset();
  loadNews();
});

// ==========================================
// 5. Docs
// ==========================================
async function loadDocs() {
  const container = document.getElementById('docs-container');
  const snap = await getDocs(collection(db, "documents_global"));
  container.innerHTML = '';
  snap.forEach(d => {
    const data = d.data();
    const div = document.createElement('div');
    div.className = 'glass-card bg-card p-3 rounded-xl border border-theme flex justify-between items-center';
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="p-2 bg-blue-100 text-blue-600 rounded-lg"><i data-lucide="file-text" class="w-4 h-4"></i></div>
        <div>
          <h4 class="font-bold text-main text-sm">${data.title}</h4>
          <a href="${data.url}" target="_blank" class="text-xs text-blue-500 hover:underline">Xem file</a>
        </div>
      </div>
      <button class="text-red-500 p-2" onclick="deleteDocHandler('documents_global', '${d.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
    `;
    container.appendChild(div);
  });
  lucide.createIcons();
}
document.getElementById('upload-doc-input').addEventListener('change', async(e) => {
  const file = e.target.files[0]; if(!file) return;
  const progressContainer = document.getElementById('upload-doc-progress');
  const progressBar = progressContainer.querySelector('div');
  progressContainer.classList.remove('hidden');
  const uploadTask = uploadBytesResumable(ref(storage, `global_docs/${Date.now()}_${file.name}`), file);
  uploadTask.on('state_changed', 
    (snap) => { progressBar.style.width = (snap.bytesTransferred / snap.totalBytes) * 100 + '%'; },
    (error) => { showToast("Lá»—i táº£i file", true); progressContainer.classList.add('hidden'); },
    async () => {
      document.getElementById('doc-url').value = await getDownloadURL(uploadTask.snapshot.ref);
      showToast("Táº£i xong");
      progressContainer.classList.add('hidden');
    }
  );
});
document.getElementById('form-doc').addEventListener('submit', async(e) => {
  e.preventDefault();
  await addDoc(collection(db, "documents_global"), {
    title: document.getElementById('doc-title').value,
    url: document.getElementById('doc-url').value,
    category: document.getElementById('doc-category').value,
    createdAt: new Date().toISOString()
  });
  showToast("ÄÃ£ thÃªm tÃ i liá»‡u");
  e.target.reset();
  loadDocs();
});

// ==========================================
// 6. Discovery
// ==========================================
async function loadDiscovery() {
  const container = document.getElementById('discovery-container');
  const snap = await getDocs(collection(db, "discovery"));
  container.innerHTML = '';
  snap.forEach(d => {
    const data = d.data();
    const div = document.createElement('div');
    div.className = 'glass-card bg-card p-4 rounded-xl border border-theme';
    div.innerHTML = `
      ${data.imageUrl ? `<img src="${data.imageUrl}" class="w-full h-32 object-cover rounded-lg mb-3">` : ''}
      <h4 class="font-bold text-main text-sm mb-1">${data.title}</h4>
      <p class="text-xs text-muted mb-2 line-clamp-2">${data.description}</p>
      <div class="flex justify-between items-center">
        <a href="${data.url}" target="_blank" class="text-xs text-blue-500 font-bold">Má»Ÿ Link</a>
        <button class="text-red-500 p-1" onclick="deleteDocHandler('discovery', '${d.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    `;
    container.appendChild(div);
  });
  lucide.createIcons();
}
document.getElementById('form-discovery').addEventListener('submit', async(e) => {
  e.preventDefault();
  await addDoc(collection(db, "discovery"), {
    title: document.getElementById('discovery-title').value,
    url: document.getElementById('discovery-url').value,
    imageUrl: document.getElementById('discovery-image').value,
    description: document.getElementById('discovery-desc').value,
    createdAt: new Date().toISOString()
  });
  showToast("ÄÃ£ thÃªm bÃ i khÃ¡m phÃ¡");
  e.target.reset();
  loadDiscovery();
});

// ==========================================
// 7. Q&A Approval  â€” see batch version below
// ==========================================

window.approveQA = async (id) => {
  await updateDoc(doc(db, "qa", id), { isApproved: true });
  showToast("ÄÃ£ duyá»‡t cÃ¢u há»i");
  loadQA();
}

window.toggleReplyBox = (id) => {
  document.getElementById(`reply-box-${id}`).classList.toggle('hidden');
}

window.replyQA = async (id) => {
  const text = document.getElementById(`reply-text-${id}`).value.trim();
  if(!text) return;
  const docRef = doc(db, "qa", id);
  const snap = await getDoc(docRef);
  const data = snap.data();
  const answers = data.answers || [];
  answers.push({
    userEmail: currentUser.email,
    answer: text,
    createdAt: new Date().toISOString()
  });
  await updateDoc(docRef, { answers, isApproved: true }); // Auto approve if admin replies
  showToast("ÄÃ£ tráº£ lá»i");
  loadQA();
}

// ============================================================
// BATCH Q&A
// ============================================================

function updateBatchQAButtons() {
  const checked = document.querySelectorAll('.qa-checkbox:checked');
  const btnApprove = document.getElementById('btn-batch-approve');
  const btnDelete = document.getElementById('btn-batch-delete');
  const hasSelection = checked.length > 0;
  
  if (btnApprove) {
    btnApprove.disabled = !hasSelection;
    btnApprove.classList.toggle('opacity-50', !hasSelection);
    btnApprove.classList.toggle('cursor-not-allowed', !hasSelection);
  }
  if (btnDelete) {
    btnDelete.disabled = !hasSelection;
    btnDelete.classList.toggle('opacity-50', !hasSelection);
    btnDelete.classList.toggle('cursor-not-allowed', !hasSelection);
  }
}

// Override loadQA to add checkboxes
const _origAdminLoadQA = loadQA;
async function loadQA() {
  const container = document.getElementById('qa-container');
  const snap = await getDocs(collection(db, "qa"));
  container.innerHTML = '';
  let pendingCount = 0;
  
  snap.forEach(d => {
    const data = d.data();
    if(!data.isApproved) pendingCount++;
    const div = document.createElement('div');
    div.className = `glass-card bg-card p-5 rounded-2xl border ${data.isApproved ? 'border-theme' : 'border-orange-400 bg-orange-50/50 dark:bg-orange-900/10'} relative`;
    
    div.innerHTML = `
      <div class="flex justify-between items-start mb-3">
        <div class="flex items-center gap-3">
          <input type="checkbox" class="qa-checkbox w-4 h-4 accent-orange-500 cursor-pointer shrink-0" data-id="${d.id}" onchange="updateBatchQAButtons()">
          <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">${(data.userEmail ? data.userEmail[0] : '?').toUpperCase()}</div>
          <div>
            <p class="text-sm font-bold text-main">${data.userEmail || 'KhÃ¡ch'}</p>
            <p class="text-[10px] text-muted">${new Date(data.createdAt).toLocaleString('vi-VN')}</p>
          </div>
        </div>
        ${!data.isApproved ? `<span class="px-2 py-1 bg-orange-500 text-white text-[10px] rounded uppercase font-bold">Chá» duyá»‡t</span>` : '<span class="px-2 py-1 bg-green-500 text-white text-[10px] rounded uppercase font-bold">ÄÃ£ duyá»‡t</span>'}
      </div>
      <p class="text-sm text-main font-medium mb-4 p-3 bg-white dark:bg-slate-800 rounded-xl border border-theme shadow-inner">${data.question}</p>
      
      <div class="flex gap-2 flex-wrap">
        ${!data.isApproved ? `<button class="btn-primary !py-1.5 !px-3 text-xs" onclick="window.approveQA('${d.id}')">Duyá»‡t cho phÃ©p hiá»‡n</button>` : ''}
        <button class="btn-secondary !py-1.5 !px-3 text-xs" onclick="window.toggleReplyBox('${d.id}')">Tráº£ lá»i</button>
        <button class="btn-secondary !py-1.5 !px-3 text-xs text-red-500" onclick="window.deleteDocHandler('qa', '${d.id}')">XÃ³a</button>
      </div>

      <div id="reply-box-${d.id}" class="hidden mt-3 pt-3 border-t border-theme">
        <textarea id="reply-text-${d.id}" class="input-glass !py-2 text-sm w-full mb-2" rows="2" placeholder="Nháº­p cÃ¢u tráº£ lá»i..."></textarea>
        <button class="btn-primary !py-1 text-xs" onclick="window.replyQA('${d.id}')">Gá»­i tráº£ lá»i</button>
      </div>

      ${data.answers && data.answers.length > 0 ? `
        <div class="mt-4 space-y-2 pl-4 border-l-2 border-primary">
          ${data.answers.map(ans => `
            <div class="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
              <p class="text-xs font-bold text-primary mb-1">${ans.userEmail} <span class="text-[10px] text-muted font-normal ml-2">${new Date(ans.createdAt).toLocaleString()}</span></p>
              <p class="text-sm text-main">${ans.answer}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    container.appendChild(div);
  });
  statPendingQa.textContent = pendingCount;
  lucide.createIcons();
}

// Select All handler
const qaSelectAll = document.getElementById('qa-select-all');
if (qaSelectAll) qaSelectAll.addEventListener('change', () => {
  document.querySelectorAll('.qa-checkbox').forEach(cb => {
    cb.checked = qaSelectAll.checked;
  });
  updateBatchQAButtons();
});

// Batch Approve
const btnBatchApprove = document.getElementById('btn-batch-approve');
if (btnBatchApprove) btnBatchApprove.addEventListener('click', async () => {
  const checked = [...document.querySelectorAll('.qa-checkbox:checked')];
  if (!checked.length) return;
  btnBatchApprove.disabled = true;
  btnBatchApprove.innerHTML = '<div class="loader !w-4 !h-4 !border-2"></div> Äang duyá»‡t...';
  await Promise.all(checked.map(cb => updateDoc(doc(db, 'qa', cb.dataset.id), { isApproved: true })));
  showToast(`ÄÃ£ duyá»‡t ${checked.length} cÃ¢u há»i`);
  if (qaSelectAll) qaSelectAll.checked = false;
  await loadQA();
});

// Batch Delete
const btnBatchDelete = document.getElementById('btn-batch-delete');
if (btnBatchDelete) btnBatchDelete.addEventListener('click', async () => {
  const checked = [...document.querySelectorAll('.qa-checkbox:checked')];
  if (!checked.length) return;
  if (!confirm(`XÃ³a ${checked.length} cÃ¢u há»i Ä‘Ã£ chá»n?`)) return;
  await Promise.all(checked.map(cb => deleteDoc(doc(db, 'qa', cb.dataset.id))));
  showToast(`ÄÃ£ xÃ³a ${checked.length} cÃ¢u há»i`);
  if (qaSelectAll) qaSelectAll.checked = false;
  await loadQA();
});

// ============================================================
// ACTIVITY LOG
// ============================================================
async function loadActivityLog() {
  const container = document.getElementById('activity-log-container');
  if (!container) return;
  container.innerHTML = '<div class="loader mx-auto col-span-full"></div>';
  
  try {
    const snap = await getDocs(collection(db, 'activity_log'));
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const recentUsers = [];
    snap.forEach(d => {
      const data = d.data();
      const lastSeen = new Date(data.lastSeen);
      if (lastSeen >= thirtyMinAgo) {
        recentUsers.push({ ...data, lastSeen });
      }
    });
    
    recentUsers.sort((a, b) => b.lastSeen - a.lastSeen);
    
    if (recentUsers.length === 0) {
      container.innerHTML = `
        <div class="col-span-full flex flex-col items-center py-8 text-muted">
          <i data-lucide="users" class="w-10 h-10 mb-3 opacity-30"></i>
          <p class="text-sm font-medium">ChÆ°a cÃ³ há»c viÃªn nÃ o truy cáº­p trong 30 phÃºt qua</p>
        </div>`;
      lucide.createIcons({ root: container });
      return;
    }

    container.innerHTML = recentUsers.map(u => {
      const diffMs = Date.now() - u.lastSeen.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const timeAgo = diffMin < 1 ? 'Vá»«a xong' : `${diffMin} phÃºt trÆ°á»›c`;
      const initial = (u.email || u.displayName || '?')[0].toUpperCase();
      
      return `<div class="flex items-center gap-3 p-3 bg-card rounded-xl border border-theme hover:border-green-300 transition-colors">
        <div class="relative">
          <div class="w-10 h-10 bg-gradient-to-tr from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">${initial}</div>
          <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-main truncate">${u.displayName || u.email?.split('@')[0] || 'áº¨n danh'}</p>
          <p class="text-xs text-muted truncate">${u.email || ''}</p>
        </div>
        <span class="text-[10px] text-green-500 font-bold whitespace-nowrap">${timeAgo}</span>
      </div>`;
    }).join('');
    lucide.createIcons({ root: container });
  } catch(e) {
    console.error('Activity log error:', e);
    container.innerHTML = '<p class="text-muted text-sm col-span-full">Lá»—i táº£i dá»¯ liá»‡u.</p>';
  }
}

// Auto-load activity log and refresh button
document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btn-refresh-activity');
  if (btnRefresh) btnRefresh.addEventListener('click', () => {
    loadActivityLog();
    btnRefresh.classList.add('animate-spin');
    setTimeout(() => btnRefresh.classList.remove('animate-spin'), 1000);
  });
});

// Patch loadData to also load activity log
const _origAdminLoadData = loadData;
window.loadData = async function() {
  await _origAdminLoadData();
  await loadActivityLog();
  populateKeyCourseCheckboxes();
};


// ============================================================
// ACTIVATION KEYS MANAGEMENT
// ============================================================

let allKeysData = []; // Cache for filtering
let currentKeyFilter = 'all';

/** Populate course checkboxes in the key generator */
function populateKeyCourseCheckboxes() {
  const container = document.getElementById('key-course-checkboxes');
  if (!container) return;
  if (currentCourses.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm">ChÆ°a cÃ³ khÃ³a há»c nÃ o. HÃ£y táº¡o khÃ³a há»c trÆ°á»›c.</p>';
    return;
  }
  container.innerHTML = currentCourses.map(c => `
    <label class="flex items-center gap-3 p-2.5 rounded-xl border border-theme hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-colors">
      <input type="checkbox" class="key-course-cb w-4 h-4 accent-orange-500 cursor-pointer" value="${c.id}" data-title="${(c.title||'').replace(/"/g,'&quot;')}">
      <span class="text-sm font-semibold text-main line-clamp-1">${c.title}</span>
    </label>
  `).join('');
}

/** Generate one activation key and save to Firestore */
async function generateActivationKey(courseIds, prefix = 'KHV', note = '') {
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
  const key = `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${randomPart}`;
  await setDoc(doc(db, 'activation_keys', key), {
    courseIds,
    isUsed: false,
    usedBy: null,
    createdAt: new Date().toISOString(),
    usedAt: null,
    prefix: prefix.toUpperCase(),
    note: note || ''
  });
  return key;
}

/** Load and display all activation keys */
async function loadActivationKeys() {
  const container = document.getElementById('keys-container');
  if (!container) return;
  container.innerHTML = '<div class="loader mx-auto mt-8"></div>';
  try {
    const snap = await getDocs(collection(db, 'activation_keys'));
    allKeysData = [];
    snap.forEach(d => {
      allKeysData.push({ id: d.id, ...d.data() });
    });
    // Sort: unused first, then by date
    allKeysData.sort((a, b) => {
      if (a.isUsed !== b.isUsed) return a.isUsed ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    renderKeysList();
  } catch(e) {
    console.error(e);
    container.innerHTML = '<p class="text-muted text-sm">Lá»—i táº£i danh sÃ¡ch mÃ£.</p>';
  }
}

function renderKeysList() {
  const container = document.getElementById('keys-container');
  if (!container) return;
  const filtered = allKeysData.filter(k => {
    if (currentKeyFilter === 'unused') return !k.isUsed;
    if (currentKeyFilter === 'used') return k.isUsed;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center py-10 text-muted">
        <i data-lucide="key" class="w-10 h-10 mb-3 opacity-30"></i>
        <p class="text-sm font-medium">ChÆ°a cÃ³ mÃ£ nÃ o.</p>
      </div>`;
    lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = filtered.map(k => {
    const courseNames = k.courseIds?.map(cId => {
      const c = currentCourses.find(x => x.id === cId);
      return c ? `<span class="px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[10px] font-bold">${c.title}</span>` : '';
    }).join('') || '';

    const statusClass = k.isUsed ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10';
    const statusText = k.isUsed ? 'ÄÃ£ dÃ¹ng' : 'ChÆ°a dÃ¹ng';
    const createdDate = k.createdAt ? new Date(k.createdAt).toLocaleDateString('vi-VN') : '?';

    return `
      <div class="p-3 bg-card border border-theme rounded-xl hover:border-primary/30 transition-colors" data-key-id="${k.id}">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <code class="font-mono text-sm font-bold text-main tracking-wider">${k.id}</code>
              <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusClass}">${statusText}</span>
            </div>
            <div class="flex flex-wrap gap-1 mb-1">${courseNames}</div>
            ${k.note ? `<p class="text-[10px] text-muted italic">${k.note}</p>` : ''}
            ${k.isUsed ? `<p class="text-[10px] text-muted">ðŸ‘¤ ${k.usedBy || '?'} â€¢ ${k.usedAt ? new Date(k.usedAt).toLocaleDateString('vi-VN') : ''}</p>` : `<p class="text-[10px] text-muted">ðŸ—“ Táº¡o: ${createdDate}</p>`}
          </div>
          <div class="flex gap-1 shrink-0">
            <button onclick="window.copyKey('${k.id}')" class="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors" title="Copy mÃ£">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="window.deleteKeyHandler('${k.id}')" class="p-1.5 text-muted hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors" title="XÃ³a mÃ£">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons({ root: container });
}

window.copyKey = async (key) => {
  try {
    await navigator.clipboard.writeText(key);
    showToast('ÄÃ£ copy mÃ£!');
  } catch(e) {
    showToast('Lá»—i copy!', true);
  }
};

window.copyAllKeys = async () => {
  try {
    const keys = window._lastGeneratedKeys || [];
    if (keys.length === 0) return;
    await navigator.clipboard.writeText(keys.join('\n'));
    showToast(`ÄÃ£ copy ${keys.length} mÃ£!`);
  } catch(e) {
    showToast('Lá»—i copy!', true);
  }
};

window.deleteKeyHandler = async (keyId) => {
  if (!confirm(`XÃ³a mÃ£ "${keyId}"?`)) return;
  await deleteDoc(doc(db, 'activation_keys', keyId));
  showToast('ÄÃ£ xÃ³a mÃ£');
  loadActivationKeys();
};

// Key prefix preview
const keyPrefixInput = document.getElementById('key-prefix');
const keyPreview = document.getElementById('key-preview');
if (keyPrefixInput && keyPreview) {
  keyPrefixInput.addEventListener('input', () => {
    const p = (keyPrefixInput.value || 'KHV').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'KHV';
    keyPreview.textContent = `${p}-XXXXXXXX`;
  });
}

// Generate button handler
const btnGenerateKey = document.getElementById('btn-generate-key');
if (btnGenerateKey) {
  btnGenerateKey.addEventListener('click', async () => {
    const prefix = (document.getElementById('key-prefix')?.value || 'KHV').trim();
    const quantity = parseInt(document.getElementById('key-quantity')?.value || '1');
    const note = document.getElementById('key-note')?.value.trim() || '';
    const checkedBoxes = [...document.querySelectorAll('.key-course-cb:checked')];
    const courseIds = checkedBoxes.map(cb => cb.value);

    if (courseIds.length === 0) { showToast('Chá»n Ã­t nháº¥t 1 khÃ³a há»c!', true); return; }
    if (quantity < 1 || quantity > 100) { showToast('Sá»‘ lÆ°á»£ng pháº£i tá»« 1 Ä‘áº¿n 100!', true); return; }

    btnGenerateKey.disabled = true;
    btnGenerateKey.innerHTML = '<div class="loader !w-4 !h-4 !border-2"></div> Äang táº¡o...';

    try {
      const generatedKeys = [];
      for (let i = 0; i < quantity; i++) {
        const k = await generateActivationKey(courseIds, prefix, note);
        generatedKeys.push(k);
      }

      // Show result box
      window._lastGeneratedKeys = generatedKeys; // Store for copyAllKeys
      const resultBox = document.getElementById('key-result-box');
      const resultList = document.getElementById('key-result-list');
      if (resultBox && resultList) {
        resultBox.classList.remove('hidden');
        resultList.innerHTML = generatedKeys.map(k => `
          <div class="flex items-center gap-2">
            <code class="font-mono text-sm font-bold text-green-600 dark:text-green-400 flex-1">${k}</code>
            <button onclick="window.copyKey('${k}')" class="text-xs text-muted hover:text-primary px-2 py-1 rounded border border-theme">Copy</button>
          </div>
        `).join('');
      }

      showToast(`ÄÃ£ táº¡o ${quantity} mÃ£ thÃ nh cÃ´ng!`);
      loadActivationKeys();
    } catch(e) {
      console.error(e);
      showToast('Lá»—i táº¡o mÃ£!', true);
    } finally {
      btnGenerateKey.disabled = false;
      btnGenerateKey.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> Táº¡o MÃ£ KÃ­ch Hoáº¡t';
      lucide.createIcons({ root: btnGenerateKey });
    }
  });
}

// Filter buttons for keys list
document.querySelectorAll('.key-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.key-filter-btn').forEach(b => {
      b.classList.remove('active', 'bg-primary', 'text-white');
      b.classList.add('border', 'border-theme', 'text-muted');
    });
    btn.classList.add('active', 'bg-primary', 'text-white');
    btn.classList.remove('border', 'border-theme', 'text-muted');
    currentKeyFilter = btn.dataset.filter;
    renderKeysList();
  });
});

// Refresh keys button
const btnRefreshKeys = document.getElementById('btn-refresh-keys');
if (btnRefreshKeys) {
  btnRefreshKeys.addEventListener('click', () => {
    loadActivationKeys();
    btnRefreshKeys.querySelector('i')?.classList.add('animate-spin');
    setTimeout(() => btnRefreshKeys.querySelector('i')?.classList.remove('animate-spin'), 1000);
  });
}

// Hook into loadData to also load keys when admin opens that tab
const _tabBtns = document.querySelectorAll('.admin-tab');
_tabBtns.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.target === 'keys-tab') {
      loadActivationKeys();
      populateKeyCourseCheckboxes();
    }
  });
});


// ============================================================
// MANUAL COURSE ACTIVATION (Admin â†’ Student)
// ============================================================

function populateManualActivateCourses() {
  const container = document.getElementById('manual-activate-courses');
  if (!container) return;
  if (currentCourses.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm">ChÆ°a cÃ³ khÃ³a há»c nÃ o.</p>';
    return;
  }
  container.innerHTML = currentCourses.map(c => `
    <label class="flex items-center gap-3 p-2.5 rounded-xl border border-theme hover:border-orange-400/40 hover:bg-orange-500/5 cursor-pointer transition-colors">
      <input type="checkbox" class="manual-course-cb w-4 h-4 accent-orange-500 cursor-pointer" value="${c.id}">
      <span class="text-sm font-semibold text-main line-clamp-1">${c.title}</span>
    </label>
  `).join('');
}

const btnManualActivate = document.getElementById('btn-manual-activate');
const modalManualActivate = document.getElementById('modal-manual-activate');
const btnCloseManualModal = document.getElementById('btn-close-manual-modal');
const btnConfirmManualActivate = document.getElementById('btn-confirm-manual-activate');

if (btnManualActivate) {
  btnManualActivate.addEventListener('click', () => {
    populateManualActivateCourses();
    document.getElementById('manual-activate-email').value = '';
    modalManualActivate.classList.remove('hidden');
    modalManualActivate.classList.add('flex');
  });
}

if (btnCloseManualModal) {
  btnCloseManualModal.addEventListener('click', () => {
    modalManualActivate.classList.add('hidden');
    modalManualActivate.classList.remove('flex');
  });
}

// Close on backdrop click
if (modalManualActivate) {
  modalManualActivate.addEventListener('click', (e) => {
    if (e.target === modalManualActivate) {
      modalManualActivate.classList.add('hidden');
      modalManualActivate.classList.remove('flex');
    }
  });
}

if (btnConfirmManualActivate) {
  btnConfirmManualActivate.addEventListener('click', async () => {
    const email = document.getElementById('manual-activate-email')?.value.trim().toLowerCase();
    const checked = [...document.querySelectorAll('.manual-course-cb:checked')];
    const courseIds = checked.map(cb => cb.value);

    if (!email) { showToast('Vui lÃ²ng nháº­p email há»c viÃªn!', true); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email khÃ´ng há»£p lá»‡!', true); return; }
    if (courseIds.length === 0) { showToast('Chá»n Ã­t nháº¥t 1 khÃ³a há»c!', true); return; }

    btnConfirmManualActivate.disabled = true;
    btnConfirmManualActivate.innerHTML = '<div class="loader !w-4 !h-4 !border-2"></div> Äang kÃ­ch hoáº¡t...';

    try {
      // Read current progress doc to add unlocked courses using arrayUnion
      const progressRef = doc(db, 'progress', email);
      await setDoc(progressRef, { 
        unlockedCourses: arrayUnion(...courseIds) 
      }, { merge: true });

      const courseNames = courseIds.map(id => currentCourses.find(c => c.id === id)?.title || id).join(', ');
      showToast(`âœ… ÄÃ£ kÃ­ch hoáº¡t ${courseIds.length} khÃ³a cho ${email}`);

      // Send notification to the user
      try {
        await addDoc(collection(db, 'notifications'), {
          email: email,
          title: `Admin Ä‘Ã£ kÃ­ch hoáº¡t ${courseIds.length} khÃ³a há»c`,
          body: `Báº¡n Ä‘Ã£ Ä‘Æ°á»£c thÃªm cÃ¡c khÃ³a há»c: ${courseNames}`,
          createdAt: new Date().toISOString(),
          icon: 'gift',
          color: 'text-orange-500',
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          type: 'activation'
        });
      } catch(e) { console.error('Failed to send notification', e); }

      // Log to activity
      console.log(`[Admin Manual Activate] ${email} â†’ ${courseNames}`);

      modalManualActivate.classList.add('hidden');
      modalManualActivate.classList.remove('flex');
    } catch(e) {
      console.error(e);
      showToast('Lá»—i kÃ­ch hoáº¡t! Xem console.', true);
    } finally {
      btnConfirmManualActivate.disabled = false;
      btnConfirmManualActivate.innerHTML = '<i data-lucide="zap" class="w-4 h-4"></i> KÃ­ch hoáº¡t ngay';
      lucide.createIcons({ root: btnConfirmManualActivate });
    }
  });
}

// ================================================================
// AI KEY POOL MANAGEMENT
// ================================================================

let allPoolKeys = [];       // Cache for filtering
let currentPoolFilter = 'all';

/** Load and render all AI pool keys */
async function loadAIPool() {
  const container = document.getElementById('ai-pool-list');
  if (!container) return;
  container.innerHTML = '<div class="loader mx-auto mt-8"></div>';

  try {
    const snap = await getDocs(collection(db, 'ai_pool'));
    allPoolKeys = [];
    snap.forEach(d => {
      allPoolKeys.push({ id: d.id, ...d.data() });
    });

    updateAIPoolStats();
    renderAIPoolList();
  } catch(e) {
    console.error('loadAIPool error:', e);
    container.innerHTML = '<p class="text-muted text-sm text-center py-8">Lá»—i táº£i dá»¯ liá»‡u.</p>';
  }
}

function updateAIPoolStats() {
  const active = allPoolKeys.filter(k => k.status === 'active').length;
  const expired = allPoolKeys.filter(k => k.status === 'expired').length;
  const total = allPoolKeys.length;

  const elActive = document.getElementById('ai-pool-active-count');
  const elExpired = document.getElementById('ai-pool-expired-count');
  const elTotal = document.getElementById('ai-pool-total-count');

  if (elActive) elActive.textContent = active;
  if (elExpired) elExpired.textContent = expired;
  if (elTotal) elTotal.textContent = total;
}

function renderAIPoolList() {
  const container = document.getElementById('ai-pool-list');
  if (!container) return;

  const filtered = currentPoolFilter === 'all'
    ? allPoolKeys
    : allPoolKeys.filter(k => k.status === currentPoolFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm text-center py-8">KhÃ´ng cÃ³ key nÃ o.</p>';
    return;
  }

  container.innerHTML = '';
  filtered.forEach((key, idx) => {
    const isActive = key.status === 'active';
    const masked = maskKey(key.key);
    const updatedAt = key.updatedAt
      ? new Date(key.updatedAt).toLocaleString('vi-VN')
      : '---';

    const row = document.createElement('div');
    row.className = `flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isActive
        ? 'border-green-500/20 bg-green-500/5 hover:border-green-500/40'
        : 'border-red-500/20 bg-red-500/5 hover:border-red-500/40'
    }`;
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="font-mono text-xs font-bold text-main truncate">${masked}</p>
        <div class="flex items-center gap-3 mt-1">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
            isActive ? 'text-green-500' : 'text-red-500'
          }">
            <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-400'}"></span>
            ${key.status}
          </span>
          <span class="text-[10px] text-muted">Lá»—i: ${key.errorCount || 0}</span>
          <span class="text-[10px] text-muted hidden sm:inline">${updatedAt}</span>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button title="${isActive ? 'VÃ´ hiá»‡u hÃ³a' : 'KÃ­ch hoáº¡t láº¡i'}"
          class="p-1.5 rounded-lg border border-theme text-muted hover:text-main transition-colors text-xs"
          onclick="window.togglePoolKeyStatus('${key.id}', '${key.status}')">
          <i data-lucide="${isActive ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
        </button>
        <button title="XÃ³a key"
          class="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          onclick="window.deletePoolKey('${key.id}')">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  lucide.createIcons({ root: container });
}

/** Mask API key for display: show first 8 + last 4 chars */
function maskKey(key) {
  if (!key || key.length < 12) return key;
  return key.substring(0, 8) + 'â€¢'.repeat(Math.max(0, key.length - 12)) + key.slice(-4);
}

/** Save keys from textarea â€” skip duplicates */
async function saveAIPoolKeys() {
  const textarea = document.getElementById('ai-pool-keys-input');
  const btn = document.getElementById('btn-save-ai-pool');
  if (!textarea || !btn) return;

  const rawText = textarea.value.trim();
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.startsWith('AIza') && l.length > 20);

  if (lines.length === 0) {
    showToast('KhÃ´ng tÃ¬m tháº¥y API Key há»£p lá»‡! (pháº£i báº¯t Ä‘áº§u báº±ng AIza)', true);
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div class="loader !w-4 !h-4 !border-2 !border-white !border-t-transparent inline-block mr-2"></div> Äang lÆ°u...';
  btn.disabled = true;

  // Get existing keys to skip duplicates
  const existingKeys = new Set(allPoolKeys.map(k => k.key));
  const newKeys = lines.filter(k => !existingKeys.has(k));

  if (newKeys.length === 0) {
    showToast(`Táº¥t cáº£ ${lines.length} key Ä‘Ã£ tá»“n táº¡i trong pool.`, true);
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    lucide.createIcons({ root: btn });
    return;
  }

  try {
    const now = new Date().toISOString();
    await Promise.all(newKeys.map(key =>
      addDoc(collection(db, 'ai_pool'), {
        key,
        status: 'active',
        errorCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    ));

    showToast(`âœ… ÄÃ£ thÃªm ${newKeys.length} key má»›i (bá» qua ${lines.length - newKeys.length} trÃ¹ng láº·p).`);
    textarea.value = '';
    await loadAIPool();
  } catch(e) {
    console.error('saveAIPoolKeys error:', e);
    showToast('Lá»—i khi lÆ°u keys!', true);
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    lucide.createIcons({ root: btn });
  }
}

/** Toggle key status between active and expired */
window.togglePoolKeyStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === 'active' ? 'expired' : 'active';
  try {
    await updateDoc(doc(db, 'ai_pool', id), {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
    showToast(newStatus === 'active' ? 'âœ… Key Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t láº¡i!' : 'Key Ä‘Ã£ bá»‹ vÃ´ hiá»‡u hÃ³a.');
    await loadAIPool();
  } catch(e) {
    showToast('Lá»—i cáº­p nháº­t key!', true);
  }
};

/** Delete a pool key */
window.deletePoolKey = async (id) => {
  if (!confirm('XÃ³a key nÃ y khá»i pool?')) return;
  try {
    await deleteDoc(doc(db, 'ai_pool', id));
    showToast('ÄÃ£ xÃ³a key.');
    await loadAIPool();
  } catch(e) {
    showToast('Lá»—i xÃ³a key!', true);
  }
};

/** Restore all expired keys to active */
async function restoreAllExpiredKeys() {
  const expired = allPoolKeys.filter(k => k.status === 'expired');
  if (expired.length === 0) {
    showToast('KhÃ´ng cÃ³ key nÃ o Ä‘ang expired.', true);
    return;
  }
  if (!confirm(`Äáº·t láº¡i ${expired.length} key tá»« "expired" â†’ "active"?`)) return;

  const btn = document.getElementById('btn-restore-ai-keys');
  if (btn) { btn.disabled = true; btn.textContent = 'Äang khÃ´i phá»¥c...'; }

  try {
    const now = new Date().toISOString();
    await Promise.all(expired.map(k =>
      updateDoc(doc(db, 'ai_pool', k.id), { status: 'active', errorCount: 0, updatedAt: now })
    ));
    showToast(`âœ… ÄÃ£ khÃ´i phá»¥c ${expired.length} key vá» "active".`);
    await loadAIPool();
  } catch(e) {
    showToast('Lá»—i khÃ´i phá»¥c!', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="rotate-ccw" class="w-4 h-4"></i> KhÃ´i phá»¥c táº¥t cáº£ Expired';
      lucide.createIcons({ root: btn });
    }
  }
}

// Wire up AI Pool tab buttons
document.addEventListener('DOMContentLoaded', () => {
  const btnSave = document.getElementById('btn-save-ai-pool');
  const btnRefresh = document.getElementById('btn-refresh-ai-pool');
  const btnRestore = document.getElementById('btn-restore-ai-keys');

  if (btnSave) btnSave.addEventListener('click', saveAIPoolKeys);
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.classList.add('animate-spin');
      await loadAIPool();
      setTimeout(() => btnRefresh.classList.remove('animate-spin'), 800);
    });
  }
  if (btnRestore) btnRestore.addEventListener('click', restoreAllExpiredKeys);

  // Filter buttons
  document.querySelectorAll('.ai-pool-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-pool-filter').forEach(b => {
        b.classList.remove('bg-purple-500', 'text-white');
        b.classList.add('border', 'border-theme', 'text-muted');
      });
      btn.classList.add('bg-purple-500', 'text-white');
      btn.classList.remove('border', 'border-theme', 'text-muted');
      currentPoolFilter = btn.dataset.filter;
      renderAIPoolList();
    });
  });

  // Load pool when AI tab is clicked
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.target === 'ai-pool-tab') {
        loadAIPool();
      }
    });
  });
});




// ============================================================
// EXAM MANAGEMENT (Thi Online)
// ============================================================

let examQuestions = [];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createEmptyQuestion(type = 'multiple_choice') {
  const base = {
    id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    type,
    text: ''
  };
  if (type === 'multiple_choice') {
    // Phần 1: TNKQ — 0,25đ/câu
    return { ...base, optA: '', optB: '', optC: '', optD: '', answer: 'A', points: 0.25 };
  }
  if (type === 'true_false') {
    // Phần 2: Đúng/Sai 4 ý — 1đ/câu (1ý=0.1, 2ý=0.25, 3ý=0.5, 4ý=1đ)
    return {
      ...base,
      points: 1,
      statements: [
        { label: 'a', text: '', answer: 'Đúng' },
        { label: 'b', text: '', answer: 'Đúng' },
        { label: 'c', text: '', answer: 'Đúng' },
        { label: 'd', text: '', answer: 'Đúng' }
      ]
    };
  }
  // Phần 3: Trả lời ngắn — 0,25đ/câu
  return { ...base, answer: '', points: 0.25 };
}

function normalizePdfUrl(url = '') {
  const trimmed = url.trim();
  if (!trimmed) return '';
  const driveMatch = trimmed.match(/\/d\/([^/]+)/) || trimmed.match(/[?&]id=([^&]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  return trimmed;
}

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizeQuestionPoints(value) {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.round(points * 100) / 100 : 1;
}

function sanitizeExamQuestions() {
  return examQuestions.map((q, idx) => {
    const base = {
      id: q.id || `q_${idx + 1}`,
      type: q.type || 'multiple_choice',
      text: (q.text || '').trim(),
      points: normalizeQuestionPoints(q.points)
    };
    if (base.type === 'multiple_choice') {
      return {
        ...base,
        optA: (q.optA || '').trim(),
        optB: (q.optB || '').trim(),
        optC: (q.optC || '').trim(),
        optD: (q.optD || '').trim(),
        answer: (q.answer || '').trim()
      };
    }
    if (base.type === 'true_false') {
      const stmts = (q.statements || []).map(s => ({
        label: s.label,
        text: (s.text || '').trim(),
        answer: s.answer === 'Sai' ? 'Sai' : 'Đúng'
      }));
      return { ...base, statements: stmts };
    }
    // short_answer
    return { ...base, answer: (q.answer || '').trim() };
  });
}

function validateExamQuestions(questions) {
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const prefix = `Câu ${i + 1}`;
    // Bỏ qua check question.text, optA/B/C/D, s.text vì admin giờ chỉ tạo phiếu đáp án
    if (question.type === 'multiple_choice') {
      if (!['A', 'B', 'C', 'D'].includes(question.answer))
        return `${prefix} chưa chọn đáp án đúng.`;
    }
    if (question.type === 'true_false') {
      const stmts = question.statements || [];
      if (stmts.length !== 4) return `${prefix} (Đúng/Sai) phải có đủ 4 ý a/b/c/d.`;
    }
    if (question.type === 'short_answer' && !question.answer) {
      return `${prefix} chưa nhập đáp án ngắn.`;
    }
  }
  return '';
}

function getExamSummaryPayload(id, payload) {
  return {
    id,
    title: payload.title,
    subject: payload.subject,
    duration: payload.duration,
    pdfUrl: payload.pdfUrl,
    pdfEmbedUrl: payload.pdfEmbedUrl,
    status: payload.status,
    instructions: payload.instructions,
    passPercentage: payload.passPercentage,
    attemptsLimit: payload.attemptsLimit,
    startAt: payload.startAt,
    endAt: payload.endAt,
    shuffleQuestions: payload.shuffleQuestions,
    shuffleOptions: payload.shuffleOptions,
    showResultAfterSubmit: payload.showResultAfterSubmit,
    allowReviewAfterSubmit: payload.allowReviewAfterSubmit,
    questionCount: payload.questionCount,
    totalPoints: payload.totalPoints,
    createdAt: payload.createdAt || '',
    createdBy: payload.createdBy || '',
    updatedAt: payload.updatedAt
  };
}

function getExamAvailabilityText(exam) {
  const now = Date.now();
  const start = exam.startAt ? new Date(exam.startAt).getTime() : 0;
  const end = exam.endAt ? new Date(exam.endAt).getTime() : 0;
  if (start && start > now) return 'Sắp mở';
  if (end && end < now) return 'Đã đóng';
  return 'Đang mở';
}

function resetExamForm() {
  document.getElementById('exam-editing-id').value = '';
  document.getElementById('exam-title').value = '';
  document.getElementById('exam-subject').value = '';
  document.getElementById('exam-duration').value = '45';
  document.getElementById('exam-pdf-url').value = '';
  document.getElementById('exam-instructions').value = '';
  document.getElementById('exam-pass-score').value = '50';
  document.getElementById('exam-attempt-limit').value = '1';
  document.getElementById('exam-start-at').value = '';
  document.getElementById('exam-end-at').value = '';
  document.getElementById('exam-shuffle-questions').checked = false;
  document.getElementById('exam-shuffle-options').checked = false;
  document.getElementById('exam-show-result').checked = true;
  document.getElementById('exam-allow-review').checked = true;
  document.getElementById('exam-status-draft').checked = true;
  examQuestions = [];
  renderQuestionsEditor();
}

function renderQuestionsEditor() {
  const container = document.getElementById('exam-questions-container');
  const countEl = document.getElementById('exam-q-count');
  if (!container || !countEl) return;
  countEl.textContent = `${examQuestions.length} câu`;

  if (examQuestions.length === 0) {
    container.innerHTML = [
      '<div class="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-2 text-xs text-muted">',
        '<p class="font-black text-indigo-600 text-sm">Thang \u0111i\u1ec3m chu\u1ea9n THPT 2025</p>',
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">',
          '<div class="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-theme">',
            '<p class="font-bold text-blue-600">Ph\u1ea7n 1 \u2014 Tr\u1eafc nghi\u1ec7m</p>',
            '<p class="mt-1">M\u1eb7c \u0111\u1ecbnh <span class="font-black">0,25\u0111</span>/c\u00e2u</p>',
          '</div>',
          '<div class="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-theme">',
            '<p class="font-bold text-amber-600">Ph\u1ea7n 2 \u2014 \u0110\u00fang/Sai (4 \u00fd)</p>',
            '<p class="mt-1">1\u00fd\u2713=0,1\u0111 &middot; 2\u00fd\u2713=0,25\u0111 &middot; 3\u00fd\u2713=0,5\u0111 &middot; 4\u00fd\u2713=full</p>',
          '</div>',
          '<div class="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-theme">',
            '<p class="font-bold text-green-600">Ph\u1ea7n 3 \u2014 Tr\u1ea3 l\u1eddi ng\u1eafn</p>',
            '<p class="mt-1">M\u1eb7c \u0111\u1ecbnh <span class="font-black">0,25\u0111</span>/c\u00e2u</p>',
          '</div>',
        '</div>',
      '</div>',
      '<p class="text-sm text-muted text-center py-4">Nh\u1ea5n "Th\u00eam c\u00e2u" \u0111\u1ec3 b\u1eaft \u0111\u1ea7u t\u1ea1o c\u00e2u h\u1ecfi</p>'
    ].join('');
    return;
  }

  container.innerHTML = examQuestions.map((rawQuestion, idx) => {
    const q = {
      ...createEmptyQuestion(rawQuestion.type),
      ...rawQuestion,
      points: normalizeQuestionPoints(rawQuestion.points)
    };

    const typeBadge = q.type === 'multiple_choice'
      ? '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded uppercase">TNKQ</span>'
      : q.type === 'true_false'
        ? '<span class="px-1.5 py-0.5 bg-amber-100 text-amber-600 text-[10px] font-bold rounded uppercase">Đúng/Sai</span>'
        : '<span class="px-1.5 py-0.5 bg-green-100 text-green-600 text-[10px] font-bold rounded uppercase">Trả lời ngắn</span>';

    let answerHtml = '';
    if (q.type === 'multiple_choice') {
      answerHtml = `
        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs font-bold text-muted uppercase">Chọn đáp án đúng:</span>
          <div class="flex gap-2">
            ${['A', 'B', 'C', 'D'].map(opt => `
              <label class="cursor-pointer">
                <input type="radio" name="ans-${q.id}" value="${opt}" ${q.answer === opt ? 'checked' : ''} data-action="update-answer" data-idx="${idx}" class="sr-only">
                <span class="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-bold transition-colors ${q.answer === opt ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-theme text-muted hover:border-indigo-400'}">${opt}</span>
              </label>
            `).join('')}
          </div>
        </div>`;
    } else if (q.type === 'true_false') {
      // 4 phát biểu độc lập, mỗi ý có radio Đúng/Sai riêng
      const stmts = (q.statements && q.statements.length === 4)
        ? q.statements
        : [{ label: 'a', text: '', answer: 'Đúng' }, { label: 'b', text: '', answer: 'Đúng' }, { label: 'c', text: '', answer: 'Đúng' }, { label: 'd', text: '', answer: 'Đúng' }];

      answerHtml = `
        <div class="mt-2 space-y-2">
          <p class="text-xs font-bold text-muted uppercase">Chọn Đúng/Sai cho từng ý:</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${stmts.map((s, si) => `
              <div class="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-theme">
                <span class="text-xs font-black text-indigo-600 w-5">Ý ${s.label}</span>
                <div class="flex gap-1">
                  <label class="cursor-pointer">
                    <input type="radio" name="stmt-${q.id}-${si}" value="Đúng" ${s.answer === 'Đúng' ? 'checked' : ''} data-action="update-stmt-ans" data-idx="${idx}" data-si="${si}" class="sr-only">
                    <span class="px-2 py-1 rounded border text-[11px] font-bold transition-colors ${s.answer === 'Đúng' ? 'bg-green-100 border-green-400 text-green-700' : 'border-theme text-muted hover:border-green-400'}">Đúng</span>
                  </label>
                  <label class="cursor-pointer">
                    <input type="radio" name="stmt-${q.id}-${si}" value="Sai" ${s.answer === 'Sai' ? 'checked' : ''} data-action="update-stmt-ans" data-idx="${idx}" data-si="${si}" class="sr-only">
                    <span class="px-2 py-1 rounded border text-[11px] font-bold transition-colors ${s.answer === 'Sai' ? 'bg-red-100 border-red-400 text-red-700' : 'border-theme text-muted hover:border-red-400'}">Sai</span>
                  </label>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    } else {
      answerHtml = `
        <div class="mt-3 space-y-2">
          <input type="text" value="${escapeHtml(q.answer || '')}" class="input-glass !py-1 text-xs w-full" placeholder="Ví dụ: quang hợp | quá trình quang hợp" data-action="update-answer" data-idx="${idx}">
          <p class="text-[11px] text-muted">Nhập nhiều đáp án đúng bằng dấu <span class="font-black">|</span>.</p>
        </div>`;
    }

    return `
      <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-theme relative group">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
            <span class="text-sm font-black text-muted shrink-0">${idx + 1}.</span>
            ${typeBadge}
            <select class="input-glass !py-0.5 text-[10px] shrink-0" data-action="update-type" data-idx="${idx}">
              <option value="multiple_choice" ${q.type === 'multiple_choice' ? 'selected' : ''}>Trắc nghiệm</option>
              <option value="true_false" ${q.type === 'true_false' ? 'selected' : ''}>Đúng/Sai</option>
              <option value="short_answer" ${q.type === 'short_answer' ? 'selected' : ''}>Trả lời ngắn</option>
            </select>
            <div class="flex items-center gap-1 shrink-0">
              <span class="text-[10px] font-bold text-muted uppercase">Diểm</span>
              <input type="number" min="0.1" step="0.05" value="${escapeHtml(q.points)}" class="input-glass !py-0.5 text-[10px] w-20" data-action="update-points" data-idx="${idx}">
              ${q.type === 'true_false' ? '<span class="text-[9px] text-amber-600 font-bold">(1ý→0.1· 2ý→0.25· 3ý→0.5· 4ý=full)</span>' : ''}
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button class="text-sky-500 hover:text-sky-600 transition-colors p-1" data-action="duplicate-q" data-idx="${idx}" title="Nhân bản câu này">
              <i data-lucide="copy" class="w-4 h-4 pointer-events-none"></i>
            </button>
            <button class="text-red-400 hover:text-red-600 transition-colors p-1 shrink-0" data-action="delete-q" data-idx="${idx}" title="Xóa câu này">
              <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
            </button>
          </div>
        </div>
        ${answerHtml}
      </div>`;
  }).join('');

  lucide.createIcons({ root: container });
}

const examQuestionsContainer = document.getElementById('exam-questions-container');
if (examQuestionsContainer) {
  examQuestionsContainer.addEventListener('input', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const idx = Number(e.target.dataset.idx);
    if (!Number.isInteger(idx) || !examQuestions[idx]) return;
    if (action === 'update-points') examQuestions[idx].points = e.target.value;
    if (action === 'update-answer' && e.target.type === 'text') {
      // Cho phần short_answer (nếu có dùng input text)
      examQuestions[idx].answer = e.target.value;
    }
  });

  examQuestionsContainer.addEventListener('change', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const idx = Number(e.target.dataset.idx);
    if (!Number.isInteger(idx) || !examQuestions[idx]) return;

    if (action === 'update-type') {
      const nextType = e.target.value;
      // Always start fresh for the new type to avoid stale data
      examQuestions[idx] = {
        ...createEmptyQuestion(nextType),
        id: examQuestions[idx].id,
        text: examQuestions[idx].text || '',
        points: normalizeQuestionPoints(examQuestions[idx].points)
      };
      renderQuestionsEditor();
      return;
    }

    if (action === 'update-answer') {
      examQuestions[idx].answer = e.target.value;
      if (e.target.type === 'radio') {
        renderQuestionsEditor(); // re-render để cập nhật màu span
      }
      return;
    }
    
    if (action === 'update-points') examQuestions[idx].points = normalizeQuestionPoints(e.target.value);
    
    // true_false statement answer (radio Đúng/Sai)
    if (action === 'update-stmt-ans') {
      const si = Number(e.target.dataset.si);
      if (!examQuestions[idx].statements) examQuestions[idx].statements = [];
      if (!examQuestions[idx].statements[si]) examQuestions[idx].statements[si] = { label: ['a','b','c','d'][si], text: '', answer: 'Đúng' };
      examQuestions[idx].statements[si].answer = e.target.value;
      renderQuestionsEditor(); // re-render to update label colors
      return;
    }
  });

  examQuestionsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.idx);
    if (!Number.isInteger(idx) || !examQuestions[idx]) return;

    if (action === 'delete-q') {
      examQuestions.splice(idx, 1);
      renderQuestionsEditor();
    }

    if (action === 'duplicate-q') {
      const cloned = JSON.parse(JSON.stringify(examQuestions[idx]));
      cloned.id = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      examQuestions.splice(idx + 1, 0, cloned);
      renderQuestionsEditor();
    }
  });
}

document.getElementById('btn-add-question').addEventListener('click', () => {
  examQuestions.push(createEmptyQuestion('multiple_choice'));
  renderQuestionsEditor();
  const container = document.getElementById('exam-questions-container');
  setTimeout(() => {
    if (container) container.scrollTop = container.scrollHeight;
  }, 50);
});

document.getElementById('btn-cancel-exam').addEventListener('click', resetExamForm);

document.getElementById('exam-pdf-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate: chỉ nhận PDF
  if (file.type !== 'application/pdf') {
    showToast('Chỉ hỗ trợ file PDF!', true);
    e.target.value = '';
    return;
  }

  const progressWrap = document.getElementById('exam-pdf-progress');
  const progressBar = document.getElementById('exam-pdf-progress-bar');
  progressWrap.classList.remove('hidden');
  progressBar.style.width = '0%';

  // Upload lên Supabase Storage (bucket: exam-pdfs)
  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = `exam_pdfs/${fileName}`;

  const { data, error } = await supabaseClient.storage
    .from('exam-pdfs')
    .upload(filePath, file, {
      onProgress: (percent) => {
        progressBar.style.width = `${percent}%`;
      }
    });

  if (error) {
    showToast('Lỗi upload PDF: ' + error.message, true);
    progressWrap.classList.add('hidden');
    return;
  }

  // Lấy public URL
  const { data: urlData } = supabaseClient.storage.from('exam-pdfs').getPublicUrl(filePath);
  document.getElementById('exam-pdf-url').value = urlData.publicUrl;
  progressWrap.classList.add('hidden');
  progressBar.style.width = '0%';
  showToast('Upload PDF thành công! (Supabase Storage)');
});

async function loadExams() {
  const container = document.getElementById('exams-list-container');
  if (!container) return;

  container.innerHTML = '<div class="loader mx-auto mt-4"></div>';
  try {
    const exams = [];
    let snap = await getDocs(collection(db, 'exams_public'));
    if (snap.empty) snap = await getDocs(collection(db, 'exams'));

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      exams.push({
        id: docSnap.id,
        title: data.title,
        subject: data.subject,
        duration: data.duration,
        pdfUrl: data.pdfUrl,
        status: data.status,
        instructions: data.instructions || '',
        passPercentage: data.passPercentage ?? 50,
        attemptsLimit: data.attemptsLimit ?? 1,
        startAt: data.startAt || '',
        endAt: data.endAt || '',
        shuffleQuestions: Boolean(data.shuffleQuestions),
        shuffleOptions: Boolean(data.shuffleOptions),
        showResultAfterSubmit: data.showResultAfterSubmit !== false,
        allowReviewAfterSubmit: data.allowReviewAfterSubmit !== false,
        questionCount: data.questionCount || (Array.isArray(data.questions) ? data.questions.length : 0),
        totalPoints: data.totalPoints || (Array.isArray(data.questions) ? data.questions.reduce((sum, question) => sum + (Number(question.points) > 0 ? Number(question.points) : 1), 0) : 0),
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || data.createdAt || ''
      });
    });

    if (!exams.length) {
      container.innerHTML = '<p class="text-sm text-muted text-center py-6">Chưa có đề thi nào. Hãy tạo đề thi đầu tiên.</p>';
      return;
    }

    exams.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    container.innerHTML = exams.map((exam) => {
      const isPublished = exam.status === 'published';
      const availability = getExamAvailabilityText(exam);
      const availabilityClasses = availability === 'Đang mở'
        ? 'bg-emerald-100 text-emerald-600'
        : availability === 'Sắp mở'
          ? 'bg-amber-100 text-amber-600'
          : 'bg-rose-100 text-rose-600';

      return `
        <div class="flex items-start gap-3 p-4 bg-card rounded-xl border border-theme hover:border-indigo-400/50 transition-colors group">
          <div class="p-2.5 rounded-xl ${isPublished ? 'bg-green-100 dark:bg-green-500/15 text-green-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'} shrink-0">
            <i data-lucide="clipboard-list" class="w-5 h-5"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-bold text-main text-sm leading-tight">${escapeHtml(exam.title || 'Đề thi')}</h4>
              <span class="px-2 py-0.5 text-[10px] font-bold rounded-full ${isPublished ? 'bg-green-100 text-green-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">${isPublished ? 'Công khai' : 'Nháp'}</span>
              <span class="px-2 py-0.5 text-[10px] font-bold rounded-full ${availabilityClasses}">${availability}</span>
            </div>
            <p class="text-xs text-muted mt-0.5">${escapeHtml(exam.subject || 'Chưa chọn môn')} · ${exam.duration || '?'} phút · ${exam.questionCount || 0} câu · ${exam.totalPoints || 0} điểm</p>
            <p class="text-[11px] text-muted mt-1">${exam.attemptsLimit === 0 ? 'Làm không giới hạn' : `${exam.attemptsLimit || 1} lần làm`} · Mốc đạt ${exam.passPercentage ?? 50}%</p>
          </div>
          <div class="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Xem kết quả" onclick="loadSubmissions('${exam.id}', ${JSON.stringify(exam.title || 'Đề thi')})">
              <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
            </button>
            <button class="p-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors" title="Chỉnh sửa" onclick="editExam('${exam.id}')">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button class="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Xóa" onclick="deleteExamHandler('${exam.id}')">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>`;
    }).join('');

    lucide.createIcons({ root: container });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="text-sm text-red-500 text-center">Lỗi tải danh sách đề thi.</p>';
  }
}

document.getElementById('btn-save-exam').addEventListener('click', async () => {
  const title = document.getElementById('exam-title').value.trim();
  if (!title) {
    showToast('Vui lòng nhập tên đề thi!', true);
    return;
  }
  if (examQuestions.length === 0) {
    showToast('Vui lòng thêm ít nhất 1 câu hỏi!', true);
    return;
  }

  const questions = sanitizeExamQuestions();
  const validationError = validateExamQuestions(questions);
  if (validationError) {
    showToast(validationError, true);
    return;
  }

  const duration = Math.max(1, Math.min(300, Number(document.getElementById('exam-duration').value) || 45));
  const passPercentage = Math.max(0, Math.min(100, Number(document.getElementById('exam-pass-score').value) || 50));
  const attemptsLimit = Math.max(0, Math.min(20, Number(document.getElementById('exam-attempt-limit').value) || 0));
  const startAtRaw = document.getElementById('exam-start-at').value;
  const endAtRaw = document.getElementById('exam-end-at').value;
  const startAt = startAtRaw ? new Date(startAtRaw).toISOString() : '';
  const endAt = endAtRaw ? new Date(endAtRaw).toISOString() : '';

  if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
    showToast('Thời gian đóng đề phải sau thời gian mở đề.', true);
    return;
  }

  const btn = document.getElementById('btn-save-exam');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Đang lưu...';
  lucide.createIcons();

  const nowIso = new Date().toISOString();
  const rawPdfUrl = document.getElementById('exam-pdf-url').value.trim();
  const payload = {
    title,
    subject: document.getElementById('exam-subject').value,
    duration,
    pdfUrl: rawPdfUrl,
    pdfEmbedUrl: normalizePdfUrl(rawPdfUrl),
    instructions: document.getElementById('exam-instructions').value.trim(),
    passPercentage,
    attemptsLimit,
    startAt,
    endAt,
    status: document.querySelector('input[name="exam-status"]:checked').value,
    shuffleQuestions: document.getElementById('exam-shuffle-questions').checked,
    shuffleOptions: document.getElementById('exam-shuffle-options').checked,
    showResultAfterSubmit: document.getElementById('exam-show-result').checked,
    allowReviewAfterSubmit: document.getElementById('exam-allow-review').checked,
    questions,
    questionCount: questions.length,
    totalPoints: questions.reduce((sum, question) => sum + normalizeQuestionPoints(question.points), 0),
    updatedAt: nowIso
  };

  try {
    const editingId = document.getElementById('exam-editing-id').value;
    const batch = writeBatch(db);

    if (editingId) {
      const examRef = doc(db, 'exams', editingId);
      batch.set(examRef, payload, { merge: true });
      batch.set(doc(db, 'exams_public', editingId), getExamSummaryPayload(editingId, payload), { merge: true });
      await batch.commit();
      showToast('Đã cập nhật đề thi!');
    } else {
      const examRef = doc(collection(db, 'exams'));
      payload.createdAt = nowIso;
      payload.createdBy = currentUser.email;
      batch.set(examRef, payload);
      batch.set(doc(db, 'exams_public', examRef.id), getExamSummaryPayload(examRef.id, payload));
      await batch.commit();
      showToast('Đã tạo đề thi mới!');
    }

    resetExamForm();
    loadExams();
  } catch (error) {
    console.error(error);
    showToast('Lỗi lưu đề thi!', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Lưu Đề Thi';
    lucide.createIcons();
  }
});

window.editExam = async (id) => {
  try {
    const snap = await getDoc(doc(db, 'exams', id));
    if (!snap.exists()) {
      showToast('Không tìm thấy đề thi!', true);
      return;
    }

    const data = snap.data();
    document.getElementById('exam-editing-id').value = id;
    document.getElementById('exam-title').value = data.title || '';
    document.getElementById('exam-subject').value = data.subject || '';
    document.getElementById('exam-duration').value = data.duration || 45;
    document.getElementById('exam-pdf-url').value = data.pdfUrl || '';
    document.getElementById('exam-instructions').value = data.instructions || '';
    document.getElementById('exam-pass-score').value = data.passPercentage ?? 50;
    document.getElementById('exam-attempt-limit').value = data.attemptsLimit ?? 1;
    document.getElementById('exam-start-at').value = toDatetimeLocalValue(data.startAt);
    document.getElementById('exam-end-at').value = toDatetimeLocalValue(data.endAt);
    document.getElementById('exam-shuffle-questions').checked = Boolean(data.shuffleQuestions);
    document.getElementById('exam-shuffle-options').checked = Boolean(data.shuffleOptions);
    document.getElementById('exam-show-result').checked = data.showResultAfterSubmit !== false;
    document.getElementById('exam-allow-review').checked = data.allowReviewAfterSubmit !== false;
    if (data.status === 'published') document.getElementById('exam-status-published').checked = true;
    else document.getElementById('exam-status-draft').checked = true;

    examQuestions = JSON.parse(JSON.stringify(data.questions || [])).map((question) => ({
      ...createEmptyQuestion(question.type),
      ...question,
      points: normalizeQuestionPoints(question.points)
    }));
    renderQuestionsEditor();
    showToast('Đã tải đề thi để chỉnh sửa');
    document.getElementById('exam-tab').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error(error);
    showToast('Lỗi tải đề thi!', true);
  }
};

window.deleteExamHandler = async (id) => {
  if (!confirm('Xóa đề thi này? Tất cả kết quả làm bài cũng sẽ bị mất!')) return;

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'exams', id));
    batch.delete(doc(db, 'exams_public', id));
    await batch.commit();
    showToast('Đã xóa đề thi');
    loadExams();
  } catch (error) {
    console.error(error);
    showToast('Không thể xóa đề thi!', true);
  }
};

window.loadSubmissions = async (examId, examTitle) => {
  const container = document.getElementById('submissions-container');
  const titleEl = document.getElementById('exam-view-title');
  if (!container || !titleEl) return;

  titleEl.textContent = `— ${examTitle}`;
  container.innerHTML = '<div class="loader mx-auto mt-4"></div>';

  try {
    const snap = await getDocs(query(collection(db, 'exam_submissions'), where('examId', '==', examId)));
    const submissions = [];
    snap.forEach((docSnap) => submissions.push({ id: docSnap.id, ...docSnap.data() }));

    if (submissions.length === 0) {
      container.innerHTML = '<div class="flex flex-col items-center py-8 text-muted"><i data-lucide="inbox" class="w-8 h-8 mb-2 opacity-30"></i><p class="text-sm font-medium">Chưa có học sinh nào nộp bài</p></div>';
      lucide.createIcons({ root: container });
      return;
    }

    submissions.sort((a, b) => {
      const pctDiff = (b.percentage || 0) - (a.percentage || 0);
      if (pctDiff !== 0) return pctDiff;
      return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
    });

    container.innerHTML = `
      <div class="grid grid-cols-3 text-[10px] font-black text-muted uppercase tracking-wider px-3 pb-1 border-b border-theme mb-1">
        <span>Học sinh</span>
        <span class="text-center">Điểm</span>
        <span class="text-right">Thời gian nộp</span>
      </div>
      ${submissions.map((submission) => {
        const pct = Math.round(submission.percentage || 0);
        const color = pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500';
        const bar = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
        const submittedAt = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString('vi-VN') : '—';
        return `
          <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-500 text-white text-xs font-black flex items-center justify-center shrink-0">${escapeHtml((submission.userEmail || '?')[0].toUpperCase())}</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-main truncate">${escapeHtml(submission.userEmail || 'Ẩn danh')}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <div class="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div class="h-full ${bar} rounded-full" style="width:${pct}%"></div>
                </div>
                <span class="text-xs font-black ${color}">${submission.score || 0}/${submission.maxScore || 0}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="text-[11px] font-bold ${color}">${pct}%</span>
              <p class="text-[10px] text-muted">${submittedAt.split(',')[0]}</p>
            </div>
          </div>`;
      }).join('')}
    `;
    lucide.createIcons({ root: container });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="text-sm text-red-500 text-center">Lỗi tải kết quả.</p>';
  }
};

const btnRefreshExams = document.getElementById('btn-refresh-exams');
if (btnRefreshExams) {
  btnRefreshExams.addEventListener('click', () => {
    loadExams();
    const icon = btnRefreshExams.querySelector('i');
    if (icon) {
      icon.classList.add('animate-spin');
      setTimeout(() => icon.classList.remove('animate-spin'), 1000);
    }
  });
}

resetExamForm();

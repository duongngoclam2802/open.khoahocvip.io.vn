import { 
  auth, db, storage, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence,
  collection, getDocs, doc, getDoc, setDoc, updateDoc, addDoc, writeBatch, arrayUnion, query, where,
  ref, uploadBytesResumable, getDownloadURL
} from './firebase-config.js';

// DOM Auth
const authCheckLoader = document.getElementById('auth-check-loader');
const loginOverlay = document.getElementById('login-overlay');
const btnLogin = document.getElementById('btn-login');
const btnLoginLarge = document.getElementById('btn-login-large');
const btnCloseLogin = document.getElementById('btn-close-login');
const btnLogout = document.getElementById('btn-logout');
const userMenu = document.getElementById('user-menu');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');

// Views
const allViews = document.querySelectorAll('.main-view');

// UI Elements
const courseGrid = document.getElementById('course-grid');
const courseOutline = document.getElementById('course-outline');
const currentLectureTitle = document.getElementById('current-lecture-title');
const lectureDescription = document.getElementById('lecture-description');
const resourceContainer = document.getElementById('resource-container');
const btnDownloadDoc = document.getElementById('btn-download-doc');
const btnMarkDone = document.getElementById('btn-mark-done');
const textMarkDone = document.getElementById('text-mark-done');
const progressBarFill = document.getElementById('progress-bar');
const progressPercentText = document.getElementById('progress-percent');
const notebookTextarea = document.getElementById('notebook-textarea');
const saveIndicator = document.getElementById('save-indicator');
const btnExportPdf = document.getElementById('btn-export-pdf');

// Stats Elements
const statLearning = document.getElementById('stat-learning');
const statHours = document.getElementById('stat-hours');
const statCompletedLectures = document.getElementById('stat-completed-lectures');
const statXp = document.getElementById('stat-xp');
const leaderboardContainer = document.getElementById('leaderboard-container');

// State
let currentUser = null;
let allCourses = [];
let currentCourse = null;
let currentLecture = null;
let activeLectureId = null;
let pendingLecture = null;
let ytPlayer = null;
let ytPlayerReady = false;
let isPlayerInitialized = false;
let userIsWhitelisted = false; // cached whitelist status (non-blocking after login)

// userProgress structure:
// {
//    totalWatchSeconds: 0,
//    courses: { courseId: { completedLectures: [], videoPositions: {}, notes: {}, badges: [] } }
// }
let userProgress = { totalWatchSeconds: 0, courses: {} };

// Helper Toast
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  const icon = toast.querySelector('i');
  msgEl.textContent = msg;
  icon.setAttribute('data-lucide', isError ? 'alert-circle' : 'check-circle');
  icon.className = isError ? 'text-red-500 w-5 h-5' : 'text-green-500 w-5 h-5';
  lucide.createIcons();
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

// ----------------------------------------------------
// UI NAVIGATION
// ----------------------------------------------------
window.changeMainView = (viewId, element = null) => {
  haptic(5); // Trigger haptic on every nav

  // Pause video if moving away
  if (viewId !== 'view-learning' && ytPlayer && isPlayerInitialized) {
    try {
      const iframe = document.getElementById('yt-iframe');
      if (iframe) iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
    } catch(e) {}
  }

  // Use View Transitions if available
  const doNav = () => {
    // Update sidebar active state
    if (element) {
      document.querySelectorAll('.sidebar-item').forEach(el => {
        el.classList.remove('active', 'text-main');
        el.classList.add('text-muted');
      });
      element.classList.add('active', 'text-main');
      element.classList.remove('text-muted');
    }

    // Hide all views
    allViews.forEach(v => {
      v.classList.add('hidden');
      v.style.opacity = '0';
    });

    // Show target
    const target = document.getElementById(viewId);
    if (!target) return;
    target.classList.remove('hidden');
    const container = document.getElementById('main-views-container');
    if (container) container.scrollTop = 0;
    requestAnimationFrame(() => {
      target.style.opacity = '1';
    });

    // Load contextual data
    if(viewId === 'view-news') loadNews();
    if(viewId === 'view-docs') loadDocs();
    if(viewId === 'view-discovery') loadDiscovery();
    if(viewId === 'view-qa') loadQA();
    if(viewId === 'view-dashboard') renderCourseGrid();
    if(viewId === 'view-profile') loadProfile();

    // Sync Mobile Bottom Nav
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.removeAttribute('data-active');
      if (btn.getAttribute('data-view') === viewId) {
        btn.classList.add('active');
        btn.setAttribute('data-active', 'true');
      }
    });
  };

  if (document.startViewTransition) {
    document.startViewTransition(doNav);
  } else {
    doNav();
  }
};


// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------

function hideAuthLoader() {
  if (!authCheckLoader) return;
  authCheckLoader.classList.add('opacity-0');
  setTimeout(() => authCheckLoader.classList.add('hidden'), 350);
}

// Force-hide after 6s as safety net (network issues, Firebase timeout, etc.)
const _loaderTimeout = setTimeout(hideAuthLoader, 6000);

// Set persistence FIRST, then register auth listener
// so Firebase emits stable state (not null→user flicker)
(async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch(e) {
    console.warn('setPersistence error:', e);
  }

  loadCourses();
  loadLeaderboard();

  onAuthStateChanged(auth, async (user) => {
    // Safety: always hide loader when auth state is determined
    hideAuthLoader();
    clearTimeout(_loaderTimeout);

    if (user) {
    // ✅ Mọi tài khoản Google đều đăng nhập được — không chặn ở bước này
    currentUser = user;

    // Check whitelist in background (non-blocking) for course access purposes
    userIsWhitelisted = false;
    checkWhitelist(user.email).then(result => {
      userIsWhitelisted = result;
      renderCourseGrid(); // re-render after whitelist result arrives
    }).catch(() => { userIsWhitelisted = false; });

    updateAuthUI();
    await loadProgress();

    // Init streak system for logged-in user
    if (typeof window.initStreakSystem === 'function') window.initStreakSystem(user.uid);
    
    if (currentCourse && document.getElementById('view-learning').classList.contains('opacity-100')) {
      renderOutline();
      updateProgressUI();
      if (activeLectureId) loadNotebook(activeLectureId);
    }
    
    if (pendingLecture) {
      goToLearningView(pendingLecture.courseId);
      playLecture(pendingLecture.lecture, pendingLecture.topicTitle);
      pendingLecture = null;
    }

    // Refresh Dashboard Stats
    renderCourseGrid();
    
  } else {
    currentUser = null;
    userIsWhitelisted = false;
    updateAuthUI();
    userProgress = { totalWatchSeconds: 0, courses: {} };
    renderCourseGrid();
  }
  }); // end onAuthStateChanged

})(); // end async IIFE

async function checkWhitelist(email) {
  if (email.toLowerCase() === 'duongngoclam28022008@gmail.com') return true;
  try {
    const docSnap = await getDoc(doc(db, "allowed_users", email.toLowerCase()));
    if (!docSnap.exists()) return false;
    const data = docSnap.data();
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) return false;
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function updateAuthUI() {
  if (currentUser) {
    btnLogin.classList.add('hidden');
    userMenu.classList.remove('hidden');
    userInfo.textContent = currentUser.email.split('@')[0];
    userAvatar.textContent = currentUser.email[0].toUpperCase();
    loginOverlay.classList.remove('opacity-100');
    setTimeout(() => loginOverlay.classList.add('hidden'), 300);
  } else {
    btnLogin.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

const handleLogin = async () => {
  try {
    const btnText = btnLoginLarge.innerHTML;
    btnLoginLarge.innerHTML = '<div class="loader !w-5 !h-5 !border-2"></div>';
    await signInWithPopup(auth, googleProvider);
    btnLoginLarge.innerHTML = btnText;
  } catch (error) {
    alert("Lỗi đăng nhập: " + error.message);
  }
};

btnLogin.addEventListener('click', handleLogin);
btnLoginLarge.addEventListener('click', handleLogin);
btnLogout.addEventListener('click', () => signOut(auth));
btnCloseLogin.addEventListener('click', () => {
  loginOverlay.classList.remove('opacity-100');
  setTimeout(() => loginOverlay.classList.add('hidden'), 300);
  pendingLecture = null;
});

// ----------------------------------------------------
// COURSES & STATS
// ----------------------------------------------------
async function loadCourses() {
  try {
    const snap = await getDocs(collection(db, "courses"));
    allCourses = [];
    snap.forEach(d => {
      const data = d.data(); data.id = d.id;
      allCourses.push(data);
    });
    renderCourseGrid();
  } catch (e) { console.error(e); }
}

async function loadProgress() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, "progress", currentUser.email));
    if (snap.exists()) {
      const data = snap.data();
      userProgress.totalWatchSeconds = data.totalWatchSeconds || 0;
      userProgress.courses = data.courses || {};
      userProgress.unlockedCourses = data.unlockedCourses || [];
    }
  } catch (e) { console.error(e); }
}

async function saveProgressToServer() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "progress", currentUser.email), userProgress, { merge: true });
  } catch (e) { console.error(e); }
}

function renderCourseGrid() {
  const dashGrid = document.getElementById('dashboard-course-grid');
  const myGrid = document.getElementById('my-courses-grid');
  
  if (dashGrid) dashGrid.innerHTML = '';
  if (myGrid) myGrid.innerHTML = '';

  if (allCourses.length === 0) {
    if(dashGrid) dashGrid.innerHTML = '<p class="text-muted">Chưa có khóa học nào.</p>';
    if(myGrid) myGrid.innerHTML = '<p class="text-muted col-span-full text-center">Chưa có khóa học nào.</p>';
    return;
  }

  let activeCoursesCount = 0;
  let totalCompletedLectures = 0;
  
  // Sort courses: Active ones first, then others
  let sortedCourses = [...allCourses].sort((a, b) => {
    let pA = userProgress?.courses?.[a.id]?.completedLectures?.length || 0;
    let pB = userProgress?.courses?.[b.id]?.completedLectures?.length || 0;
    return pB - pA;
  });

  // Calculate global stats
  sortedCourses.forEach(course => {
    if (currentUser && userProgress.courses[course.id]) {
      const pData = userProgress.courses[course.id];
      if (pData.completedLectures && pData.completedLectures.length > 0) activeCoursesCount++;
      totalCompletedLectures += (pData.completedLectures ? pData.completedLectures.length : 0);
    }
  });

  // Function to generate card HTML
  const generateCardHtml = (course, idx, isGrid) => {
    let hasFreeTrial = false;
    let totalLec = 0;
    if (course.topics) {
      course.topics.forEach(t => {
        if(t.lectures) {
          totalLec += t.lectures.length;
          t.lectures.forEach(l => { if(l.isFreeTrial) hasFreeTrial = true; });
        }
      });
    }

    const thumb = course.thumbnailUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop';
    
    let pData = { completedLectures: [] };
    if (currentUser && userProgress.courses[course.id]) {
      pData = userProgress.courses[course.id];
    }
    const percent = totalLec === 0 ? 0 : Math.round((pData.completedLectures.length / totalLec) * 100);

    // Determine unlock status
    // Rules:
    //   1. Admin email → always unlocked
    //   2. User is in allowed_users whitelist (with valid expiry) → unlocked
    //   3. courseId is in user's unlockedCourses (activated via key) → unlocked
    //   4. Course has at least 1 free-trial lecture → card shown normally (but playLecture still gate-checks each lecture)
    const isAdmin = currentUser && currentUser.email === 'duongngoclam28022008@gmail.com';
    const unlockedCourses = userProgress.unlockedCourses || [];
    const isFullyUnlocked = currentUser && (isAdmin || userIsWhitelisted || unlockedCourses.includes(course.id));
    // For card display: if course has free trial, show as semi-accessible (not locked overlay)
    const isUnlocked = isFullyUnlocked || (!currentUser ? false : hasFreeTrial);

    const card = document.createElement('div');
    // Dashboard uses list layout, My Courses uses grid layout
    card.className = isGrid 
      ? `bg-card p-4 rounded-3xl border border-theme hover:-translate-y-2 transition-all duration-300 cursor-pointer stagger-item flex flex-col gap-4 relative group shadow-sm hover:shadow-xl`
      : `bg-card p-4 rounded-3xl border border-theme hover:-translate-y-2 transition-all duration-300 cursor-pointer stagger-item flex flex-col sm:flex-row gap-5 relative group shadow-sm hover:shadow-xl`;
    
    card.style.animationDelay = `${idx * 0.1}s`;
    
    card.innerHTML = `
      <div class="absolute inset-0 rounded-3xl bg-gradient-to-r ${percent === 100 ? 'from-green-400 to-emerald-500' : 'from-blue-400 to-indigo-500'} opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none"></div>
      <div class="absolute inset-[-1px] rounded-3xl bg-gradient-to-r ${percent === 100 ? 'from-green-500 to-emerald-500' : 'from-blue-500 to-indigo-500'} opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-sm"></div>
      <div class="absolute inset-0 rounded-3xl bg-card transition-colors duration-300 -z-0"></div>

      <div class="${isGrid ? 'h-40 w-full' : 'h-32 sm:w-48 shrink-0'} relative rounded-2xl overflow-hidden group-hover:shadow-lg transition-shadow z-10">
        <img src="${thumb}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out ${!isUnlocked ? 'brightness-50' : ''}" alt="">
        ${!isUnlocked ? `
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div class="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 mb-1">
              <i data-lucide="lock" class="w-5 h-5 text-white"></i>
            </div>
            <span class="text-[10px] text-white font-bold">Cần mã kích hoạt</span>
          </div>
        ` : `
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-50 group-hover:scale-100">
            <div class="w-12 h-12 bg-white/90 backdrop-blur-sm text-blue-600 rounded-full flex items-center justify-center shadow-xl">
              <i data-lucide="play" class="w-6 h-6 ml-1"></i>
            </div>
          </div>
        `}
        ${hasFreeTrial ? '<div class="absolute top-2 left-2 bg-gradient-to-r from-orange-400 to-orange-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg uppercase tracking-wider">Học thử</div>' : ''}
        ${percent === 100 ? '<div class="absolute top-2 right-2 bg-gradient-to-r from-green-400 to-green-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg uppercase tracking-wider"><i data-lucide="check-circle" class="w-3 h-3 inline"></i> Hoàn thành</div>' : ''}
      </div>
      
      <div class="flex-1 flex flex-col justify-between py-1 z-10">
        <div>
          <h3 class="font-black text-lg text-main mb-1.5 ${isUnlocked ? 'group-hover:text-blue-500' : 'opacity-70'} transition-colors line-clamp-2">${course.title}</h3>
          <div class="flex items-center gap-4 text-xs text-muted mb-3 font-semibold">
            <span class="flex items-center gap-1 bg-blue-500/10 text-blue-600 px-2 py-1 rounded-md"><i data-lucide="play-circle" class="w-4 h-4"></i> ${totalLec} Bài giảng</span>
            ${!isUnlocked ? '<span class="flex items-center gap-1 bg-orange-500/10 text-orange-500 px-2 py-1 rounded-md"><i data-lucide="key" class="w-4 h-4"></i> Chưa kích hoạt</span>' : ''}
          </div>
        </div>
        <div class="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-theme group-hover:border-blue-500/30 transition-colors mt-auto">
          <div class="flex justify-between text-[11px] font-bold mb-2">
            <span class="text-muted uppercase tracking-wider flex items-center gap-1"><i data-lucide="target" class="w-3 h-3"></i> Tiến độ học</span>
            <span class="${percent === 100 ? 'text-green-500' : 'text-blue-500'} font-black">${percent}%</span>
          </div>
          <div class="progress-bar-container bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div class="progress-bar-fill w-0 ${percent === 100 ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-blue-400 to-indigo-500'} h-full rounded-full transition-all duration-1000 ease-out" style="width: ${percent}%"></div>
          </div>
        </div>
      </div>
    `;

    // Add data-subject and data-course-card for ambient glow + tilt
    card.setAttribute('data-course-card', '');
    if (course.subject) card.setAttribute('data-subject', course.subject);
    else if (course.title) {
      // Auto-detect subject from title
      const titleLower = course.title.toLowerCase();
      if (titleLower.includes('toán')) card.setAttribute('data-subject', 'Toán');
      else if (titleLower.includes('lý') || titleLower.includes('vật lý')) card.setAttribute('data-subject', 'Lý');
      else if (titleLower.includes('hóa') || titleLower.includes('hoá')) card.setAttribute('data-subject', 'Hóa');
      else if (titleLower.includes('sinh')) card.setAttribute('data-subject', 'Sinh');
      else if (titleLower.includes('anh')) card.setAttribute('data-subject', 'Anh');
      else if (titleLower.includes('văn') || titleLower.includes('ngữ văn')) card.setAttribute('data-subject', 'Văn');
    }

    card.addEventListener('click', () => {
      if (!isUnlocked) {
        // Redirect to profile to activate key
        showToast('Vui lòng nhập mã kích hoạt để mở khóa khóa học này! 🔑');
        window.changeMainView('view-profile');
        setTimeout(() => document.getElementById('activation-key-input')?.focus(), 400);
        return;
      }
      goToLearningView(course.id);
    });
    
    // Set dataset for filtering
    card.dataset.title = course.title.toLowerCase();
    card.dataset.progress = percent;
    card.dataset.status = percent === 100 ? 'completed' : (percent > 0 ? 'in_progress' : 'not_started');

    lucide.createIcons({ root: card });
    return card;
  };

  // Render Dashboard Top 2 Courses
  if (dashGrid) {
    const top2 = sortedCourses.slice(0, 2);
    if(top2.length > 0) {
      top2.forEach((course, idx) => {
        dashGrid.appendChild(generateCardHtml(course, idx, false));
      });
    } else {
      dashGrid.innerHTML = '<p class="text-muted">Bạn chưa học khóa nào.</p>';
    }
  }

  // Render All Courses to My Courses Grid
  if (myGrid) {
    sortedCourses.forEach((course, idx) => {
      myGrid.appendChild(generateCardHtml(course, idx, true));
    });
  }

  // Setup Filtering for My Courses
  const searchInput = document.getElementById('my-courses-search');
  const filterSelect = document.getElementById('my-courses-filter');
  
  const filterCourses = () => {
    if(!myGrid) return;
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const status = filterSelect ? filterSelect.value : 'all';
    
    Array.from(myGrid.children).forEach(card => {
      const matchSearch = card.dataset.title.includes(query);
      const matchStatus = status === 'all' || 
                          (status === 'completed' && card.dataset.status === 'completed') || 
                          (status === 'in_progress' && (card.dataset.status === 'in_progress' || card.dataset.status === 'completed'));
      
      if(matchSearch && matchStatus) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  };

  if(searchInput) searchInput.addEventListener('input', filterCourses);
  if(filterSelect) filterSelect.addEventListener('change', filterCourses);

  // Update Stats UI — animated counters
  const hours = parseFloat((userProgress.totalWatchSeconds / 3600).toFixed(1));
  const xp = Math.floor((userProgress.totalWatchSeconds / 3600) * 50) + (totalCompletedLectures * 100);

  // Use animated counter if available (defined in inline script)
  if (typeof window.triggerDashboardCounters === 'function') {
    window.triggerDashboardCounters({ learning: activeCoursesCount, hours, lectures: totalCompletedLectures, xp });
  } else {
    if(statLearning) statLearning.textContent = activeCoursesCount;
    if(statHours) statHours.innerHTML = `${hours}<span class="text-lg text-muted font-medium">h</span>`;
    if(statCompletedLectures) statCompletedLectures.textContent = totalCompletedLectures;
    if(statXp) statXp.textContent = xp;
  }

  // Apply ambient glow and tilt to newly rendered cards
  setTimeout(() => {
    if (typeof window.applyAmbientGlow === 'function') {
      window.applyAmbientGlow(document.getElementById('dashboard-course-grid'));
      window.applyAmbientGlow(document.getElementById('my-courses-grid'));
    }
    if (typeof window.initTiltEffects === 'function') window.initTiltEffects();
  }, 300);

  lucide.createIcons();
}

async function loadLeaderboard() {
  leaderboardContainer.innerHTML = '<div class="loader mx-auto"></div>';
  try {
    const snap = await getDocs(collection(db, "progress"));
    let users = [];
    snap.forEach(d => {
      const data = d.data();
      let totalLec = 0;
      if (data.courses) {
        Object.values(data.courses).forEach(c => {
          if (c.completedLectures) totalLec += c.completedLectures.length;
        });
      }
      const hours = (data.totalWatchSeconds || 0) / 3600;
      const xp = Math.floor(hours * 50) + (totalLec * 100);
      users.push({ email: d.id, xp: xp });
    });

    users.sort((a, b) => b.xp - a.xp);
    const topUsers = users.slice(0, 5); // top 5
    
    leaderboardContainer.innerHTML = '';
    if(topUsers.length === 0) {
      leaderboardContainer.innerHTML = '<p class="text-muted text-sm">Chưa có ai.</p>';
    }

    topUsers.forEach((u, i) => {
      const isTop1 = i === 0;
      const isTop2 = i === 1;
      const isTop3 = i === 2;
      
      let rankHtml = '';
      let bgHtml = '';
      let borderHtml = 'border border-transparent border-b-theme';
      
      if (isTop1) {
        rankHtml = `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 text-white font-black flex items-center justify-center shadow-lg shadow-yellow-500/40 text-lg border-2 border-white dark:border-slate-800">1</div>`;
        bgHtml = `bg-gradient-to-r from-yellow-500/10 to-transparent`;
        borderHtml = `border border-yellow-500/30 shadow-sm`;
      } else if (isTop2) {
        rankHtml = `<div class="w-9 h-9 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-white font-black flex items-center justify-center shadow-lg shadow-slate-400/40 text-base border-2 border-white dark:border-slate-800">2</div>`;
      } else if (isTop3) {
        rankHtml = `<div class="w-9 h-9 rounded-full bg-gradient-to-br from-orange-300 to-orange-500 text-white font-black flex items-center justify-center shadow-lg shadow-orange-500/40 text-base border-2 border-white dark:border-slate-800">3</div>`;
      } else {
        rankHtml = `<div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold flex items-center justify-center text-sm border border-theme">${i+1}</div>`;
      }

      const isOnline = currentUser && u.email === currentUser.email; // Show "online" dot for current user
      const avatarLetter = u.email[0].toUpperCase();
      const avatarClass = isTop1 ? 'golden-aura' : '';

      leaderboardContainer.innerHTML += `
        <div class="flex items-center gap-4 p-3 rounded-2xl ${bgHtml} ${borderHtml} hover:-translate-y-0.5 hover:shadow-md transition-all group">
          <div class="relative">
            ${rankHtml}
            ${isTop1 ? '<div class="absolute -top-2 -right-2 text-yellow-500 animate-bounce"><i data-lucide="crown" class="w-5 h-5 fill-yellow-500"></i></div>' : ''}
            ${isOnline ? '<span class="online-dot" title="Đang online"></span>' : ''}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-black text-main truncate group-hover:text-orange-500 transition-colors">${u.email.split('@')[0]}${isOnline ? ' <span class="text-[10px] text-green-500 font-bold">• online</span>' : ''}</p>
            <p class="text-xs font-bold text-muted mt-0.5 flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3 text-yellow-500"></i> ${u.xp.toLocaleString()} XP</p>
          </div>
        </div>
      `;
    });
    lucide.createIcons();
  } catch (e) {
    console.error(e);
  }
}

// ----------------------------------------------------
// LEARNING VIEW (VIDEO)
// ----------------------------------------------------
function goToLearningView(courseId) {
  currentCourse = allCourses.find(c => c.id === courseId);
  document.getElementById('sidebar-course-title').textContent = currentCourse.title;
  
  // Show study buddy widget
  if (typeof window.showStudyBuddy === 'function') window.showStudyBuddy();

  // Show the view first, then load content so player has visible DOM
  window.changeMainView('view-learning');
  
  renderOutline();
  updateProgressUI();
  
  // Small delay so view is fully visible before player mounts
  setTimeout(() => {
    if (!activeLectureId && currentCourse.topics && currentCourse.topics[0] && currentCourse.topics[0].lectures && currentCourse.topics[0].lectures[0]) {
      playLecture(currentCourse.topics[0].lectures[0], currentCourse.topics[0].title);
    }
  }, 100);
}

function getCourseProgress(courseId) {
  if (!userProgress.courses[courseId]) {
    userProgress.courses[courseId] = { completedLectures: [], videoPositions: {}, notes: {}, badges: [] };
  }
  return userProgress.courses[courseId];
}

function renderOutline() {
  if (!currentCourse || !currentCourse.topics) return;
  const pData = getCourseProgress(currentCourse.id);
  courseOutline.innerHTML = '';
  
  currentCourse.topics.forEach((topic, tIndex) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'mb-3 border border-theme rounded-2xl overflow-hidden bg-card shadow-sm';
    
    let completedCount = 0;
    const totalLectures = topic.lectures ? topic.lectures.length : 0;
    if (topic.lectures) {
      topic.lectures.forEach(l => { if (pData.completedLectures.includes(l.id)) completedCount++; });
    }

    const header = document.createElement('button');
    header.className = 'w-full px-5 py-3.5 flex justify-between items-center hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors text-left';
    header.innerHTML = `
      <div class="flex-1 pr-3">
        <h4 class="font-bold text-sm text-main leading-tight">${topic.title}</h4>
        <p class="text-xs text-muted mt-1 font-medium">${completedCount}/${totalLectures} hoàn thành</p>
      </div>
      <div class="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
        <i data-lucide="chevron-down" class="w-4 h-4 text-muted transition-transform duration-300"></i>
      </div>
    `;
    
    const content = document.createElement('div');
    content.className = 'accordion-content bg-card border-t border-theme border-opacity-50';
    let isTopicActive = false;

    if (topic.lectures && topic.lectures.length > 0) {
      const list = document.createElement('ul');
      list.className = 'py-2 px-1';
      topic.lectures.forEach((lecture) => {
        const isDone = pData.completedLectures.includes(lecture.id);
        const isActive = activeLectureId === lecture.id;
        if (isActive) isTopicActive = true;

        const li = document.createElement('li');
        li.className = `px-4 py-3 flex items-start gap-3 cursor-pointer transition-all duration-300 relative rounded-xl mx-2 mb-1 border ${isActive ? 'bg-primary/10 border-primary/30 shadow-sm' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}`;
        
        li.innerHTML = `
          <div class="mt-0.5 shrink-0">
            ${isDone ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500 fill-green-100 dark:fill-green-900"></i>' : (isActive ? '<i data-lucide="play-circle" class="w-5 h-5 text-primary"></i>' : '<i data-lucide="circle" class="w-5 h-5 text-muted"></i>')}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm ${isActive ? 'font-bold text-primary' : 'text-main font-medium'} leading-snug">${lecture.title}</p>
            ${lecture.isFreeTrial ? '<span class="px-1.5 py-0.5 mt-1 inline-block rounded bg-green-100 text-green-700 text-[9px] font-bold uppercase">Học thử</span>' : ''}
          </div>
        `;
        li.addEventListener('click', () => playLecture(lecture, topic.title));
        list.appendChild(li);
      });
      content.appendChild(list);
    }

    header.addEventListener('click', () => {
      content.classList.toggle('open');
      header.querySelector('i').classList.toggle('rotate-180');
    });

    if (isTopicActive || (!activeLectureId && tIndex === 0)) {
      content.classList.add('open');
      header.querySelector('i').classList.add('rotate-180');
    }

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    courseOutline.appendChild(wrapper);
  });
  lucide.createIcons();
}

function playLecture(lecture, topicTitle) {
  // Gate 1: Not logged in → require login (even for free-trial, to track progress)
  if (!currentUser) {
    if (!lecture.isFreeTrial) {
      // Non-free lecture: block, show login
      pendingLecture = { courseId: currentCourse.id, lecture, topicTitle };
      loginOverlay.classList.remove('hidden');
      setTimeout(() => loginOverlay.classList.remove('opacity-0'), 10);
      return;
    }
    // Free-trial: allow even without login (just play)
  }

  // Gate 2: Logged in but course not unlocked AND lecture not free-trial → block
  if (currentUser && !lecture.isFreeTrial) {
    const isAdmin = currentUser.email === 'duongngoclam28022008@gmail.com';
    const unlockedCourses = userProgress.unlockedCourses || [];
    const isCourseUnlocked = isAdmin || userIsWhitelisted || unlockedCourses.includes(currentCourse.id);
    if (!isCourseUnlocked) {
      // Show locked lecture UI in the player area
      showLockedLectureUI(lecture);
      activeLectureId = lecture.id;
      currentLectureTitle.textContent = lecture.title;
      renderOutline();
      return;
    }
  }

  currentLecture = lecture;
  activeLectureId = lecture.id;
  currentLectureTitle.textContent = lecture.title;

  // Update AI context badge
  if (typeof window.updateAIContext === 'function') window.updateAIContext();
  
  lectureDescription.textContent = lecture.description || 'Không có mô tả.';
  if (lecture.documentLink) {
    resourceContainer.classList.remove('hidden');
    btnDownloadDoc.href = lecture.documentLink;
  } else {
    resourceContainer.classList.add('hidden');
  }

  loadNotebook(lecture.id);

  if (lecture.youtubeLink) {
    const videoId = extractYouTubeID(lecture.youtubeLink);
    if (videoId) {
      let startAt = 0;
      if (currentUser) {
        const pData = getCourseProgress(currentCourse.id);
        if (pData.videoPositions && pData.videoPositions[lecture.id]) startAt = pData.videoPositions[lecture.id];
      }
      loadVideoIframe(videoId, startAt);
    } else {
      showPlayerError('Link Video không hợp lệ');
    }
  } else {
    showPlayerError('Bài giảng này không có video', 'video-off');
  }

  renderOutline();
  updateMarkDoneButton();
}

// ─── VIDEO PLAYER (iframe-based — robust, no YT SDK DOM replacement issues) ───
let currentVideoId = null;

function loadVideoIframe(videoId, startSeconds = 0) {
  if (currentVideoId === videoId) return; // Already loaded
  currentVideoId = videoId;
  
  const placeholder = document.getElementById('player-placeholder');
  const playerWrap = document.getElementById('video-player-wrap');
  
  // Show loading state
  placeholder.classList.remove('hidden');
  placeholder.innerHTML = `
    <div class="loader !w-10 !h-10 !border-4 mb-4"></div>
    <p class="font-medium text-slate-300">Đang tải video...</p>
  `;
  playerWrap.innerHTML = '';
  
  const startParam = startSeconds > 5 ? `&start=${Math.floor(startSeconds)}` : '';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('id', 'yt-iframe');
  iframe.setAttribute('src', `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=0${startParam}`);
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
  iframe.setAttribute('allowfullscreen', '');
  iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:0.75rem;';
  
  iframe.onload = () => {
    placeholder.classList.add('hidden');
    isPlayerInitialized = true;
  };
  
  playerWrap.appendChild(iframe);
  
  // Track watch time with a simple interval (no YT API needed)
  clearInterval(window._watchTimer);
  window._watchTimer = setInterval(() => {
    if (!currentUser || !isPlayerInitialized) return;
    if (typeof userProgress.totalWatchSeconds !== 'number') userProgress.totalWatchSeconds = 0;
    userProgress.totalWatchSeconds += 5;
    if (currentCourse && activeLectureId) {
      const pData = getCourseProgress(currentCourse.id);
      if (!pData.videoPositions) pData.videoPositions = {};
      // We track approximate position based on elapsed time
      pData.videoPositions[activeLectureId] = (pData.videoPositions[activeLectureId] || 0) + 5;
    }
    saveProgressToServer();
  }, 5000);
}

// Keep legacy variable for compat (already declared above)
window.onYouTubeIframeAPIReady = function() { ytPlayerReady = true; };

// Watch time tracking is now inside loadVideoIframe

function playNextLecture() {
  if (!currentCourse || !activeLectureId) return;
  let foundCurrent = false; let nextLec = null; let nextTopic = "";
  for (const topic of currentCourse.topics) {
    if (!topic.lectures) continue;
    for (const lec of topic.lectures) {
      if (foundCurrent) { nextLec = lec; nextTopic = topic.title; break; }
      if (lec.id === activeLectureId) foundCurrent = true;
    }
    if (nextLec) break;
  }
  if (nextLec) playLecture(nextLec, nextTopic);
}

function updateMarkDoneButton() {
  if (!currentLecture || !currentUser) { btnMarkDone.disabled = true; return; }
  btnMarkDone.disabled = false;
  const pData = getCourseProgress(currentCourse.id);
  const isDone = pData.completedLectures.includes(currentLecture.id);
  
  if (isDone) {
    btnMarkDone.className = 'btn-secondary !rounded-2xl !py-3 flex flex-col items-center gap-1 min-w-[110px] shrink-0 border-2 bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800';
    textMarkDone.textContent = "Đã xong";
    btnMarkDone.querySelector('i').setAttribute('data-lucide', 'check-circle-2');
  } else {
    btnMarkDone.className = 'btn-secondary !rounded-2xl !py-3 flex flex-col items-center gap-1 min-w-[110px] shrink-0 border-2 text-muted';
    textMarkDone.textContent = "Hoàn thành";
    btnMarkDone.querySelector('i').setAttribute('data-lucide', 'circle');
  }
  lucide.createIcons();
}

function markLectureDone(lectureId, isDone) {
  if (!currentUser || !currentCourse) return;
  const pData = getCourseProgress(currentCourse.id);
  if (isDone) {
    if (!pData.completedLectures.includes(lectureId)) pData.completedLectures.push(lectureId);
  } else {
    pData.completedLectures = pData.completedLectures.filter(id => id !== lectureId);
  }
  updateMarkDoneButton(); renderOutline(); updateProgressUI(); saveProgressToServer();
}

btnMarkDone.addEventListener('click', () => {
  if (!currentLecture || !currentUser) return;
  const pData = getCourseProgress(currentCourse.id);
  markLectureDone(currentLecture.id, !pData.completedLectures.includes(currentLecture.id));
});

function updateProgressUI() {
  if (!currentCourse) return;
  let totalLec = 0;
  if (currentCourse.topics) currentCourse.topics.forEach(t => totalLec += (t.lectures ? t.lectures.length : 0));
  
  let pData = { completedLectures: [], badges: [] };
  if (currentUser) pData = getCourseProgress(currentCourse.id);
  
  const percent = totalLec === 0 ? 0 : Math.round((pData.completedLectures.length / totalLec) * 100);
  progressBarFill.style.width = `${percent}%`;
  progressPercentText.textContent = `${percent}%`;

  if (currentUser && percent >= 50 && !pData.badges.includes('50_percent')) {
    awardBadge('50_percent', '50% Hoàn Thành', 'Tuyệt vời!'); pData.badges.push('50_percent'); saveProgressToServer();
  } else if (currentUser && percent === 100 && !pData.badges.includes('100_percent')) {
    awardBadge('100_percent', 'Tốt Nghiệp!', 'Chúc mừng bạn!'); pData.badges.push('100_percent'); saveProgressToServer();
  }
}

function awardBadge(id, title, desc) {
  document.getElementById('badge-icon-container').innerHTML = `<svg class="w-full h-full text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15l-2 5l9-5l-9-5l2 5z"/></svg>`;
  document.getElementById('badge-title').textContent = title;
  document.getElementById('badge-desc').textContent = desc;
  document.getElementById('badge-popup').classList.add('show');
  const duration = 3000; const end = Date.now() + duration;
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#f97316', '#eab308'] });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#f97316', '#eab308'] });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
}

/** Show a locked screen in the player area for lectures the user hasn't unlocked */
function showLockedLectureUI(lecture) {
  currentVideoId = null;
  clearInterval(window._watchTimer);

  const playerWrap = document.getElementById('video-player-wrap');
  const placeholder = document.getElementById('player-placeholder');

  if (playerWrap) playerWrap.innerHTML = '';
  if (placeholder) {
    placeholder.classList.remove('hidden');
    placeholder.innerHTML = `
      <div class="flex flex-col items-center text-center px-6 py-8 max-w-xs mx-auto">
        <div class="w-20 h-20 bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-orange-500/30 rounded-full flex items-center justify-center mb-5 shadow-lg shadow-orange-500/10">
          <i data-lucide="lock" class="w-9 h-9 text-orange-400"></i>
        </div>
        <h3 class="text-white font-black text-lg mb-2">Bài giảng bị khoá 🔒</h3>
        <p class="text-slate-400 text-sm mb-5 leading-relaxed">
          Bạn cần kích hoạt khóa học <strong class="text-orange-400">${currentCourse?.title || ''}</strong> để xem bài giảng này.
        </p>
        <button onclick="window._headerActivateKey()" class="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 text-sm">
          <i data-lucide="key" class="w-4 h-4"></i> Nhập mã kích hoạt
        </button>
        <p class="text-slate-500 text-xs mt-3">Hoặc liên hệ Admin để được cấp quyền.</p>
      </div>
    `;
    lucide.createIcons({ root: placeholder });
  }
}

// NOTEBOOK — uses contenteditable div, so use innerText not .value

let noteTimeout = null;
function loadNotebook(lectureId) {
  if (!currentUser) {
    notebookTextarea.innerHTML = '';
    notebookTextarea.setAttribute('contenteditable', 'false');
    notebookTextarea.style.opacity = '0.5';
    notebookTextarea.setAttribute('data-placeholder', 'Đăng nhập để ghi chú...');
    return;
  }
  notebookTextarea.setAttribute('contenteditable', 'true');
  notebookTextarea.style.opacity = '';
  const pData = getCourseProgress(currentCourse.id);
  const savedNote = (pData.notes && pData.notes[lectureId]) ? pData.notes[lectureId] : '';
  notebookTextarea.innerText = savedNote;
}

notebookTextarea.addEventListener('input', () => {
  if (!currentUser || !currentCourse || !activeLectureId) return;
  saveIndicator.classList.remove('opacity-100');
  clearTimeout(noteTimeout);
  noteTimeout = setTimeout(() => {
    const pData = getCourseProgress(currentCourse.id);
    if (!pData.notes) pData.notes = {};
    pData.notes[activeLectureId] = notebookTextarea.innerText;
    saveProgressToServer();
    saveIndicator.classList.add('opacity-100');
    setTimeout(() => saveIndicator.classList.remove('opacity-100'), 2000);
  }, 1000);
});

btnExportPdf.addEventListener('click', () => {
  const noteText = notebookTextarea.innerText.trim();
  if (!noteText) { alert('Ghi chú trống'); return; }
  const el = document.createElement('div');
  el.innerHTML = `<h2 style="color: #ea580c;">Khóa học: ${currentCourse.title}</h2><h3>Bài giảng: ${currentLectureTitle.textContent}</h3><hr><p style="white-space:pre-wrap;">${noteText}</p>`;
  html2pdf().from(el).save(`Ghi-chu-${currentLecture ? currentLecture.title : 'bai-giang'}.pdf`);
});

function showPlayerError(msg, icon = 'alert-triangle') {
  currentVideoId = null;
  clearInterval(window._watchTimer);
  const playerWrap = document.getElementById('video-player-wrap');
  const placeholder = document.getElementById('player-placeholder');
  if (playerWrap) playerWrap.innerHTML = '';
  if (placeholder) {
    placeholder.classList.remove('hidden');
    placeholder.innerHTML = `
      <i data-lucide="${icon}" class="w-16 h-16 mb-4 opacity-40"></i>
      <p class="font-semibold text-lg text-slate-300">${msg}</p>
    `;
    lucide.createIcons({ root: placeholder });
  }
}

function extractYouTubeID(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// ----------------------------------------------------
// MULTI-FEATURES LOADERS (News, Docs, Discovery, QA)
// ----------------------------------------------------
async function loadNews() {
  const c = document.getElementById('news-grid'); c.innerHTML = '<div class="loader mx-auto col-span-full"></div>';
  const snap = await getDocs(collection(db, "news")); c.innerHTML = '';
  if(snap.empty) { c.innerHTML = '<p class="text-muted">Chưa có tin tức.</p>'; return; }
  snap.forEach(d => {
    const data = d.data();
    c.innerHTML += `
      <div class="glass-card bg-card p-0 rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 transition-transform border border-theme">
        ${data.imageUrl ? `<img src="${data.imageUrl}" class="w-full h-40 object-cover">` : '<div class="w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900"></div>'}
        <div class="p-5">
          <p class="text-[10px] text-muted font-bold uppercase mb-2">${new Date(data.createdAt).toLocaleDateString('vi-VN')}</p>
          <h3 class="font-bold text-main text-lg mb-2 line-clamp-2">${data.title}</h3>
          <p class="text-sm text-muted line-clamp-3">${data.content}</p>
        </div>
      </div>
    `;
  });
}

let allDocuments = [];
let currentDocCategory = 'all';

async function loadDocs() {
  const c = document.getElementById('docs-list'); 
  c.innerHTML = '<div class="loader mx-auto"></div>';
  
  // Only fetch once from Firestore
  if (allDocuments.length === 0) {
    try {
      const snap = await getDocs(collection(db, "documents_global"));
      snap.forEach(d => {
        allDocuments.push({ id: d.id, ...d.data() });
      });
      // Sort by newest first
      allDocuments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch(e) {
      console.error(e);
      c.innerHTML = '<p class="text-red-500 text-center">Lỗi tải tài liệu.</p>';
      return;
    }
  }

  renderDocsList();
}

function renderDocsList() {
  const c = document.getElementById('docs-list');
  c.innerHTML = '';

  const filteredDocs = currentDocCategory === 'all' 
    ? allDocuments 
    : allDocuments.filter(d => d.category === currentDocCategory);

  if(filteredDocs.length === 0) { 
    c.innerHTML = '<p class="text-muted text-center py-8">Chưa có tài liệu nào trong môn này.</p>'; 
    return; 
  }

  filteredDocs.forEach(data => {
    // Show badge only in "all" view, or always show it
    const categoryBadge = data.category ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase">${data.category}</span>` : '';
    
    c.innerHTML += `
      <div class="glass-card bg-card p-4 rounded-xl border border-theme flex justify-between items-center hover:border-blue-300 transition-colors">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center glow-blue"><i data-lucide="file-text" class="w-5 h-5"></i></div>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h4 class="font-bold text-main leading-tight">${data.title}</h4>
              ${categoryBadge}
            </div>
            <p class="text-xs text-muted">Upload: ${new Date(data.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <a href="${data.url}" target="_blank" class="btn-primary !px-4 !py-2 text-sm flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Tải file</a>
      </div>
    `;
  });
  lucide.createIcons({ root: c });
}

// Attach event listeners to document category tabs
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.doc-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Update UI
      tabs.forEach(t => {
        t.classList.remove('active', 'bg-blue-500', 'text-white');
        t.classList.add('bg-card', 'border', 'border-theme', 'text-muted');
      });
      const target = e.currentTarget;
      target.classList.remove('bg-card', 'border', 'border-theme', 'text-muted');
      target.classList.add('active', 'bg-blue-500', 'text-white');

      // Update state & render
      currentDocCategory = target.getAttribute('data-cat');
      renderDocsList();
    });
  });
});

async function loadDiscovery() {
  const c = document.getElementById('discovery-grid'); c.innerHTML = '<div class="loader mx-auto col-span-full"></div>';
  const snap = await getDocs(collection(db, "discovery")); c.innerHTML = '';
  if(snap.empty) { c.innerHTML = '<p class="text-muted">Chưa có nội dung.</p>'; return; }
  snap.forEach(d => {
    const data = d.data();
    c.innerHTML += `
      <div class="glass-card bg-card rounded-2xl border border-theme overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
        ${data.imageUrl ? `<img src="${data.imageUrl}" class="w-full h-40 object-cover">` : ''}
        <div class="p-5 flex-1 flex flex-col">
          <h4 class="font-bold text-main mb-2">${data.title}</h4>
          <p class="text-sm text-muted mb-4 flex-1">${data.description}</p>
          <a href="${data.url}" target="_blank" class="text-purple-500 font-bold text-sm hover:underline flex items-center gap-1"><i data-lucide="external-link" class="w-4 h-4"></i> Xem chi tiết</a>
        </div>
      </div>
    `;
  });
  lucide.createIcons();
}

async function loadQA() {
  const c = document.getElementById('qa-feed'); c.innerHTML = '<div class="loader mx-auto"></div>';
  const snap = await getDocs(collection(db, "qa")); c.innerHTML = '';
  
  let count = 0;
  snap.forEach(d => {
    const data = d.data();
    if (!data.isApproved) return; // Chỉ hiện public câu đã duyệt
    count++;
    
    let answersHtml = '';
    if (data.answers && data.answers.length > 0) {
      answersHtml = `
        <div class="mt-4 pt-4 border-t border-theme space-y-3 pl-4 border-l-2 border-orange-400">
          ${data.answers.map(ans => {
            const isAdmin = ans.userEmail === 'duongngoclam28022008@gmail.com';
            return `
            <div class="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl">
              <p class="text-xs font-bold ${isAdmin ? 'text-orange-500' : 'text-main'} flex items-center gap-1 mb-1">
                ${isAdmin ? '<i data-lucide="shield-check" class="w-3 h-3"></i> Admin' : ans.userEmail.split('@')[0]} 
                <span class="text-[10px] font-normal text-muted ml-2">${new Date(ans.createdAt).toLocaleString()}</span>
              </p>
              <p class="text-sm text-main">${ans.answer}</p>
            </div>
          `}).join('')}
        </div>
      `;
    }

    c.innerHTML += `
      <div class="glass-card bg-card p-5 rounded-2xl border border-theme hover:border-orange-200 transition-colors">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-xs">${data.userEmail[0].toUpperCase()}</div>
          <div>
            <p class="text-sm font-bold text-main">${data.userEmail.split('@')[0]}</p>
            <p class="text-[10px] text-muted">${new Date(data.createdAt).toLocaleString('vi-VN')}</p>
          </div>
        </div>
        <p class="text-main font-medium text-sm leading-relaxed mb-4">${data.question}</p>
        ${answersHtml}
        
        <div class="mt-3 pt-3 border-t border-theme">
          <div class="flex gap-2">
            <input type="text" id="reply-input-${d.id}" class="input-glass flex-1 !py-1.5 text-sm" placeholder="Viết bình luận...">
            <button class="bg-slate-100 dark:bg-slate-800 text-main px-3 rounded-xl hover:bg-slate-200" onclick="window.replyQA('${d.id}')"><i data-lucide="send" class="w-4 h-4"></i></button>
          </div>
        </div>
      </div>
    `;
  });
  
  if(count === 0) c.innerHTML = '<p class="text-muted text-center py-8">Chưa có câu hỏi nào được công khai.</p>';
  lucide.createIcons();
}

document.getElementById('btn-submit-qa').addEventListener('click', async () => {
  if (!currentUser) { showToast("Vui lòng đăng nhập!", true); return; }
  const val = document.getElementById('qa-input').value.trim();
  if(!val) return;
  await addDoc(collection(db, "qa"), {
    userEmail: currentUser.email,
    question: val,
    isApproved: false,
    createdAt: new Date().toISOString()
  });
  document.getElementById('qa-input').value = '';
  showToast("Đã gửi câu hỏi. Đang chờ Admin duyệt.");
});

window.replyQA = async (id) => {
  if (!currentUser) { showToast("Vui lòng đăng nhập!", true); return; }
  const input = document.getElementById(`reply-input-${id}`);
  const text = input.value.trim();
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
  
  await updateDoc(docRef, { answers });
  input.value = '';
  showToast("Đã trả lời");
  loadQA();
}

// ============================================================
// PROFILE MODULE
// ============================================================

function updateProfileCompletionBar(data) {
  const fields = ['fullName', 'phone', 'dob', 'school', 'grade'];
  const filled = fields.filter(f => data[f] && data[f].toString().trim() !== '').length;
  const total = fields.length;
  const pct = Math.round((filled / total) * 100);

  const bar = document.getElementById('profile-completion-bar');
  const pctEl = document.getElementById('profile-completion-pct');
  const tip = document.getElementById('profile-completion-tip');
  if (!bar || !pctEl) return;

  bar.style.width = pct + '%';
  pctEl.textContent = pct + '%';

  if (pct === 100) {
    bar.style.background = 'linear-gradient(to right, #22c55e, #16a34a)';
    pctEl.className = 'text-sm font-black text-green-500';
    if(tip) tip.textContent = '✅ Hồ sơ hoàn thiện! Bạn đã điền đầy đủ thông tin.';
  } else if (pct >= 60) {
    if(tip) tip.textContent = `Đã điền ${filled}/${total} mục. Hãy hoàn thiện nốt để đạt 100%!`;
  } else {
    if(tip) tip.textContent = `Đã điền ${filled}/${total} mục. Hãy điền thêm thông tin để nhận huy hiệu hoàn thiện!`;
  }
}

async function loadProfile() {
  if (!currentUser) {
    showToast("Đăng nhập để xem hồ sơ cá nhân!", true);
    return;
  }

  // Set basics from Google Auth
  const avatarImg = document.getElementById('profile-avatar-img');
  const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
  const displayName = document.getElementById('profile-display-name');
  const emailDisplay = document.getElementById('profile-email-display');
  const joinedEl = document.getElementById('profile-joined');

  if (displayName) displayName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
  if (emailDisplay) emailDisplay.textContent = currentUser.email;

  // Show avatar from Google or photoURL
  const photoSrc = currentUser.photoURL;
  if (photoSrc && avatarImg) {
    avatarImg.src = photoSrc;
    avatarImg.classList.remove('hidden');
    if(avatarPlaceholder) avatarPlaceholder.classList.add('hidden');
  } else if (avatarPlaceholder) {
    avatarPlaceholder.textContent = (currentUser.email[0] || 'A').toUpperCase();
  }

  // Join date from auth metadata
  if (joinedEl && currentUser.metadata?.creationTime) {
    const d = new Date(currentUser.metadata.creationTime);
    joinedEl.textContent = 'Thành viên từ ' + d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  }

  // Load from Firestore
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.email));
    const data = snap.exists() ? snap.data() : {};

    const v = (id, field) => {
      const el = document.getElementById(id);
      if(el) el.value = data[field] || '';
    };
    v('pf-fullname', 'fullName');
    v('pf-phone', 'phone');
    v('pf-dob', 'dob');
    v('pf-school', 'school');
    v('pf-grade', 'grade');

    // Update display name to fullName if available
    if (data.fullName && displayName) displayName.textContent = data.fullName;

    // Update completion bar
    updateProfileCompletionBar(data);

    if (typeof loadAIKeyPool === 'function') loadAIKeyPool();
  } catch(e) {
    console.error(e);
  }

  // Re-init lucide for new icons
  lucide.createIcons();

  // Live update completion bar as user types
  ['pf-fullname','pf-phone','pf-dob','pf-school','pf-grade'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', () => {
      const currentData = {
        fullName: document.getElementById('pf-fullname')?.value,
        phone:    document.getElementById('pf-phone')?.value,
        dob:      document.getElementById('pf-dob')?.value,
        school:   document.getElementById('pf-school')?.value,
        grade:    document.getElementById('pf-grade')?.value,
      };
      updateProfileCompletionBar(currentData);
    });
  });
}

async function saveProfile() {
  if (!currentUser) { showToast("Đăng nhập để lưu hồ sơ!", true); return; }

  const btn = document.getElementById('btn-save-profile');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div class="loader !w-5 !h-5 !border-2 !border-white !border-t-transparent mx-auto"></div>';
  btn.disabled = true;

  const profileData = {
    fullName: document.getElementById('pf-fullname')?.value.trim() || '',
    phone:    document.getElementById('pf-phone')?.value.trim() || '',
    dob:      document.getElementById('pf-dob')?.value || '',
    school:   document.getElementById('pf-school')?.value.trim() || '',
    grade:    document.getElementById('pf-grade')?.value || '',
    email:    currentUser.email,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'users', currentUser.email), profileData, { merge: true });

    // Update display name on card
    const dn = document.getElementById('profile-display-name');
    if (dn && profileData.fullName) dn.textContent = profileData.fullName;

    updateProfileCompletionBar(profileData);
    showToast('🎉 Đã lưu hồ sơ thành công!');
  } catch(e) {
    console.error(e);
    showToast('Lỗi khi lưu hồ sơ. Vui lòng thử lại!', true);
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    lucide.createIcons();
  }
}

// Avatar upload handler
const photoInput = document.getElementById('profile-photo-input');
if (photoInput) {
  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Ảnh quá lớn! Vui lòng chọn ảnh nhỏ hơn 5MB.', true);
      return;
    }

    const progressWrap = document.getElementById('upload-progress-wrap');
    const progressBar = document.getElementById('upload-progress-bar');
    const uploadPct = document.getElementById('upload-pct');
    if(progressWrap) progressWrap.classList.remove('hidden');

    const storageRef = ref(storage, `avatars/${currentUser.email}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if(progressBar) progressBar.style.width = pct + '%';
        if(uploadPct) uploadPct.textContent = pct + '%';
      },
      (err) => {
        console.error(err);
        showToast('Lỗi tải ảnh!', true);
        if(progressWrap) progressWrap.classList.add('hidden');
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);

        // Update Auth profile
        try {
          const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js');
          await updateProfile(auth.currentUser, { photoURL: url });
        } catch(e) { console.error(e); }

        // Update Firestore
        await setDoc(doc(db, 'users', currentUser.email), { photoURL: url }, { merge: true });

        // Update UI
        const avatarImg = document.getElementById('profile-avatar-img');
        const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
        if(avatarImg) { avatarImg.src = url; avatarImg.classList.remove('hidden'); }
        if(avatarPlaceholder) avatarPlaceholder.classList.add('hidden');

        if(progressWrap) progressWrap.classList.add('hidden');
        showToast('✨ Đã cập nhật ảnh đại diện thành công!');
      }
    );
  });
}

// Save profile button
const btnSaveProfile = document.getElementById('btn-save-profile');
if (btnSaveProfile) btnSaveProfile.addEventListener('click', saveProfile);

// ============================================================
// HAPTIC FEEDBACK
// ============================================================
function haptic(duration = 10) {
  try { if (navigator.vibrate) navigator.vibrate(duration); } catch(e) {}
}

// ============================================================
// SKELETON SCREENS (replace loaders)
// ============================================================
function skeletonNews(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton-news">
      <div class="skeleton-news-img"></div>
      <div class="skeleton-news-body">
        <div class="skeleton-text-xs" style="width:40%"></div>
        <div class="skeleton-text-sm" style="width:85%"></div>
        <div class="skeleton-text-sm" style="width:70%"></div>
        <div class="skeleton-text-xs" style="width:55%"></div>
      </div>
    </div>`;
  }
  return html;
}

function skeletonDocs(count = 4) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton-doc">
      <div class="skeleton-circle" style="width:40px;height:40px"></div>
      <div style="flex:1">
        <div class="skeleton-text-sm" style="width:60%"></div>
        <div class="skeleton-text-xs" style="width:35%"></div>
      </div>
    </div>`;
  }
  return html;
}

function skeletonQA(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton-qa">
      <div class="skeleton-qa-header">
        <div class="skeleton-circle" style="width:36px;height:36px"></div>
        <div style="flex:1">
          <div class="skeleton-text-sm" style="width:50%"></div>
          <div class="skeleton-text-xs" style="width:30%"></div>
        </div>
      </div>
      <div class="skeleton-text-sm" style="width:90%"></div>
      <div class="skeleton-text-sm" style="width:75%"></div>
    </div>`;
  }
  return html;
}

// Patch loaders with skeleton screens
const _origLoadNews = loadNews;
window.loadNews = async function() {
  const c = document.getElementById('news-grid');
  if (c) c.innerHTML = skeletonNews(3);
  await _origLoadNews();
};

const _origLoadDocs = loadDocs;
window.loadDocs = async function() {
  const c = document.getElementById('docs-list');
  if (c) c.innerHTML = skeletonDocs(4);
  await _origLoadDocs();
};

const _origLoadQA = loadQA;
window.loadQA = async function() {
  const c = document.getElementById('qa-feed');
  if (c) c.innerHTML = skeletonQA(3);
  await _origLoadQA();
};

// ============================================================
// BOTTOM SHEET SYSTEM
// ============================================================
function openBottomSheet(sheetId, backdropId) {
  haptic(8);
  const sheet = document.getElementById(sheetId);
  const backdrop = document.getElementById(backdropId);
  if (!sheet || !backdrop) return;
  backdrop.classList.remove('hidden');
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });
  // Swipe down to close
  if (window.Hammer) {
    const mc = new Hammer(sheet);
    mc.get('swipe').set({ direction: Hammer.DIRECTION_DOWN });
    mc.on('swipedown', () => closeBottomSheet(sheetId, backdropId));
  }
}

function closeBottomSheet(sheetId, backdropId) {
  const sheet = document.getElementById(sheetId);
  const backdrop = document.getElementById(backdropId);
  if (!sheet || !backdrop) return;
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => backdrop.classList.add('hidden'), 300);
}

// Close buttons
const btnCloseNotif = document.getElementById('btn-close-notif');
if (btnCloseNotif) btnCloseNotif.addEventListener('click', () => closeBottomSheet('notif-sheet','notif-backdrop'));
const notifBackdrop = document.getElementById('notif-backdrop');
if (notifBackdrop) notifBackdrop.addEventListener('click', () => closeBottomSheet('notif-sheet','notif-backdrop'));

const btnCloseLecture = document.getElementById('btn-close-lecture-sheet');
if (btnCloseLecture) btnCloseLecture.addEventListener('click', () => closeBottomSheet('lecture-sheet','lecture-sheet-backdrop'));
const lectBackdrop = document.getElementById('lecture-sheet-backdrop');
if (lectBackdrop) lectBackdrop.addEventListener('click', () => closeBottomSheet('lecture-sheet','lecture-sheet-backdrop'));

// Lecture sheet syncs from sidebar outline on mobile
function syncLectureSheet() {
  const content = document.getElementById('lecture-sheet-content');
  const outline = document.getElementById('course-outline');
  if (!content || !outline) return;
  content.innerHTML = outline.innerHTML;
  // Re-attach click handlers
  content.querySelectorAll('li').forEach((li, i) => {
    const original = outline.querySelectorAll('li')[i];
    if (original) li.addEventListener('click', () => {
      original.click();
      closeBottomSheet('lecture-sheet','lecture-sheet-backdrop');
    });
  });
  lucide.createIcons({ root: content });
}

// ============================================================
// NOTIFICATION CENTER
// ============================================================
let allNotifications = [];
let readNotifIds = new Set(JSON.parse(localStorage.getItem('readNotifs') || '[]'));

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  try {
    // Collect from news, qa answers, and personal notifications
    const promises = [
      getDocs(collection(db, 'news')),
      getDocs(collection(db, 'qa'))
    ];
    
    if (currentUser && currentUser.email) {
      const q = query(collection(db, 'notifications'), where('email', '==', currentUser.email));
      promises.push(getDocs(q));
    }

    const results = await Promise.all(promises);
    const newsSnap = results[0];
    const qaSnap = results[1];
    const notifSnap = results[2];
    
    allNotifications = [];

    newsSnap.forEach(d => {
      const data = d.data();
      allNotifications.push({
        id: 'news_' + d.id,
        type: 'news',
        title: 'Bài mới: ' + data.title,
        body: data.content?.substring(0, 80) + '...',
        time: data.createdAt,
        icon: 'newspaper',
        color: 'text-blue-500',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        action: () => window.changeMainView('view-news')
      });
    });

    qaSnap.forEach(d => {
      const data = d.data();
      if (data.answers && data.answers.length > 0) {
        allNotifications.push({
          id: 'qa_' + d.id,
          type: 'qa',
          title: 'Admin đã trả lời câu hỏi của bạn',
          body: data.question?.substring(0, 60) + '...',
          time: data.answers[data.answers.length - 1].createdAt,
          icon: 'message-square',
          color: 'text-green-500',
          bg: 'bg-green-50 dark:bg-green-900/20',
          action: () => window.changeMainView('view-qa')
        });
      }
    });

    if (notifSnap) {
      notifSnap.forEach(d => {
        const data = d.data();
        allNotifications.push({
          id: 'personal_' + d.id,
          type: data.type || 'system',
          title: data.title,
          body: data.body,
          time: data.createdAt,
          icon: data.icon || 'bell',
          color: data.color || 'text-purple-500',
          bg: data.bg || 'bg-purple-50 dark:bg-purple-900/20',
          action: () => window.changeMainView('view-my-courses')
        });
      });
    }

    // Add daily study reminder
    const today = new Date().toISOString().split('T')[0];
    allNotifications.push({
      id: 'reminder_' + today,
      type: 'reminder',
      title: '⏰ Nhắc nhở học tập hôm nay',
      body: 'Đừng quên hoàn thành bài giảng của ngày hôm nay nhé!',
      time: new Date().toISOString(),
      icon: 'alarm-clock',
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      action: () => window.changeMainView('view-my-courses')
    });

    // Sort by time desc
    allNotifications.sort((a, b) => new Date(b.time) - new Date(a.time));
    allNotifications = allNotifications.slice(0, 20); // limit 20

    renderNotifications();
  } catch(e) {
    console.error('Notification load error:', e);
  }
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  const unread = allNotifications.filter(n => !readNotifIds.has(n.id));
  const badge = document.getElementById('notif-badge');
  const mobileDot = document.getElementById('mobile-notif-dot');
  
  if (unread.length > 0) {
    if (badge) { badge.textContent = unread.length > 9 ? '9+' : unread.length; badge.classList.remove('hidden'); }
    if (mobileDot) mobileDot.classList.remove('hidden');
  } else {
    if (badge) badge.classList.add('hidden');
    if (mobileDot) mobileDot.classList.add('hidden');
  }

  if (allNotifications.length === 0) {
    list.innerHTML = `<div class="flex flex-col items-center py-8 text-muted">
      <i data-lucide="bell-off" class="w-10 h-10 mb-3 opacity-30"></i>
      <p class="text-sm font-medium">Chưa có thông báo</p>
    </div>`;
    lucide.createIcons({ root: list });
    return;
  }

  list.innerHTML = allNotifications.map(n => {
    const isRead = readNotifIds.has(n.id);
    const timeStr = new Date(n.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    return `<div class="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!isRead ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}" data-notif-id="${n.id}" onclick="window.openNotif('${n.id}')">
      <div class="w-10 h-10 rounded-xl ${n.bg} ${n.color} flex items-center justify-center shrink-0">
        <i data-lucide="${n.icon}" class="w-5 h-5"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-main ${!isRead ? '' : 'opacity-70'} leading-tight">${n.title}</p>
        <p class="text-xs text-muted mt-0.5 line-clamp-2">${n.body}</p>
        <p class="text-[10px] text-muted mt-1 font-medium">${timeStr}</p>
      </div>
      ${!isRead ? '<div class="w-2 h-2 bg-orange-500 rounded-full shrink-0 mt-1.5"></div>' : ''}
    </div>`;
  }).join('');
  lucide.createIcons({ root: list });
}

window.openNotif = (id) => {
  readNotifIds.add(id);
  localStorage.setItem('readNotifs', JSON.stringify([...readNotifIds]));
  const notif = allNotifications.find(n => n.id === id);
  if (notif?.action) { notif.action(); closeBottomSheet('notif-sheet', 'notif-backdrop'); }
  renderNotifications();
};

const btnMarkAllRead = document.getElementById('btn-mark-all-read');
if (btnMarkAllRead) btnMarkAllRead.addEventListener('click', () => {
  allNotifications.forEach(n => readNotifIds.add(n.id));
  localStorage.setItem('readNotifs', JSON.stringify([...readNotifIds]));
  renderNotifications();
  haptic(5);
});

// Bell button opens notification sheet
const btnNotif = document.getElementById('btn-notification');
if (btnNotif) btnNotif.addEventListener('click', () => {
  openBottomSheet('notif-sheet', 'notif-backdrop');
  loadNotifications();
  haptic(8);
});

// ============================================================
// GLOBAL SEARCH
// ============================================================
let allNews = [], allDocs = [];

async function ensureSearchData() {
  if (allNews.length === 0) {
    try {
      const snap = await getDocs(collection(db, 'news'));
      allNews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}
  }
  if (allDocs.length === 0) {
    try {
      const snap = await getDocs(collection(db, 'documents_global'));
      allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}
  }
}

function buildSearchResults(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results = [];

  // Courses
  const matchCourses = allCourses.filter(c => c.title?.toLowerCase().includes(q)).slice(0, 3);
  matchCourses.forEach(c => results.push({
    type: 'course', icon: 'book-open-check', iconBg: 'bg-orange-100 text-orange-500',
    title: c.title, sub: 'Khóa học',
    thumb: c.thumbnailUrl,
    action: () => { if(currentUser) goToLearningView(c.id); else window.changeMainView('view-my-courses'); }
  }));

  // Docs
  const matchDocs = allDocs.filter(d => d.title?.toLowerCase().includes(q)).slice(0, 3);
  matchDocs.forEach(d => results.push({
    type: 'doc', icon: 'file-text', iconBg: 'bg-blue-100 text-blue-500',
    title: d.title, sub: 'Tài liệu PDF',
    action: () => window.changeMainView('view-docs')
  }));

  // News
  const matchNews = allNews.filter(n => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q)).slice(0, 2);
  matchNews.forEach(n => results.push({
    type: 'news', icon: 'newspaper', iconBg: 'bg-green-100 text-green-500',
    title: n.title, sub: 'Tin tức',
    action: () => window.changeMainView('view-news')
  }));

  return results;
}

function renderSearchResults(results, contentEl, dropdownEl) {
  if (!contentEl || !dropdownEl) return;
  if (results.length === 0) {
    contentEl.innerHTML = `<div class="flex flex-col items-center py-6 text-muted"><i data-lucide="search-x" class="w-8 h-8 mb-2 opacity-40"></i><p class="text-sm">Không tìm thấy kết quả</p></div>`;
    lucide.createIcons({ root: contentEl });
    dropdownEl.classList.remove('hidden');
    return;
  }
  contentEl.innerHTML = results.map(r => `
    <div class="search-result-item" data-action="search-item">
      ${r.thumb
        ? `<img src="${r.thumb}" class="search-result-thumb" onerror="this.style.display='none'">`
        : `<div class="search-result-icon ${r.iconBg}"><i data-lucide="${r.icon}" class="w-4 h-4"></i></div>`
      }
      <div>
        <p class="search-result-title">${r.title}</p>
        <p class="search-result-sub">${r.sub}</p>
      </div>
    </div>
  `).join('');
  // Bind clicks
  contentEl.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.addEventListener('click', () => { results[i].action(); haptic(8); dropdownEl.classList.add('hidden'); });
  });
  lucide.createIcons({ root: contentEl });
  dropdownEl.classList.remove('hidden');
}

let searchDebounce = null;
function initGlobalSearch(inputId, contentId, dropdownId) {
  const input = document.getElementById(inputId);
  const content = document.getElementById(contentId);
  const dropdown = document.getElementById(dropdownId);
  const clearBtn = inputId === 'global-search-input' ? document.getElementById('btn-clear-search') : null;
  if (!input) return;

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.classList.toggle('hidden', !q);
    clearTimeout(searchDebounce);
    if (!q) { if (dropdown) dropdown.classList.add('hidden'); return; }
    searchDebounce = setTimeout(async () => {
      await ensureSearchData();
      renderSearchResults(buildSearchResults(q), content, dropdown);
    }, 200);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim() && dropdown) dropdown.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (dropdown && !input.closest('.relative')?.contains(e.target)) dropdown.classList.add('hidden');
  });
}

initGlobalSearch('global-search-input', 'search-results-content', 'search-dropdown');
initGlobalSearch('mobile-search-input', 'mobile-search-results', 'mobile-search-dropdown');

if (document.getElementById('btn-clear-search')) {
  document.getElementById('btn-clear-search').addEventListener('click', () => {
    const inp = document.getElementById('global-search-input');
    if (inp) { inp.value = ''; inp.focus(); }
    document.getElementById('btn-clear-search').classList.add('hidden');
    document.getElementById('search-dropdown')?.classList.add('hidden');
  });
}

const btnMobileSearch = document.getElementById('btn-mobile-search');
if (btnMobileSearch) btnMobileSearch.addEventListener('click', () => {
  const bar = document.getElementById('mobile-search-bar');
  if (bar) { bar.classList.remove('hidden'); bar.querySelector('input')?.focus(); }
  haptic(5);
});

// ============================================================
// SWIPE GESTURES (Hammer.js)
// ============================================================
const TAB_ORDER = ['view-dashboard', 'view-my-courses', 'view-news', 'view-profile'];

function initSwipeGestures() {
  if (typeof Hammer === 'undefined') return;
  const container = document.getElementById('main-views-container');
  if (!container) return;

  const mc = new Hammer.Manager(container);
  mc.add(new Hammer.Swipe({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 50, velocity: 0.3 }));

  mc.on('swipeleft swiperight', (ev) => {
    // Don't swipe if inside a scrollable element (like course list)
    if (ev.target.closest('.overflow-x-auto, .video-slider, .tab-menu')) return;
    
    const current = TAB_ORDER.find(v => !document.getElementById(v)?.classList.contains('hidden'));
    if (!current) return;
    let idx = TAB_ORDER.indexOf(current);
    
    if (ev.type === 'swipeleft' && idx < TAB_ORDER.length - 1) {
      haptic(5);
      window.navTo(TAB_ORDER[idx + 1]);
    } else if (ev.type === 'swiperight' && idx > 0) {
      haptic(5);
      window.navTo(TAB_ORDER[idx - 1]);
    }
  });
}

// ============================================================
// NAVIGATION HELPERS
// ============================================================
window.navTo = (viewId, element = null) => {
  window.changeMainView(viewId, element);
};

// ============================================================
// CUSTOM VIDEO PLAYER CONTROLS
// ============================================================
let playerIsPlaying = false;
let currentPlaybackRate = 1;

function initCustomPlayerControls() {
  const controls = document.getElementById('custom-player-controls');
  const playerWrap = document.getElementById('video-player-wrap');
  if (!controls || !playerWrap) return;

  controls.classList.remove('hidden');

  // Auto-hide controls
  let hideTimer;
  function showControls() {
    controls.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => controls.classList.remove('visible'), 3000);
  }

  const container = document.getElementById('video-container-wrap');
  if (container) {
    container.addEventListener('mousemove', showControls, { passive: true });
    container.addEventListener('touchstart', showControls, { passive: true });
  }

  function postToIframe(action) {
    const iframe = playerWrap.querySelector('iframe');
    if (!iframe) return;
    try {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: action, args: [] }), '*');
    } catch(e) {}
  }

  const ctrlPlay = document.getElementById('ctrl-play-pause');
  const playIcon = document.getElementById('ctrl-play-icon');

  if (ctrlPlay) ctrlPlay.addEventListener('click', () => {
    haptic(10);
    if (playerIsPlaying) {
      postToIframe('pauseVideo');
      playerIsPlaying = false;
      if (playIcon) playIcon.setAttribute('data-lucide', 'play');
    } else {
      postToIframe('playVideo');
      playerIsPlaying = true;
      if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
    }
    lucide.createIcons({ root: ctrlPlay.parentElement });
  });

  const ctrlRewind = document.getElementById('ctrl-rewind');
  if (ctrlRewind) ctrlRewind.addEventListener('click', () => {
    haptic(8);
    postToIframe('seekBy:-10');
  });

  const ctrlFwd = document.getElementById('ctrl-forward');
  if (ctrlFwd) ctrlFwd.addEventListener('click', () => {
    haptic(8);
    postToIframe('seekBy:10');
  });

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPlaybackRate = parseFloat(btn.dataset.speed);
      postToIframe(`setPlaybackRate:${currentPlaybackRate}`);
    });
  });
}

// Patch loadVideoIframe to init custom controls after load
const _origLoadVideoIframe = loadVideoIframe;
window._initCustomControlsOnLoad = () => {
  // Small delay to ensure iframe is ready
  setTimeout(() => {
    playerIsPlaying = true;
    const playIcon = document.getElementById('ctrl-play-icon');
    if (playIcon) { playIcon.setAttribute('data-lucide', 'pause'); lucide.createIcons({ root: playIcon.parentElement }); }
    initCustomPlayerControls();
  }, 1500);
};

// ============================================================
// ACTIVITY LOG (write lastSeen to Firestore for admin)
// ============================================================
async function recordActivity() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'activity_log', currentUser.email), {
      email: currentUser.email,
      lastSeen: new Date().toISOString(),
      displayName: currentUser.displayName || currentUser.email.split('@')[0]
    }, { merge: true });
  } catch(e) {}
}

// Record on auth + every 5 minutes
let activityInterval;
const origOnAuth = onAuthStateChanged;
// Hook into the existing auth flow via post-auth actions
setTimeout(() => {
  if (currentUser) {
    recordActivity();
    activityInterval = setInterval(recordActivity, 5 * 60 * 1000);
  }
}, 3000);

// ============================================================
// INIT ALL NEW FEATURES
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initSwipeGestures();
  loadNotifications();

  // Add haptic to important buttons
  const hapticBtns = ['btn-submit-qa', 'btn-save-profile', 'btn-mark-done', 'btn-focus-mode'];
  hapticBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => haptic(10));
  });

  // Spring + haptic on mobile nav
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(6);
      btn.classList.add('haptic-pulse');
      setTimeout(() => btn.classList.remove('haptic-pulse'), 300);
    });
  });
});

// Wrap in safety check for existing function
if (typeof window.markLectureDone === 'function' || typeof markLectureDone === 'function') {
  const _origMarkDone = window.markLectureDone || markLectureDone;
  window.markLectureDone = (lectureId, isDone) => {
    haptic(10);
    _origMarkDone(lectureId, isDone);
    recordActivity();
  };
}


// ============================================================
// ACTIVATION KEY SYSTEM
// ============================================================

const RATE_LIMIT_KEY = 'khv_key_attempts';
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getAttemptData() {
  try {
    return JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '{"count":0,"resetAt":0}');
  } catch { return { count: 0, resetAt: 0 }; }
}

function saveAttemptData(data) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
}

function isRateLimited() {
  const data = getAttemptData();
  if (data.count >= RATE_LIMIT_MAX && Date.now() < data.resetAt) return true;
  // Reset if expired
  if (Date.now() >= data.resetAt) saveAttemptData({ count: 0, resetAt: 0 });
  return false;
}

function recordFailedAttempt() {
  const data = getAttemptData();
  if (Date.now() >= data.resetAt) {
    saveAttemptData({ count: 1, resetAt: Date.now() + RATE_LIMIT_DURATION_MS });
  } else {
    data.count++;
    saveAttemptData(data);
  }
}

function resetAttempts() {
  saveAttemptData({ count: 0, resetAt: 0 });
}

function showRateLimitWarning() {
  const warning = document.getElementById('key-rate-limit-warning');
  const msg = document.getElementById('key-rate-limit-msg');
  const data = getAttemptData();
  if (warning && msg) {
    const remaining = Math.ceil((data.resetAt - Date.now()) / 60000);
    msg.textContent = `Nhập sai ${RATE_LIMIT_MAX} lần liên tiếp. Vui lòng thử lại sau ${remaining} phút.`;
    warning.classList.remove('hidden');
  }
}

function hideRateLimitWarning() {
  const warning = document.getElementById('key-rate-limit-warning');
  if (warning) warning.classList.add('hidden');
}

/** Show the activation success modal with confetti */
function showActivationSuccess(courseNames) {
  const modal = document.getElementById('activation-success-modal');
  const inner = document.getElementById('activation-modal-inner');
  const namesContainer = document.getElementById('activation-course-names');

  if (namesContainer) {
    namesContainer.innerHTML = courseNames.map(name =>
      `<div class="flex items-center justify-center gap-2 py-2 px-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
        <i data-lucide="book-open" class="w-4 h-4 text-orange-500 shrink-0"></i>
        <span class="font-bold text-main text-sm">${name}</span>
      </div>`
    ).join('');
    lucide.createIcons({ root: namesContainer });
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
      if (inner) { inner.classList.remove('scale-90', 'opacity-0'); inner.classList.add('scale-100', 'opacity-100'); }
    });
  }

  // Fire confetti
  if (typeof confetti === 'function') {
    const end = Date.now() + 3000;
    (function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 80, origin: { x: 0, y: 0.7 }, colors: ['#f97316', '#fb923c', '#fbbf24'] });
      confetti({ particleCount: 6, angle: 120, spread: 80, origin: { x: 1, y: 0.7 }, colors: ['#f97316', '#fb923c', '#fbbf24'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    }());
  }
}

/** Render the list of already unlocked courses in the profile card */
function renderUnlockedCoursesList() {
  const container = document.getElementById('unlocked-courses-list');
  const items = document.getElementById('unlocked-courses-items');
  if (!container || !items) return;

  const unlockedIds = userProgress.unlockedCourses || [];
  if (unlockedIds.length === 0) { container.classList.add('hidden'); return; }

  container.classList.remove('hidden');
  items.innerHTML = unlockedIds.map(cId => {
    const course = allCourses.find(c => c.id === cId);
    return course
      ? `<div class="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
          <i data-lucide="check-circle-2" class="w-4 h-4 text-green-500 shrink-0"></i>
          <span class="text-sm font-semibold text-main">${course.title}</span>
        </div>`
      : '';
  }).join('');
  lucide.createIcons({ root: items });
}

/** Main activation logic */
async function activateKey(keyCode) {
  if (!currentUser) { showToast('Vui lòng đăng nhập trước!', true); return; }

  const trimmedKey = keyCode.trim().toUpperCase();
  if (!trimmedKey) { showToast('Vui lòng nhập mã kích hoạt!', true); return; }

  if (isRateLimited()) { showRateLimitWarning(); return; }

  const btnText = document.getElementById('btn-activate-text');
  const btn = document.getElementById('btn-activate-key');
  const input = document.getElementById('activation-key-input');

  if (btn) { btn.disabled = true; }
  if (btnText) btnText.textContent = 'Đang kiểm tra...';

  try {
    const keyRef = doc(db, 'activation_keys', trimmedKey);
    const keySnap = await getDoc(keyRef);

    if (!keySnap.exists()) {
      recordFailedAttempt();
      if (isRateLimited()) showRateLimitWarning();
      showToast('Mã kích hoạt không tồn tại!', true);
      return;
    }

    const keyData = keySnap.data();

    if (keyData.isUsed) {
      showToast('Mã này đã được sử dụng rồi!', true);
      return;
    }

    const unlockIds = keyData.courseIds || [];
    // Find course names for the modal
    const courseNames = unlockIds.map(cId => {
      const c = allCourses.find(x => x.id === cId);
      return c ? c.title : cId;
    });

    // Use a batch to update both the key and the user's progress atomically
    const batch = writeBatch(db);

    // 1. Mark key as used
    batch.update(keyRef, {
      isUsed: true,
      usedBy: currentUser.email,
      usedAt: new Date().toISOString()
    });

    // 2. Add courseIds to user's unlockedCourses using arrayUnion
    if (unlockIds.length > 0) {
      const progressRef = doc(db, 'progress', currentUser.email);
      batch.set(progressRef, { 
        unlockedCourses: arrayUnion(...unlockIds) 
      }, { merge: true });
    }

    // Execute the atomic transaction
    await batch.commit();

    // Send a notification to the user's inbox
    try {
      if (unlockIds.length > 0) {
        await addDoc(collection(db, 'notifications'), {
          email: currentUser.email,
          title: `🎉 Kích hoạt thành công ${courseNames.length} khóa học!`,
          body: `Chào mừng bạn đến với khóa học! Bạn đã nhận được các khóa học: ${courseNames.join(', ')}. Hãy bắt đầu học ngay nhé!`,
          createdAt: new Date().toISOString(),
          icon: 'gift',
          color: 'text-orange-500',
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          type: 'activation'
        });
      }
      // Refresh notifications silently
      loadNotifications();
    } catch(e) { console.error('Failed to send notification', e); }

    // Update local state after successful commit
    const existingUnlocked = userProgress.unlockedCourses || [];
    const newUnlocked = [...new Set([...existingUnlocked, ...unlockIds])];
    userProgress.unlockedCourses = newUnlocked;

    // Reset rate limit on success
    resetAttempts();
    hideRateLimitWarning();

    if (input) input.value = '';

    // ✅ Toast ngay lập tức
    const courseCount = courseNames.length;
    showToast(`🎉 Kích hoạt thành công ${courseCount} khóa học!`);

    // Sau đó mới hiện modal + confetti
    setTimeout(() => {
      showActivationSuccess(courseNames);
    }, 400);

    renderCourseGrid();
    renderUnlockedCoursesList();

  } catch(e) {
    console.error('Activation error:', e);
    // Explicitly show the error message so the user can debug if it's a permission issue
    if (e.message && e.message.includes('permission')) {
      showToast('Lỗi: Bạn không có quyền kích hoạt (Firebase Rules).', true);
    } else {
      showToast('Lỗi kích hoạt: ' + (e.message || 'Vui lòng thử lại!'), true);
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Kích hoạt';
  }
}

// Wire up the activation button and input
document.addEventListener('DOMContentLoaded', () => {
  const btnActivate = document.getElementById('btn-activate-key');
  const keyInput = document.getElementById('activation-key-input');

  if (btnActivate) {
    btnActivate.addEventListener('click', () => {
      const val = keyInput?.value || '';
      activateKey(val);
    });
  }

  if (keyInput) {
    // Auto-uppercase as user types
    keyInput.addEventListener('input', (e) => {
      const pos = e.target.selectionStart;
      e.target.value = e.target.value.toUpperCase();
      e.target.setSelectionRange(pos, pos);
    });
    // Allow Enter key
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') activateKey(keyInput.value);
    });
  }

  // Close activation modal
  const btnCloseModal = document.getElementById('btn-close-activation-modal');
  const activationModal = document.getElementById('activation-success-modal');
  const activationInner = document.getElementById('activation-modal-inner');
  if (btnCloseModal && activationModal) {
    btnCloseModal.addEventListener('click', () => {
      if (activationInner) { activationInner.classList.add('scale-90', 'opacity-0'); activationInner.classList.remove('scale-100', 'opacity-100'); }
      setTimeout(() => {
        activationModal.classList.add('hidden');
        activationModal.classList.remove('flex');
        window.changeMainView('view-dashboard');
      }, 300);
    });
  }
});

// Hook into loadProfile to show unlocked courses
const _origLoadProfile = window.loadProfile;
if (typeof _origLoadProfile === 'function') {
  window.loadProfile = async function() {
    await _origLoadProfile();
    renderUnlockedCoursesList();
  };
} else {
  // If loadProfile doesn't exist yet, just render on view change
  const _origChangeMainView = window.changeMainView;
  window.changeMainView = (viewId, element = null) => {
    _origChangeMainView(viewId, element);
    if (viewId === 'view-profile') setTimeout(renderUnlockedCoursesList, 300);
  };
}

// ============================================================
// HEADER ACTIVATION KEY SHORTCUT
// ============================================================
window._headerActivateKey = () => {
  if (!currentUser) {
    // Show login overlay so user logs in first
    loginOverlay.classList.remove('hidden');
    setTimeout(() => loginOverlay.classList.remove('opacity-0'), 10);
    // After login will auto re-render, user can navigate to profile
    showToast('Đăng nhập để nhập mã kích hoạt! 🔑');
    return;
  }
  // Navigate to profile tab and scroll to / focus the activation input
  window.changeMainView('view-profile');
  setTimeout(() => {
    const input = document.getElementById('activation-key-input');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }
  }, 350);
};




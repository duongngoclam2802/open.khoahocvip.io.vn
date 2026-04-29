import {
  auth, db,
  onAuthStateChanged,
  collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, query, where
} from './firebase-config.js';

const TRUE_FALSE_LABELS = ['a', 'b', 'c', 'd'];
const TRUE_FALSE_SCORE_MAP = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 };
const EXAM_CACHE_TTL = 60 * 1000;
const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MOBILE_PDF_BREAKPOINT = '(max-width: 1023px)';

let examUser = null;
let examCache = { exams: [], submissions: [], loadedAt: 0 };
let selectedSubject = 'all';

let currentExam = null;
let currentQuestions = [];
let currentQuestionOrder = [];
let currentOptionOrders = {};
let currentAnswers = {};
let currentDraftId = '';
let currentStartedAt = 0;
let currentRemainingTime = 0;
let examTimer = null;
let draftTimer = null;
let examSubmitting = false;
let currentResult = null;
const mobilePdfViewers = {
  room: {
    url: '',
    doc: null,
    scale: 1,
    fitScale: 1,
    renderToken: 0,
    pagesId: 'exam-mobile-pdf-pages',
    statusId: 'exam-mobile-pdf-status',
    infoId: 'exam-mobile-pdf-info',
    openLinkId: 'exam-mobile-pdf-open-link'
  },
  result: {
    url: '',
    doc: null,
    scale: 1,
    fitScale: 1,
    renderToken: 0,
    pagesId: 'exam-result-mobile-pdf-pages',
    statusId: 'exam-result-mobile-pdf-status',
    infoId: 'exam-result-mobile-pdf-info',
    openLinkId: 'exam-result-mobile-pdf-open-link'
  }
};

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[ch]));
}

function showExamToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) {
    if (isError) console.error(message);
    return;
  }

  const icon = toast.querySelector('i');
  if (icon) {
    icon.setAttribute('data-lucide', isError ? 'alert-circle' : 'check-circle');
    icon.className = isError ? 'text-red-500 w-5 h-5' : 'text-green-500 w-5 h-5';
  }
  msgEl.textContent = message;
  if (window.lucide) window.lucide.createIcons({ root: toast });
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

function showLoginRequired() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.remove('opacity-0'), 10);
  }
  showExamToast('Vui lòng đăng nhập để làm bài thi.', true);
}

function normalizeExam(raw, id) {
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  return {
    id: raw.id || id,
    title: raw.title || 'Đề thi chưa đặt tên',
    subject: raw.subject || 'Khác',
    duration: Number(raw.duration || 0),
    pdfUrl: raw.pdfUrl || '',
    status: raw.status || 'draft',
    instructions: raw.instructions || 'Đọc kỹ đề trong PDF và điền đáp án sang bảng bên phải.',
    startAt: raw.startAt || '',
    endAt: raw.endAt || '',
    shuffleQuestions: Boolean(raw.shuffleQuestions),
    shuffleOptions: Boolean(raw.shuffleOptions),
    showResultAfterSubmit: raw.showResultAfterSubmit !== false,
    allowReviewAfterSubmit: raw.allowReviewAfterSubmit !== false,
    passScore: Number(raw.passScore ?? 50),
    attemptLimit: Number(raw.attemptLimit || raw.maxAttempts || 1),
    questionCount: Number(raw.questionCount || questions.length),
    questions
  };
}

function isExamOpen(exam) {
  if (exam.status !== 'published') return false;
  const now = Date.now();
  if (exam.startAt && new Date(exam.startAt).getTime() > now) return false;
  if (exam.endAt && new Date(exam.endAt).getTime() < now) return false;
  return true;
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}h ${rest}m`;
  }
  return `${minutes}m ${String(secs).padStart(2, '0')}s`;
}

function formatTimer(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getDraftKey(examId) {
  const email = examUser?.email?.toLowerCase() || 'guest';
  return `exam_draft_${email}_${examId}`;
}

function getDraftId(examId) {
  return `${examUser.email.toLowerCase()}_${examId}`;
}

function getSubmissionsForExam(examId) {
  return examCache.submissions.filter((item) => item.examId === examId);
}

async function loadExamHub(options = {}) {
  const force = Boolean(options.force);
  const loginAlert = document.getElementById('exam-login-alert');
  if (loginAlert) loginAlert.classList.toggle('hidden', Boolean(examUser));

  const list = document.getElementById('exam-list');
  const history = document.getElementById('exam-history');
  if (list && (force || examCache.exams.length === 0)) list.innerHTML = '<div class="loader mx-auto col-span-full"></div>';
  if (history && examUser && (force || examCache.loadedAt === 0)) history.innerHTML = '<div class="loader mx-auto mt-8"></div>';

  const now = Date.now();
  const canUseCache = !force && examCache.loadedAt && now - examCache.loadedAt < EXAM_CACHE_TTL;
  if (canUseCache) {
    renderExamHub();
    return;
  }

  try {
    const examSnap = await getDocs(collection(db, 'exams'));
    const exams = [];
    examSnap.forEach((item) => exams.push(normalizeExam(item.data(), item.id)));

    let submissions = [];
    if (examUser?.email) {
      const submissionQuery = query(collection(db, 'exam_submissions'), where('userEmail', '==', examUser.email));
      const submissionSnap = await getDocs(submissionQuery);
      submissionSnap.forEach((item) => submissions.push({ id: item.id, ...item.data() }));
    }

    exams.sort((a, b) => String(a.subject).localeCompare(String(b.subject), 'vi') || String(a.title).localeCompare(String(b.title), 'vi'));
    submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    examCache = { exams, submissions, loadedAt: Date.now() };
    renderExamHub();
  } catch (error) {
    console.error('loadExamHub error:', error);
    if (list) list.innerHTML = '<p class="text-sm text-red-500 col-span-full text-center py-10">Không tải được danh sách đề thi.</p>';
    if (history) history.innerHTML = '<p class="text-sm text-red-500 text-center py-10">Không tải được lịch sử làm bài.</p>';
  }
}

function renderExamHub() {
  renderExamSubjectTabs();
  renderExamList();
  renderExamHistory();
  if (window.lucide) window.lucide.createIcons();
}

function renderExamSubjectTabs() {
  const container = document.getElementById('exam-subject-tabs');
  if (!container) return;

  const openExams = examCache.exams.filter(isExamOpen);
  const subjects = ['all', ...new Set(openExams.map((exam) => exam.subject || 'Khác'))];
  if (!subjects.includes(selectedSubject)) selectedSubject = 'all';

  container.innerHTML = subjects.map((subject) => {
    const active = selectedSubject === subject;
    const label = subject === 'all' ? 'Tất cả' : subject;
    return `
      <button type="button" class="exam-subject-tab ${active ? 'is-active' : ''}" data-subject="${escapeHTML(subject)}">
        ${escapeHTML(label)}
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-subject]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedSubject = button.dataset.subject;
      renderExamHub();
    });
  });
}

function renderExamList() {
  const container = document.getElementById('exam-list');
  if (!container) return;

  let exams = examCache.exams.filter(isExamOpen);
  if (selectedSubject !== 'all') exams = exams.filter((exam) => exam.subject === selectedSubject);

  if (exams.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-muted">
        <i data-lucide="clipboard-x" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
        <p class="text-sm font-semibold">Chưa có đề thi nào đang mở.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = exams.map((exam) => {
    const attempts = getSubmissionsForExam(exam.id);
    const attemptLimit = exam.attemptLimit > 0 ? exam.attemptLimit : Infinity;
    const used = attempts.length;
    const maxScore = getExamMaxScore(exam);
    const isLoggedIn = Boolean(examUser);
    const canAttempt = isLoggedIn && used < attemptLimit;
    const disabled = isLoggedIn && !canAttempt;
    const bestScore = attempts.length ? Math.max(...attempts.map((item) => Number(item.score || 0))) : null;
    const buttonText = !isLoggedIn
      ? 'Đăng nhập để thi'
      : (canAttempt ? 'Vào làm bài' : 'Hết lượt làm');

    return `
      <article class="exam-card bg-white/80 dark:bg-slate-900/70 backdrop-blur border border-theme rounded-2xl p-5 hover:border-emerald-400/70 hover:-translate-y-1 transition-all shadow-sm">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="min-w-0">
            <span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
              <i data-lucide="book-open" class="w-3 h-3"></i> ${escapeHTML(exam.subject)}
            </span>
            <h3 class="text-base font-black text-main mt-3 line-clamp-2">${escapeHTML(exam.title)}</h3>
            <p class="text-xs text-muted mt-1 line-clamp-2">${escapeHTML(exam.instructions)}</p>
          </div>
          <div class="rounded-2xl bg-emerald-500/10 text-emerald-500 p-3 shrink-0">
            <i data-lucide="timer" class="w-5 h-5"></i>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center mb-4">
          <div class="rounded-xl bg-slate-50 dark:bg-white/5 border border-theme p-2">
            <p class="text-[10px] text-muted font-bold uppercase">Phút</p>
            <p class="text-sm font-black text-main">${exam.duration}</p>
          </div>
          <div class="rounded-xl bg-slate-50 dark:bg-white/5 border border-theme p-2">
            <p class="text-[10px] text-muted font-bold uppercase">Câu</p>
            <p class="text-sm font-black text-main">${exam.questionCount}</p>
          </div>
          <div class="rounded-xl bg-slate-50 dark:bg-white/5 border border-theme p-2">
            <p class="text-[10px] text-muted font-bold uppercase">Điểm</p>
            <p class="text-sm font-black text-main">${maxScore.toFixed(2)}</p>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 text-xs text-muted font-semibold mb-4">
          <span>Lượt làm: ${used}/${attemptLimit === Infinity ? '∞' : attemptLimit}</span>
          <span>${bestScore === null ? 'Chưa làm' : `Cao nhất: ${bestScore.toFixed(2)}`}</span>
        </div>

        <button type="button" class="w-full exam-start-btn ${disabled ? 'is-disabled' : ''}" data-exam-id="${escapeHTML(exam.id)}" ${disabled ? 'disabled' : ''}>
          ${buttonText}
        </button>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-exam-id]').forEach((button) => {
    button.addEventListener('click', () => startExam(button.dataset.examId));
  });
}

function renderExamHistory() {
  const container = document.getElementById('exam-history');
  if (!container) return;

  if (!examUser) {
    container.innerHTML = `
      <div class="text-center py-10 text-muted">
        <i data-lucide="lock" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
        <p class="text-sm font-semibold">Đăng nhập để xem lịch sử làm bài.</p>
      </div>
    `;
    return;
  }

  if (examCache.submissions.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-muted">
        <i data-lucide="history" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
        <p class="text-sm font-semibold">Bạn chưa nộp bài thi nào.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = examCache.submissions.map((submission) => {
    const pct = submission.maxScore ? Math.round((Number(submission.score || 0) / Number(submission.maxScore)) * 100) : 0;
    const passed = pct >= Number(submission.passScore || 0);
    return `
      <article class="rounded-2xl border border-theme bg-white/70 dark:bg-slate-900/70 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h4 class="font-black text-main text-sm line-clamp-2">${escapeHTML(submission.examTitle || 'Đề thi')}</h4>
            <p class="text-[11px] text-muted mt-1">${formatDateTime(submission.submittedAt)} · Lần ${submission.attemptNumber || 1}</p>
          </div>
          <span class="shrink-0 text-xs font-black rounded-full px-2.5 py-1 ${passed ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}">
            ${pct}%
          </span>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs font-semibold text-muted">
          <span>Điểm: <b class="text-main">${Number(submission.score || 0).toFixed(2)}</b>/${Number(submission.maxScore || 0).toFixed(2)}</span>
          <span>${formatDuration(submission.timeTaken)}</span>
        </div>
      </article>
    `;
  }).join('');
}

async function startExam(examId) {
  if (!examUser?.email) {
    showLoginRequired();
    return;
  }

  try {
    let exam = examCache.exams.find((item) => item.id === examId);
    if (!exam) {
      const snap = await getDoc(doc(db, 'exams', examId));
      if (!snap.exists()) {
        showExamToast('Không tìm thấy đề thi.', true);
        return;
      }
      exam = normalizeExam(snap.data(), snap.id);
    }

    if (!isExamOpen(exam)) {
      showExamToast('Đề thi chưa mở hoặc đã kết thúc.', true);
      return;
    }

    await ensureLatestUserSubmissions();
    const usedAttempts = getSubmissionsForExam(exam.id).length;
    if (exam.attemptLimit > 0 && usedAttempts >= exam.attemptLimit) {
      showExamToast('Bạn đã hết số lần làm bài cho đề thi này.', true);
      renderExamHub();
      return;
    }

    currentExam = exam;
    currentDraftId = getDraftId(exam.id);
    const draft = await loadExamDraft(exam.id);
    const durationSeconds = Math.max(60, Math.round(Number(exam.duration || 1) * 60));

    currentAnswers = draft?.answers && typeof draft.answers === 'object' ? structuredCloneSafe(draft.answers) : {};
    currentQuestionOrder = Array.isArray(draft?.questionOrder) && draft.questionOrder.length
      ? draft.questionOrder
      : buildQuestionOrder(exam);
    currentQuestions = applyQuestionOrder(exam.questions, currentQuestionOrder);
    currentOptionOrders = draft?.optionOrders && typeof draft.optionOrders === 'object'
      ? structuredCloneSafe(draft.optionOrders)
      : buildOptionOrders(exam, currentQuestionOrder);
    currentRemainingTime = Math.min(Number(draft?.remainingTime || durationSeconds), durationSeconds);
    currentStartedAt = Date.now() - ((durationSeconds - currentRemainingTime) * 1000);
    examSubmitting = false;

    window.changeMainView('view-exam-room');
    renderExamRoom();
    startCountdown();
    saveLocalDraft();
    if (draft) showExamToast('Đã khôi phục bài làm nháp.');
  } catch (error) {
    console.error('startExam error:', error);
    showExamToast('Không thể bắt đầu bài thi.', true);
  }
}

async function ensureLatestUserSubmissions() {
  if (!examUser?.email) return;
  const submissionQuery = query(collection(db, 'exam_submissions'), where('userEmail', '==', examUser.email));
  const submissionSnap = await getDocs(submissionQuery);
  const submissions = [];
  submissionSnap.forEach((item) => submissions.push({ id: item.id, ...item.data() }));
  submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  examCache.submissions = submissions;
}

function structuredCloneSafe(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    return JSON.parse(JSON.stringify(value));
  }
}

function buildQuestionOrder(exam) {
  const ids = (exam.questions || []).map((question, index) => question.id || `q_${index + 1}`);
  if (!exam.shuffleQuestions) return ids;
  return shuffleArray(ids);
}

function applyQuestionOrder(questions, order) {
  const byId = new Map((questions || []).map((question, index) => [question.id || `q_${index + 1}`, { ...question, id: question.id || `q_${index + 1}` }]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);
  if (ordered.length === questions.length) return ordered;
  return (questions || []).map((question, index) => ({ ...question, id: question.id || `q_${index + 1}` }));
}

function buildOptionOrders(exam, questionOrder) {
  if (!exam.shuffleOptions) return {};
  const output = {};
  const questionMap = new Map((exam.questions || []).map((question, index) => [question.id || `q_${index + 1}`, question]));
  questionOrder.forEach((qid) => {
    const question = questionMap.get(qid);
    if (question?.type === 'multiple_choice') output[qid] = shuffleArray(['A', 'B', 'C', 'D']);
  });
  return output;
}

function shuffleArray(items) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

async function loadExamDraft(examId) {
  const localDraft = readLocalDraft(examId);
  let remoteDraft = null;

  try {
    const snap = await getDoc(doc(db, 'exam_drafts', getDraftId(examId)));
    if (snap.exists()) remoteDraft = snap.data();
  } catch (error) {
    console.warn('load remote draft failed:', error);
  }

  if (!localDraft) return remoteDraft;
  if (!remoteDraft) return localDraft;

  const localTime = new Date(localDraft.lastSavedAt || 0).getTime();
  const remoteTime = new Date(remoteDraft.lastSavedAt || 0).getTime();
  return remoteTime >= localTime ? remoteDraft : localDraft;
}

function readLocalDraft(examId) {
  try {
    const raw = localStorage.getItem(getDraftKey(examId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function isMobileExamLayout() {
  return window.matchMedia(MOBILE_PDF_BREAKPOINT).matches;
}

function configurePdfJs() {
  if (!window.pdfjsLib) return false;
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }
  return true;
}

function setMobilePdfStatus(scope, message, hidden = false) {
  const state = mobilePdfViewers[scope];
  const status = state ? document.getElementById(state.statusId) : null;
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('is-hidden', hidden);
}

function setMobilePdfInfo(scope, text) {
  const state = mobilePdfViewers[scope];
  const info = state ? document.getElementById(state.infoId) : null;
  if (info) info.textContent = text;
}

function renderMobilePdfFallback(scope, url) {
  const state = mobilePdfViewers[scope];
  const pages = state ? document.getElementById(state.pagesId) : null;
  if (!pages || !url) return;

  const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
  pages.innerHTML = `
    <iframe class="exam-mobile-pdf-fallback" title="PDF đề thi" src="${viewerUrl}"></iframe>
  `;
  setMobilePdfInfo(scope, 'PDF');
  setMobilePdfStatus(scope, '', true);
}

async function setupMobilePdfViewer(scope, url) {
  const state = mobilePdfViewers[scope];
  if (!state) return;

  const openLink = document.getElementById(state.openLinkId);
  if (openLink) {
    openLink.href = url || '#';
    openLink.classList.toggle('pointer-events-none', !url);
  }

  const pages = document.getElementById(state.pagesId);
  if (!pages) return;

  if (!isMobileExamLayout()) return;
  if (!url) {
    state.url = '';
    state.doc = null;
    pages.innerHTML = '';
    setMobilePdfInfo(scope, 'PDF');
    setMobilePdfStatus(scope, 'Chưa có file PDF cho đề thi này.');
    return;
  }

  if (!configurePdfJs()) {
    renderMobilePdfFallback(scope, url);
    return;
  }

  if (state.url === url && state.doc) {
    await renderMobilePdfPages(scope, { resetToFit: true });
    return;
  }

  state.url = url;
  state.doc = null;
  state.scale = 1;
  state.fitScale = 1;
  pages.innerHTML = '';
  setMobilePdfInfo(scope, 'Đang tải...');
  setMobilePdfStatus(scope, 'Đang tải PDF...');

  try {
    state.doc = await window.pdfjsLib.getDocument({ url }).promise;
    await renderMobilePdfPages(scope, { resetToFit: true });
  } catch (error) {
    console.error('setupMobilePdfViewer error:', error);
    state.doc = null;
    renderMobilePdfFallback(scope, url);
  }
}

async function renderMobilePdfPages(scope, options = {}) {
  const state = mobilePdfViewers[scope];
  if (!state?.doc) return;

  const pages = document.getElementById(state.pagesId);
  if (!pages) return;

  const token = ++state.renderToken;
  pages.innerHTML = '';
  setMobilePdfStatus(scope, 'Đang dựng trang PDF...');

  try {
    const firstPage = await state.doc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(280, (pages.parentElement?.clientWidth || window.innerWidth) - 24);
    state.fitScale = Math.max(0.35, Math.min(1.8, availableWidth / baseViewport.width));
    if (options.resetToFit || !state.scale) state.scale = state.fitScale;
    state.scale = Math.max(0.35, Math.min(2.8, state.scale));

    setMobilePdfInfo(scope, `${state.doc.numPages} trang · ${Math.round((state.scale / state.fitScale) * 100)}%`);

    for (let pageNumber = 1; pageNumber <= state.doc.numPages; pageNumber += 1) {
      if (token !== state.renderToken) return;
      const page = pageNumber === 1 ? firstPage : await state.doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: state.scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);

      const wrapper = document.createElement('div');
      wrapper.className = 'exam-mobile-pdf-page';

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const label = document.createElement('div');
      label.className = 'exam-mobile-pdf-page-label';
      label.textContent = `Trang ${pageNumber}/${state.doc.numPages}`;

      wrapper.appendChild(canvas);
      wrapper.appendChild(label);
      pages.appendChild(wrapper);

      const context = canvas.getContext('2d');
      await page.render({
        canvasContext: context,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
      }).promise;
    }

    if (token === state.renderToken) setMobilePdfStatus(scope, '', true);
  } catch (error) {
    console.error('renderMobilePdfPages error:', error);
    renderMobilePdfFallback(scope, state.url);
  }
}

function changeMobilePdfZoom(scope, action) {
  const state = mobilePdfViewers[scope];
  if (!state?.doc) return;

  if (action === 'zoom-in') state.scale *= 1.18;
  if (action === 'zoom-out') state.scale /= 1.18;
  if (action === 'fit') {
    renderMobilePdfPages(scope, { resetToFit: true });
    return;
  }
  renderMobilePdfPages(scope);
}

function renderExamRoom() {
  if (!currentExam) return;

  const title = document.getElementById('exam-room-title');
  const frame = document.getElementById('exam-pdf-frame');
  const openLink = document.getElementById('exam-pdf-open-link');
  const submitBtn = document.getElementById('btn-submit-exam');

  if (title) title.textContent = currentExam.title;
  if (frame) frame.src = currentExam.pdfUrl || 'about:blank';
  if (openLink) {
    openLink.href = currentExam.pdfUrl || '#';
    openLink.classList.toggle('pointer-events-none', !currentExam.pdfUrl);
  }
  setupMobilePdfViewer('room', currentExam.pdfUrl);
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="send" class="w-5 h-5"></i> Nộp bài';
  }

  renderCompactAnswerForm();
  updateExamProgress();
  updateExamTimerUI();
  setExamRoomPane('pdf');
  if (window.lucide) window.lucide.createIcons();
}

function renderCompactAnswerForm() {
  const container = document.getElementById('exam-answer-form');
  if (!container || !currentExam) return;
  const previousScrollTop = container.scrollTop;

  container.innerHTML = currentQuestions.map((question, index) => {
    const questionNumber = index + 1;
    const qid = question.id || `q_${questionNumber}`;
    const points = Number(question.points || 0);
    const typeLabel = getQuestionTypeLabel(question.type);
    return `
      <article class="exam-question-row bg-white/80 dark:bg-slate-900/70 border border-theme rounded-2xl p-3" data-question-id="${escapeHTML(qid)}">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-sm font-black shrink-0">${questionNumber}</span>
            <div class="min-w-0">
              <p class="text-sm font-black text-main">Câu ${questionNumber}</p>
              <p class="text-[10px] text-muted font-bold uppercase tracking-widest">${typeLabel}</p>
            </div>
          </div>
          <span class="text-[11px] font-black text-muted">${points.toFixed(2)}đ</span>
        </div>
        ${renderQuestionInput(question, qid)}
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-answer-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      const { qid, value, label } = button.dataset;
      const question = currentQuestions.find((item) => item.id === qid);
      if (!question) return;

      if (question.type === 'true_false') {
        if (!currentAnswers[qid] || typeof currentAnswers[qid] !== 'object') currentAnswers[qid] = {};
        currentAnswers[qid][label] = value;
      } else {
        currentAnswers[qid] = value;
      }
      renderCompactAnswerForm();
      updateExamProgress();
      scheduleDraftSave();
    });
  });

  container.querySelectorAll('[data-short-answer]').forEach((input) => {
    input.addEventListener('input', () => {
      currentAnswers[input.dataset.qid] = input.value;
      updateExamProgress();
      scheduleDraftSave();
    });
  });

  if (window.lucide) window.lucide.createIcons({ root: container });
  container.scrollTop = previousScrollTop;
}

function renderQuestionInput(question, qid) {
  if (question.type === 'true_false') {
    const answerObject = currentAnswers[qid] && typeof currentAnswers[qid] === 'object' ? currentAnswers[qid] : {};
    const statements = Array.isArray(question.statements) && question.statements.length
      ? question.statements
      : TRUE_FALSE_LABELS.map((label) => ({ label, answer: '' }));

    return `
      <div class="space-y-2">
        ${statements.map((statement) => {
          const label = statement.label || '';
          const selected = answerObject[label] || '';
          return `
            <div class="grid grid-cols-[28px_1fr_1fr] gap-2 items-center">
              <span class="text-sm font-black text-muted">${escapeHTML(label)})</span>
              ${renderAnswerButton(qid, 'Đúng', selected === 'Đúng', label, 'Đ')}
              ${renderAnswerButton(qid, 'Sai', selected === 'Sai', label, 'S')}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  if (question.type === 'short_answer') {
    const value = typeof currentAnswers[qid] === 'string' ? currentAnswers[qid] : '';
    return `
      <input data-short-answer data-qid="${escapeHTML(qid)}" type="text" value="${escapeHTML(value)}"
        class="input-glass !rounded-xl !py-2.5 text-sm" placeholder="Nhập đáp án ngắn...">
    `;
  }

  const selected = currentAnswers[qid] || '';
  const options = currentOptionOrders[qid] || ['A', 'B', 'C', 'D'];
  return `
    <div class="grid grid-cols-4 gap-2">
      ${options.map((option) => renderAnswerButton(qid, option, selected === option, '', option)).join('')}
    </div>
  `;
}

function renderAnswerButton(qid, value, active, label, text) {
  return `
    <button type="button"
      class="exam-choice-btn ${active ? 'is-selected' : ''}"
      data-answer-choice
      data-qid="${escapeHTML(qid)}"
      data-label="${escapeHTML(label)}"
      data-value="${escapeHTML(value)}">
      ${escapeHTML(text)}
    </button>
  `;
}

function getQuestionTypeLabel(type) {
  if (type === 'true_false') return 'Đúng/Sai 4 ý';
  if (type === 'short_answer') return 'Trả lời ngắn';
  return 'TNKQ 4 lựa chọn';
}

function updateExamProgress() {
  const total = currentQuestions.length || 1;
  const answered = currentQuestions.filter((question) => isQuestionAnswered(question, currentAnswers)).length;
  const pct = Math.round((answered / total) * 100);
  const text = document.getElementById('exam-progress-text');
  const bar = document.getElementById('exam-progress-bar');
  if (text) text.textContent = `${pct}%`;
  if (bar) bar.style.width = `${pct}%`;
}

function isQuestionAnswered(question, answers) {
  const qid = question.id;
  const answer = answers[qid];
  if (question.type === 'true_false') {
    if (!answer || typeof answer !== 'object') return false;
    const statements = Array.isArray(question.statements) && question.statements.length
      ? question.statements
      : TRUE_FALSE_LABELS.map((label) => ({ label }));
    return statements.every((statement) => answer[statement.label] === 'Đúng' || answer[statement.label] === 'Sai');
  }
  return String(answer ?? '').trim() !== '';
}

function startCountdown() {
  clearInterval(examTimer);
  examTimer = setInterval(async () => {
    currentRemainingTime -= 1;
    updateExamTimerUI();

    if (currentRemainingTime > 0 && currentRemainingTime % 15 === 0) {
      saveExamDraft({ silent: true });
    }

    if (currentRemainingTime <= 0) {
      currentRemainingTime = 0;
      clearInterval(examTimer);
      showExamToast('Hết thời gian. Hệ thống đang tự động nộp bài.');
      await submitExam({ auto: true });
    }
  }, 1000);
}

function updateExamTimerUI() {
  const timer = document.getElementById('exam-timer');
  if (!timer) return;
  timer.textContent = formatTimer(currentRemainingTime);
  timer.classList.toggle('text-red-500', currentRemainingTime <= 300);
  timer.classList.toggle('text-amber-500', currentRemainingTime > 300 && currentRemainingTime <= 900);
}

function scheduleDraftSave() {
  saveLocalDraft();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveExamDraft({ silent: true }), 700);
}

function buildDraftPayload() {
  return {
    id: currentDraftId,
    examId: currentExam.id,
    userEmail: examUser.email,
    answers: currentAnswers,
    remainingTime: Math.max(0, currentRemainingTime),
    questionOrder: currentQuestionOrder,
    optionOrders: currentOptionOrders,
    lastSavedAt: new Date().toISOString()
  };
}

function saveLocalDraft() {
  if (!currentExam || !examUser) return;
  try {
    localStorage.setItem(getDraftKey(currentExam.id), JSON.stringify(buildDraftPayload()));
    updateDraftStatus('Đã lưu cục bộ');
  } catch (error) {
    console.warn('local draft save failed:', error);
  }
}

async function saveExamDraft(options = {}) {
  if (!currentExam || !examUser || examSubmitting) return;
  const silent = options.silent !== false;
  const payload = buildDraftPayload();

  try {
    localStorage.setItem(getDraftKey(currentExam.id), JSON.stringify(payload));
    await setDoc(doc(db, 'exam_drafts', currentDraftId), payload, { merge: true });
    updateDraftStatus('Đã lưu nháp');
    if (!silent) showExamToast('Đã lưu nháp bài làm.');
  } catch (error) {
    console.warn('saveExamDraft error:', error);
    updateDraftStatus('Lưu nháp lỗi');
    if (!silent) showExamToast('Không lưu được nháp lên máy chủ.', true);
  }
}

function updateDraftStatus(text) {
  const status = document.getElementById('exam-autosave-status');
  if (!status) return;
  status.innerHTML = `<i data-lucide="cloud-check" class="w-4 h-4"></i> ${escapeHTML(text)}`;
  if (window.lucide) window.lucide.createIcons({ root: status });
}

async function submitExam(options = {}) {
  if (!currentExam || !examUser || examSubmitting) return;
  const auto = Boolean(options.auto);
  const unanswered = currentQuestions.filter((question) => !isQuestionAnswered(question, currentAnswers)).length;

  if (!auto) {
    const message = unanswered > 0
      ? `Bạn còn ${unanswered} câu chưa điền đủ đáp án. Vẫn nộp bài?`
      : 'Xác nhận nộp bài thi? Sau khi nộp bạn không thể sửa đáp án.';
    if (!confirm(message)) return;
  }

  examSubmitting = true;
  clearInterval(examTimer);
  clearTimeout(draftTimer);

  const submitBtn = document.getElementById('btn-submit-exam');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Đang nộp bài...';
    if (window.lucide) window.lucide.createIcons({ root: submitBtn });
  }

  try {
    await ensureLatestUserSubmissions();
    const grading = gradeExamSubmission(currentExam, currentAnswers);
    const durationSeconds = Math.max(60, Math.round(Number(currentExam.duration || 1) * 60));
    const timeTaken = Math.min(durationSeconds, Math.max(0, Math.round((Date.now() - currentStartedAt) / 1000)));
    const previousAttempts = getSubmissionsForExam(currentExam.id).length;
    const submission = {
      examId: currentExam.id,
      examTitle: currentExam.title,
      userEmail: examUser.email,
      userName: examUser.displayName || examUser.email,
      answers: currentAnswers,
      score: grading.score,
      maxScore: grading.maxScore,
      correctCount: grading.correctCount,
      totalQuestions: grading.totalQuestions,
      passScore: currentExam.passScore,
      submittedAt: new Date().toISOString(),
      timeTaken,
      attemptNumber: previousAttempts + 1
    };

    const submissionRef = await addDoc(collection(db, 'exam_submissions'), submission);
    submission.id = submissionRef.id;
    examCache.submissions.unshift(submission);

    try {
      await deleteDoc(doc(db, 'exam_drafts', currentDraftId));
      localStorage.removeItem(getDraftKey(currentExam.id));
    } catch (draftError) {
      console.warn('draft cleanup failed:', draftError);
    }

    currentResult = { exam: currentExam, submission, grading };
    renderExamResult();
    cleanupExamSession({ keepResult: true });
    window.changeMainView('view-exam-result');
    showExamToast(auto ? 'Đã tự động nộp bài.' : 'Đã nộp bài thành công.');
  } catch (error) {
    console.error('submitExam error:', error);
    examSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="send" class="w-5 h-5"></i> Nộp bài';
      if (window.lucide) window.lucide.createIcons({ root: submitBtn });
    }
    showExamToast('Không nộp được bài thi. Vui lòng thử lại.', true);
  }
}

function gradeExamSubmission(exam, answers) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  const details = {};
  const questions = Array.isArray(exam.questions) ? exam.questions : [];

  questions.forEach((rawQuestion, index) => {
    const question = { ...rawQuestion, id: rawQuestion.id || `q_${index + 1}` };
    const qid = question.id;
    const points = Number(question.points || 0);
    maxScore += points;
    let questionScore = 0;
    let isCorrect = false;
    let correctAnswer = question.answer || '';
    const userAnswer = answers[qid];

    if (question.type === 'true_false') {
      const statements = Array.isArray(question.statements) ? question.statements : [];
      let correctItems = 0;
      const correctObject = {};
      const userObject = userAnswer && typeof userAnswer === 'object' ? userAnswer : {};

      statements.forEach((statement) => {
        const label = statement.label;
        const expected = normalizeTrueFalse(statement.answer);
        const actual = normalizeTrueFalse(userObject[label]);
        correctObject[label] = expected;
        if (actual && actual === expected) correctItems += 1;
      });

      const baseScore = TRUE_FALSE_SCORE_MAP[correctItems] || 0;
      questionScore = roundScore(baseScore * (points || 1));
      isCorrect = correctItems === statements.length && statements.length > 0;
      correctAnswer = correctObject;
      details[qid] = { type: question.type, score: questionScore, maxScore: points, isCorrect, correctItems, userAnswer: userObject, correctAnswer };
    } else if (question.type === 'short_answer') {
      const acceptable = String(question.answer || '')
        .split('|')
        .map((item) => normalizeShortAnswer(item))
        .filter(Boolean);
      const actual = normalizeShortAnswer(userAnswer);
      isCorrect = Boolean(actual && acceptable.includes(actual));
      questionScore = isCorrect ? points : 0;
      details[qid] = { type: question.type, score: questionScore, maxScore: points, isCorrect, userAnswer: String(userAnswer ?? ''), correctAnswer: question.answer || '' };
    } else {
      const actual = String(userAnswer || '').trim().toUpperCase();
      const expected = String(question.answer || '').trim().toUpperCase();
      isCorrect = Boolean(actual && actual === expected);
      questionScore = isCorrect ? points : 0;
      details[qid] = { type: question.type || 'multiple_choice', score: questionScore, maxScore: points, isCorrect, userAnswer: actual, correctAnswer: expected };
    }

    if (isCorrect) correctCount += 1;
    score += questionScore;
  });

  return {
    score: roundScore(score),
    maxScore: roundScore(maxScore),
    correctCount,
    totalQuestions: questions.length,
    details
  };
}

function roundScore(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeShortAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

function normalizeTrueFalse(value) {
  const normalized = normalizeShortAnswer(value);
  if (['đúng', 'dung', 'd', 'true', '1'].includes(normalized)) return 'Đúng';
  if (['sai', 's', 'false', '0'].includes(normalized)) return 'Sai';
  return '';
}

function getExamMaxScore(exam) {
  return roundScore((exam.questions || []).reduce((sum, question) => sum + Number(question.points || 0), 0));
}

function renderExamResult() {
  const summary = document.getElementById('exam-result-summary');
  const review = document.getElementById('exam-review-panel');
  if (!summary || !currentResult) return;

  const { exam, submission, grading } = currentResult;
  const percentage = grading.maxScore ? Math.round((grading.score / grading.maxScore) * 100) : 0;
  const passed = percentage >= Number(exam.passScore || 0);
  const canShowScore = exam.showResultAfterSubmit !== false;
  const resultTitle = document.getElementById('exam-result-title');
  const resultFrame = document.getElementById('exam-result-pdf-frame');
  const resultOpenLink = document.getElementById('exam-result-pdf-open-link');

  if (resultTitle) resultTitle.textContent = exam.title;
  if (resultFrame) resultFrame.src = exam.pdfUrl || 'about:blank';
  if (resultOpenLink) {
    resultOpenLink.href = exam.pdfUrl || '#';
    resultOpenLink.classList.toggle('pointer-events-none', !exam.pdfUrl);
  }
  setupMobilePdfViewer('result', exam.pdfUrl);

  summary.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
      <div>
        <p class="text-[11px] font-black uppercase tracking-widest text-emerald-500">Kết quả bài thi</p>
        <h2 class="text-2xl font-black text-main mt-1">${escapeHTML(exam.title)}</h2>
        <p class="text-sm text-muted mt-2">Nộp lúc ${formatDateTime(submission.submittedAt)} · Thời gian làm bài ${formatDuration(submission.timeTaken)}</p>
      </div>
    </div>

    ${canShowScore ? `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <div class="rounded-2xl border border-theme bg-slate-50 dark:bg-white/5 p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-muted">Điểm</p>
          <p class="text-3xl font-black text-main mt-1">${grading.score.toFixed(2)}<span class="text-sm text-muted">/${grading.maxScore.toFixed(2)}</span></p>
        </div>
        <div class="rounded-2xl border border-theme bg-slate-50 dark:bg-white/5 p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-muted">Tỷ lệ</p>
          <p class="text-3xl font-black ${passed ? 'text-green-500' : 'text-amber-500'} mt-1">${percentage}%</p>
        </div>
        <div class="rounded-2xl border border-theme bg-slate-50 dark:bg-white/5 p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-muted">Câu đúng</p>
          <p class="text-3xl font-black text-main mt-1">${grading.correctCount}<span class="text-sm text-muted">/${grading.totalQuestions}</span></p>
        </div>
        <div class="rounded-2xl border border-theme bg-slate-50 dark:bg-white/5 p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-muted">Trạng thái</p>
          <p class="text-xl font-black ${passed ? 'text-green-500' : 'text-amber-500'} mt-2">${passed ? 'Đạt' : 'Chưa đạt'}</p>
        </div>
      </div>
    ` : `
      <div class="mt-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5 text-blue-600 dark:text-blue-300 font-semibold">
        Bài làm đã được ghi nhận. Admin đang tắt chế độ hiển thị điểm ngay sau khi nộp.
      </div>
    `}
  `;

  if (review) {
    if (exam.allowReviewAfterSubmit) {
      review.classList.remove('hidden');
      review.innerHTML = renderReviewTable(exam, grading);
    } else {
      review.classList.add('hidden');
      review.innerHTML = '';
    }
  }
  setExamResultPane('summary');
  if (window.lucide) window.lucide.createIcons();
}

function renderReviewTable(exam, grading) {
  const rows = (exam.questions || []).map((question, index) => {
    const qid = question.id || `q_${index + 1}`;
    const detail = grading.details[qid] || {};
    const statusClass = detail.isCorrect ? 'is-correct' : 'is-wrong';
    return `
      <article class="exam-review-row ${statusClass}">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-black text-main">Câu ${index + 1}</p>
            <p class="text-[11px] text-muted font-bold uppercase tracking-widest">${getQuestionTypeLabel(question.type)} · ${Number(detail.score || 0).toFixed(2)}/${Number(detail.maxScore || question.points || 0).toFixed(2)}đ</p>
          </div>
          <span class="text-xs font-black rounded-full px-2.5 py-1 ${detail.isCorrect ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}">
            ${detail.isCorrect ? 'Đúng' : 'Sai'}
          </span>
        </div>
        <div class="mt-3 text-sm">
          ${renderReviewAnswer(question, detail)}
        </div>
      </article>
    `;
  }).join('');

  return `
    <div class="flex items-center justify-between gap-3 mb-5">
      <div>
        <h3 class="text-lg font-black text-main flex items-center gap-2"><i data-lucide="search-check" class="w-5 h-5 text-emerald-500"></i> Xem lại đáp án</h3>
        <p class="text-xs text-muted mt-1">Màu xanh là đúng, màu đỏ là sai. Câu Đúng/Sai được chấm theo thang 0.1 / 0.25 / 0.5 / 1.</p>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${rows}</div>
  `;
}

function renderReviewAnswer(question, detail) {
  if (question.type === 'true_false') {
    const statements = Array.isArray(question.statements) ? question.statements : [];
    return `
      <div class="space-y-1.5">
        ${statements.map((statement) => {
          const label = statement.label;
          const userValue = normalizeTrueFalse(detail.userAnswer?.[label]) || 'Chưa chọn';
          const correctValue = normalizeTrueFalse(detail.correctAnswer?.[label]) || '--';
          const ok = userValue === correctValue;
          return `
            <div class="flex items-center justify-between gap-3 rounded-xl border ${ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'} px-3 py-2">
              <span class="font-black">${escapeHTML(label)})</span>
              <span class="${ok ? 'text-green-600' : 'text-red-500'} font-bold">Bạn: ${escapeHTML(userValue)}</span>
              <span class="text-muted font-semibold">Đáp án: ${escapeHTML(correctValue)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div class="rounded-xl border border-theme bg-slate-50 dark:bg-white/5 px-3 py-2">
        <p class="text-[10px] text-muted font-black uppercase tracking-widest">Bạn chọn</p>
        <p class="font-bold text-main mt-1">${escapeHTML(detail.userAnswer || 'Chưa trả lời')}</p>
      </div>
      <div class="rounded-xl border border-theme bg-slate-50 dark:bg-white/5 px-3 py-2">
        <p class="text-[10px] text-muted font-black uppercase tracking-widest">Đáp án đúng</p>
        <p class="font-bold text-green-600 mt-1">${escapeHTML(detail.correctAnswer || '--')}</p>
      </div>
    </div>
  `;
}

function cleanupExamSession(options = {}) {
  clearInterval(examTimer);
  clearTimeout(draftTimer);
  currentExam = null;
  currentQuestions = [];
  currentQuestionOrder = [];
  currentOptionOrders = {};
  currentAnswers = {};
  currentDraftId = '';
  currentStartedAt = 0;
  currentRemainingTime = 0;
  examSubmitting = false;
  if (!options.keepResult) currentResult = null;
}

function setExamFocusMode(viewId) {
  const active = viewId === 'view-exam-room' || viewId === 'view-exam-result';
  document.body.classList.toggle('exam-focus-mode', active);

  const sidebar = document.getElementById('global-sidebar');
  const mobileOverlay = document.getElementById('mobile-sidebar-overlay');
  if (active) {
    sidebar?.classList.add('hidden');
    mobileOverlay?.classList.add('hidden');
  }
}

function setPaneState(viewId, pane, buttonSelector, attributeName) {
  const view = document.getElementById(viewId);
  if (!view) return;
  view.dataset.activePane = pane;
  view.querySelectorAll(buttonSelector).forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute(attributeName) === pane);
  });
}

function setExamRoomPane(pane = 'pdf') {
  setPaneState('view-exam-room', pane, '[data-exam-pane-target]', 'data-exam-pane-target');
}

function setExamResultPane(pane = 'summary') {
  setPaneState('view-exam-result', pane, '[data-result-pane-target]', 'data-result-pane-target');
}

function exitExamRoom() {
  if (!currentExam) {
    window.changeMainView('view-exams');
    return;
  }

  if (!confirm('Thoát phòng thi? Bài làm hiện tại sẽ được lưu nháp để bạn quay lại sau.')) return;
  saveExamDraft({ silent: true });
  cleanupExamSession();
  window.changeMainView('view-exams');
}

function installNavigationHook() {
  if (typeof window.changeMainView !== 'function') {
    setTimeout(installNavigationHook, 50);
    return;
  }

  const originalChangeMainView = window.changeMainView;
  if (originalChangeMainView.__examHooked) return;

  const hooked = (viewId, element = null) => {
    if (currentExam && viewId !== 'view-exam-room' && viewId !== 'view-exam-result') {
      if (!confirm('Bạn đang làm bài. Rời phòng thi và lưu nháp?')) return;
      saveExamDraft({ silent: true });
      cleanupExamSession();
    }

    originalChangeMainView(viewId, element);
    setExamFocusMode(viewId);
    if (viewId === 'view-exams') setTimeout(() => loadExamHub(), 0);
  };
  hooked.__examHooked = true;
  window.changeMainView = hooked;
}

function bindExamEvents() {
  const refreshBtn = document.getElementById('btn-refresh-exams');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadExamHub({ force: true }));

  const submitBtn = document.getElementById('btn-submit-exam');
  if (submitBtn) submitBtn.addEventListener('click', () => submitExam());

  const exitBtn = document.getElementById('btn-exit-exam');
  if (exitBtn) exitBtn.addEventListener('click', exitExamRoom);

  document.querySelectorAll('[data-exam-pane-target]').forEach((button) => {
    button.addEventListener('click', () => setExamRoomPane(button.getAttribute('data-exam-pane-target')));
  });

  document.querySelectorAll('[data-result-pane-target]').forEach((button) => {
    button.addEventListener('click', () => setExamResultPane(button.getAttribute('data-result-pane-target')));
  });

  document.querySelectorAll('[data-mobile-pdf-action]').forEach((button) => {
    button.addEventListener('click', () => {
      changeMobilePdfZoom(button.dataset.mobilePdfScope, button.dataset.mobilePdfAction);
    });
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!isMobileExamLayout()) return;
      if (currentExam?.pdfUrl) setupMobilePdfViewer('room', currentExam.pdfUrl);
      if (currentResult?.exam?.pdfUrl) setupMobilePdfViewer('result', currentResult.exam.pdfUrl);
    }, 200);
  });
}

onAuthStateChanged(auth, (user) => {
  examUser = user;
  examCache.loadedAt = 0;
  examCache.submissions = [];
  const examsView = document.getElementById('view-exams');
  if (examsView && !examsView.classList.contains('hidden')) loadExamHub({ force: true });
});

bindExamEvents();
installNavigationHook();

window.loadExamHub = loadExamHub;
window.startExam = startExam;
window.submitExam = submitExam;
window.renderCompactAnswerForm = renderCompactAnswerForm;
window.gradeExamSubmission = gradeExamSubmission;

import {
  auth, db,
  onAuthStateChanged,
  collection, getDocs, doc, setDoc, deleteDoc, query, where
} from './firebase-config.js';

const ADMIN_EMAIL = 'duongngoclam28022008@gmail.com';
const SUPABASE_URL = 'https://uyqwlmcbwhqybxbwbvzi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5cXdsbWNid2hxeWJ4YndidnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDM2ODgsImV4cCI6MjA5Mjg3OTY4OH0.TtQiiyv-DFCPquAcyXXx6EpQChNYmDY22B8P97qDP4s';
const SUPABASE_EXAM_BUCKET = 'exam-pdfs';
const TRUE_FALSE_LABELS = ['a', 'b', 'c', 'd'];

let adminUser = null;
let adminExams = [];
let editingExam = null;
let selectedResultsExamId = '';

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[ch]));
}

function showAdminExamToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) {
    if (isError) console.error(message);
    return;
  }
  const oldIcon = toast.querySelector('svg') || toast.querySelector('i');
  if (oldIcon) oldIcon.remove();
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', isError ? 'alert-circle' : 'check-circle');
  icon.className = isError ? 'text-red-500 w-5 h-5' : 'text-green-500 w-5 h-5';
  toast.insertBefore(icon, msgEl);
  msgEl.textContent = message;
  if (window.lucide) window.lucide.createIcons({ root: toast });
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

function normalizeExam(raw, id) {
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  return {
    id: raw.id || id,
    title: raw.title || '',
    subject: raw.subject || '',
    duration: Number(raw.duration || 90),
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

function createEmptyExam() {
  return {
    id: '',
    title: '',
    subject: 'Toán',
    duration: 90,
    pdfUrl: '',
    status: 'draft',
    instructions: 'Đọc kỹ đề trong PDF và điền đáp án sang bảng bên phải.',
    startAt: '',
    endAt: '',
    shuffleQuestions: false,
    shuffleOptions: false,
    showResultAfterSubmit: true,
    allowReviewAfterSubmit: true,
    passScore: 50,
    attemptLimit: 1,
    questionCount: 0,
    questions: []
  };
}

async function loadAdminExams() {
  const table = document.getElementById('admin-exams-table');
  if (table) table.innerHTML = '<tr><td colspan="5" class="py-8 text-center"><div class="loader mx-auto"></div></td></tr>';

  try {
    const snap = await getDocs(collection(db, 'exams'));
    adminExams = [];
    snap.forEach((item) => adminExams.push(normalizeExam(item.data(), item.id)));
    adminExams.sort((a, b) => String(a.subject).localeCompare(String(b.subject), 'vi') || String(a.title).localeCompare(String(b.title), 'vi'));
    renderAdminExams();
  } catch (error) {
    console.error('loadAdminExams error:', error);
    if (table) table.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-red-500">Không tải được danh sách đề thi.</td></tr>';
  }
}

function renderAdminExams() {
  const table = document.getElementById('admin-exams-table');
  if (!table) return;

  if (adminExams.length === 0) {
    table.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-muted">Chưa có đề thi nào.</td></tr>';
    return;
  }

  table.innerHTML = adminExams.map((exam) => {
    const isPublished = exam.status === 'published';
    return `
      <tr class="align-top hover:bg-gray-50/60 dark:hover:bg-white/5 transition-colors">
        <td class="py-4 pr-4">
          <p class="font-black text-main line-clamp-2">${escapeHTML(exam.title || 'Đề thi chưa đặt tên')}</p>
          <p class="text-xs text-muted mt-1">${escapeHTML(exam.pdfUrl ? 'Đã có PDF' : 'Chưa có PDF')} · ${exam.duration} phút</p>
        </td>
        <td class="py-4 pr-4 font-bold text-main">${escapeHTML(exam.subject || '--')}</td>
        <td class="py-4 pr-4 text-muted">${exam.questions.length}</td>
        <td class="py-4 pr-4">
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${isPublished ? 'bg-green-500/10 text-green-500' : 'bg-slate-500/10 text-muted'}">
            ${isPublished ? 'Công khai' : 'Nháp'}
          </span>
        </td>
        <td class="py-4 pr-0">
          <div class="flex justify-end gap-2">
            <button class="btn-secondary !py-1.5 !px-3 text-xs" data-exam-action="results" data-exam-id="${escapeHTML(exam.id)}">Kết quả</button>
            <button class="btn-secondary !py-1.5 !px-3 text-xs" data-exam-action="edit" data-exam-id="${escapeHTML(exam.id)}">Sửa</button>
            <button class="btn-secondary !py-1.5 !px-3 text-xs text-red-500" data-exam-action="delete" data-exam-id="${escapeHTML(exam.id)}">Xóa</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons({ root: table });
}

function resetExamEditorScroll(modal) {
  if (!modal) return;
  modal.scrollTop = 0;
  modal.querySelectorAll('.custom-scrollbar, .overflow-y-auto').forEach((scrollArea) => {
    scrollArea.scrollTop = 0;
  });
}

function openExamEditor(examId = '') {
  const source = examId ? adminExams.find((exam) => exam.id === examId) : createEmptyExam();
  if (!source) {
    showAdminExamToast('Không tìm thấy đề thi.', true);
    return;
  }

  editingExam = JSON.parse(JSON.stringify(source));
  if (!Array.isArray(editingExam.questions)) editingExam.questions = [];
  fillExamForm(editingExam);
  renderQuestionBuilder();

  const title = document.getElementById('modal-exam-title');
  if (title) title.textContent = editingExam.id ? 'Chỉnh sửa đề thi' : 'Tạo đề thi';

  const modal = document.getElementById('modal-exam');
  if (modal) {
    document.body.classList.add('admin-modal-open');
    modal.classList.remove('hidden');
    resetExamEditorScroll(modal);
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
  }
}

function closeExamEditor() {
  const modal = document.getElementById('modal-exam');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.classList.remove('admin-modal-open');
  }, 250);
}

function fillExamForm(exam) {
  setValue('exam-title', exam.title);
  setValue('exam-subject', exam.subject);
  setValue('exam-duration', exam.duration);
  setValue('exam-pdf-url', exam.pdfUrl);
  setValue('exam-instructions', exam.instructions);
  setValue('exam-start-at', toLocalDateTimeInput(exam.startAt));
  setValue('exam-end-at', toLocalDateTimeInput(exam.endAt));
  setValue('exam-status', exam.status);
  setValue('exam-pass-score', exam.passScore);
  setValue('exam-attempt-limit', exam.attemptLimit);
  setChecked('exam-shuffle-questions', exam.shuffleQuestions);
  setChecked('exam-shuffle-options', exam.shuffleOptions);
  setChecked('exam-show-result', exam.showResultAfterSubmit);
  setChecked('exam-allow-review', exam.allowReviewAfterSubmit);
}

function setValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value ?? '';
}

function setChecked(id, checked) {
  const input = document.getElementById(id);
  if (input) input.checked = Boolean(checked);
}

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function syncExamFormToState() {
  if (!editingExam) return;
  editingExam.title = document.getElementById('exam-title')?.value.trim() || '';
  editingExam.subject = document.getElementById('exam-subject')?.value.trim() || '';
  editingExam.duration = Number(document.getElementById('exam-duration')?.value || 0);
  editingExam.pdfUrl = document.getElementById('exam-pdf-url')?.value.trim() || '';
  editingExam.instructions = document.getElementById('exam-instructions')?.value.trim() || '';
  editingExam.startAt = fromLocalDateTimeInput(document.getElementById('exam-start-at')?.value || '');
  editingExam.endAt = fromLocalDateTimeInput(document.getElementById('exam-end-at')?.value || '');
  editingExam.status = document.getElementById('exam-status')?.value || 'draft';
  editingExam.passScore = Number(document.getElementById('exam-pass-score')?.value || 0);
  editingExam.attemptLimit = Number(document.getElementById('exam-attempt-limit')?.value || 1);
  editingExam.shuffleQuestions = Boolean(document.getElementById('exam-shuffle-questions')?.checked);
  editingExam.shuffleOptions = Boolean(document.getElementById('exam-shuffle-options')?.checked);
  editingExam.showResultAfterSubmit = Boolean(document.getElementById('exam-show-result')?.checked);
  editingExam.allowReviewAfterSubmit = Boolean(document.getElementById('exam-allow-review')?.checked);
  editingExam.questionCount = editingExam.questions.length;
}

async function saveExam() {
  if (!editingExam) return;
  syncExamFormToState();

  if (!editingExam.title) {
    showAdminExamToast('Vui lòng nhập tên đề thi.', true);
    return;
  }
  if (!editingExam.subject) {
    showAdminExamToast('Vui lòng nhập môn học.', true);
    return;
  }
  if (!editingExam.duration || editingExam.duration < 1) {
    showAdminExamToast('Thời gian làm bài phải lớn hơn 0.', true);
    return;
  }
  if (!editingExam.pdfUrl) {
    showAdminExamToast('Vui lòng nhập hoặc upload link PDF đề thi.', true);
    return;
  }
  if (!editingExam.questions.length) {
    showAdminExamToast('Vui lòng thêm ít nhất 1 câu hỏi.', true);
    return;
  }

  const saveBtn = document.getElementById('btn-save-exam');
  const oldHTML = saveBtn?.innerHTML;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Đang lưu...';
    if (window.lucide) window.lucide.createIcons({ root: saveBtn });
  }

  try {
    const now = new Date().toISOString();
    const examId = editingExam.id || `exam_${Date.now()}`;
    const payload = {
      ...editingExam,
      id: examId,
      questionCount: editingExam.questions.length,
      updatedAt: now
    };
    if (!editingExam.id) payload.createdAt = now;

    await setDoc(doc(db, 'exams', examId), payload, { merge: false });
    showAdminExamToast('Đã lưu đề thi thành công.');
    closeExamEditor();
    await loadAdminExams();
  } catch (error) {
    console.error('saveExam error:', error);
    showAdminExamToast('Không lưu được đề thi.', true);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldHTML;
      if (window.lucide) window.lucide.createIcons({ root: saveBtn });
    }
  }
}

async function deleteExam(examId) {
  const exam = adminExams.find((item) => item.id === examId);
  if (!exam) return;
  if (!confirm(`Xóa đề thi "${exam.title}"? Bài nộp cũ sẽ không bị xóa.`)) return;

  try {
    await deleteDoc(doc(db, 'exams', examId));
    showAdminExamToast('Đã xóa đề thi.');
    await loadAdminExams();
    if (selectedResultsExamId === examId) {
      selectedResultsExamId = '';
      renderSubmissionPlaceholder();
    }
  } catch (error) {
    console.error('deleteExam error:', error);
    showAdminExamToast('Không xóa được đề thi.', true);
  }
}

function renderQuestionBuilder() {
  const container = document.getElementById('exam-question-builder');
  if (!container || !editingExam) return;

  if (!editingExam.questions.length) {
    container.innerHTML = `
      <div class="border border-dashed border-theme rounded-2xl p-8 text-center text-muted">
        <i data-lucide="list-plus" class="w-10 h-10 mx-auto mb-3 opacity-40"></i>
        <p class="text-sm font-semibold">Chưa có câu hỏi. Hãy thêm TNKQ, Đúng/Sai hoặc Trả lời ngắn.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = editingExam.questions.map((question, index) => renderQuestionEditor(question, index)).join('');
  if (window.lucide) window.lucide.createIcons({ root: container });
}

function renderQuestionEditor(question, index) {
  const typeLabel = getQuestionTypeLabel(question.type);
  return `
    <article class="rounded-2xl border border-theme bg-slate-50/70 dark:bg-white/5 p-4" data-q-index="${index}">
      <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-4">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black">${index + 1}</div>
          <div>
            <p class="font-black text-main">Câu ${index + 1}</p>
            <p class="text-[11px] text-muted font-bold uppercase tracking-widest">${typeLabel} · ${escapeHTML(question.id)}</p>
          </div>
        </div>
        <div class="flex gap-1.5">
          <button type="button" class="p-2 rounded-lg border border-theme text-muted hover:text-main" title="Lên" data-question-action="move-up" data-q-index="${index}"><i data-lucide="arrow-up" class="w-4 h-4"></i></button>
          <button type="button" class="p-2 rounded-lg border border-theme text-muted hover:text-main" title="Xuống" data-question-action="move-down" data-q-index="${index}"><i data-lucide="arrow-down" class="w-4 h-4"></i></button>
          <button type="button" class="p-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10" title="Xóa" data-question-action="remove" data-q-index="${index}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </div>
      ${renderQuestionConfig(question, index)}
    </article>
  `;
}

function renderQuestionConfig(question, index) {
  if (question.type === 'true_false') {
    const statements = normalizeStatements(question.statements);
    return `
      <div class="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-4">
        <div>
          <label class="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Điểm tối đa</label>
          <input type="number" step="0.05" min="0" class="input-glass !py-2" value="${Number(question.points || 1)}" data-question-field="points" data-q-index="${index}">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${statements.map((statement) => `
            <label class="flex items-center gap-2 rounded-xl border border-theme bg-card p-2.5">
              <span class="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center text-sm font-black">${escapeHTML(statement.label)}</span>
              <select class="input-glass !py-2 !rounded-xl text-sm" data-statement-label="${escapeHTML(statement.label)}" data-q-index="${index}">
                <option value="Đúng" ${statement.answer === 'Đúng' ? 'selected' : ''}>Đúng</option>
                <option value="Sai" ${statement.answer === 'Sai' ? 'selected' : ''}>Sai</option>
              </select>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (question.type === 'short_answer') {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_140px] gap-4">
        <div>
          <label class="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Đáp án đúng</label>
          <input type="text" class="input-glass !py-2" value="${escapeHTML(question.answer || '')}" placeholder="VD: 15|mười lăm" data-question-field="answer" data-q-index="${index}">
          <p class="text-[11px] text-muted mt-1">Dùng dấu | để chấp nhận nhiều cách viết.</p>
        </div>
        <div>
          <label class="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Điểm</label>
          <input type="number" step="0.05" min="0" class="input-glass !py-2" value="${Number(question.points || 0.5)}" data-question-field="points" data-q-index="${index}">
        </div>
      </div>
    `;
  }

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Đáp án đúng</label>
        <select class="input-glass !py-2" data-question-field="answer" data-q-index="${index}">
          ${['A', 'B', 'C', 'D'].map((option) => `<option value="${option}" ${question.answer === option ? 'selected' : ''}>${option}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Điểm</label>
        <input type="number" step="0.05" min="0" class="input-glass !py-2" value="${Number(question.points || 0.25)}" data-question-field="points" data-q-index="${index}">
      </div>
    </div>
  `;
}

function normalizeStatements(statements) {
  const byLabel = new Map((Array.isArray(statements) ? statements : []).map((item) => [item.label, item]));
  return TRUE_FALSE_LABELS.map((label) => {
    const statement = byLabel.get(label);
    return {
      label,
      answer: statement?.answer === 'Sai' ? 'Sai' : 'Đúng'
    };
  });
}

function getQuestionTypeLabel(type) {
  if (type === 'true_false') return 'Đúng/Sai 4 ý';
  if (type === 'short_answer') return 'Trả lời ngắn';
  return 'TNKQ';
}

function addQuestion(type) {
  if (!editingExam) return;
  const questionId = nextQuestionId();
  if (type === 'true_false') {
    editingExam.questions.push({
      id: questionId,
      type,
      points: 1,
      statements: TRUE_FALSE_LABELS.map((label) => ({ label, answer: 'Đúng' }))
    });
  } else if (type === 'short_answer') {
    editingExam.questions.push({ id: questionId, type, answer: '', points: 0.5 });
  } else {
    editingExam.questions.push({ id: questionId, type: 'multiple_choice', answer: 'A', points: 0.25 });
  }
  renderQuestionBuilder();
}

function nextQuestionId() {
  const used = new Set((editingExam?.questions || []).map((question) => question.id));
  let index = (editingExam?.questions?.length || 0) + 1;
  let id = `q_${String(index).padStart(3, '0')}`;
  while (used.has(id)) {
    index += 1;
    id = `q_${String(index).padStart(3, '0')}`;
  }
  return id;
}

function updateQuestionField(target) {
  if (!editingExam) return;
  const index = Number(target.dataset.qIndex);
  const question = editingExam.questions[index];
  if (!question) return;

  if (target.dataset.questionField) {
    const field = target.dataset.questionField;
    question[field] = field === 'points' ? Number(target.value || 0) : target.value;
  }

  if (target.dataset.statementLabel) {
    const label = target.dataset.statementLabel;
    question.statements = normalizeStatements(question.statements);
    const statement = question.statements.find((item) => item.label === label);
    if (statement) statement.answer = target.value === 'Sai' ? 'Sai' : 'Đúng';
  }
}

function handleQuestionAction(action, index) {
  if (!editingExam) return;
  const questions = editingExam.questions;
  if (!questions[index]) return;

  if (action === 'remove') {
    questions.splice(index, 1);
  } else if (action === 'move-up' && index > 0) {
    [questions[index - 1], questions[index]] = [questions[index], questions[index - 1]];
  } else if (action === 'move-down' && index < questions.length - 1) {
    [questions[index + 1], questions[index]] = [questions[index], questions[index + 1]];
  }

  renderQuestionBuilder();
}

async function uploadSelectedPdf(file) {
  if (!file) return;
  const progress = document.getElementById('exam-pdf-upload-progress');
  const bar = progress?.querySelector('div');
  if (progress) progress.classList.remove('hidden');
  if (bar) bar.style.width = '5%';

  try {
    const url = await uploadExamPdfToSupabase(file, (percent) => {
      if (bar) bar.style.width = `${percent}%`;
    });
    setValue('exam-pdf-url', url);
    if (editingExam) editingExam.pdfUrl = url;
    showAdminExamToast('Đã upload PDF lên Supabase.');
  } catch (error) {
    console.error('uploadSelectedPdf error:', error);
    showAdminExamToast('Upload PDF thất bại. Kiểm tra bucket exam-pdfs và Storage policies.', true);
  } finally {
    if (bar) bar.style.width = '100%';
    setTimeout(() => {
      if (progress) progress.classList.add('hidden');
      if (bar) bar.style.width = '0';
    }, 700);
  }
}

function uploadExamPdfToSupabase(file, onProgress) {
  return new Promise((resolve, reject) => {
    const safeName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-');
    const objectPath = `exams/${Date.now()}_${safeName}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_EXAM_BUCKET}/${objectPath}`;
    const xhr = new XMLHttpRequest();

    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percent = Math.max(5, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(`${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_EXAM_BUCKET}/${objectPath}`);
      } else {
        reject(new Error(xhr.responseText || `Supabase upload failed with HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading PDF'));
    xhr.send(file);
  });
}

async function loadExamSubmissions(examId) {
  const container = document.getElementById('admin-exam-results');
  const title = document.getElementById('admin-exam-results-title');
  const exam = adminExams.find((item) => item.id === examId);
  selectedResultsExamId = examId;

  if (title) title.textContent = exam ? exam.title : 'Kết quả bài nộp';
  if (container) container.innerHTML = '<div class="loader mx-auto mt-8"></div>';

  try {
    const submissionQuery = query(collection(db, 'exam_submissions'), where('examId', '==', examId));
    const snap = await getDocs(submissionQuery);
    const submissions = [];
    snap.forEach((item) => submissions.push({ id: item.id, ...item.data() }));
    submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    renderExamSubmissions(submissions);
  } catch (error) {
    console.error('loadExamSubmissions error:', error);
    if (container) container.innerHTML = '<p class="text-sm text-red-500 text-center py-10">Không tải được bài nộp.</p>';
  }
}

function renderSubmissionPlaceholder() {
  const title = document.getElementById('admin-exam-results-title');
  const container = document.getElementById('admin-exam-results');
  if (title) title.textContent = 'Chọn một đề thi để xem bài nộp.';
  if (container) container.innerHTML = '<p class="text-sm text-muted text-center py-10">Chưa chọn đề thi.</p>';
}

function renderExamSubmissions(submissions) {
  const container = document.getElementById('admin-exam-results');
  if (!container) return;

  if (submissions.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted text-center py-10">Chưa có học sinh nộp bài.</p>';
    return;
  }

  container.innerHTML = submissions.map((submission) => {
    const percent = submission.maxScore ? Math.round((Number(submission.score || 0) / Number(submission.maxScore)) * 100) : 0;
    return `
      <article class="rounded-2xl border border-theme bg-slate-50/70 dark:bg-white/5 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-black text-main text-sm truncate">${escapeHTML(submission.userName || submission.userEmail || 'Học sinh')}</p>
            <p class="text-[11px] text-muted mt-1 truncate">${escapeHTML(submission.userEmail || '')}</p>
          </div>
          <span class="rounded-full bg-blue-500/10 text-blue-500 px-2.5 py-1 text-xs font-black">${percent}%</span>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div class="rounded-xl border border-theme bg-card p-2">
            <p class="text-muted font-bold uppercase tracking-wider text-[10px]">Điểm</p>
            <p class="font-black text-main">${Number(submission.score || 0).toFixed(2)}/${Number(submission.maxScore || 0).toFixed(2)}</p>
          </div>
          <div class="rounded-xl border border-theme bg-card p-2">
            <p class="text-muted font-bold uppercase tracking-wider text-[10px]">Thời gian</p>
            <p class="font-black text-main">${formatDuration(submission.timeTaken)}</p>
          </div>
        </div>
        <p class="text-[11px] text-muted mt-3">Nộp lúc ${formatDateTime(submission.submittedAt)} · Lần ${submission.attemptNumber || 1}</p>
      </article>
    `;
  }).join('');
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
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m ${String(secs).padStart(2, '0')}s`;
}

function bindAdminExamEvents() {
  document.getElementById('btn-add-exam')?.addEventListener('click', () => openExamEditor());
  document.getElementById('btn-close-exam-modal')?.addEventListener('click', closeExamEditor);
  document.getElementById('btn-cancel-exam')?.addEventListener('click', closeExamEditor);
  document.getElementById('btn-save-exam')?.addEventListener('click', saveExam);
  document.getElementById('exam-pdf-upload')?.addEventListener('change', (event) => uploadSelectedPdf(event.target.files?.[0]));
  document.getElementById('btn-refresh-exam-results')?.addEventListener('click', () => {
    if (selectedResultsExamId) loadExamSubmissions(selectedResultsExamId);
  });

  document.querySelectorAll('[data-add-question]').forEach((button) => {
    button.addEventListener('click', () => addQuestion(button.dataset.addQuestion));
  });

  document.getElementById('admin-exams-table')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-exam-action]');
    if (!button) return;
    const action = button.dataset.examAction;
    const examId = button.dataset.examId;
    if (action === 'edit') openExamEditor(examId);
    if (action === 'delete') deleteExam(examId);
    if (action === 'results') loadExamSubmissions(examId);
  });

  const builder = document.getElementById('exam-question-builder');
  if (builder) {
    builder.addEventListener('input', (event) => updateQuestionField(event.target));
    builder.addEventListener('change', (event) => updateQuestionField(event.target));
    builder.addEventListener('click', (event) => {
      const button = event.target.closest('[data-question-action]');
      if (!button) return;
      handleQuestionAction(button.dataset.questionAction, Number(button.dataset.qIndex));
    });
  }

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.target === 'exams-tab' && adminUser?.email?.toLowerCase() === ADMIN_EMAIL) {
        loadAdminExams();
      }
    });
  });
}

onAuthStateChanged(auth, (user) => {
  adminUser = user;
  if (user?.email?.toLowerCase() !== ADMIN_EMAIL) return;
  const examsTab = document.getElementById('exams-tab');
  if (examsTab && !examsTab.classList.contains('hidden')) loadAdminExams();
});

bindAdminExamEvents();

window.loadAdminExams = loadAdminExams;
window.openExamEditor = openExamEditor;
window.saveExam = saveExam;

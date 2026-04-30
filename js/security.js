/**
 * ============================================================
 * KHOAHOCVIP SECURITY GUARD v2.0 — Mobile Safe
 * Không dùng debugger / size-check (gây false positive mobile)
 * ============================================================
 */
(function() {
  'use strict';

  // ─── 1. CHẶN CHUỘT PHẢI ─────────────────────────────────
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  });

  // ─── 2. CHẶN PHÍM TẮT NGUY HIỂM ────────────────────────
  // Chỉ chặn trên desktop (mobile không có keyboard F12)
  document.addEventListener('keydown', function(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const code = e.code || '';
    const key  = (e.key || '').toUpperCase();

    // F12
    if (e.keyCode === 123 || code === 'F12') {
      e.preventDefault(); return false;
    }
    // Ctrl+Shift+I / J / C / K (DevTools)
    if (ctrl && shift && ['I','J','C','K'].includes(key)) {
      e.preventDefault(); return false;
    }
    // Ctrl+U (View source)
    if (ctrl && key === 'U') {
      e.preventDefault(); return false;
    }
    // Ctrl+S (Save)
    if (ctrl && key === 'S') {
      e.preventDefault(); return false;
    }
    // Ctrl+P (Print)
    if (ctrl && key === 'P') {
      e.preventDefault(); return false;
    }
  });

  // ─── 3. CHẶN KÉO THẢ ẢNH ───────────────────────────────
  document.addEventListener('dragstart', function(e) {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') {
      e.preventDefault();
    }
  });

  // ─── 4. WATERMARK KHI COPY (chỉ trong view học) ─────────
  document.addEventListener('copy', function(e) {
    // Cho phép copy trong input/textarea (ghi chú)
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const el = document.activeElement;
    if (el && el.getAttribute('contenteditable') === 'true') return;

    // Chỉ chặn khi đang ở màn hình học
    const learningView = document.getElementById('view-learning');
    if (learningView && !learningView.classList.contains('hidden')) {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain',
          '© Khoahocvip.io.vn – Nội dung được bảo vệ bản quyền.');
      }
    }
  });

  // ─── 5. CSS: CHẶN CHỌN VĂN BẢN + IN ẤN ─────────────────
  document.addEventListener('DOMContentLoaded', function() {
    // Xóa blur/filter từ phiên cũ (nếu có cache)
    document.body.style.filter = '';
    document.body.style.pointerEvents = '';

    var style = document.createElement('style');
    style.textContent = [
      /* Chặn chọn text trong vùng học */
      '#current-lecture-title, #lecture-description, #course-outline,',
      '.video-player-wrap {',
      '  -webkit-user-select: none !important;',
      '  -moz-user-select: none !important;',
      '  user-select: none !important;',
      '}',
      /* Cho phép chọn trong ô ghi chú / input */
      'input, textarea, [contenteditable] {',
      '  -webkit-user-select: text !important;',
      '  user-select: text !important;',
      '}',
      /* Chặn kéo ảnh — KHÔNG dùng pointer-events (sẽ phá mobile touch) */
      'img { -webkit-user-drag: none; }',
      /* Tắt in trang */
      '@media print { body { display: none !important; } }'
    ].join('\n');
    document.head.appendChild(style);
  });

})();

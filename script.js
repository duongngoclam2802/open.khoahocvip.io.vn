/* ===== PARTICLES SCRIPT ===== */
(function createParticles() {
  const container = document.getElementById('particles');
  const count = window.innerWidth < 600 ? 35 : 70;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 3 + 1;
    const x = Math.random() * 100;
    const duration = Math.random() * 15 + 10;
    const delay = Math.random() * 20;
    const drift = (Math.random() - 0.5) * 200;
    const colors = ['#a78bfa', '#38bdf8', '#f472b6', '#ffffff'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}%;
      animation-duration: ${duration}s;
      animation-delay: -${delay}s;
      background: ${color};
      --drift: ${drift}px;
      opacity: 0;
      box-shadow: 0 0 ${size * 3}px ${color};
    `;
    container.appendChild(p);
  }
})();

/* ===== COUNTDOWN TIMER ===== */
const targetDate = new Date('2026-06-20T23:59:59+07:00');

function updateCountdown() {
  const now = new Date();
  const diff = targetDate - now;

  if (diff <= 0) {
    document.getElementById('days').textContent = '00';
    document.getElementById('hours').textContent = '00';
    document.getElementById('minutes').textContent = '00';
    document.getElementById('seconds').textContent = '00';
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const daysEl = document.getElementById('days');
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');

  animateValue(daysEl, String(days).padStart(2, '0'));
  animateValue(hoursEl, String(hours).padStart(2, '0'));
  animateValue(minutesEl, String(minutes).padStart(2, '0'));
  animateValue(secondsEl, String(seconds).padStart(2, '0'));
}

function animateValue(el, newVal) {
  if (el.textContent !== newVal) {
    el.style.transform = 'translateY(-10px) scale(0.9)';
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = newVal;
      el.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      el.style.transform = 'translateY(0) scale(1)';
      el.style.opacity = '1';
    }, 150);
    setTimeout(() => { el.style.transition = ''; }, 400);
  }
}

updateCountdown();
setInterval(updateCountdown, 1000);

/* ===== PROGRESS BAR INJECTION ===== */
(function addProgressBar() {
  const countdownSection = document.querySelector('.countdown-section');
  const startDate = new Date('2026-05-01T00:00:00+07:00');
  const endDate = new Date('2026-06-20T23:59:59+07:00');
  const now = new Date();
  const total = endDate - startDate;
  const elapsed = now - startDate;
  const percent = Math.min(Math.max(Math.round((elapsed / total) * 100), 0), 100);

  const progressHTML = `
    <div class="progress-bar-outer" style="margin-top:24px;">
      <div class="progress-bar-inner" style="--target-width: ${percent}%"></div>
    </div>
    <div class="progress-label">
      <span>Tiến độ nâng cấp</span>
      <span>${percent}% hoàn thành</span>
    </div>
  `;
  countdownSection.insertAdjacentHTML('beforeend', progressHTML);

  // Animate the progress bar to actual percent
  const inner = document.querySelector('.progress-bar-inner');
  if (inner) {
    inner.style.animation = 'none';
    inner.style.width = '0';
    setTimeout(() => {
      inner.style.transition = 'width 2s cubic-bezier(0.4, 0, 0.2, 1)';
      inner.style.width = percent + '%';
    }, 1800);
  }
})();

/* ===== HOVER TILT EFFECT ON FEATURE CARDS ===== */
document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -6;
    const rotY = ((x - cx) / cx) * 6;
    card.style.transform = `translateY(-6px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.01)`;
    card.style.transition = 'transform 0.1s ease';
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    card.style.transition = 'transform 0.4s ease';
  });
});

/* ===== INTERSECTION OBSERVER FOR SCROLL ANIMATIONS ===== */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.feature-card, .notice-card, .support-section').forEach(el => {
  observer.observe(el);
});

/* ===== COUNTDOWN NUMBER GLOW ON CHANGE ===== */
function addGlowOnChange() {
  document.querySelectorAll('.countdown-number').forEach(el => {
    const orig = el.textContent;
    const check = setInterval(() => {
      if (el.textContent !== orig) {
        clearInterval(check);
        el.style.textShadow = '0 0 40px rgba(167, 139, 250, 0.9), 0 0 80px rgba(56,189,248,0.5)';
        setTimeout(() => {
          el.style.transition = 'text-shadow 0.8s ease';
          el.style.textShadow = '0 0 30px rgba(167, 139, 250, 0.5)';
        }, 200);
      }
    }, 100);
  });
}
addGlowOnChange();

/* ===== TITLE TYPEWRITER EFFECT ===== */
(function titleAnimation() {
  const title = document.querySelector('.main-title');
  if (!title) return;
  title.style.opacity = '1';
})();

/* ===== MOUSE PARALLAX EFFECT ON ORBS ===== */
document.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 2;
  const y = (e.clientY / window.innerHeight - 0.5) * 2;
  const orbs = document.querySelectorAll('.orb');
  orbs.forEach((orb, i) => {
    const factor = (i + 1) * 15;
    orb.style.transform = `translate(${x * factor}px, ${y * factor}px)`;
  });
});

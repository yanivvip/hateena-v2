import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── FIREBASE ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDFcmKOIUROAEZAFoXSheYUO77a7XoXefY",
  authDomain: "hateena-bills.firebaseapp.com",
  projectId: "hateena-bills",
  storageBucket: "hateena-bills.firebasestorage.app",
  messagingSenderId: "583733208209",
  appId: "1:583733208209:web:80db86958c2471e8890b30"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// ── DEFAULT RATES (overridden by Firestore settings) ──────────────────
let RATES = { electricity: 0.64, waterA: 4.543, waterB: 11.6584, sewage: 6.4 };
let WATER_QUOTA = { main: 17.5, roni: 0, yuval: 7 };
let COMMUNITY_FEES = { main: 351, roni: 60, yuval: 60 };
let ARNONA = { main: 1607, roni: 272, yuval: 272 };

const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const CONSUMERS = [
  { id:'main',  name:'מיכל ויניב',   iconClass:'main',  iconType:'main',  hasMeter:false },
  { id:'roni',  name:'רני לובר',   iconClass:'unit1', iconType:'unit',  num:'1', hasMeter:true },
  { id:'yuval', name:'יובל ונועם', iconClass:'unit2', iconType:'unit',  num:'2', hasMeter:true },
];

// ── STATE ─────────────────────────────────────────────────────────────
let currentUser = null;
let userRole = 'tenant';
let userConsumerId = null;
let userName = '';
let viewMonth = new Date().getMonth();
let viewYear  = new Date().getFullYear();
let calcResult = null;

// ── AUTH ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    await loadUserProfile(user.uid);
    await loadSettings();
    showApp();
  } else {
    showLogin();
  }
});

async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const d = snap.data();
    userRole = d.role || 'tenant';
    userConsumerId = d.consumerId || null;
    userName = d.name || '';
  }
}

async function loadSettings() {
  const snap = await getDoc(doc(db, 'settings', 'rates'));
  if (snap.exists()) {
    const d = snap.data();
    if (d.electricity) RATES.electricity = d.electricity;
    if (d.waterA)      RATES.waterA      = d.waterA;
    if (d.waterB)      RATES.waterB      = d.waterB;
    if (d.sewage)      RATES.sewage      = d.sewage;
    if (d.waterQuota)  WATER_QUOTA       = { ...WATER_QUOTA, ...d.waterQuota };
    if (d.communityFees) COMMUNITY_FEES  = { ...COMMUNITY_FEES, ...d.communityFees };
    if (d.arnona)      ARNONA            = { ...ARNONA, ...d.arnona };
  }
}

// Listen for SW update messages
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'UPDATE_AVAILABLE') {
      showUpdateBanner();
    }
  });
  // Also detect new SW waiting
  navigator.serviceWorker.ready.then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }
      });
    });
  });
}

function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#7c3aed;color:white;padding:10px 16px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 2px 12px rgba(124,58,237,0.5);z-index:99999';
  banner.innerHTML = `<span style="display:flex;align-items:center;gap:8px"><i class="ti ti-refresh"></i> גרסה חדשה זמינה!</span><button onclick="window.location.reload(true)" style="background:white;color:#7c3aed;border:none;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">רענן עכשיו</button>`;
  document.body.prepend(banner);
}

window.toggleTheme = function() {
  const isLight = document.body.classList.toggle('light-mode');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = isLight ? 'ti ti-sun' : 'ti ti-moon';
  localStorage.setItem('bills-theme', isLight ? 'light' : 'dark');
};

// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('bills-theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = 'ti ti-sun';
  }
})();

window.hardRefresh = async function() {
  showToast('מרענן...');
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) await reg.unregister();
  }
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  window.location.reload(true);
};

window.togglePassword = function() {
  const input = document.getElementById('login-password');
  const icon  = document.getElementById('eye-icon');
  if (!input || !icon) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'ti ti-eye-off';
  } else {
    input.type = 'password';
    icon.className = 'ti ti-eye';
  }
};

window.loginUser = async function() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btnText = document.getElementById('login-btn-text');
  const btnSpinner = document.getElementById('login-btn-spinner');
  const btn = document.getElementById('login-btn');

  if (!email || !pass) { showErr(errEl, 'אנא הכנס אימייל וסיסמה'); return; }

  errEl.classList.add('hidden');
  btnText.classList.add('hidden');
  btnSpinner.classList.remove('hidden');
  btn.disabled = true;

  // Safety timeout – if login takes more than 10 seconds, reset button
  const loginTimeout = setTimeout(() => {
    btnText.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
    btn.disabled = false;
    showErr(errEl, 'הבקשה ארכה זמן רב מדי. נסה שוב.');
  }, 10000);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    clearTimeout(loginTimeout);
  } catch(e) {
    clearTimeout(loginTimeout);
    showErr(errEl, 'אימייל או סיסמה שגויים');
    btnText.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
    btn.disabled = false;
  }
};

window.logoutUser = async function() {
  await signOut(auth);
  // Reset login form
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  const errEl   = document.getElementById('login-error');
  const btnText = document.getElementById('login-btn-text');
  const btnSpinner = document.getElementById('login-btn-spinner');
  const btn = document.getElementById('login-btn');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';
  if (errEl)   errEl.classList.add('hidden');
  if (btnText)    btnText.classList.remove('hidden');
  if (btnSpinner) btnSpinner.classList.add('hidden');
  if (btn) btn.disabled = false;
};

function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function showLogin() {
  document.getElementById('screen-login').classList.add('active');
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('screen-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-app').classList.remove('hidden');
  document.getElementById('screen-app').classList.add('active');

  const initial = (userName || currentUser.email)[0].toUpperCase();
  const displayName = userName || initial;
  document.getElementById('user-badge').textContent = displayName;
  document.getElementById('user-badge').style.fontSize = userName && userName.length > 4 ? '10px' : userName && userName.length > 2 ? '12px' : '14px';
  document.getElementById('topbar-role').textContent = userRole === 'admin' ? 'מנהל' : 'דייר';

  document.querySelectorAll('.admin-only').forEach(el => {
    if (userRole === 'admin') el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  showPage('home');
  checkNotifications();
}

// ── NAVIGATION ────────────────────────────────────────────────────────
window.showPage = function(name) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  if (page) {
    page.classList.remove('hidden');
    page.classList.add('active');
  }
  const btn = document.querySelector(`.nav-btn[data-page="${name}"]`);
  if (btn) btn.classList.add('active');

  const renders = { home: renderHome, meter: renderMeterPage, calc: renderCalcPage, history: renderHistoryPage, settings: renderSettingsPage };
  if (renders[name]) renders[name]();
};

// ── MONTH KEY ─────────────────────────────────────────────────────────
function monthKey(m, y) {
  m = m ?? viewMonth; y = y ?? viewYear;
  return `${y}-${String(m+1).padStart(2,'0')}`;
}

function prevMonthKey() {
  let m = viewMonth - 1, y = viewYear;
  if (m < 0) { m = 11; y--; }
  return monthKey(m, y);
}

window.changeViewMonth = function(delta) {
  viewMonth += delta;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
  const active = document.querySelector('.page.active');
  if (active) {
    const name = active.id.replace('page-','');
    const renders = { home: renderHome, meter: renderMeterPage, calc: renderCalcPage };
    if (renders[name]) renders[name]();
  }
};

// ── UNIT ICON HTML ────────────────────────────────────────────────────
function unitIconHTML(c, size = 'normal') {
  const icon = c.iconType === 'main' ? 'ti-home-2' : 'ti-building-skyscraper';
  const sz = size === 'small' ? '32px' : '40px';
  const fsz = size === 'small' ? '16px' : '20px';
  return `<div class="unit-icon-wrap">
    <div class="unit-icon ${c.iconClass}" style="width:${sz};height:${sz}">
      <i class="ti ${icon}" style="font-size:${fsz}" aria-hidden="true"></i>
    </div>
    ${c.num ? `<div class="unit-num">${c.num}</div>` : ''}
  </div>`;
}

// ── BILLING CALC ──────────────────────────────────────────────────────
function calcElectricity(m, fixedPayment) {
  const mainUsage = (m.elec_main_cur||0) - (m.elec_main_prev||0);
  const roniUsage = (m.elec_roni_cur||0) - (m.elec_roni_prev||0);
  const yuvalUsage= (m.elec_yuval_cur||0)- (m.elec_yuval_prev||0);
  const mainCalc  = mainUsage - roniUsage - yuvalUsage;
  const share = fixedPayment / 3;
  return {
    main:  { usage:mainCalc,  variable:mainCalc*RATES.electricity,  fixed:share, total:mainCalc*RATES.electricity+share  },
    roni:  { usage:roniUsage, variable:roniUsage*RATES.electricity, fixed:share, total:roniUsage*RATES.electricity+share },
    yuval: { usage:yuvalUsage,variable:yuvalUsage*RATES.electricity,fixed:share, total:yuvalUsage*RATES.electricity+share},
    fixedPayment,
  };
}

function waterCost(usage, quota) {
  if (usage <= 0) return { a:0, aCost:0, b:0, bCost:0, total:0 };
  if (usage <= quota) return { a:usage, aCost:usage*RATES.waterA, b:0, bCost:0, total:usage*RATES.waterA };
  const a=quota, b=usage-quota;
  return { a, aCost:a*RATES.waterA, b, bCost:b*RATES.waterB, total:a*RATES.waterA+b*RATES.waterB };
}

function calcWater(m) {
  const mainUsage = (m.water_main_cur||0)-(m.water_main_prev||0);
  const roniUsage = (m.water_roni_cur||0)-(m.water_roni_prev||0);
  const yuvalUsage= (m.water_yuval_cur||0)-(m.water_yuval_prev||0);
  const mainCalc  = mainUsage - roniUsage - yuvalUsage;
  return {
    main:  { usage:mainCalc,  ...waterCost(mainCalc,  WATER_QUOTA.main)  },
    roni:  { usage:roniUsage, ...waterCost(roniUsage, WATER_QUOTA.roni)  },
    yuval: { usage:yuvalUsage,...waterCost(yuvalUsage, WATER_QUOTA.yuval) },
  };
}

function calcSewage(sewWater) {
  return {
    main:  { usage:sewWater.main||0,  total:(sewWater.main||0)*RATES.sewage  },
    roni:  { usage:sewWater.roni||0,  total:(sewWater.roni||0)*RATES.sewage  },
    yuval: { usage:sewWater.yuval||0, total:(sewWater.yuval||0)*RATES.sewage },
  };
}

function calcTotals(elec, water, hasArnona, sewage, charges) {
  const result = {};
  ['main','roni','yuval'].forEach(id => {
    const community = COMMUNITY_FEES[id];
    const arnona    = hasArnona ? ARNONA[id] : 0;
    const sewageAmt = sewage ? sewage[id].total : 0;
    const extraCharges = (charges||[]).filter(c=>c.consumerId===id||c.consumerId==='all').reduce((s,c)=>s+c.amount,0);
    result[id] = {
      electricity: elec[id].total,
      water:       water[id].total,
      community,
      arnona,
      sewage:      sewageAmt,
      extraCharges,
      total:       elec[id].total + water[id].total + community + arnona + sewageAmt + extraCharges,
    };
  });
  return result;
}

// ── HOME PAGE ─────────────────────────────────────────────────────────
async function renderHome() {
  const page = document.getElementById('page-home');
  page.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  if (userRole === 'admin') {
    await renderAdminHomeNew(page);
  } else {
    // Tenant: find latest approved month
    let latestCalcSnap = null;
    for (let m = 11; m >= 0; m--) {
      const snap = await getDoc(doc(db,'calculations',monthKey(m, viewYear)));
      if (snap.exists() && snap.data().status === 'approved') {
        latestCalcSnap = snap;
        break;
      }
    }
    page.innerHTML = renderTenantHome(latestCalcSnap);
  }
}

async function renderAdminHomeNew(page) {
  // Load all 12 months of the year
  const year = viewYear;
  const allSnaps = await Promise.all(
    Array.from({length:12}, (_,m) =>
      getDoc(doc(db,'calculations',`${year}-${String(m+1).padStart(2,'0')}`))
    )
  );

  // Find latest approved month for detail display
  let latestIdx = -1;
  let latestSnap = null;
  for (let m = 11; m >= 0; m--) {
    if (allSnaps[m].exists() && allSnaps[m].data().status === 'approved') {
      latestIdx = m;
      latestSnap = allSnaps[m];
      break;
    }
  }

  let html = '';

  // Year navigation
  html += `<div class="month-nav">
    <button class="month-nav-btn" onclick="changeViewYear(-1)" aria-label="שנה קודמת"><i class="ti ti-chevron-right"></i></button>
    <span class="month-nav-label">${year}</span>
    <button class="month-nav-btn" onclick="changeViewYear(1)" aria-label="שנה הבאה"><i class="ti ti-chevron-left"></i></button>
  </div>`;

  // 12-month grid
  html += `<div class="card">
    <div class="section-hdr"><span class="section-title">סטטוס חודשי ${year}</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:4px">`;

  for (let m = 0; m < 12; m++) {
    const snap = allSnaps[m];
    const exists = snap.exists();
    const data = exists ? snap.data() : null;
    const approved = exists && data.status === 'approved';
    const paid = approved ? Object.values(data.paid||{}).every(Boolean) && Object.keys(data.paid||{}).length > 0 : false;
    const allPaid = approved && paid;
    const somePaid = approved && !allPaid && Object.values(data.paid||{}).some(Boolean);
    const approvedAt = approved && data.approvedAt?.toDate ? data.approvedAt.toDate() : null;
    const dateStr = approvedAt ? `${approvedAt.getDate()}.${approvedAt.getMonth()+1}` : '';
    const mk = `${year}-${String(m+1).padStart(2,'0')}`;

    let bg = 'rgba(255,255,255,0.04)';
    let border = 'var(--border)';
    let icon = '';
    if (allPaid)   { bg = 'rgba(5,150,105,0.15)';  border = 'rgba(5,150,105,0.4)';  icon = '<i class="ti ti-circle-check" style="color:#6ee7b7;font-size:14px"></i>'; }
    else if (somePaid) { bg = 'rgba(217,119,6,0.1)'; border = 'rgba(217,119,6,0.3)'; icon = '<i class="ti ti-clock" style="color:#fcd34d;font-size:14px"></i>'; }
    else if (approved) { bg = 'rgba(124,58,237,0.1)'; border = 'rgba(124,58,237,0.3)'; icon = '<i class="ti ti-check" style="color:#a78bfa;font-size:14px"></i>'; }

    html += `<div onclick="selectMonth(${m},${year})" style="background:${bg};border:1px solid ${border};border-radius:8px;padding:8px 6px;text-align:center;cursor:pointer;transition:all .15s">
      <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${MONTHS_HE[m].substring(0,3)}</div>
      <div style="margin-top:3px;height:16px">${icon}</div>
      ${dateStr ? `<div style="font-size:9px;color:var(--text-muted);margin-top:2px">${dateStr}</div>` : ''}
    </div>`;
  }

  html += `</div></div>`;

  // Latest approved month detail
  if (latestSnap) {
    const data = latestSnap.data();
    const totals = data.totals || {};
    const grand = Object.values(totals).reduce((s,t)=>s+(t.total||0),0);
    const approvedAt = data.approvedAt?.toDate ? data.approvedAt.toDate() : null;
    const dateStr = approvedAt ? `${approvedAt.getDate()}.${approvedAt.getMonth()+1}.${approvedAt.getFullYear()}` : '';
    const latestMk = `${year}-${String(latestIdx+1).padStart(2,'0')}`;

    html += `<div class="hero-card">
      <div class="hero-month">${MONTHS_HE[latestIdx]} ${year}${dateStr ? ` • עודכן ${dateStr}` : ''}</div>
      <div class="hero-amount">₪${grand.toFixed(0)}</div>
      <div class="hero-label">סה"כ חיובים</div>
      <div class="hero-grid">
        ${CONSUMERS.map(c=>`<div class="hero-stat">
          <div class="hero-stat-val">₪${(totals[c.id]?.total||0).toFixed(0)}</div>
          <div class="hero-stat-label">${c.name}</div>
        </div>`).join('')}
      </div>
    </div>`;

    if (data.status === 'pending_approval') {
      html += `<div class="approval-banner">
        <div class="approval-title"><i class="ti ti-clock"></i> ממתין לאישורך</div>
        <div class="approval-actions">
          <button class="btn-sm btn-sm-green" onclick="approveCalc('${latestMk}')"><i class="ti ti-check"></i> אשר ושלח</button>
          <button class="btn-sm btn-sm-purple" onclick="showCalcDetail('${latestMk}')"><i class="ti ti-eye"></i> פירוט</button>
        </div>
      </div>`;
    }

    html += `<div class="card">
      <div class="section-hdr"><span class="section-title">פירוט ${MONTHS_HE[latestIdx]}</span>
        <span class="badge badge-${data.hasArnona?'amber':'purple'}">${data.hasArnona?'ארנונה+ביוב':'חודש רגיל'}</span>
      </div>`;

    CONSUMERS.forEach(c => {
      const t = totals[c.id]||{};
      const paid = data.paid?.[c.id];
      html += `<div class="unit-row" onclick="showTenantDetail('${c.id}','${latestMk}')">
        ${unitIconHTML(c)}
        <div class="unit-info">
          <div class="unit-name">${c.name}</div>
        </div>
        <div style="text-align:left">
          <div class="unit-amount">₪${(t.total||0).toFixed(0)}</div>
          ${paid ? '<span class="badge badge-green" style="font-size:9px"><i class="ti ti-check"></i> שולם</span>' : ''}
        </div>
      </div>`;
    });
    html += `</div>`;

  } else {
    html += `<div class="hero-card">
      <div class="hero-month">${year}</div>
      <div class="hero-amount">₪—</div>
      <div class="hero-label">טרם בוצע חישוב השנה</div>
    </div>
    <button class="btn-primary" onclick="showPage('calc')"><i class="ti ti-calculator"></i> בצע חישוב חודשי</button>`;
  }

  page.innerHTML = html;
}

function buildMonthNav() {
  return `<div class="month-nav">
    <button class="month-nav-btn" onclick="changeViewMonth(-1)" aria-label="חודש קודם"><i class="ti ti-chevron-right"></i></button>
    <span class="month-nav-label">${MONTHS_HE[viewMonth]} ${viewYear}</span>
    <button class="month-nav-btn" onclick="changeViewMonth(1)" aria-label="חודש הבא"><i class="ti ti-chevron-left"></i></button>
  </div>`;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const d = date.getDate(), mo = date.getMonth()+1, y = String(date.getFullYear()).slice(2);
  const h = String(date.getHours()).padStart(2,'0'), min = String(date.getMinutes()).padStart(2,'0');
  return `${d}.${mo}.${y} בשעה ${h}:${min}`;
}

window.changeViewYear = function(delta) {
  viewYear += delta;
  renderHome();
};

window.selectMonth = async function(m, y) {
  viewMonth = m;
  viewYear = y;
  const mk = monthKey(m, y);
  const calcSnap = await getDoc(doc(db,'calculations',mk));
  if (calcSnap.exists()) {
    showCalcDetail(mk);
  } else {
    showPage('meter');
  }
};

function renderTenantHome(calcSnap) {
  let html = '';
  if (!calcSnap.exists() || calcSnap.data().status !== 'approved') {
    return `<div class="empty-state">
      <div class="empty-icon"><i class="ti ti-clock"></i></div>
      <div class="empty-text">החישוב לחודש זה טרם פורסם</div>
    </div>`;
  }
  const data = calcSnap.data();
  const t    = data.totals?.[userConsumerId] || {};
  const paid = data.paid?.[userConsumerId];
  const c    = CONSUMERS.find(c=>c.id===userConsumerId);

  html += `<div class="hero-card">
    <div class="hero-month">${MONTHS_HE[viewMonth]} ${viewYear}</div>
    <div class="hero-amount">₪${(t.total||0).toFixed(0)}</div>
    <div class="hero-label">לתשלום החודש</div>
  </div>`;

  if (paid) {
    html += `<div class="card" style="border-color:rgba(5,150,105,0.4);background:rgba(5,150,105,0.05)">
      <div style="display:flex;align-items:center;gap:8px;color:#6ee7b7">
        <i class="ti ti-circle-check" style="font-size:22px"></i>
        <span style="font-weight:600">התשלום סומן כ"שולם" ✓</span>
      </div>
    </div>`;
  }

  html += `<div class="card">
    <div class="card-title" style="margin-bottom:12px">פירוט חיובים</div>
    <table class="breakdown-table">
      <tr><td><i class="ti ti-bolt" style="color:#fcd34d;margin-left:6px"></i>חשמל</td><td>₪${(t.electricity||0).toFixed(2)}</td></tr>
      <tr><td><i class="ti ti-droplet" style="color:#67e8f9;margin-left:6px"></i>מים</td><td>₪${(t.water||0).toFixed(2)}</td></tr>
      <tr><td><i class="ti ti-building-community" style="color:#a78bfa;margin-left:6px"></i>מיסי קהילה</td><td>₪${(t.community||0).toFixed(2)}</td></tr>
      ${t.arnona?`<tr><td><i class="ti ti-receipt-tax" style="color:#fcd34d;margin-left:6px"></i>ארנונה</td><td>₪${t.arnona.toFixed(2)}</td></tr>`:''}
      ${t.sewage?`<tr><td><i class="ti ti-droplets" style="color:#67e8f9;margin-left:6px"></i>ביוב</td><td>₪${t.sewage.toFixed(2)}</td></tr>`:''}
      ${t.extraCharges?`<tr><td><i class="ti ti-plus" style="color:#fcd34d;margin-left:6px"></i>חיובים נוספים</td><td>₪${t.extraCharges.toFixed(2)}</td></tr>`:''}
    </table>
    <div class="breakdown-total">
      <span class="breakdown-total-label">סה"כ לתשלום</span>
      <span class="breakdown-total-val">₪${(t.total||0).toFixed(0)}</span>
    </div>
  </div>`;
  return html;
}

// ── METER PAGE ────────────────────────────────────────────────────────
async function renderMeterPage() {
  const page = document.getElementById('page-meter');
  page.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const mk   = monthKey();
  const pmk  = prevMonthKey();
  const [metersSnap, prevSnap] = await Promise.all([
    getDoc(doc(db,'meters',mk)),
    getDoc(doc(db,'meters',pmk))
  ]);
  const md   = metersSnap.exists() ? metersSnap.data() : {};
  const prev = prevSnap.exists()   ? prevSnap.data()   : {};

  let html = `<div class="page-title">דיווח מונים</div>
    <div class="page-sub">${MONTHS_HE[viewMonth]} ${viewYear}</div>
    ${buildMonthNav()}`;

  if (userRole === 'admin') {
    html += renderAdminMeterForm(md, prev, mk);
  } else {
    html += renderTenantMeterForm(md, prev, mk);
  }
  page.innerHTML = html;
}

function renderAdminMeterForm(md, prev, mk) {
  let html = '';

  // ── ELECTRICITY
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-bolt" style="color:#fcd34d"></i> חשמל</span></div>`;

  // Main meter
  html += `<div class="meter-card">
    <div class="meter-hdr">
      <i class="ti ti-plug" style="font-size:22px;color:#a78bfa" aria-hidden="true"></i>
      <div><div class="meter-title">מונה חשמל ראשי</div><div class="meter-subtitle">מונה כולל לכל השטח</div></div>
    </div>
    <div class="meter-inputs">
      <div><div class="input-label">קריאה קודמת</div>
        <input class="input-field" type="number" id="elec_main_prev" value="${md.elec_main_prev??prev.elec_main_cur??''}" placeholder="0" inputmode="numeric" oninput="calcUsageDisplay('elec_main','קוט&quot;ש')">
      </div>
      <div><div class="input-label">קריאה נוכחית</div>
        <input class="input-field" type="number" id="elec_main_cur" value="${md.elec_main_cur??''}" placeholder="0" inputmode="numeric" oninput="calcUsageDisplay('elec_main','קוט&quot;ש')">
      </div>
    </div>
    <div class="usage-disp" id="usage-elec_main" style="${md.elec_main_cur?'':'display:none'}">
      <span class="usage-label">צריכה</span>
      <span class="usage-val" id="usage-val-elec_main">${md.elec_main_cur?((md.elec_main_cur||0)-(md.elec_main_prev||prev.elec_main_cur||0)).toFixed(0)+' קוט"ש':''}</span>
    </div>
  </div>`;

  // Tenant electricity (read-only display + admin override)
  ['roni','yuval'].forEach(id => {
    const c = CONSUMERS.find(c=>c.id===id);
    const submitted = md[`elec_${id}_cur`] !== undefined;
    const prevVal = md[`elec_${id}_prev`]??prev[`elec_${id}_cur`]??'—';
    const curVal  = md[`elec_${id}_cur`]??'';
    const usage   = submitted ? ((md[`elec_${id}_cur`]||0)-(parseFloat(prevVal)||0)).toFixed(0) : null;
    const photoUrl= md[`elec_${id}_photo`];

    html += `<div class="meter-card ${submitted?'submitted':''}">
      <div class="meter-hdr">
        ${unitIconHTML(c,'small')}
        <div style="flex:1"><div class="meter-title">${c.name}</div>
          <div class="meter-subtitle">${submitted ? `✓ עודכן: ${formatTimestamp(md[`elec_${id}_updatedAt`])}` : 'ממתין לדיווח'}</div>
        </div>
        <button class="btn-sm btn-sm-purple" onclick="adminEditMeter('${mk}','${id}','${curVal}','${prevVal}')">
          <i class="ti ti-edit"></i> עדכן
        </button>
      </div>
      ${submitted?`<div class="usage-disp">
        <span class="usage-label">קריאה קודמת: ${prevVal}</span>
        <span class="usage-val">${usage} קוט"ש</span>
      </div>`:''}
      ${photoUrl?`<img src="${photoUrl}" style="width:100%;border-radius:8px;margin-top:8px;max-height:140px;object-fit:cover" alt="צילום מונה">`:''}
    </div>`;
  });

  // ── WATER
  html += `<div class="section-hdr" style="margin-top:4px"><span class="section-title"><i class="ti ti-droplet" style="color:#67e8f9"></i> מים</span></div>`;
  ['main','roni','yuval'].forEach(id => {
    const c       = CONSUMERS.find(c=>c.id===id);
    const prevCur = md[`water_${id}_prev`]??prev[`water_${id}_cur`]??'';
    const curCur  = md[`water_${id}_cur`]??'';
    html += `<div class="meter-card">
      <div class="meter-hdr">
        <i class="ti ti-droplet" style="font-size:20px;color:#67e8f9" aria-hidden="true"></i>
        ${id==='main'?'<div><div class="meter-title">מונה מים ראשי</div></div>':
          `<div style="flex:1"><div class="meter-title">${c.name}</div></div>`}
      </div>
      <div class="meter-inputs">
        <div><div class="input-label">קריאה קודמת</div>
          <input class="input-field" type="number" id="water_${id}_prev" value="${prevCur}" placeholder="0" inputmode="numeric" oninput="calcUsageDisplay('water_${id}','מ&quot;ק')">
        </div>
        <div><div class="input-label">קריאה נוכחית</div>
          <input class="input-field" type="number" id="water_${id}_cur" value="${curCur}" placeholder="0" inputmode="numeric" oninput="calcUsageDisplay('water_${id}','מ&quot;ק')">
        </div>
      </div>
      <div class="usage-disp" id="usage-water_${id}" style="${curCur?'':'display:none'}">
        <span class="usage-label">צריכה</span>
        <span class="usage-val" id="usage-val-water_${id}">${curCur?((parseFloat(curCur)||0)-(parseFloat(prevCur)||0)).toFixed(2)+' מ"ק':''}</span>
      </div>
    </div>`;
  });

  // ── MAIN PREVIEW
  html += `<div id="main-preview" class="card" style="display:none;border-color:rgba(124,58,237,0.4);background:rgba(124,58,237,0.08)"
    data-elec-roni-cur="${md.elec_roni_cur??0}"
    data-elec-roni-prev="${md.elec_roni_prev??prev.elec_roni_cur??0}"
    data-elec-yuval-cur="${md.elec_yuval_cur??0}"
    data-elec-yuval-prev="${md.elec_yuval_prev??prev.elec_yuval_cur??0}"
    data-water-roni-cur="${md.water_roni_cur??0}"
    data-water-roni-prev="${md.water_roni_prev??prev.water_roni_cur??0}"
    data-water-yuval-cur="${md.water_yuval_cur??0}"
    data-water-yuval-prev="${md.water_yuval_prev??prev.water_yuval_cur??0}">
    <div class="card-title" style="color:#c4b5fd;margin-bottom:10px"><i class="ti ti-calculator"></i> מיכל ויניב – צריכה מחושבת (בזמן אמת)</div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(124,58,237,0.2)">
      <span style="font-size:13px;color:var(--text-secondary)"><i class="ti ti-bolt" style="color:#fcd34d;margin-left:6px"></i>חשמל</span>
      <span id="main-preview-elec" style="font-size:14px;font-weight:700">—</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
      <span style="font-size:13px;color:var(--text-secondary)"><i class="ti ti-droplet" style="color:#67e8f9;margin-left:6px"></i>מים</span>
      <span id="main-preview-water" style="font-size:14px;font-weight:700">—</span>
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px">* מחושב: מונה ראשי פחות שתי היחידות</div>
  </div>`;

  // ── FIXED PAYMENT
  html += `<div class="section-hdr" style="margin-top:4px"><span class="section-title"><i class="ti ti-credit-card" style="color:#a78bfa"></i> תשלום קבוע חשמל</span></div>
    <div class="card">
      <div class="form-group" style="margin:0">
        <label>סכום תשלום קבוע (₪) – מחולק שווה ל-3</label>
        <input type="number" id="fixed_payment" value="${md.fixed_payment??''}" placeholder="0" style="direction:ltr" inputmode="decimal">
      </div>
    </div>`;

  // ── ARNONA
  html += `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div><div class="card-title"><i class="ti ti-receipt-tax" style="color:#fcd34d;margin-left:6px"></i>ארנונה וביוב</div>
        <div class="card-sub">חודש עם שובר ארנונה</div>
      </div>
      <label class="switch"><input type="checkbox" id="has_arnona" ${md.has_arnona?'checked':''} onchange="toggleArnonaFields()">
        <span class="switch-slider"></span></label>
    </div>
    <div id="arnona-fields" style="display:${md.has_arnona?'block':'none'}">
      <div class="divider"></div>
      <div class="form-group"><label>תקופת ארנונה (למשל 05-06/2026)</label>
        <input type="text" id="arnona_period" value="${md.arnona_period??''}" placeholder="05-06/2026">
      </div>
      <div class="form-group"><label>תקופת מים לביוב (למשל 02-03/2026)</label>
        <input type="text" id="sewage_period" value="${md.sewage_period??''}" placeholder="02-03/2026">
      </div>
      <div class="section-hdr"><span class="section-title">צריכת מים לביוב (מ"ק)</span></div>
      ${['main','roni','yuval'].map(id=>{
        const c = CONSUMERS.find(c=>c.id===id);
        return `<div class="form-group"><label>${id==='main'?'מיכל ויניב':c.name}</label>
          <input type="number" id="sewage_water_${id}" value="${md[`sewage_water_${id}`]??''}" placeholder="0" style="direction:ltr" inputmode="decimal">
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // ── ONE-TIME CHARGES
  html += buildOneTimeChargesSection(md, mk);

  html += `<button class="btn-primary" onclick="saveMeters('${mk}')">
    <i class="ti ti-device-floppy"></i> שמור נתונים
  </button>`;

  return html;
}

function buildOneTimeChargesSection(md, mk) {
  const charges = md.oneTimeCharges || [];
  let html = `<div class="section-hdr" style="margin-top:4px">
    <span class="section-title"><i class="ti ti-plus" style="color:#fcd34d"></i> חיובים חד פעמיים</span>
    <button class="btn-sm btn-sm-purple" onclick="showAddCharge('${mk}')"><i class="ti ti-plus"></i> הוסף</button>
  </div>`;

  if (charges.length === 0) {
    html += `<div class="card"><div style="text-align:center;color:var(--text-muted);font-size:13px;padding:8px">אין חיובים נוספים</div></div>`;
  } else {
    html += `<div class="card">`;
    charges.forEach((ch, i) => {
      const c = CONSUMERS.find(c=>c.id===ch.consumerId);
      html += `<div class="charge-row">
        <div class="unit-icon-wrap" style="width:32px">${ch.consumerId==='all'?'<i class="ti ti-users" style="font-size:18px;color:#a78bfa"></i>':unitIconHTML(c,'small')}</div>
        <div class="charge-desc" style="margin-right:8px">
          <div style="color:var(--text-primary);font-size:13px">${ch.description}</div>
          <div style="font-size:11px">${ch.consumerId==='all'?'כולם':c?.name}</div>
        </div>
        <div class="charge-amt">₪${ch.amount.toFixed(0)}</div>
        <button class="btn-sm btn-sm-red" onclick="removeCharge('${mk}',${i})" style="padding:4px 8px"><i class="ti ti-trash"></i></button>
      </div>`;
    });
    html += `</div>`;
  }
  return html;
}

window.showAddCharge = function(mk) {
  openModal('הוסף חיוב חד פעמי', `
    <div class="form-group"><label>יחידה</label>
      <select id="charge-consumer">
        <option value="all">כולם (מחולק שווה)</option>
        ${CONSUMERS.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>תיאור</label>
      <input type="text" id="charge-desc" placeholder="למשל: תיקון משאבת מים">
    </div>
    <div class="form-group"><label>סכום (₪)</label>
      <input type="number" id="charge-amount" placeholder="0" style="direction:ltr" inputmode="decimal">
    </div>
    <button class="btn-primary" onclick="saveCharge('${mk}')"><i class="ti ti-plus"></i> הוסף חיוב</button>
  `);
};

window.saveCharge = async function(mk) {
  const consumerId = document.getElementById('charge-consumer').value;
  const desc  = document.getElementById('charge-desc').value.trim();
  const amount= parseFloat(document.getElementById('charge-amount').value);
  if (!desc || isNaN(amount) || amount <= 0) { showToast('אנא מלא את כל השדות'); return; }

  const snap = await getDoc(doc(db,'meters',mk));
  const md   = snap.exists() ? snap.data() : {};
  const charges = md.oneTimeCharges || [];
  charges.push({ consumerId, description:desc, amount });
  await setDoc(doc(db,'meters',mk), { oneTimeCharges: charges }, { merge:true });
  closeModal();
  showToast('חיוב נוסף ✓');
  renderMeterPage();
};

window.removeCharge = async function(mk, idx) {
  const snap = await getDoc(doc(db,'meters',mk));
  if (!snap.exists()) return;
  const charges = snap.data().oneTimeCharges || [];
  charges.splice(idx, 1);
  await updateDoc(doc(db,'meters',mk), { oneTimeCharges: charges });
  showToast('הוסר ✓');
  renderMeterPage();
};

function renderTenantMeterForm(md, prev, mk) {
  const id = userConsumerId;
  if (!id) return '<div class="empty-state"><div class="empty-icon"><i class="ti ti-alert-circle"></i></div><div class="empty-text">חשבון לא משויך לצרכן. פנה למנהל.</div></div>';

  const submitted = md[`elec_${id}_cur`] !== undefined;
  const prevVal   = md[`elec_${id}_prev`] ?? prev[`elec_${id}_cur`] ?? '';
  const photoUrl  = md[`elec_${id}_photo`];

  let html = '';
  if (submitted) {
    const usage = ((md[`elec_${id}_cur`]||0) - (parseFloat(prevVal)||0)).toFixed(0);
    html += `<div class="meter-card submitted">
      <div class="meter-hdr">
        <i class="ti ti-circle-check" style="font-size:28px;color:#6ee7b7" aria-hidden="true"></i>
        <div><div class="meter-title">מונה עודכן בהצלחה</div>
          <div class="meter-subtitle">${formatTimestamp(md[`elec_${id}_updatedAt`]) || `${MONTHS_HE[viewMonth]} ${viewYear}`}</div>
        </div>
      </div>
      <div class="usage-disp">
        <span class="usage-label">קריאה: ${md[`elec_${id}_cur`]}</span>
        <span class="usage-val">צריכה: ${usage} קוט"ש</span>
      </div>
      ${photoUrl?`<img src="${photoUrl}" style="width:100%;border-radius:8px;margin-top:8px;max-height:160px;object-fit:cover" alt="צילום מונה">`:''}
    </div>
    <button class="btn-secondary" onclick="editTenantMeter('${mk}','${id}','${md[`elec_${id}_cur`]}','${prevVal}')">
      <i class="ti ti-edit"></i> עדכן קריאה
    </button>`;
  } else {
    html += `<div class="meter-card">
      <div class="meter-hdr">
        <i class="ti ti-bolt" style="font-size:24px;color:#fcd34d" aria-hidden="true"></i>
        <div><div class="meter-title">קריאת מונה חשמל</div>
          <div class="meter-subtitle">${MONTHS_HE[viewMonth]} ${viewYear}</div>
        </div>
      </div>
      <div class="meter-inputs">
        <div><div class="input-label">קריאה קודמת</div>
          <input class="input-field" type="number" id="elec_prev" value="${prevVal}" readonly style="opacity:0.6">
        </div>
        <div><div class="input-label">קריאה נוכחית ✏️</div>
          <input class="input-field" type="number" id="elec_cur" placeholder="הכנס" inputmode="numeric" oninput="updateTenantUsage()">
        </div>
      </div>
      <div class="usage-disp" id="tenant-usage" style="display:none">
        <span class="usage-label">צריכה החודש</span>
        <span class="usage-val" id="tenant-usage-val">0 קוט"ש</span>
      </div>
    </div>
    <div class="section-hdr"><span class="section-title"><i class="ti ti-camera" style="color:#a78bfa"></i> צילום מונה</span></div>
    <div class="meter-card">
      <div class="photo-upload-area" id="photo-area" onclick="triggerPhotoInput()">
        <input type="file" id="photo-input" accept="image/*" capture="environment" onchange="handlePhotoSelected(event)" style="display:none">
        <div class="photo-upload-icon"><i class="ti ti-camera" aria-hidden="true"></i></div>
        <div class="photo-upload-text">לחץ לצילום מונה – OCR יזהה אוטומטית</div>
        <img id="photo-preview" class="photo-preview" alt="תצוגה מקדימה">
      </div>
      <div id="ocr-confirm" style="display:none;margin-top:10px;background:rgba(110,231,183,0.1);border:1px solid rgba(110,231,183,0.3);border-radius:8px;padding:10px 12px">
        <div style="font-size:12px;color:#6ee7b7;margin-bottom:6px"><i class="ti ti-robot"></i> OCR זיהה את המספר הבא – אנא אשר לפני שליחה:</div>
        <div style="font-size:13px;color:var(--text-secondary)">הערך מועתק לשדה "קריאה נוכחית" – בדוק שהוא נכון ותקן אם צריך.</div>
      </div>
    </div>
    <button class="btn-primary" onclick="submitTenantMeter('${mk}','${id}')">
      <i class="ti ti-send"></i> שלח קריאה
    </button>`;
  }
  return html;
}

window.triggerPhotoInput = function() {
  document.getElementById('photo-input')?.click();
};

window.handlePhotoSelected = async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const preview = document.getElementById('photo-preview');
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  }
  const area = document.getElementById('photo-area');
  if (area) area.querySelector('.photo-upload-text').textContent = 'מנתח תמונה...';

  // OCR via Google Cloud Vision
  try {
    const base64 = await fileToBase64(file);
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=AIzaSyDIo6mv0yLGiAAWVJiQ3wF_piajaojElxI`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    );
    const data = await response.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';

    // Extract meter number – look for longest sequence of digits (5-8 digits)
    const numbers = text.match(/\d[\d\s.,]{3,10}\d/g) || [];
    const cleaned = numbers.map(n => n.replace(/[\s.,]/g, '')).filter(n => n.length >= 4 && n.length <= 10);
    const bestMatch = cleaned.sort((a,b) => b.length - a.length)[0] || '';

    const curInput = document.getElementById('elec_cur');
    if (curInput && bestMatch) {
      curInput.value = bestMatch;
      curInput.style.borderColor = '#6ee7b7';
      updateTenantUsage();
      showToast(`OCR זיהה: ${bestMatch} – אנא אשר`);
      const confirmBox = document.getElementById('ocr-confirm');
      if (confirmBox) confirmBox.style.display = 'block';
    } else {
      showToast('לא זוהה מספר – הכנס ידנית');
    }

    if (area) area.querySelector('.photo-upload-text').textContent = '✓ תמונה נטענה';
  } catch(err) {
    console.error('OCR error:', err);
    showToast('שגיאה בניתוח תמונה – הכנס ידנית');
    if (area) area.querySelector('.photo-upload-text').textContent = file.name;
  }
};

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

window.updateTenantUsage = function() {
  const cur  = parseFloat(document.getElementById('elec_cur')?.value||0);
  const prev = parseFloat(document.getElementById('elec_prev')?.value||0);
  const disp = document.getElementById('tenant-usage');
  const val  = document.getElementById('tenant-usage-val');
  if (disp && val && cur > 0) {
    disp.style.display = 'flex';
    val.textContent = `${(cur-prev).toFixed(0)} קוט"ש`;
  }
};

window.calcUsageDisplay = function(fieldId, unit) {
  const cur  = parseFloat(document.getElementById(`${fieldId}_cur`)?.value||0);
  const prev = parseFloat(document.getElementById(`${fieldId}_prev`)?.value||0);
  const disp = document.getElementById(`usage-${fieldId}`);
  const val  = document.getElementById(`usage-val-${fieldId}`);
  if (disp && val) {
    if (cur > 0) {
      disp.style.display = 'flex';
      val.textContent = `${(cur-prev).toFixed(2)} ${unit}`;
    } else {
      disp.style.display = 'none';
    }
  }
  // Update מיכל ויניב live preview
  updateMainPreview();
};

function updateMainPreview() {
  // Electricity – main inputs
  const elecMainCur  = parseFloat(document.getElementById('elec_main_cur')?.value||0);
  const elecMainPrev = parseFloat(document.getElementById('elec_main_prev')?.value||0);

  // Tenant electricity – read from hidden data attributes set on page render
  const elecRoniCur   = parseFloat(document.getElementById('main-preview')?.dataset.elecRoniCur  ||0);
  const elecRoniPrev  = parseFloat(document.getElementById('main-preview')?.dataset.elecRoniPrev ||0);
  const elecYuvalCur  = parseFloat(document.getElementById('main-preview')?.dataset.elecYuvalCur ||0);
  const elecYuvalPrev = parseFloat(document.getElementById('main-preview')?.dataset.elecYuvalPrev||0);

  const elecMain = (elecMainCur - elecMainPrev) - (elecRoniCur - elecRoniPrev) - (elecYuvalCur - elecYuvalPrev);

  // Water
  const waterMainCur  = parseFloat(document.getElementById('water_main_cur')?.value||0);
  const waterMainPrev = parseFloat(document.getElementById('water_main_prev')?.value||0);
  const waterRoniCur  = parseFloat(document.getElementById('main-preview')?.dataset.waterRoniCur  ||0);
  const waterRoniPrev = parseFloat(document.getElementById('main-preview')?.dataset.waterRoniPrev ||0);
  const waterYuvalCur = parseFloat(document.getElementById('main-preview')?.dataset.waterYuvalCur ||0);
  const waterYuvalPrev= parseFloat(document.getElementById('main-preview')?.dataset.waterYuvalPrev||0);

  const waterMain = (waterMainCur - waterMainPrev) - (waterRoniCur - waterRoniPrev) - (waterYuvalCur - waterYuvalPrev);

  const preview = document.getElementById('main-preview');
  if (!preview) return;

  const hasData = elecMainCur > 0 || waterMainCur > 0;
  if (hasData) {
    preview.style.display = 'block';
    document.getElementById('main-preview-elec').textContent = `${elecMain.toFixed(1)} קוט"ש`;
    document.getElementById('main-preview-water').textContent = `${waterMain.toFixed(2)} מ"ק`;
    document.getElementById('main-preview-elec').style.color = elecMain < 0 ? '#fca5a5' : '#6ee7b7';
    document.getElementById('main-preview-water').style.color = waterMain < 0 ? '#fca5a5' : '#6ee7b7';
  } else {
    preview.style.display = 'none';
  }
}

window.toggleArnonaFields = function() {
  const checked = document.getElementById('has_arnona')?.checked;
  const fields  = document.getElementById('arnona-fields');
  if (fields) fields.style.display = checked ? 'block' : 'none';
};

window.saveMeters = async function(mk) {
  const data = {};
  const numFields = ['elec_main_prev','elec_main_cur','water_main_prev','water_main_cur',
                     'water_roni_prev','water_roni_cur','water_yuval_prev','water_yuval_cur','fixed_payment'];
  numFields.forEach(f => {
    const el = document.getElementById(f);
    if (el && el.value !== '') data[f] = parseFloat(el.value);
  });

  const hasArnona = document.getElementById('has_arnona')?.checked||false;
  data.has_arnona = hasArnona;
  if (hasArnona) {
    ['arnona_period','sewage_period'].forEach(f=>{
      const el=document.getElementById(f); if(el) data[f]=el.value;
    });
    ['main','roni','yuval'].forEach(id=>{
      const el=document.getElementById(`sewage_water_${id}`);
      if(el&&el.value!=='') data[`sewage_water_${id}`]=parseFloat(el.value);
    });
  }
  data.updatedAt = serverTimestamp();
  await setDoc(doc(db,'meters',mk), data, { merge:true });
  showToast('נתוני המונים נשמרו ✓');
};

window.submitTenantMeter = async function(mk, consumerId) {
  const curEl  = document.getElementById('elec_cur');
  const prevEl = document.getElementById('elec_prev');
  const photoInput = document.getElementById('photo-input');

  if (!curEl?.value) { showToast('אנא הכנס קריאת מונה'); return; }
  const curVal  = parseFloat(curEl.value);
  const prevVal = parseFloat(prevEl?.value||0);
  if (curVal < prevVal) { showToast('קריאה נוכחית לא יכולה להיות נמוכה מהקודמת'); return; }

  const btn = document.querySelector('.btn-primary');
  if (btn) { btn.disabled=true; btn.innerHTML='<div class="btn-spinner"></div>'; }

  try {
    let photoURL = null;
    if (photoInput?.files[0]) {
      const file = photoInput.files[0];
      const sRef = storageRef(storage, `meters/${mk}/${consumerId}_${Date.now()}.jpg`);
      await uploadBytes(sRef, file);
      photoURL = await getDownloadURL(sRef);
    }

    const updateData = {
      [`elec_${consumerId}_cur`]:       curVal,
      [`elec_${consumerId}_prev`]:      prevVal,
      [`elec_${consumerId}_updatedAt`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) updateData[`elec_${consumerId}_photo`] = photoURL;

    await setDoc(doc(db,'meters',mk), updateData, { merge:true });

    const c = CONSUMERS.find(c=>c.id===consumerId);
    await addDoc(collection(db,'notifications'), {
      type:'meter_submitted', consumerId, consumerName:c.name, monthKey:mk,
      message:`${c.name} עדכנ/ו מונה חשמל לחודש ${mk}`,
      read:false, createdAt:serverTimestamp(),
    });

    showToast('קריאה נשלחה בהצלחה ✓');
    renderMeterPage();
  } catch(e) {
    showToast('שגיאה בשליחה, נסה שוב');
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> שלח קריאה'; }
  }
};

window.adminEditMeter = function(mk, consumerId, curVal, prevVal) {
  const c = CONSUMERS.find(c=>c.id===consumerId);
  openModal(`עדכון מונה – ${c.name}`, `
    <div class="form-group"><label>קריאה קודמת</label>
      <input type="number" id="edit-prev" value="${(!prevVal||prevVal==='undefined')?'':prevVal}" class="input-field" inputmode="numeric">
    </div>
    <div class="form-group"><label>קריאה נוכחית</label>
      <input type="number" id="edit-cur" value="${(!curVal||curVal==='undefined')?'':curVal}" class="input-field" inputmode="numeric">
    </div>
    <div class="form-group"><label>צילום מונה</label>
      <div class="photo-upload-area" onclick="document.getElementById('admin-photo').click()">
        <input type="file" id="admin-photo" accept="image/*" style="display:none" onchange="handleAdminPhoto(event)">
        <div class="photo-upload-icon"><i class="ti ti-camera" aria-hidden="true"></i></div>
        <div class="photo-upload-text" id="admin-photo-name">לחץ לצילום</div>
        <img id="admin-photo-preview" class="photo-preview" alt="תצוגה מקדימה">
      </div>
    </div>
    <button class="btn-primary" onclick="saveAdminMeter('${mk}','${consumerId}')">
      <i class="ti ti-device-floppy"></i> שמור
    </button>
  `);
};

window.handleAdminPhoto = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('admin-photo-preview');
  if (preview) { preview.src=URL.createObjectURL(file); preview.style.display='block'; }
  const name = document.getElementById('admin-photo-name');
  if (name) name.textContent = file.name;
};

window.saveAdminMeter = async function(mk, consumerId) {
  const curVal  = parseFloat(document.getElementById('edit-cur')?.value);
  const prevVal = parseFloat(document.getElementById('edit-prev')?.value||0);
  if (isNaN(curVal) || curVal < prevVal) { showToast('קריאה לא תקינה'); return; }

  const btn = document.querySelector('.modal-box .btn-primary');
  if (btn) btn.disabled = true;

  try {
    let photoURL = null;
    const photoInput = document.getElementById('admin-photo');
    if (photoInput?.files[0]) {
      const sRef = storageRef(storage, `meters/${mk}/${consumerId}_admin_${Date.now()}.jpg`);
      await uploadBytes(sRef, photoInput.files[0]);
      photoURL = await getDownloadURL(sRef);
    }
    const updateData = {
      [`elec_${consumerId}_cur`]:       curVal,
      [`elec_${consumerId}_prev`]:      prevVal,
      [`elec_${consumerId}_updatedAt`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) updateData[`elec_${consumerId}_photo`] = photoURL;
    await setDoc(doc(db,'meters',mk), updateData, { merge:true });
    closeModal();
    showToast('מונה עודכן ✓');
    renderMeterPage();
  } catch(e) {
    showToast('שגיאה בשמירה');
    if (btn) btn.disabled = false;
  }
};

window.editTenantMeter = function(mk, consumerId, curVal, prevVal) {
  adminEditMeter(mk, consumerId, curVal, prevVal);
};

// ── CALC PAGE ─────────────────────────────────────────────────────────
async function renderCalcPage() {
  const page = document.getElementById('page-calc');
  if (userRole !== 'admin') { page.innerHTML=''; return; }
  page.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const mk = monthKey();
  const [metersSnap, calcSnap] = await Promise.all([
    getDoc(doc(db,'meters',mk)),
    getDoc(doc(db,'calculations',mk))
  ]);
  const md = metersSnap.exists() ? metersSnap.data() : {};

  let html = `<div class="page-title">חישוב חודשי</div>
    <div class="page-sub">${MONTHS_HE[viewMonth]} ${viewYear}</div>
    ${buildMonthNav()}`;

  // Validate
  const missing = [];
  if (!md.elec_main_cur)  missing.push('קריאת חשמל ראשי');
  if (!md.elec_roni_cur)  missing.push('קריאת חשמל רני');
  if (!md.elec_yuval_cur) missing.push('קריאת חשמל יובל/נועם');
  if (!md.water_main_cur) missing.push('קריאת מים ראשי');
  if (!md.water_roni_cur) missing.push('קריאת מים רני');
  if (!md.water_yuval_cur)missing.push('קריאת מים יובל/נועם');
  if (!md.fixed_payment)  missing.push('תשלום קבוע חשמל');

  if (missing.length > 0) {
    html += `<div class="card" style="border-color:rgba(217,119,6,0.4);background:rgba(217,119,6,0.05)">
      <div class="card-title" style="color:#fcd34d;margin-bottom:10px"><i class="ti ti-alert-triangle"></i> חסרים נתונים</div>
      ${missing.map(f=>`<div class="missing-field"><i class="ti ti-point-filled"></i><span>${f}</span></div>`).join('')}
      <button class="btn-secondary" onclick="showPage('meter')" style="margin-top:12px"><i class="ti ti-arrow-right"></i> עדכן מונים</button>
    </div>`;
    page.innerHTML = html;
    return;
  }

  // Run calculation
  const elec    = calcElectricity(md, md.fixed_payment);
  const water   = calcWater(md);
  const hasAr   = md.has_arnona||false;
  const sewage  = hasAr ? calcSewage({ main:md.sewage_water_main||0, roni:md.sewage_water_roni||0, yuval:md.sewage_water_yuval||0 }) : null;
  const charges = md.oneTimeCharges||[];
  const totals  = calcTotals(elec, water, hasAr, sewage, charges);
  calcResult    = { elec, water, totals, hasArnona:hasAr, sewage, charges, md, mk };

  if (calcSnap.exists() && calcSnap.data().status==='approved') {
    html += `<div class="card" style="border-color:rgba(5,150,105,0.4);background:rgba(5,150,105,0.05)">
      <div style="color:#6ee7b7;font-weight:600"><i class="ti ti-circle-check"></i> חישוב זה כבר אושר ונשלח</div>
    </div>`;
  }

  html += `<div class="card" style="border-color:rgba(124,58,237,0.3)">
    <div style="color:#c4b5fd;font-weight:600;margin-bottom:4px"><i class="ti ti-calculator"></i> תוצאת החישוב</div>
    <div class="card-sub">${hasAr?'כולל ארנונה וביוב':'חודש רגיל'}</div>
  </div>`;

  CONSUMERS.forEach(c => {
    const t = totals[c.id];
    const e = elec[c.id];
    const w = water[c.id];
    const cCharges = charges.filter(ch=>ch.consumerId===c.id||ch.consumerId==='all');
    html += `<div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        ${unitIconHTML(c,'small')}
        <div class="card-title" style="flex:1">${c.name}</div>
        <div class="unit-amount">₪${t.total.toFixed(0)}</div>
      </div>
      <table class="breakdown-table">
        <tr><td><i class="ti ti-bolt" style="color:#fcd34d;margin-left:4px"></i>חשמל (${e.usage.toFixed(1)} קוט"ש × ₪${RATES.electricity})</td><td>₪${e.variable.toFixed(2)}</td></tr>
        <tr><td><i class="ti ti-credit-card" style="color:#a78bfa;margin-left:4px"></i>קבוע שליש (₪${md.fixed_payment}/3)</td><td>₪${e.fixed.toFixed(2)}</td></tr>
        ${w.a>0?`<tr><td><i class="ti ti-droplet" style="color:#67e8f9;margin-left:4px"></i>מים תעריף א (${w.a.toFixed(2)} מ"ק)</td><td>₪${w.aCost.toFixed(2)}</td></tr>`:''}
        ${w.b>0?`<tr><td><i class="ti ti-droplet" style="color:#fcd34d;margin-left:4px"></i>מים תעריף ב (${w.b.toFixed(2)} מ"ק)</td><td>₪${w.bCost.toFixed(2)}</td></tr>`:''}
        <tr><td><i class="ti ti-building-community" style="color:#a78bfa;margin-left:4px"></i>מיסי קהילה</td><td>₪${t.community.toFixed(2)}</td></tr>
        ${hasAr?`<tr><td><i class="ti ti-receipt-tax" style="color:#fcd34d;margin-left:4px"></i>ארנונה (דו-חודשי)</td><td>₪${t.arnona.toFixed(2)}</td></tr>`:''}
        ${hasAr&&sewage?`<tr><td><i class="ti ti-droplets" style="color:#67e8f9;margin-left:4px"></i>ביוב (${sewage[c.id].usage.toFixed(2)} מ"ק)</td><td>₪${t.sewage.toFixed(2)}</td></tr>`:''}
        ${cCharges.map(ch=>`<tr><td><i class="ti ti-plus" style="color:#fcd34d;margin-left:4px"></i>${ch.description}${ch.consumerId==='all'?' (חלק)':''}</td><td>₪${(ch.consumerId==='all'?ch.amount/3:ch.amount).toFixed(2)}</td></tr>`).join('')}
      </table>
      <div class="breakdown-total">
        <span class="breakdown-total-label">סה"כ</span>
        <span class="breakdown-total-val">₪${t.total.toFixed(2)}</span>
      </div>
    </div>`;
  });

  html += `<div style="display:flex;flex-direction:column;gap:8px">
    <button class="btn-primary" onclick="saveAndApprove('${mk}')"><i class="ti ti-check"></i> אשר ושלח לדיירים</button>
    <button class="btn-secondary" onclick="showWhatsAppPreview()"><i class="ti ti-brand-whatsapp"></i> תצוגת וואטסאפ</button>
  </div>`;

  page.innerHTML = html;
}

window.saveAndApprove = async function(mk) {
  if (!calcResult) return;
  const btn = document.querySelector('#page-calc .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="btn-spinner"></div> שומר...'; }

  try {
    await setDoc(doc(db,'calculations',mk), {
      totals:     calcResult.totals,
      hasArnona:  calcResult.hasArnona,
      status:     'approved',
      approvedAt: serverTimestamp(),
      approvedBy: currentUser.uid,
      paid:       {},
    });

    // Auto-send tenant emails
    showToast('שולח מיילים לדיירים...');
    const [yr, mo] = mk.split('-');
    const monthName = MONTHS_HE[parseInt(mo)-1];
    const t = calcResult.totals;
    const tenantEmails = { roni:'Renanal13@gmail.com', yuval:'Yuvhiggins@gmail.com' };
    const tenantNames  = { roni:'רני', yuval:'יובל ונועם' };
    for (const [id, email] of Object.entries(tenantEmails)) {
      const tv = t[id] || {};
      await emailjs.send('service_hsuzwti', 'template_4h2gms8', {
        to_email:          email,
        tenant_name:       tenantNames[id],
        month_year:        `${monthName} ${yr}`,
        total_electricity: tv.electricity?.toFixed(2)||'0',
        total_water:       tv.water?.toFixed(2)||'0',
        community:         tv.community?.toFixed(2)||'0',
        arnona_line:       tv.arnona ? `🏛️ ארנונה: ₪${tv.arnona.toFixed(2)}` : '',
        sewage_line:       tv.sewage ? `🚰 ביוב: ₪${tv.sewage.toFixed(2)}`   : '',
        total:             tv.total?.toFixed(0)||'0',
      }, 'mGOnSglK3GGKpdxVI');
    }

    showToast('החישוב אושר ✓ – שתף קבצי אקסל כשתהיה מוכן');
    // Keep calcResult so share button works immediately after approval
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> אושר ✓'; }
    showPage('home');
  } catch(e) {
    console.error(e);
    showToast('שגיאה: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> אשר ושלח לדיירים'; }
  }
};

async function generateAndSendExcel(mk, result, sendToTenants = true) {
  const [yr, mo] = mk.split('-');
  const monthName = MONTHS_HE[parseInt(mo)-1];
  const { totals, elec, water, hasArnona, sewage, md } = result;

  // Fetch annual data from Firestore to build full year sheet
  const annualData = {};
  for (let m = 0; m < 12; m++) {
    const key = `${yr}-${String(m+1).padStart(2,'0')}`;
    const [calcSnap, metersSnap] = await Promise.all([
      getDoc(doc(db,'calculations',key)),
      getDoc(doc(db,'meters',key))
    ]);
    if (calcSnap.exists()) {
      annualData[m] = {
        calc:   calcSnap.data(),
        meters: metersSnap.exists() ? metersSnap.data() : {}
      };
    }
  }

  // Build Excel using SheetJS (XLSX)
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs');
  const wb = XLSX.utils.book_new();

  const MONTHS = MONTHS_HE;
  const CONSUMERS_LOCAL = [
    { id:'main',  name:'מיכל ויניב' },
    { id:'roni',  name:'רני לובר' },
    { id:'yuval', name:'יובל ונועם' },
  ];

  // Build sheet for each unit
  CONSUMERS_LOCAL.forEach((cons, cidx) => {
    const rows = [];
    rows.push([`${cons.name} – נתונים שנתיים ${yr}`, ...Array(12).fill(''), 'סה"כ שנתי']);
    rows.push(['קטגוריה', ...MONTHS, 'סה"כ']);

    const fields = [
      ['⚡ חשמל', null],
      ['קריאה קודמת (קוט"ש)', m => annualData[m]?.meters[`elec_${cons.id}_prev`] ?? ''],
      ['קריאה נוכחית (קוט"ש)', m => annualData[m]?.meters[`elec_${cons.id}_cur`] ?? ''],
      ['צריכה (קוט"ש)', m => {
        const d = annualData[m]?.meters;
        if (!d) return '';
        if (cons.id === 'main') {
          const main = (d.elec_main_cur||0)-(d.elec_main_prev||0);
          const roni = (d.elec_roni_cur||0)-(d.elec_roni_prev||0);
          const yuval= (d.elec_yuval_cur||0)-(d.elec_yuval_prev||0);
          return +(main-roni-yuval).toFixed(2);
        }
        return +((d[`elec_${cons.id}_cur`]||0)-(d[`elec_${cons.id}_prev`]||0)).toFixed(2);
      }],
      ['תעריף (₪/קוט"ש)', m => annualData[m] ? RATES.electricity : ''],
      ['עלות צריכה (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.electricity != null
        ? +(annualData[m].calc.totals[cons.id].electricity - (annualData[m].calc.totals[cons.id].electricity - annualData[m].calc.totals[cons.id].electricity)).toFixed(2) : ''],
      ['חלק בתשלום קבוע (₪)', m => annualData[m]?.meters?.fixed_payment
        ? +(annualData[m].meters.fixed_payment/3).toFixed(2) : ''],
      ['סה"כ חשמל (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.electricity != null
        ? +annualData[m].calc.totals[cons.id].electricity.toFixed(2) : ''],
      ['💧 מים', null],
      ['קריאה קודמת (מ"ק)', m => annualData[m]?.meters[`water_${cons.id}_prev`] ?? ''],
      ['קריאה נוכחית (מ"ק)', m => annualData[m]?.meters[`water_${cons.id}_cur`] ?? ''],
      ['צריכה כוללת (מ"ק)', m => {
        const d = annualData[m]?.meters;
        if (!d) return '';
        if (cons.id === 'main') {
          const main = (d.water_main_cur||0)-(d.water_main_prev||0);
          const roni = (d.water_roni_cur||0)-(d.water_roni_prev||0);
          const yuval= (d.water_yuval_cur||0)-(d.water_yuval_prev||0);
          return +(main-roni-yuval).toFixed(2);
        }
        return +((d[`water_${cons.id}_cur`]||0)-(d[`water_${cons.id}_prev`]||0)).toFixed(2);
      }],
      ['סה"כ מים (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.water != null
        ? +annualData[m].calc.totals[cons.id].water.toFixed(2) : ''],
      ['🏘️ קהילה וחיובים', null],
      ['מיסי קהילה (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.community ?? ''],
      ['ארנונה (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.arnona || ''],
      ['ביוב (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.sewage || ''],
      ['חיובים נוספים (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.extraCharges || ''],
      ['💳 סה"כ לתשלום (₪)', m => annualData[m]?.calc?.totals?.[cons.id]?.total != null
        ? +annualData[m].calc.totals[cons.id].total.toFixed(2) : ''],
      ['✓ שולם', m => annualData[m]?.calc?.paid?.[cons.id] ? 'כן' : ''],
    ];

    fields.forEach(([label, fn]) => {
      if (fn === null) {
        rows.push([label, ...Array(13).fill('')]);
      } else {
        const vals = Array.from({length:12}, (_,m) => { try { return fn(m); } catch { return ''; } });
        const numVals = vals.filter(v => typeof v === 'number');
        const total = numVals.length > 0 ? +numVals.reduce((a,b)=>a+b,0).toFixed(2) : '';
        rows.push([label, ...vals, total]);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:28}, ...Array(12).fill({wch:11}), {wch:13}];
    XLSX.utils.book_append_sheet(wb, ws, cons.name);
  });

  // Summary sheet
  const summaryRows = [];
  summaryRows.push([`ריכוז נתונים שנתי – ${yr}`, ...Array(12).fill(''), 'סה"כ שנתי']);
  summaryRows.push(['קטגוריה', ...MONTHS, 'סה"כ']);

  const summaryFields = [
    ['⚡ חשמל', null],
    ...CONSUMERS_LOCAL.flatMap(c => [
      [`${c.name} – צריכה (קוט"ש)`, m => {
        const d = annualData[m]?.meters;
        if (!d) return '';
        if (c.id === 'main') {
          const main=(d.elec_main_cur||0)-(d.elec_main_prev||0);
          const roni=(d.elec_roni_cur||0)-(d.elec_roni_prev||0);
          const yuval=(d.elec_yuval_cur||0)-(d.elec_yuval_prev||0);
          return +(main-roni-yuval).toFixed(2);
        }
        return +((d[`elec_${c.id}_cur`]||0)-(d[`elec_${c.id}_prev`]||0)).toFixed(2);
      }],
      [`${c.name} – תשלום (₪)`, m => annualData[m]?.calc?.totals?.[c.id]?.electricity != null
        ? +annualData[m].calc.totals[c.id].electricity.toFixed(2) : ''],
    ]),
    ['סה"כ חשמל (₪)', m => {
      if (!annualData[m]?.calc) return '';
      return +CONSUMERS_LOCAL.reduce((s,c)=>s+(annualData[m].calc.totals?.[c.id]?.electricity||0),0).toFixed(2);
    }],
    ['💧 מים', null],
    ...CONSUMERS_LOCAL.flatMap(c => [
      [`${c.name} – צריכה (מ"ק)`, m => {
        const d = annualData[m]?.meters;
        if (!d) return '';
        if (c.id === 'main') {
          const main=(d.water_main_cur||0)-(d.water_main_prev||0);
          const roni=(d.water_roni_cur||0)-(d.water_roni_prev||0);
          const yuval=(d.water_yuval_cur||0)-(d.water_yuval_prev||0);
          return +(main-roni-yuval).toFixed(2);
        }
        return +((d[`water_${c.id}_cur`]||0)-(d[`water_${c.id}_prev`]||0)).toFixed(2);
      }],
      [`${c.name} – תשלום (₪)`, m => annualData[m]?.calc?.totals?.[c.id]?.water != null
        ? +annualData[m].calc.totals[c.id].water.toFixed(2) : ''],
    ]),
    ['סה"כ מים (₪)', m => {
      if (!annualData[m]?.calc) return '';
      return +CONSUMERS_LOCAL.reduce((s,c)=>s+(annualData[m].calc.totals?.[c.id]?.water||0),0).toFixed(2);
    }],
    ['🏘️ קהילה וארנונה', null],
    ...CONSUMERS_LOCAL.map(c => [`${c.name} – קהילה (₪)`, m => annualData[m]?.calc?.totals?.[c.id]?.community || '']),
    ...CONSUMERS_LOCAL.map(c => [`${c.name} – ארנונה (₪)`, m => annualData[m]?.calc?.totals?.[c.id]?.arnona || '']),
    ['סה"כ ביוב (₪)', m => {
      if (!annualData[m]?.calc) return '';
      return +CONSUMERS_LOCAL.reduce((s,c)=>s+(annualData[m].calc.totals?.[c.id]?.sewage||0),0).toFixed(2);
    }],
    ['💳 סה"כ לתשלום', null],
    ...CONSUMERS_LOCAL.map(c => [`${c.name} – סה"כ (₪)`, m => annualData[m]?.calc?.totals?.[c.id]?.total != null
      ? +annualData[m].calc.totals[c.id].total.toFixed(2) : '']),
    ['סה"כ כולל (₪)', m => {
      if (!annualData[m]?.calc) return '';
      return +CONSUMERS_LOCAL.reduce((s,c)=>s+(annualData[m].calc.totals?.[c.id]?.total||0),0).toFixed(2);
    }],
  ];

  summaryFields.forEach(([label, fn]) => {
    if (fn === null) {
      summaryRows.push([label, ...Array(13).fill('')]);
    } else {
      const vals = Array.from({length:12}, (_,m) => { try { return fn(m); } catch { return ''; } });
      const numVals = vals.filter(v => typeof v === 'number');
      const total = numVals.length > 0 ? +numVals.reduce((a,b)=>a+b,0).toFixed(2) : '';
      summaryRows.push([label, ...vals, total]);
    }
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{wch:32}, ...Array(12).fill({wch:11}), {wch:13}];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ריכוז נתונים');

  const t = totals;
  const grand = Object.values(t).reduce((s,v)=>s+(v.total||0),0);

  // Build styled monthly Excel for Michal's email attachment
  const wbMonth = XLSX.utils.book_new();

  // Build one sheet per unit for current month only
  const unitsLocal = [
    { id:'main',  name:'מיכל ויניב' },
    { id:'roni',  name:'רני לובר'   },
    { id:'yuval', name:'יובל ונועם' },
  ];

  unitsLocal.forEach(u => {
    const ut = t[u.id] || {};
    const em = elec[u.id] || {};
    const wm = water[u.id] || {};
    const rows = [
      [`${u.name} – חיובים ${monthName} ${yr}`],
      ['סעיף', 'פירוט', 'סכום (₪)'],
      ['⚡ חשמל', '', ''],
      ['צריכה', `${em.usage?.toFixed(1)||0} קוט"ש × ₪${RATES.electricity}`, em.variable?.toFixed(2)||0],
      ['תשלום קבוע', `שליש מ-₪${md.fixed_payment||0}`, em.fixed?.toFixed(2)||0],
      ['סה"כ חשמל', '', ut.electricity?.toFixed(2)||0],
      ['💧 מים', '', ''],
      ['תעריף א', `${wm.a?.toFixed(2)||0} מ"ק × ₪${RATES.waterA}`, wm.aCost?.toFixed(2)||0],
      ['תעריף ב', `${wm.b?.toFixed(2)||0} מ"ק × ₪${RATES.waterB}`, wm.bCost?.toFixed(2)||0],
      ['סה"כ מים', '', ut.water?.toFixed(2)||0],
      ['🏘️ מיסי קהילה', '', ut.community?.toFixed(2)||0],
      ...(ut.arnona ? [['🏛️ ארנונה (דו-חודשי)', '', ut.arnona?.toFixed(2)||0]] : []),
      ...(ut.sewage ? [['🚰 ביוב', '', ut.sewage?.toFixed(2)||0]] : []),
      ...(ut.extraCharges ? [['➕ חיובים נוספים', '', ut.extraCharges?.toFixed(2)||0]] : []),
      ['💳 סה"כ לתשלום', '', ut.total?.toFixed(2)||0],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:22},{wch:30},{wch:14}];
    XLSX.utils.book_append_sheet(wbMonth, ws, u.name);
  });

  const wbMonthOut = XLSX.write(wbMonth, { bookType:'xlsx', type:'base64' });

  // Send to Google Apps Script:
  // 1. Save annual data to Google Sheets (cumulative, no styling)
  // 2. Email Michal with styled monthly Excel attached
  try {
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbw4VjNG6OqQ_uUg9sOqfokt6S1YV9g1bmyTpok0IoYnpkWAT2WkAxSddLolV-cr8SX7/exec';
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        year:           yr,
        monthYear:      `${monthName} ${yr}`,
        totalMain:      t.main?.total?.toFixed(0)  || '0',
        totalRoni:      t.roni?.total?.toFixed(0)  || '0',
        totalYuval:     t.yuval?.total?.toFixed(0) || '0',
        grandTotal:     grand.toFixed(0),
        annualData:     annualData,
        monthlyExcel:   wbMonthOut,
        monthlyFileName:`Bills_${monthName}_${yr}.xlsx`,
      }),
    });
    const result = await response.json().catch(() => ({ success: true }));
    if (result.success === false) {
      console.error('Script error:', result.error);
      showToast('שגיאה בשליחה: ' + (result.error || ''));
    } else {
      showToast('נשלח לדרייב ולמיכל ✓');
    }
  } catch(e) {
    console.error('Drive/email error:', e);
    showToast('שגיאה בשליחה לדרייב: ' + e.message);
  }

  // Send individual emails to tenants via EmailJS (only on first approval)
  if (sendToTenants) {
    const tenantEmails = {
      roni:  'Renanal13@gmail.com',
      yuval: 'Yuvhiggins@gmail.com',
    };
    const tenantNames = {
      roni:  'רני',
      yuval: 'יובל ונועם',
    };

    for (const [id, email] of Object.entries(tenantEmails)) {
      const tv = t[id] || {};
      await emailjs.send('service_hsuzwti', 'template_4h2gms8', {
        to_email:          email,
        tenant_name:       tenantNames[id],
        month_year:        `${monthName} ${yr}`,
        total_electricity: tv.electricity?.toFixed(2) || '0',
        total_water:       tv.water?.toFixed(2)       || '0',
        community:         tv.community?.toFixed(2)   || '0',
        arnona_line:       tv.arnona  ? `🏛️ ארנונה: ₪${tv.arnona.toFixed(2)}`  : '',
        sewage_line:       tv.sewage  ? `🚰 ביוב: ₪${tv.sewage.toFixed(2)}`    : '',
        total:             tv.total?.toFixed(0)        || '0',
      }, 'mGOnSglK3GGKpdxVI');
    }
  }

}

window.shareExcelFiles = async function(mk) {
  showToast('מייצר קבצים...');

  try {
    let targetMk = mk;

    // If called from settings (no mk), find the latest approved month
    if (!targetMk) {
      if (calcResult?.mk) {
        targetMk = calcResult.mk;
      } else {
        // Search for latest approved month in current year
        for (let m = 11; m >= 0; m--) {
          const key = `${viewYear}-${String(m+1).padStart(2,'0')}`;
          const snap = await getDoc(doc(db,'calculations',key));
          if (snap.exists() && snap.data().status === 'approved') {
            targetMk = key;
            break;
          }
        }
      }
    }

    if (!targetMk) { showToast('אין חישוב מאושר השנה'); return; }

    const [yr, mo] = targetMk.split('-');
    const monthName = MONTHS_HE[parseInt(mo)-1];

    // Load calc data from Firebase if calcResult not available for this month
    let result = (calcResult?.mk === targetMk) ? calcResult : null;
    if (!result) {
      const [calcSnap, metersSnap] = await Promise.all([
        getDoc(doc(db,'calculations',targetMk)),
        getDoc(doc(db,'meters',targetMk))
      ]);
      if (!calcSnap.exists()) { showToast('אין חישוב מאושר לחודש זה'); return; }
      const savedData = calcSnap.data();
      const md = metersSnap.exists() ? metersSnap.data() : {};
      const elec   = calcElectricity(md, md.fixed_payment||0);
      const water  = calcWater(md);
      const hasAr  = md.has_arnona||false;
      const sewage = hasAr ? calcSewage({ main:md.sewage_water_main||0, roni:md.sewage_water_roni||0, yuval:md.sewage_water_yuval||0 }) : null;
      result = { elec, water, totals: savedData.totals, hasArnona: hasAr, sewage, md, mk: targetMk };
    }

    const { totals, elec, water, md } = result;
    const t = totals;

    // ── Load ExcelJS via script tag (UMD bundle sets window.ExcelJS) ──
    if (!window.ExcelJS) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const EJS = window.ExcelJS;

    function styleCell(cell, { fillColor, fontColor, bold, fontSize, alignH, numFmt }) {
      cell.font = { name:'Arial', size:fontSize||10, bold:!!bold, color:{argb:'FF'+fontColor} };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+fillColor} };
      cell.alignment = { horizontal:alignH||'right', vertical:'middle', readingOrder:'rightToLeft', wrapText:false };
      cell.border = {
        top:   {style:'thin',color:{argb:'FFCCCCCC'}},
        bottom:{style:'thin',color:{argb:'FFCCCCCC'}},
        left:  {style:'thin',color:{argb:'FFCCCCCC'}},
        right: {style:'thin',color:{argb:'FFCCCCCC'}},
      };
      if (numFmt) cell.numFmt = numFmt;
    }

    // ── קובץ שנתי בלבד ──────────────────────────────────────────
    const annualData = {};
    for (let m = 0; m < 12; m++) {
      const key = `${yr}-${String(m+1).padStart(2,'0')}`;
      const [calcSnap, metersSnap] = await Promise.all([
        getDoc(doc(db,'calculations',key)),
        getDoc(doc(db,'meters',key))
      ]);
      if (calcSnap.exists()) {
        annualData[m] = { calc: calcSnap.data(), meters: metersSnap.exists() ? metersSnap.data() : {} };
      }
    }

    const wbAnnual = new EJS.Workbook();
    wbAnnual.creator = 'Bills App';
    const CONSUMERS_LOCAL = [
      { id:'main', name:'מיכל ויניב' },
      { id:'roni', name:'רני לובר' },
      { id:'yuval', name:'יובל ונועם' },
    ];

    for (const cons of CONSUMERS_LOCAL) {
      const ws = wbAnnual.addWorksheet(cons.name, { views:[{ rightToLeft:true }] });
      ws.columns = [{ width:22 }, ...Array(12).fill({ width:10 }), { width:12 }];

      const getElec = m => {
        const d = annualData[m]?.meters; if (!d) return '';
        if (cons.id==='main') return +((d.elec_main_cur||0)-(d.elec_main_prev||0)-(d.elec_roni_cur||0)+(d.elec_roni_prev||0)-(d.elec_yuval_cur||0)+(d.elec_yuval_prev||0)).toFixed(1);
        return +((d[`elec_${cons.id}_cur`]||0)-(d[`elec_${cons.id}_prev`]||0)).toFixed(1);
      };
      const getWater = m => {
        const d = annualData[m]?.meters; if (!d) return '';
        if (cons.id==='main') return +((d.water_main_cur||0)-(d.water_main_prev||0)-(d.water_roni_cur||0)+(d.water_roni_prev||0)-(d.water_yuval_cur||0)+(d.water_yuval_prev||0)).toFixed(2);
        return +((d[`water_${cons.id}_cur`]||0)-(d[`water_${cons.id}_prev`]||0)).toFixed(2);
      };
      const getNum = (m,field) => { const v=annualData[m]?.calc?.totals?.[cons.id]?.[field]; return v!=null?+v.toFixed(2):''; };

      const annualRows = [
        { vals:[`${cons.name} – נתונים שנתיים ${yr}`,...Array(12).fill(''),'סה"כ שנתי'], type:'title' },
        { vals:['קטגוריה',...MONTHS_HE,'סה"כ'], type:'header' },
        { vals:['⚡ חשמל',...Array(13).fill('')], type:'section' },
        { vals:['צריכה (קוט"ש)',...Array.from({length:12},(_,m)=>getElec(m)),''], type:'data' },
        { vals:['סה"כ חשמל (₪)',...Array.from({length:12},(_,m)=>getNum(m,'electricity')),''], type:'data' },
        { vals:['💧 מים',...Array(13).fill('')], type:'section' },
        { vals:['צריכה (מ"ק)',...Array.from({length:12},(_,m)=>getWater(m)),''], type:'data' },
        { vals:['סה"כ מים (₪)',...Array.from({length:12},(_,m)=>getNum(m,'water')),''], type:'data' },
        { vals:['מיסי קהילה (₪)',...Array.from({length:12},(_,m)=>annualData[m]?.calc?.totals?.[cons.id]?.community||''),''], type:'data' },
        { vals:['ארנונה (₪)',...Array.from({length:12},(_,m)=>annualData[m]?.calc?.totals?.[cons.id]?.arnona||''),''], type:'data' },
        { vals:['ביוב (₪)',...Array.from({length:12},(_,m)=>annualData[m]?.calc?.totals?.[cons.id]?.sewage||''),''], type:'data' },
        { vals:['💳 סה"כ לתשלום (₪)',...Array.from({length:12},(_,m)=>getNum(m,'total')),''], type:'total' },
        { vals:['✓ שולם',...Array.from({length:12},(_,m)=>annualData[m]?.calc?.paid?.[cons.id]?'כן':''),''], type:'data' },
      ];
      // Fill totals column
      annualRows.forEach(row => {
        if (row.type!=='title'&&row.type!=='header'&&row.type!=='section') {
          const nums=row.vals.slice(1,13).filter(v=>typeof v==='number');
          row.vals[13]=nums.length?+nums.reduce((a,b)=>a+b,0).toFixed(2):'';
        }
      });

      annualRows.forEach((row, idx) => {
        const r = idx+1;
        const wsRow = ws.addRow(row.vals);
        wsRow.height = 18;
        const isTitle   = row.type==='title';
        const isHeader  = row.type==='header';
        const isSection = row.type==='section';
        const isTotal   = row.type==='total';
        const fillColor = isTitle?'0E4C6E':isHeader?'2D2D4A':isSection?'1A1A2E':isTotal?'EDE9FE':'FFFFFF';
        const fontColor = (isTitle||isHeader||isSection)?'FFFFFF':isTotal?'7C3AED':'1A1A2E';
        const bold = isTitle||isHeader||isSection||isTotal;
        const fontSize = isTitle?12:9;
        for (let c=1;c<=14;c++) {
          const isSumCol=c===14, isCatCol=c===1;
          const fc = isSumCol&&!isTitle&&!isHeader&&!isSection?(isTotal?'EDE9FE':'E8E4F8'):fillColor;
          const cell = ws.getCell(r,c);
          styleCell(cell,{fillColor:fc,fontColor,bold:bold||isSumCol,fontSize,alignH:isCatCol?'right':'center'});
          if (c>1&&r>2&&!isSection&&typeof row.vals[c-1]==='number') cell.numFmt='#,##0.00';
        }
      });
      ws.mergeCells(1,1,1,14);
    }

    // ── ריכוז נתונים sheet ────────────────────────────────────────
    const wsRikuz = wbAnnual.addWorksheet('ריכוז נתונים', { views:[{ rightToLeft:true }] });
    wsRikuz.columns = [{ width:20.83 }, ...Array(12).fill({ width:10 }), { width:13 }];

    const thin = { style:'thin', color:{ argb:'FFCCCCCC' } };
    const bdr  = { top:thin, bottom:thin, left:thin, right:thin };

    function rkCell(cell, fillColor, fontColor, bold, alignH, numFmt) {
      cell.font      = { name:'Arial', size:9, bold:!!bold, color:{ argb:'FF'+fontColor } };
      cell.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF'+fillColor } };
      cell.alignment = { horizontal:alignH||'right', vertical:'middle', readingOrder:'rightToLeft', wrapText:false };
      cell.border    = bdr;
      if (numFmt) cell.numFmt = numFmt;
    }

    // Colors from template
    const C_HEADER_DARK = '2E1A5E';  // title/section rows bg
    const C_HEADER_MED  = '3D2870';  // month header cols bg
    const C_ACCENT      = '7C3AED';  // סה"כ שנתי col bg
    const C_SUM_ROW     = 'EDE9FE';  // sum rows bg
    const C_SUM_FONT    = '2E1A5E';  // sum rows font in N col
    const C_MAIN        = 'EBF4FF';  // מיכל ויניב rows
    const C_RONI        = 'EDFFF8';  // רני לובר rows
    const C_YUVAL       = 'FFFBEB';  // יובל ונועם rows
    const C_WHITE       = 'FFFFFF';
    const C_DARK_FONT   = '1A1A2E';

    const gv = (m, id, field) => {
      const v = annualData[m]?.calc?.totals?.[id]?.[field];
      return v != null ? +v.toFixed(2) : 0;
    };
    const getElecUsage = (m, id) => {
      const d = annualData[m]?.meters; if (!d) return 0;
      if (id==='main') return +((d.elec_main_cur||0)-(d.elec_main_prev||0)-(d.elec_roni_cur||0)+(d.elec_roni_prev||0)-(d.elec_yuval_cur||0)+(d.elec_yuval_prev||0)).toFixed(1);
      return +((d[`elec_${id}_cur`]||0)-(d[`elec_${id}_prev`]||0)).toFixed(1);
    };
    const getWaterUsage = (m, id) => {
      const d = annualData[m]?.meters; if (!d) return 0;
      if (id==='main') return +((d.water_main_cur||0)-(d.water_main_prev||0)-(d.water_roni_cur||0)+(d.water_roni_prev||0)-(d.water_yuval_cur||0)+(d.water_yuval_prev||0)).toFixed(2);
      return +((d[`water_${id}_cur`]||0)-(d[`water_${id}_prev`]||0)).toFixed(2);
    };
    const sumRow = vals => +vals.filter(v=>typeof v==='number').reduce((a,b)=>a+b,0).toFixed(2);

    // Build all data rows
    const rikuzRows = [
      // Row 1: Title
      { vals:[`ריכוז נתונים שנתי – ${yr}`,...Array(12).fill(''),''], type:'title' },
      // Row 2: Headers
      { vals:['קטגוריה / יחידה',...MONTHS_HE.map(m=>m+'\n'+yr),'סה"כ שנתי'], type:'header' },
      // Row 3: Section חשמל
      { vals:['⚡ חשמל – צריכה וחיוב',...Array(13).fill('')], type:'section' },
      // Rows 4-9: electricity
      { vals:['מיכל ויניב – צריכה (קוט"ש)',...Array.from({length:12},(_,m)=>getElecUsage(m,'main')),''], unit:'main' },
      { vals:['מיכל ויניב – תשלום (₪)',...Array.from({length:12},(_,m)=>gv(m,'main','electricity')),''], unit:'main' },
      { vals:['רני לובר – צריכה (קוט"ש)',...Array.from({length:12},(_,m)=>getElecUsage(m,'roni')),''], unit:'roni' },
      { vals:['רני לובר – תשלום (₪)',...Array.from({length:12},(_,m)=>gv(m,'roni','electricity')),''], unit:'roni' },
      { vals:['יובל ונועם – צריכה (קוט"ש)',...Array.from({length:12},(_,m)=>getElecUsage(m,'yuval')),''], unit:'yuval' },
      { vals:['יובל ונועם – תשלום (₪)',...Array.from({length:12},(_,m)=>gv(m,'yuval','electricity')),''], unit:'yuval' },
      // Row 10: סה"כ חשמל
      { vals:['סה"כ חשמל (₪)',...Array.from({length:12},(_,m)=>+(gv(m,'main','electricity')+gv(m,'roni','electricity')+gv(m,'yuval','electricity')).toFixed(2)),''], type:'subtotal' },
      // Row 11: Section מים
      { vals:['💧 מים – צריכה וחיוב',...Array(13).fill('')], type:'section' },
      // Rows 12-17: water
      { vals:['מיכל ויניב – צריכה (מ"ק)',...Array.from({length:12},(_,m)=>getWaterUsage(m,'main')),''], unit:'main' },
      { vals:['מיכל ויניב – תשלום (₪)',...Array.from({length:12},(_,m)=>gv(m,'main','water')),''], unit:'main' },
      { vals:['רני לובר – צריכה (מ"ק)',...Array.from({length:12},(_,m)=>getWaterUsage(m,'roni')),''], unit:'roni' },
      { vals:['רני לובר – תשלום (₪)',...Array.from({length:12},(_,m)=>gv(m,'roni','water')),''], unit:'roni' },
      { vals:['יובל ונועם – צריכה (מ"ק)',...Array.from({length:12},(_,m)=>getWaterUsage(m,'yuval')),''], unit:'yuval' },
      { vals:['יובל ונועם – תשלום (₪)',...Array.from({length:12},(_,m)=>gv(m,'yuval','water')),''], unit:'yuval' },
      // Row 18: סה"כ מים
      { vals:['סה"כ מים (₪)',...Array.from({length:12},(_,m)=>+(gv(m,'main','water')+gv(m,'roni','water')+gv(m,'yuval','water')).toFixed(2)),''], type:'subtotal' },
      // Row 19: Section קהילה
      { vals:['🏘️ קהילה, ארנונה וביוב',...Array(13).fill('')], type:'section' },
      // Rows 20-25: community/arnona
      { vals:['מיכל ויניב – קהילה (₪)',...Array.from({length:12},(_,m)=>gv(m,'main','community')),''], unit:'main' },
      { vals:['רני לובר – קהילה (₪)',...Array.from({length:12},(_,m)=>gv(m,'roni','community')),''], unit:'roni' },
      { vals:['יובל ונועם – קהילה (₪)',...Array.from({length:12},(_,m)=>gv(m,'yuval','community')),''], unit:'yuval' },
      { vals:['מיכל ויניב – ארנונה (₪)',...Array.from({length:12},(_,m)=>gv(m,'main','arnona')),''], unit:'main' },
      { vals:['רני לובר – ארנונה (₪)',...Array.from({length:12},(_,m)=>gv(m,'roni','arnona')),''], unit:'roni' },
      { vals:['יובל ונועם – ארנונה (₪)',...Array.from({length:12},(_,m)=>gv(m,'yuval','arnona')),''], unit:'yuval' },
      // Row 26: סה"כ ביוב (קהילה סה"כ)
      { vals:['סה"כ קהילה (₪)',...Array.from({length:12},(_,m)=>+(gv(m,'main','community')+gv(m,'roni','community')+gv(m,'yuval','community')+gv(m,'main','arnona')+gv(m,'roni','arnona')+gv(m,'yuval','arnona')).toFixed(2)),''], type:'subtotal' },
      // Row 27: Section סה"כ
      { vals:['💳 סה"כ לתשלום',...Array(13).fill('')], type:'section' },
      // Rows 28-30: totals per unit
      { vals:['מיכל ויניב – סה"כ (₪)',...Array.from({length:12},(_,m)=>gv(m,'main','total')),''], unit:'main' },
      { vals:['רני לובר – סה"כ (₪)',...Array.from({length:12},(_,m)=>gv(m,'roni','total')),''], unit:'roni' },
      { vals:['יובל ונועם – סה"כ (₪)',...Array.from({length:12},(_,m)=>gv(m,'yuval','total')),''], unit:'yuval' },
      // Row 31: grand total
      { vals:['סה"כ כולל (₪)',...Array.from({length:12},(_,m)=>+(gv(m,'main','total')+gv(m,'roni','total')+gv(m,'yuval','total')).toFixed(2)),''], type:'subtotal' },
    ];

    // Fill סה"כ שנתי column (col 14)
    rikuzRows.forEach(row => {
      const nums = row.vals.slice(1,13).filter(v=>typeof v==='number'&&v!==0||typeof v==='number');
      const allNums = row.vals.slice(1,13).filter(v=>typeof v==='number');
      row.vals[13] = allNums.length ? sumRow(allNums) : '';
    });

    rikuzRows.forEach((row, idx) => {
      const r = idx + 1;
      const isTitle    = row.type === 'title';
      const isHeader   = row.type === 'header';
      const isSection  = row.type === 'section';
      const isSubtotal = row.type === 'subtotal';
      const unit       = row.unit;

      const wsRow = wsRikuz.addRow(row.vals);
      wsRow.height = isHeader ? 30 : 18;

      for (let c = 1; c <= 14; c++) {
        const cell    = wsRikuz.getCell(r, c);
        const isSum   = c === 14;
        const isCat   = c === 1;
        const isMonth = c >= 2 && c <= 13;

        let fillColor, fontColor, bold = false;

        if (isTitle) {
          fillColor = C_HEADER_DARK; fontColor = C_WHITE; bold = true;
        } else if (isHeader) {
          fillColor = isSum ? C_ACCENT : (isMonth ? '3D2870' : C_HEADER_DARK);
          fontColor = C_WHITE; bold = true;
        } else if (isSection) {
          fillColor = C_HEADER_DARK; fontColor = C_WHITE; bold = true;
        } else if (isSubtotal) {
          fillColor = C_SUM_ROW;
          fontColor = isSum ? C_SUM_FONT : C_DARK_FONT;
          bold = true;
        } else {
          // Data row – color by unit
          fillColor = isSum ? C_SUM_ROW : (unit==='main'?C_MAIN:unit==='roni'?C_RONI:C_YUVAL);
          fontColor = isSum ? C_SUM_FONT : C_DARK_FONT;
          bold = isSum;
        }

        const alignH = isCat ? 'right' : 'center';
        rkCell(cell, fillColor, fontColor, bold, alignH);

        // Number format for numeric data cells
        const val = row.vals[c-1];
        if (typeof val === 'number' && !isSection && !isTitle && !isHeader) {
          cell.numFmt = '#,##0.00';
        }
      }
    });

    // Merge title row
    wsRikuz.mergeCells(1, 1, 1, 14);

    const annualBuffer = await wbAnnual.xlsx.writeBuffer();
    const annualFile = new File([annualBuffer], `Bills_${yr}_שנתי.xlsx`, { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [annualFile] })) {
      try {
        await navigator.share({
          title: `Bills – נתונים שנתיים ${yr}`,
          text: `נתונים שנתיים ${yr}`,
          files: [annualFile],
        });
      } catch(shareErr) {
        if (shareErr.name !== 'AbortError') {
          downloadFile(annualFile, yr);
        }
      }
    } else {
      downloadFile(annualFile, yr);
    }
  } catch(e) {
    console.error('shareExcelFiles error:', e);
    showToast('שגיאה: ' + e.message);
  }
};

function downloadFile(file, yr) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = `Bills_${yr}_שנתי.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('הקובץ הורד ✓');
}

window.approveCalc = async function(mk) {
  await updateDoc(doc(db,'calculations',mk), { status:'approved' });
  showToast('אושר ✓');
  renderHome();
};

window.showCalcDetail = async function(mk) {
  const snap = await getDoc(doc(db,'calculations',mk));
  if (!snap.exists()) return;
  const data   = snap.data();
  const totals = data.totals||{};
  const [yr,mo] = mk.split('-');
  let html = `<div class="card-sub" style="margin-bottom:12px">${MONTHS_HE[parseInt(mo)-1]} ${yr}</div>`;
  CONSUMERS.forEach(c => {
    const t = totals[c.id]||{};
    html += `<div class="unit-row">
      ${unitIconHTML(c,'small')}
      <div class="unit-info"><div class="unit-name">${c.name}</div>
      </div>
      <div class="unit-amount">₪${(t.total||0).toFixed(0)}</div>
    </div>`;
  });
  openModal('פירוט חישוב', html);
};

window.showWhatsAppPreview = function() {
  if (!calcResult) return;
  const { totals, elec, water, sewage, hasArnona, md } = calcResult;

  const buildMsg = (id, name) => {
    const t = totals[id];
    const e = elec[id];
    const w = water[id];
    let msg = `שלום ${name} 😊\n\nחישוב חיובים לחודש ${MONTHS_HE[viewMonth]} ${viewYear}:\n\n`;
    msg += `⚡ *חשמל:* ₪${t.electricity.toFixed(2)}\n`;
    msg += `   (${e.usage.toFixed(0)} קוט"ש × ₪${RATES.electricity} + קבוע ₪${e.fixed.toFixed(2)})\n\n`;
    msg += `💧 *מים:* ₪${t.water.toFixed(2)}\n`;
    if (w.a>0) msg += `   (${w.a.toFixed(2)} מ"ק בתעריף א × ₪${RATES.waterA})\n`;
    if (w.b>0) msg += `   (${w.b.toFixed(2)} מ"ק בתעריף ב × ₪${RATES.waterB})\n`;
    msg += `\n🏘️ *מיסי קהילה:* ₪${t.community.toFixed(2)}\n`;
    if (hasArnona) {
      msg += `\n🏛️ *ארנונה (דו-חודשי):* ₪${t.arnona.toFixed(2)}\n`;
      if (sewage) msg += `🚰 *ביוב:* ₪${t.sewage.toFixed(2)}\n`;
    }
    if (t.extraCharges>0) msg += `\n➕ *חיובים נוספים:* ₪${t.extraCharges.toFixed(2)}\n`;
    msg += `\n💳 *סה"כ לתשלום: ₪${t.total.toFixed(0)}*\n\nתודה! 🙏`;
    return msg;
  };

  const roniMsg  = buildMsg('roni','רני');
  const yuvalMsg = buildMsg('yuval','יובל ונועם');

  const roniId  = 'wa-msg-roni';
  const yuvalId = 'wa-msg-yuval';

  openModal('הודעות וואטסאפ', `
    <div style="margin-bottom:16px">
      <div class="section-title" style="margin-bottom:8px">לרני לובר</div>
      <div class="wa-preview" id="${roniId}" style="user-select:text;-webkit-user-select:text"></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn-sm btn-sm-green" onclick="shareWhatsAppById('${roniId}')"><i class="ti ti-brand-whatsapp"></i> שלח בוואטסאפ</button>
        <button class="btn-sm btn-sm-purple" onclick="copyTextById('${roniId}')"><i class="ti ti-copy"></i> העתק</button>
      </div>
    </div>
    <div>
      <div class="section-title" style="margin-bottom:8px">ליובל ונועם</div>
      <div class="wa-preview" id="${yuvalId}" style="user-select:text;-webkit-user-select:text"></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn-sm btn-sm-green" onclick="shareWhatsAppById('${yuvalId}')"><i class="ti ti-brand-whatsapp"></i> שלח בוואטסאפ</button>
        <button class="btn-sm btn-sm-purple" onclick="copyTextById('${yuvalId}')"><i class="ti ti-copy"></i> העתק</button>
      </div>
    </div>
  `);

  // Set text content after modal renders (avoids HTML injection issues)
  setTimeout(() => {
    const roniEl = document.getElementById(roniId);
    const yuvalEl = document.getElementById(yuvalId);
    if (roniEl)  roniEl.textContent  = roniMsg;
    if (yuvalEl) yuvalEl.textContent = yuvalMsg;
  }, 50);
};

window.shareWhatsAppById = function(elementId) {
  const text = document.getElementById(elementId)?.textContent || '';
  const encoded = encodeURIComponent(text);
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const url = isMobile
    ? `whatsapp://send?text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`;
  window.open(url, '_blank');
};

window.copyTextById = function(elementId) {
  const text = document.getElementById(elementId)?.textContent || '';
  copyText(text);
};

window.shareWhatsApp = function(text) {
  const encoded = encodeURIComponent(text);
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const url = isMobile
    ? `whatsapp://send?text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`;
  window.open(url, '_blank');
};

window.copyText = function(text) {
  // Try modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('הועתק ✓'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};

function fallbackCopy(text) {
  // Fallback for mobile browsers
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('הועתק ✓');
  } catch {
    showToast('לא ניתן להעתיק – העתק ידנית');
  }
  document.body.removeChild(textarea);
}

// ── TENANT DETAIL ─────────────────────────────────────────────────────
window.showTenantDetail = async function(consumerId, mk) {
  const snap = await getDoc(doc(db,'calculations',mk));
  if (!snap.exists()) return;
  const data = snap.data();
  const t    = data.totals?.[consumerId]||{};
  const c    = CONSUMERS.find(c=>c.id===consumerId);
  const [yr,mo] = mk.split('-');
  const paid = data.paid?.[consumerId];

  let html = `<div class="card-sub" style="margin-bottom:12px">${MONTHS_HE[parseInt(mo)-1]} ${yr}</div>
    <table class="breakdown-table">
      <tr><td><i class="ti ti-bolt" style="color:#fcd34d;margin-left:6px"></i>חשמל</td><td>₪${(t.electricity||0).toFixed(2)}</td></tr>
      <tr><td><i class="ti ti-droplet" style="color:#67e8f9;margin-left:6px"></i>מים</td><td>₪${(t.water||0).toFixed(2)}</td></tr>
      <tr><td><i class="ti ti-building-community" style="color:#a78bfa;margin-left:6px"></i>מיסי קהילה</td><td>₪${(t.community||0).toFixed(2)}</td></tr>
      ${t.arnona?`<tr><td><i class="ti ti-receipt-tax" style="color:#fcd34d;margin-left:6px"></i>ארנונה</td><td>₪${t.arnona.toFixed(2)}</td></tr>`:''}
      ${t.sewage?`<tr><td><i class="ti ti-droplets" style="color:#67e8f9;margin-left:6px"></i>ביוב</td><td>₪${t.sewage.toFixed(2)}</td></tr>`:''}
      ${t.extraCharges?`<tr><td><i class="ti ti-plus" style="color:#fcd34d;margin-left:6px"></i>חיובים נוספים</td><td>₪${t.extraCharges.toFixed(2)}</td></tr>`:''}
    </table>
    <div class="breakdown-total">
      <span class="breakdown-total-label">סה"כ לתשלום</span>
      <span class="breakdown-total-val">₪${(t.total||0).toFixed(0)}</span>
    </div>
    <div class="divider"></div>
    ${paid
      ? `<div style="display:flex;align-items:center;gap:8px;color:#6ee7b7"><i class="ti ti-circle-check" style="font-size:20px"></i><span style="font-weight:600">סומן כשולם ✓</span></div>
         <button class="btn-secondary" style="margin-top:10px" onclick="markPaid('${mk}','${consumerId}',false)"><i class="ti ti-x"></i> בטל סימון שולם</button>`
      : `<button class="btn-primary" onclick="markPaid('${mk}','${consumerId}',true)"><i class="ti ti-check"></i> סמן כ"שולם"</button>`
    }`;

  openModal(c.name, html);
};

window.markPaid = async function(mk, consumerId, paid) {
  const snap = await getDoc(doc(db,'calculations',mk));
  if (!snap.exists()) return;
  const current = snap.data().paid||{};
  current[consumerId] = paid ? { at: new Date().toISOString(), by: currentUser.uid } : null;
  await updateDoc(doc(db,'calculations',mk), { paid: current });
  closeModal();
  showToast(paid?'סומן כשולם ✓':'סימון בוטל');
  renderHome();
};

// ── HISTORY PAGE ──────────────────────────────────────────────────────
async function renderHistoryPage() {
  const page = document.getElementById('page-history');
  page.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const snap = await getDocs(query(collection(db,'calculations'), orderBy('approvedAt','desc')));
  const records = [];
  snap.forEach(d => records.push({ id:d.id, ...d.data() }));

  let html = `<div class="page-title">היסטוריה</div>
    <div class="page-sub">נתוני צריכה לאורך זמן</div>`;

  if (records.length === 0) {
    html += `<div class="empty-state"><div class="empty-icon"><i class="ti ti-chart-bar"></i></div><div class="empty-text">אין עדיין היסטוריה</div></div>`;
    page.innerHTML = html;
    return;
  }

  // Chart
  const showRecords = userRole==='admin' ? records : records;
  const last6 = showRecords.slice(0,6).reverse();
  const getTotal = r => userRole==='admin'
    ? Object.values(r.totals||{}).reduce((s,t)=>s+(t.total||0),0)
    : (r.totals?.[userConsumerId]?.total||0);
  const maxVal = Math.max(...last6.map(getTotal), 1);

  html += `<div class="card">
    <div class="card-title" style="margin-bottom:12px">${userRole==='admin'?'סה"כ חיובים':'החיובים שלי'} – 6 חודשים אחרונים</div>
    <div class="chart-bars">
      ${last6.map(r=>{
        const total = getTotal(r);
        const h = (total/maxVal)*110;
        const [yr,mo] = r.id.split('-');
        return `<div class="chart-bar-wrap">
          <div class="chart-bar-val">₪${total.toFixed(0)}</div>
          <div class="chart-bar" style="height:${h}px"></div>
          <div class="chart-bar-label">${MONTHS_HE[parseInt(mo)-1].substring(0,3)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // Insights (admin only, 3+ months)
  if (userRole==='admin' && records.length>=3) {
    const insights = generateInsights(records);
    insights.forEach(ins => {
      html += `<div class="insight-card"><div class="insight-icon">${ins.icon}</div><div class="insight-text">${ins.text}</div></div>`;
    });
  }

  // List
  html += `<div class="section-hdr"><span class="section-title">רשומות</span></div>`;
  showRecords.forEach(r => {
    const [yr,mo] = r.id.split('-');
    const total   = getTotal(r);
    const paidCount = Object.values(r.paid||{}).filter(Boolean).length;
    html += `<div class="card" onclick="showCalcDetail('${r.id}')" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="card-title">${MONTHS_HE[parseInt(mo)-1]} ${yr}</div>
          <div class="card-sub">${r.hasArnona?'כולל ארנונה וביוב':'חודש רגיל'}${userRole==='admin'&&paidCount>0?` • ${paidCount} שילמו`:''}</div>
        </div>
        <div style="text-align:left">
          <div class="unit-amount">₪${total.toFixed(0)}</div>
        </div>
      </div>
    </div>`;
  });

  page.innerHTML = html;
}

function generateInsights(records) {
  const insights = [];
  if (records.length < 3) return insights;
  const last = records[0];
  const [yr,mo] = last.id.split('-');
  const prev3 = records.slice(1,4);

  CONSUMERS.forEach(c => {
    const lastW = last.totals?.[c.id]?.water||0;
    const avgW  = prev3.reduce((s,r)=>s+(r.totals?.[c.id]?.water||0),0)/prev3.length;
    if (avgW > 0) {
      const diff = lastW - avgW;
      const pct  = Math.abs(diff/avgW*100);
      if (pct > 20) {
        insights.push({
          icon: diff>0 ? '📈' : '📉',
          text: `עלות המים של ${c.name} ב${MONTHS_HE[parseInt(mo)-1]} ${diff>0?'גבוהה':'נמוכה'} ב-${pct.toFixed(0)}% לעומת ממוצע 3 החודשים האחרונים.`
        });
      }
    }
  });
  return insights;
}

// ── SETTINGS PAGE ─────────────────────────────────────────────────────
async function renderSettingsPage() {
  const page = document.getElementById('page-settings');
  if (userRole !== 'admin') { page.innerHTML=''; return; }

  const [ratesSnap, usersSnap] = await Promise.all([
    getDoc(doc(db,'settings','rates')),
    getDocs(collection(db,'users'))
  ]);

  const rates = ratesSnap.exists() ? ratesSnap.data() : {};
  const users = [];
  usersSnap.forEach(d => users.push({ id:d.id, ...d.data() }));

  const APP_VERSION = 'v13';
  let html = `<div class="page-title">הגדרות <span style="font-size:12px;color:var(--text-muted);font-weight:400">${APP_VERSION}</span></div>`;

  // ── RATES
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-adjustments" style="color:#a78bfa"></i> תעריפים</span></div>
    <div class="card">
      <div class="settings-row">
        <div><div class="settings-label"><i class="ti ti-bolt" style="color:#fcd34d;margin-left:6px"></i>חשמל (₪/קוט"ש)</div></div>
        <input class="settings-input" type="number" step="0.001" id="r-elec" value="${RATES.electricity}">
      </div>
      <div class="settings-row">
        <div><div class="settings-label"><i class="ti ti-droplet" style="color:#67e8f9;margin-left:6px"></i>מים תעריף א (₪/מ"ק)</div></div>
        <input class="settings-input" type="number" step="0.001" id="r-waterA" value="${RATES.waterA}">
      </div>
      <div class="settings-row">
        <div><div class="settings-label"><i class="ti ti-droplet" style="color:#fcd34d;margin-left:6px"></i>מים תעריף ב (₪/מ"ק)</div></div>
        <input class="settings-input" type="number" step="0.001" id="r-waterB" value="${RATES.waterB}">
      </div>
      <div class="settings-row">
        <div><div class="settings-label"><i class="ti ti-droplets" style="color:#67e8f9;margin-left:6px"></i>ביוב (₪/מ"ק)</div></div>
        <input class="settings-input" type="number" step="0.001" id="r-sewage" value="${RATES.sewage}">
      </div>
      <button class="btn-primary" style="margin-top:12px" onclick="saveRates()"><i class="ti ti-device-floppy"></i> שמור תעריפים</button>
    </div>`;

  // ── FIXED FEES
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-building-community" style="color:#a78bfa"></i> מיסי קהילה חודשיים</span></div>
    <div class="card">
      ${CONSUMERS.map(c=>`<div class="settings-row">
        <div class="settings-label">${c.name}</div>
        <input class="settings-input" type="number" id="cf-${c.id}" value="${COMMUNITY_FEES[c.id]}">
      </div>`).join('')}
      <button class="btn-primary" style="margin-top:12px" onclick="saveCommunityFees()"><i class="ti ti-device-floppy"></i> שמור</button>
    </div>`;

  // ── ARNONA
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-receipt-tax" style="color:#fcd34d"></i> ארנונה דו-חודשית</span></div>
    <div class="card">
      ${CONSUMERS.map(c=>`<div class="settings-row">
        <div class="settings-label">${c.name}</div>
        <input class="settings-input" type="number" id="ar-${c.id}" value="${ARNONA[c.id]}">
      </div>`).join('')}
      <button class="btn-primary" style="margin-top:12px" onclick="saveArnona()"><i class="ti ti-device-floppy"></i> שמור</button>
    </div>`;

  // ── WATER QUOTAS
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-droplet" style="color:#67e8f9"></i> מכסות מים (מ"ק בתעריף א)</span></div>
    <div class="card">
      ${CONSUMERS.map(c=>`<div class="settings-row">
        <div class="settings-label">${c.name}</div>
        <input class="settings-input" type="number" step="0.5" id="wq-${c.id}" value="${WATER_QUOTA[c.id]}">
      </div>`).join('')}
      <button class="btn-primary" style="margin-top:12px" onclick="saveWaterQuotas()"><i class="ti ti-device-floppy"></i> שמור</button>
    </div>`;

  // ── TENANT CHANGE
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-user-swap" style="color:#67e8f9"></i> החלפת דייר</span></div>
    <div class="card">
      <div class="card-sub" style="margin-bottom:12px">בעת החלפת דייר – עדכן כאן את שם הדייר החדש ביחידה. ההיסטוריה תישמר תחת היחידה.</div>
      ${['roni','yuval'].map(id=>{
        const c = CONSUMERS.find(c=>c.id===id);
        const u = users.find(u=>u.consumerId===id);
        return `<div class="settings-row">
          <div><div class="settings-label">${c.name}</div>
            <div class="settings-sub">${u?u.name+' ('+u.id.substring(0,8)+'...)':'לא משויך'}</div>
          </div>
          <button class="btn-sm btn-sm-purple" onclick="showTenantChange('${id}')"><i class="ti ti-edit"></i></button>
        </div>`;
      }).join('')}
    </div>`;

  // ── USERS LIST
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-users" style="color:#a78bfa"></i> משתמשים</span></div>
    <div class="card">
      ${users.map(u=>`<div class="settings-row">
        <div>
          <div class="settings-label">${u.name||'ללא שם'}</div>
          <div class="settings-sub">${u.role==='admin'?'מנהל':'דייר'} • ${u.consumerId||'—'}</div>
        </div>
        <span class="badge badge-${u.role==='admin'?'purple':'blue'}">${u.role==='admin'?'מנהל':'דייר'}</span>
      </div>`).join('')}
      <div class="card-sub" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        להוספת משתמש חדש – Firebase Console → Authentication → Add user
      </div>
    </div>`;

  // ── RESEND EXCEL
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-file-spreadsheet" style="color:#6ee7b7"></i> אקסל ומיילים</span></div>
    <div class="card">
      <div class="settings-row">
        <div>
          <div class="settings-label">שתף קבצי אקסל</div>
          <div class="settings-sub">קובץ שנתי מצטבר עם ריכוז נתונים</div>
        </div>
        <button class="btn-sm btn-sm-green" onclick="shareExcelFiles()"><i class="ti ti-share"></i> שתף</button>
      </div>
    </div>`;

  // ── TENANT VIEW SWITCHER
  html += `<div class="section-hdr"><span class="section-title"><i class="ti ti-eye" style="color:#a78bfa"></i> תצוגת דייר</span></div>
    <div class="card">
      <div class="card-sub" style="margin-bottom:12px">עבור לתצוגת דייר כדי לראות בדיוק מה הדייר רואה באפליקציה</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${CONSUMERS.filter(c=>c.id!=='main').map(c=>`
          <button class="btn-secondary" onclick="switchToTenantView('${c.id}','${c.name}')">
            <i class="ti ti-user"></i> צפה כ${c.name}
          </button>`).join('')}
      </div>
    </div>`;

  page.innerHTML = html;
}

window.resendExcel = async function() {
  showToast('מייצר ושולח אקסל למיכל...');
  try {
    const mk = monthKey();
    const calcSnap = await getDoc(doc(db,'calculations',mk));
    if (!calcSnap.exists()) {
      showToast('אין חישוב מאושר לחודש זה');
      return;
    }
    const savedData = calcSnap.data();
    const metersSnap = await getDoc(doc(db,'meters',mk));
    const md = metersSnap.exists() ? metersSnap.data() : {};
    const elec   = calcElectricity(md, md.fixed_payment||0);
    const water  = calcWater(md);
    const hasAr  = md.has_arnona||false;
    const sewage = hasAr ? calcSewage({ main:md.sewage_water_main||0, roni:md.sewage_water_roni||0, yuval:md.sewage_water_yuval||0 }) : null;
    const charges= md.oneTimeCharges||[];
    const tempResult = { elec, water, totals: savedData.totals, hasArnona: hasAr, sewage, charges, md, mk };
    await generateAndSendExcel(mk, tempResult, false); // false = don't resend tenant emails
    showToast('נשלח למיכל בהצלחה ✓');
  } catch(e) {
    console.error('resendExcel error:', e);
    showToast('שגיאה: ' + e.message);
  }
};

// ── TENANT VIEW SWITCHER ──────────────────────────────────────────────
let adminViewBackup = { role: null, consumerId: null };

window.switchToTenantView = function(consumerId, name) {
  // Backup admin state
  adminViewBackup = { role: userRole, consumerId: userConsumerId };

  // Switch to tenant view
  userRole = 'tenant';
  userConsumerId = consumerId;

  // Update UI
  document.getElementById('topbar-role').textContent = `תצוגת ${name}`;
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));

  // Show return banner
  const banner = document.createElement('div');
  banner.id = 'tenant-view-banner';
  banner.style.cssText = 'background:#7c3aed;color:white;text-align:center;padding:8px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0';
  banner.innerHTML = `👁️ תצוגת ${name} – <u>לחץ לחזרה למנהל</u>`;
  banner.onclick = returnToAdminView;

  const topbar = document.querySelector('.topbar');
  topbar.parentNode.insertBefore(banner, topbar.nextSibling);

  showPage('home');
};

window.returnToAdminView = function() {
  userRole = adminViewBackup.role;
  userConsumerId = adminViewBackup.consumerId;

  document.getElementById('topbar-role').textContent = 'מנהל';
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));

  const banner = document.getElementById('tenant-view-banner');
  if (banner) banner.remove();

  showPage('home');
};

window.saveRates = async function() {
  const data = {
    electricity: parseFloat(document.getElementById('r-elec').value)||RATES.electricity,
    waterA:      parseFloat(document.getElementById('r-waterA').value)||RATES.waterA,
    waterB:      parseFloat(document.getElementById('r-waterB').value)||RATES.waterB,
    sewage:      parseFloat(document.getElementById('r-sewage').value)||RATES.sewage,
    updatedAt:   serverTimestamp(),
  };
  await setDoc(doc(db,'settings','rates'), data, { merge:true });
  RATES = { ...RATES, ...data };
  showToast('תעריפים עודכנו ✓');
};

window.saveCommunityFees = async function() {
  const fees = {};
  CONSUMERS.forEach(c => { fees[c.id] = parseFloat(document.getElementById(`cf-${c.id}`)?.value)||0; });
  await setDoc(doc(db,'settings','rates'), { communityFees:fees }, { merge:true });
  COMMUNITY_FEES = { ...COMMUNITY_FEES, ...fees };
  showToast('מיסי קהילה עודכנו ✓');
};

window.saveArnona = async function() {
  const ar = {};
  CONSUMERS.forEach(c => { ar[c.id] = parseFloat(document.getElementById(`ar-${c.id}`)?.value)||0; });
  await setDoc(doc(db,'settings','rates'), { arnona:ar }, { merge:true });
  ARNONA = { ...ARNONA, ...ar };
  showToast('ארנונה עודכנה ✓');
};

window.saveWaterQuotas = async function() {
  const wq = {};
  CONSUMERS.forEach(c => { wq[c.id] = parseFloat(document.getElementById(`wq-${c.id}`)?.value)||0; });
  await setDoc(doc(db,'settings','rates'), { waterQuota:wq }, { merge:true });
  WATER_QUOTA = { ...WATER_QUOTA, ...wq };
  showToast('מכסות מים עודכנו ✓');
};

window.showTenantChange = function(unitId) {
  const c = CONSUMERS.find(c=>c.id===unitId);
  openModal(`החלפת דייר – ${c.name}`, `
    <div class="card-sub" style="margin-bottom:12px">
      עדכן את שם הדייר החדש. ה-UID של המשתמש צריך להתעדכן ב-Firebase Console.
    </div>
    <div class="form-group"><label>שם דייר חדש</label>
      <input type="text" id="new-tenant-name" placeholder="שם הדייר החדש">
    </div>
    <div class="form-group"><label>UID של המשתמש החדש (מ-Firebase Console)</label>
      <input type="text" id="new-tenant-uid" placeholder="UID...">
    </div>
    <div class="form-group"><label>קריאת פתיחה – חשמל (למונה החדש)</label>
      <input type="number" id="new-tenant-elec" placeholder="0" inputmode="numeric">
    </div>
    <button class="btn-primary" onclick="saveTenantChange('${unitId}')"><i class="ti ti-check"></i> שמור</button>
  `);
};

window.saveTenantChange = async function(unitId) {
  const name    = document.getElementById('new-tenant-name').value.trim();
  const uid     = document.getElementById('new-tenant-uid').value.trim();
  const elecVal = parseFloat(document.getElementById('new-tenant-elec').value||0);
  if (!name) { showToast('אנא הכנס שם'); return; }

  if (uid) {
    await setDoc(doc(db,'users',uid), { role:'tenant', consumerId:unitId, name }, { merge:false });
  }

  const nextMk = monthKey();
  await setDoc(doc(db,'meters',nextMk), {
    [`elec_${unitId}_prev`]: elecVal,
  }, { merge:true });

  closeModal();
  showToast('דייר עודכן ✓');
  renderSettingsPage();
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────────
async function checkNotifications() {
  if (userRole !== 'admin') return;
  const snap = await getDocs(collection(db,'notifications'));
  let unread = 0;
  snap.forEach(d => { if (!d.data().read) unread++; });
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.toggle('hidden', unread===0);
}

window.showNotifications = async function() {
  const snap = await getDocs(collection(db,'notifications'));
  let items = [];
  snap.forEach(d => items.push({ id:d.id, ...d.data() }));
  items.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  items = items.slice(0,20);

  if (items.length === 0) {
    openModal('התראות', '<div class="empty-state"><div class="empty-icon"><i class="ti ti-bell"></i></div><div class="empty-text">אין התראות</div></div>');
    return;
  }

  const html = items.map(n=>`<div class="unit-row" style="cursor:default">
    <div style="font-size:22px;width:36px;text-align:center">${n.type==='meter_submitted'?'📊':'🔔'}</div>
    <div class="unit-info">
      <div class="unit-name" style="font-size:13px">${n.message}</div>
      <div class="unit-detail">${n.monthKey||''}</div>
    </div>
    ${!n.read?'<span class="badge badge-green">חדש</span>':''}
  </div>`).join('');

  openModal('התראות', html);

  // Mark all read
  const batch = items.filter(n=>!n.read);
  for (const n of batch) {
    await updateDoc(doc(db,'notifications',n.id), { read:true });
  }
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.add('hidden');
};

// ── MODAL ─────────────────────────────────────────────────────────────
window.openModal = function(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const ov = document.getElementById('modal-overlay');
  ov.classList.remove('hidden');
  ov.classList.add('active');
};

window.closeModal = function() {
  const ov = document.getElementById('modal-overlay');
  ov.classList.add('hidden');
  ov.classList.remove('active');
};

// ── TOAST ─────────────────────────────────────────────────────────────
window.showToast = function(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('active');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.classList.add('hidden');
    t.classList.remove('active');
  }, 2500);
};

// ── SERVICE WORKER ────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}

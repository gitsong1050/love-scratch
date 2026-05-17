const API_BASE = 'https://love-scatch-api-rtwpjgvcre.cn-hangzhou.fcapp.run';

const ADMIN_USER = '洪管理';
const PARTICIPANT_USERS = ['阿晓', '晓丹'];
const LOGIN_USERS = [ADMIN_USER, ...PARTICIPANT_USERS];

let state = {
  settings: {
    users: PARTICIPANT_USERS,
    dailyLimit: 1,
    winningRate: 50,
    consolationTexts: []
  },
  prizes: [],
  records: []
};

let prizes = [];
let records = [];
let preparedRecord = null;
let currentPrize = null;
let currentUser = LOGIN_USERS.includes(localStorage.getItem('love_current_user'))
  ? localStorage.getItem('love_current_user')
  : '';

let isDrawing = false;
let isRevealed = false;
let isRevealing = false;
let lastX = 0;
let lastY = 0;

const revealThreshold = 55;

const canvas = document.getElementById('scratchCanvas');
const ctx = canvas.getContext('2d');

const prizeContent = document.getElementById('prizeContent');
const prizeType = document.getElementById('prizeType');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const dailyText = document.getElementById('dailyText');
const targetText = document.getElementById('targetText');
const mainSubtitle = document.getElementById('mainSubtitle');

const currentUserSelect = document.getElementById('currentUser');
const fromUserSelect = document.getElementById('fromUser');
const toUserSelect = document.getElementById('toUser');

const prizeForm = document.getElementById('prizeForm');
const prizeNameInput = document.getElementById('prizeName');
const prizeCountInput = document.getElementById('prizeCount');
const prizeCategory = document.getElementById('prizeCategory');

const prizeList = document.getElementById('prizeList');
const recordList = document.getElementById('recordList');
const dbPrizeList = document.getElementById('dbPrizeList');
const dbRecordList = document.getElementById('dbRecordList');
const jsonArea = document.getElementById('jsonArea');

const adminMask = document.getElementById('adminMask');
const dataMask = document.getElementById('dataMask');
const loginScreen = document.getElementById('loginScreen');
const appMain = document.getElementById('appMain');
const loginNameInput = document.getElementById('loginName');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const openDataBtn = document.getElementById('openDataBtn');
const openAdminBtn = document.getElementById('openAdminBtn');

const adminInput = document.getElementById('adminInput');
const usersInput = document.getElementById('usersInput');
const dailyLimitInput = document.getElementById('dailyLimitInput');
const winningRateInput = document.getElementById('winningRateInput');
const consolationInput = document.getElementById('consolationInput');
const drawerAdminTools = document.getElementById('drawerAdminTools');
const prizeListHint = document.getElementById('prizeListHint');
const writeHint = document.getElementById('writeHint');

function isAdmin() {
  return currentUser === ADMIN_USER;
}

function isParticipant(user = currentUser) {
  return PARTICIPANT_USERS.includes(user);
}

function showLogin(message = '') {
  loginScreen.classList.remove('hidden');
  appMain.classList.add('hidden');
  openDataBtn.style.display = 'none';
  openAdminBtn.style.display = 'none';
  loginError.textContent = message;
  setTimeout(() => loginNameInput.focus(), 50);
}

function showApp() {
  loginScreen.classList.add('hidden');
  appMain.classList.remove('hidden');
  openAdminBtn.style.display = 'block';
  openDataBtn.style.display = isAdmin() ? 'block' : 'none';
  mainSubtitle.textContent = isAdmin()
    ? '管理员可维护全部数据；普通用户只能刮对方写给自己的卡'
    : '只能刮「对方写给你」的刮刮乐';
}

async function loginByName() {
  const name = loginNameInput.value.trim();

  if (!LOGIN_USERS.includes(name)) {
    showLogin('用户名不正确，请重新输入');
    return;
  }

  currentUser = name;
  localStorage.setItem('love_current_user', currentUser);
  showApp();
  await loadData();
  toast(`${currentUser}，欢迎回来`);
}

function logout() {
  localStorage.removeItem('love_current_user');
  currentUser = '';
  preparedRecord = null;
  currentPrize = null;
  state = {
    settings: { users: PARTICIPANT_USERS, dailyLimit: 1, winningRate: 50, consolationTexts: [] },
    prizes: [],
    records: []
  };
  prizes = [];
  records = [];
  loginNameInput.value = '';
  showLogin('已退出，请重新输入用户名');
}

async function api(action, data = {}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, user: currentUser, ...data })
  });

  let json;

  try {
    json = await res.json();
  } catch {
    throw new Error('接口没有返回 JSON，请检查函数触发器地址');
  }

  if (json && typeof json.body === 'string') {
    try {
      json = JSON.parse(json.body);
    } catch {
      throw new Error('接口 body 不是有效 JSON');
    }
  }

  if (!res.ok && !json.ok) {
    throw new Error(json.message || `请求失败：${res.status}`);
  }

  if (!json.ok) {
    throw new Error(json.message || '请求失败');
  }

  return json;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s]));
}

function formatTime(t) {
  if (!t) return '-';

  const d = new Date(Number(t));

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toDatetimeLocalValue(t) {
  if (!t) return '';

  const d = new Date(Number(t));
  const pad = n => String(n).padStart(2, '0');

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocal(value) {
  if (!value) return Date.now();

  const t = new Date(value).getTime();

  return Number.isNaN(t) ? Date.now() : t;
}

function chinaDateKey(t = Date.now()) {
  const d = new Date(Number(t) + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function otherUser(user = currentUser) {
  return PARTICIPANT_USERS.find(x => x !== user) || PARTICIPANT_USERS[0];
}

function getAdminToken() {
  let token = localStorage.getItem('love_admin_token');

  if (!token) {
    token = prompt('请输入管理密码');
    if (token) {
      localStorage.setItem('love_admin_token', token);
    }
  }

  return token;
}

function clearAdminToken() {
  localStorage.removeItem('love_admin_token');
  toast('管理密码已清除');
}

function handleAdminError(err, fallbackMsg) {
  const msg = err?.message || fallbackMsg || '操作失败';
  toast(msg);

  if (msg.includes('管理密码') || msg.includes('403')) {
    clearAdminToken();
  }
}

function normalizeLocalState(data) {
  const s = data || {};

  state = {
    settings: {
      users: PARTICIPANT_USERS,
      dailyLimit: Number(s.settings?.dailyLimit ?? 1),
      winningRate: Number(s.settings?.winningRate ?? 50),
      consolationTexts: Array.isArray(s.settings?.consolationTexts) ? s.settings.consolationTexts : []
    },
    prizes: Array.isArray(s.prizes) ? s.prizes : [],
    records: Array.isArray(s.records) ? s.records : []
  };

  prizes = state.prizes;
  records = state.records;
}

function refreshUserSelectors() {
  const loginOptions = LOGIN_USERS.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
  const participantOptions = PARTICIPANT_USERS.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');

  currentUserSelect.innerHTML = loginOptions;
  currentUserSelect.value = currentUser || LOGIN_USERS[0];
  currentUserSelect.disabled = true;

  fromUserSelect.innerHTML = participantOptions;
  toUserSelect.innerHTML = participantOptions;

  if (isAdmin()) {
    fromUserSelect.value = PARTICIPANT_USERS[0];
    toUserSelect.value = PARTICIPANT_USERS[1];
    fromUserSelect.disabled = false;
    toUserSelect.disabled = false;
    writeHint.textContent = '管理员可以代任意一方添加卡片，也可以在左下角数据面板维护全部数据。';
  } else {
    fromUserSelect.value = currentUser || PARTICIPANT_USERS[0];
    toUserSelect.value = otherUser(currentUser || PARTICIPANT_USERS[0]);
    fromUserSelect.disabled = true;
    toUserSelect.disabled = true;
    writeHint.textContent = '这里新增的是「我写给对方」的卡片。写的人自己不会抽到，只会让对方抽到。';
  }

  adminInput.value = ADMIN_USER;
  usersInput.value = PARTICIPANT_USERS.join(' / ');
  dailyLimitInput.value = Number(state.settings.dailyLimit || 0);
  winningRateInput.value = Number(state.settings.winningRate ?? 50);
  consolationInput.value = (state.settings.consolationTexts || []).join('\n');

  drawerAdminTools.style.display = isAdmin() ? 'flex' : 'none';
  prizeListHint.textContent = isAdmin()
    ? '管理员可以看到全部卡片。'
    : '普通用户这里只能看到自己写给对方的卡片。';
}

function getTodayUsed(user = currentUser) {
  const today = chinaDateKey();

  return records.filter(r =>
    String(r.to || '') === user &&
    chinaDateKey(r.time) === today
  ).length;
}

function getAvailableForCurrentUser() {
  if (!isParticipant()) return [];

  return prizes.filter(p =>
    String(p.to || '') === currentUser &&
    String(p.from || '') !== currentUser &&
    Number(p.count || 0) > 0
  );
}

function updateDailyUI() {
  if (!currentUser) {
    dailyText.textContent = '请先登录';
    targetText.textContent = '登录后显示权限和可刮次数';
    return;
  }

  if (isAdmin()) {
    dailyText.textContent = `管理员：${ADMIN_USER}`;
    targetText.textContent = '管理员不参与刮卡，可以维护数据和代写卡片';
    return;
  }

  const limit = Number(state.settings.dailyLimit || 0);
  const used = getTodayUsed();
  const available = getAvailableForCurrentUser().reduce((sum, p) => sum + Number(p.count || 0), 0);
  const other = otherUser(currentUser);

  if (limit > 0) {
    dailyText.textContent = `今日已刮 ${used}/${limit} 次，剩余 ${Math.max(0, limit - used)} 次`;
  } else {
    dailyText.textContent = `今日已刮 ${used} 次，不限制次数`;
  }

  targetText.textContent = `当前只能刮「${other} 写给 ${currentUser}」的卡片，可用 ${available} 张`;
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  if (!isRevealed) {
    drawCover();
  } else {
    ctx.clearRect(0, 0, rect.width, rect.height);
  }
}

function drawCover() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.globalCompositeOperation = 'source-over';

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#b9b9c9');
  g.addColorStop(0.5, '#eeeeee');
  g.addColorStop(1, '#a8a8b7');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.font = '800 24px Microsoft YaHei';
  ctx.textAlign = 'center';
  ctx.fillText('用手指刮开', w / 2, h / 2 - 6);

  ctx.font = '14px Microsoft YaHei';
  ctx.fillText('奖励文字就在下面 ♡', w / 2, h / 2 + 24);

  progressBar.style.width = '0%';
}

function setIdleCard() {
  preparedRecord = null;
  currentPrize = null;
  isRevealed = false;
  isRevealing = false;

  if (isAdmin()) {
    prizeType.textContent = '管理员模式';
    prizeContent.textContent = '管理员不参与刮卡\n请使用左下角数据面板维护后台';
    statusText.textContent = '管理员可以代写卡片，也可以维护中奖概率和数据';
    document.getElementById('newCardBtn').disabled = true;
  } else {
    prizeType.textContent = `${currentUser} 的今日小卡片`;
    prizeContent.textContent = '点击“准备一张”开始';
    statusText.textContent = '点击准备一张后，会占用今日一次刮卡次数';
    document.getElementById('newCardBtn').disabled = false;
  }

  progressBar.style.width = '0%';
  updateDailyUI();
  resizeCanvas();
}

function applyPreparedCard(record) {
  preparedRecord = record || null;
  currentPrize = record
    ? {
        id: record.prizeId || '',
        from: record.from,
        to: record.to,
        name: record.resultText || record.prize || '',
        category: record.category || '',
        isWin: Boolean(record.isWin)
      }
    : null;

  if (!record) {
    setIdleCard();
    return;
  }

  isRevealed = false;
  isRevealing = false;

  prizeType.textContent = record.isWin
    ? `${record.from} 写给 ${record.to}`
    : '谢谢参与';
  prizeContent.textContent = record.resultText || record.prize || '神秘小卡片';
  statusText.textContent = '文字已经藏好啦，慢慢刮开看看';
  progressBar.style.width = '0%';

  resizeCanvas();
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;

  return {
    x: p.clientX - rect.left,
    y: p.clientY - rect.top
  };
}

function start(e) {
  if (isAdmin()) return toast('管理员不参与刮卡');
  if (!preparedRecord) return toast('请先点击“准备一张”');
  if (isRevealed || isRevealing) return;

  isDrawing = true;

  const p = getPos(e);
  lastX = p.x;
  lastY = p.y;

  scratch(e);
}

function scratch(e) {
  if (!isDrawing || isRevealed || isRevealing || !preparedRecord) return;

  e.preventDefault();

  const p = getPos(e);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();

  lastX = p.x;
  lastY = p.y;

  const percent = getScratchPercent();
  progressBar.style.width = percent + '%';

  if (percent >= revealThreshold) {
    confirmPreparedCard();
  }
}

function stop() {
  isDrawing = false;
}

function getScratchPercent() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let clear = 0;
  let total = 0;

  for (let i = 3; i < data.length; i += 16) {
    total++;
    if (data[i] === 0) {
      clear++;
    }
  }

  return total ? Math.min(100, Math.round((clear / total) * 100)) : 0;
}

async function prepareCard() {
  if (isAdmin()) return toast('管理员不参与刮卡');
  if (!isParticipant()) return toast('当前身份不能刮卡');
  if (isRevealing) return toast('正在处理，请稍等');

  isRevealing = true;
  statusText.textContent = '正在准备你的刮刮乐...';

  try {
    const result = await api('prepareCard', { user: currentUser });
    normalizeLocalState(result.data);
    applyPreparedCard(result.record);
    renderAll({ keepCard: true });
    toast(result.record?.isWin ? '奖品已经藏好啦' : '安慰小卡片已经藏好啦');
  } catch (err) {
    toast(err.message || '准备失败');
    setIdleCard();
  } finally {
    isRevealing = false;
  }
}

async function confirmPreparedCard() {
  if (!preparedRecord || isRevealed || isRevealing) return;

  isRevealing = true;
  isDrawing = false;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  progressBar.style.width = '100%';
  statusText.textContent = '正在确认结果...';

  try {
    const result = await api('confirmCard', {
      user: currentUser,
      recordId: preparedRecord.id
    });

    normalizeLocalState(result.data);
    currentPrize = result.record;
    isRevealed = true;
    isRevealing = false;
    statusText.textContent = result.record?.isWin
      ? '已开奖，记得兑现这个小约定'
      : '没有中奖，但爱意已经到账';

    renderAll({ keepCard: true });

    if (result.record?.isWin) {
      confetti();
      toast('中奖啦，已写入记录');
    } else {
      toast('这次没有中奖，安慰卡也很可爱');
    }
  } catch (err) {
    isRevealing = false;
    isRevealed = false;
    prizeType.textContent = '开奖失败';
    prizeContent.textContent = err.message || '请稍后再试';
    statusText.textContent = '开奖失败，可以刷新后再试';
    toast(err.message || '开奖失败');
  }
}

async function loadData(options = {}) {
  if (!currentUser) {
    showLogin();
    return;
  }

  try {
    const result = await api('getData', { user: currentUser });

    normalizeLocalState(result.data);
    refreshUserSelectors();
    renderAll({ keepCard: true });

    openDataBtn.style.display = isAdmin() ? 'block' : 'none';

    if (isAdmin()) {
      setIdleCard();
      return;
    }

    if (result.pendingRecord && !options.forceIdle) {
      applyPreparedCard(result.pendingRecord);
      statusText.textContent = '你有一张还没刮完的卡片，继续刮开吧';
    } else if (!options.keepCard) {
      setIdleCard();
    }
  } catch (err) {
    prizeType.textContent = '加载失败';
    prizeContent.textContent = '请检查接口地址或网络';
    statusText.textContent = err.message || '数据加载失败';
    toast(err.message || '数据加载失败');
  }
}

function renderAll(options = {}) {
  openDataBtn.style.display = isAdmin() ? 'block' : 'none';
  refreshUserSelectors();
  updateDailyUI();
  renderPrizeList();
  renderRecordList();
  renderDbPrizeList();
  renderDbRecordList();
  renderJson();

  if (!options.keepCard && !preparedRecord && !isRevealed) {
    updateDailyUI();
  }
}

function directionText(item) {
  return `${escapeHTML(item.from || '?')} → ${escapeHTML(item.to || '?')}`;
}

function visiblePrizesForDrawer() {
  if (isAdmin()) return prizes;

  return prizes.filter(p => String(p.from || '') === currentUser);
}

function visibleRecordsForDrawer() {
  if (isAdmin()) return records;

  return records.filter(r => String(r.from || '') === currentUser || String(r.to || '') === currentUser);
}

function renderPrizeList() {
  prizeList.innerHTML = '';

  const list = visiblePrizesForDrawer();

  if (!list.length) {
    prizeList.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">暂无卡片</td></tr>';
    return;
  }

  list.forEach(p => {
    const name = escapeHTML(p.name || '').replace(/\n/g, ' / ');

    prizeList.insertAdjacentHTML('beforeend', `
      <tr>
        <td><span class="pill">${directionText(p)}</span></td>
        <td>${escapeHTML(p.category || '-')}</td>
        <td>${name}</td>
        <td>${Number(p.count || 0)}</td>
      </tr>
    `);
  });
}

function renderRecordList() {
  recordList.innerHTML = '';

  const list = visibleRecordsForDrawer();

  if (!list.length) {
    recordList.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">暂无记录</td></tr>';
    return;
  }

  list.forEach((r, i) => {
    const globalIndex = records.findIndex(x => x.id === r.id);
    const prize = escapeHTML(r.resultText || r.prize || '').replace(/\n/g, ' / ');
    const redeemHtml = r.redeemTime
      ? `<span class="text-green-600">${formatTime(r.redeemTime)}</span>`
      : `<button class="primary px-3 py-1 text-xs" onclick="redeem(${globalIndex})">填写兑现</button>`;
    const statusText = r.status === 'prepared' ? '<span class="text-orange-500">待刮开</span>' : '<span class="text-green-600">已刮开</span>';

    recordList.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${list.length - i}</td>
        <td>${formatTime(r.time)}<br>${statusText}</td>
        <td><span class="pill">${directionText(r)}</span></td>
        <td><b>${escapeHTML(r.category || '')}</b> ${prize}</td>
        <td>${redeemHtml}</td>
      </tr>
    `);
  });
}

function renderDbPrizeList() {
  dbPrizeList.innerHTML = '';

  if (!prizes.length) {
    dbPrizeList.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">暂无卡片</td></tr>';
    return;
  }

  prizes.forEach((p, i) => {
    const name = escapeHTML(p.name || '').replace(/\n/g, ' / ');

    dbPrizeList.insertAdjacentHTML('beforeend', `
      <tr>
        <td><span class="pill">${directionText(p)}</span><br><span class="muted">${escapeHTML(p.category || '-')}</span></td>
        <td>${name}</td>
        <td>${Number(p.count || 0)}</td>
        <td class="whitespace-nowrap">
          <button class="ghost small-btn" onclick="editPrize(${i})">改</button>
          <button class="danger small-btn" onclick="deletePrize(${i})">删</button>
        </td>
      </tr>
    `);
  });
}

function renderDbRecordList() {
  dbRecordList.innerHTML = '';

  if (!records.length) {
    dbRecordList.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">暂无记录</td></tr>';
    return;
  }

  records.forEach((r, i) => {
    const prize = escapeHTML(r.resultText || r.prize || '').replace(/\n/g, ' / ');
    const status = r.redeemTime
      ? `<span class="text-green-600">已兑现<br>${formatTime(r.redeemTime)}</span>`
      : `<span class="text-gray-400">${r.status === 'prepared' ? '待刮开' : '未兑现'}</span>`;

    dbRecordList.insertAdjacentHTML('beforeend', `
      <tr>
        <td><span class="pill">${directionText(r)}</span><br><span class="muted">${formatTime(r.time)}</span></td>
        <td>${prize}<br><span class="muted">${r.isWin ? '中奖' : '未中奖'}</span></td>
        <td>${status}</td>
        <td class="whitespace-nowrap">
          <button class="ghost small-btn" onclick="redeem(${i})">兑现</button>
          <button class="danger small-btn" onclick="deleteRecord(${i})">删</button>
        </td>
      </tr>
    `);
  });
}

function renderJson() {
  jsonArea.value = JSON.stringify(state, null, 2);
}

window.editPrize = async function (i) {
  const p = prizes[i];
  if (!p) return;

  const token = getAdminToken();
  if (!token) return toast('需要管理密码');

  const from = prompt('写的人 from：', p.from || PARTICIPANT_USERS[0]);
  if (!from) return;

  const to = prompt('写给谁 to：', p.to || otherUser(from));
  if (!to) return;

  const category = prompt('类型：', p.category || '奖励') || '奖励';
  const name = prompt('内容：', p.name || '');
  if (!name) return;

  const count = Number(prompt('剩余数量：', Number(p.count || 0)));
  if (Number.isNaN(count) || count < 0) return toast('数量不正确');

  try {
    const result = await api('updatePrize', {
      token,
      index: i,
      prize: { ...p, from, to, category, name, count }
    });

    normalizeLocalState(result.data);
    renderAll();
    setIdleCard();
    toast('修改成功');
  } catch (err) {
    handleAdminError(err, '修改失败');
  }
};

window.deletePrize = async function (i) {
  if (!confirm('删除这张卡片？')) return;

  const token = getAdminToken();
  if (!token) return toast('需要管理密码');

  try {
    const result = await api('deletePrize', { token, index: i });

    normalizeLocalState(result.data);
    renderAll();
    setIdleCard();
    toast('删除成功');
  } catch (err) {
    handleAdminError(err, '删除失败');
  }
};

window.redeem = async function (i) {
  const r = records[i];
  if (!r) return;

  const defaultValue = toDatetimeLocalValue(r.redeemTime || Date.now());
  const timeValue = prompt('填写兑现时间，格式为 YYYY-MM-DDTHH:mm', defaultValue);
  if (timeValue === null) return;

  const note = prompt('兑现备注，可留空：', r.redeemNote || '') || '';
  const redeemer = prompt('是谁填写的：', currentUser) || currentUser;

  try {
    const result = await api('redeemRecord', {
      index: i,
      redeemTime: parseDatetimeLocal(timeValue),
      redeemNote: note,
      redeemer
    });

    normalizeLocalState(result.data);
    renderAll({ keepCard: true });
    toast('已填写兑现时间');
  } catch (err) {
    toast(err.message || '填写失败');
  }
};

window.deleteRecord = async function (i) {
  if (!confirm('删除这条开奖记录？')) return;

  const token = getAdminToken();
  if (!token) return toast('需要管理密码');

  try {
    const result = await api('deleteRecord', { token, index: i });

    normalizeLocalState(result.data);
    renderAll({ keepCard: true });
    toast('记录已删除');
  } catch (err) {
    handleAdminError(err, '删除失败');
  }
};

function confetti() {
  const colors = ['#ff6fae', '#ffbf57', '#9b5cff', '#5fd6ff', '#7ee787'];

  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');

    s.className = 'confetti';
    s.style.left = Math.random() * 100 + 'vw';
    s.style.top = '-20px';
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.animationDelay = Math.random() * 0.7 + 's';

    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3600);
  }
}

function floatingHeart() {
  const h = document.createElement('div');

  h.className = 'float-heart';
  h.textContent = ['♡', '❤', '💕', '💗'][Math.floor(Math.random() * 4)];
  h.style.left = Math.random() * 100 + 'vw';
  h.style.animationDuration = 5 + Math.random() * 5 + 's';

  document.body.appendChild(h);
  setTimeout(() => h.remove(), 10000);
}

setInterval(floatingHeart, 900);

prizeForm.addEventListener('submit', async e => {
  e.preventDefault();

  const from = isAdmin() ? fromUserSelect.value : currentUser;
  const to = isAdmin() ? toUserSelect.value : otherUser(currentUser);
  const name = prizeNameInput.value.trim();
  const count = parseInt(prizeCountInput.value, 10);
  const category = prizeCategory.value;

  if (from === to) return toast('不能写给自己，请选择对方');
  if (!name || count <= 0) return toast('请填写内容和数量');

  try {
    const result = await api('addPrize', {
      user: currentUser,
      prize: { from, to, category, name, count }
    });

    normalizeLocalState(result.data);
    prizeNameInput.value = '';
    prizeCountInput.value = 1;

    renderAll({ keepCard: true });
    toast(`已写给 ${to}`);
  } catch (err) {
    toast(err.message || '添加失败');
  }
});

fromUserSelect.addEventListener('change', () => {
  if (fromUserSelect.value === toUserSelect.value) {
    toUserSelect.value = otherUser(fromUserSelect.value);
  }
});

toUserSelect.addEventListener('change', () => {
  if (fromUserSelect.value === toUserSelect.value) {
    fromUserSelect.value = otherUser(toUserSelect.value);
  }
});

currentUserSelect.addEventListener('change', () => {
  currentUserSelect.value = currentUser;
});

document.getElementById('newCardBtn').onclick = prepareCard;

document.getElementById('copyBtn').onclick = () => {
  if (!isRevealed || !currentPrize) return toast('请先刮开再复制结果');

  navigator.clipboard
    ?.writeText(prizeContent.textContent)
    .then(() => toast('结果已复制'))
    .catch(() => toast('复制失败，请手动复制'));
};

document.getElementById('seedBtn').onclick = async () => {
  const token = getAdminToken();
  if (!token) return toast('需要管理密码');

  try {
    const result = await api('seed', { token });

    normalizeLocalState(result.data);
    renderAll();
    setIdleCard();
    toast('双向示例已加入');
  } catch (err) {
    handleAdminError(err, '生成示例失败');
  }
};

document.getElementById('exportBtn').onclick = () => {
  navigator.clipboard
    ?.writeText(JSON.stringify(state, null, 2))
    .then(() => toast('数据已复制'))
    .catch(() => toast('复制失败'));
};

document.getElementById('refreshBtn').onclick = () => loadData({ keepCard: true });
document.getElementById('dbRefreshBtn').onclick = () => loadData({ keepCard: true });

document.getElementById('saveSettingsBtn').onclick = async () => {
  const token = getAdminToken();
  if (!token) return toast('需要管理密码');

  const dailyLimit = Number(dailyLimitInput.value || 0);
  const winningRate = Number(winningRateInput.value || 0);
  const consolationTexts = consolationInput.value
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

  if (Number.isNaN(dailyLimit) || dailyLimit < 0) return toast('每日次数不正确');
  if (Number.isNaN(winningRate) || winningRate < 0 || winningRate > 100) return toast('中奖概率必须是 0-100');

  try {
    const result = await api('updateSettings', {
      token,
      settings: {
        users: PARTICIPANT_USERS,
        dailyLimit,
        winningRate,
        consolationTexts
      }
    });

    normalizeLocalState(result.data);
    renderAll({ keepCard: true });
    toast('设置已保存');
  } catch (err) {
    handleAdminError(err, '设置保存失败');
  }
};

document.getElementById('clearTokenBtn').onclick = clearAdminToken;

document.getElementById('copyJsonBtn').onclick = () => {
  navigator.clipboard
    ?.writeText(jsonArea.value)
    .then(() => toast('JSON 已复制'))
    .catch(() => toast('复制失败'));
};

document.getElementById('downloadJsonBtn').onclick = () => {
  const blob = new Blob([jsonArea.value], {
    type: 'application/json;charset=utf-8'
  });
  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = `love-scratch-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(a.href);
};

document.getElementById('saveJsonBtn').onclick = async () => {
  if (!confirm('确认用文本框里的 JSON 覆盖云端全部数据？')) return;

  const token = getAdminToken();
  if (!token) return toast('需要管理密码');

  try {
    const nextState = JSON.parse(jsonArea.value);
    const result = await api('saveAll', { token, data: nextState });

    normalizeLocalState(result.data);
    renderAll();
    setIdleCard();
    toast('JSON 已整体保存');
  } catch (err) {
    handleAdminError(err, '保存失败，请检查 JSON 格式');
  }
};

openAdminBtn.onclick = () => {
  if (!currentUser) return showLogin('请先登录');

  renderAll({ keepCard: true });
  adminMask.classList.add('show');
};

document.getElementById('closeAdminBtn').onclick = () => {
  adminMask.classList.remove('show');
};

adminMask.addEventListener('click', e => {
  if (e.target === adminMask) {
    adminMask.classList.remove('show');
  }
});

openDataBtn.onclick = () => {
  if (!isAdmin()) return toast('只有管理员可以打开数据库面板');

  renderAll({ keepCard: true });
  dataMask.classList.add('show');
};

document.getElementById('closeDataBtn').onclick = () => {
  dataMask.classList.remove('show');
};

dataMask.addEventListener('click', e => {
  if (e.target === dataMask) {
    dataMask.classList.remove('show');
  }
});

loginBtn.onclick = loginByName;

loginNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loginByName();
});

logoutBtn.onclick = logout;

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('prizesPanel').classList.toggle('hidden', btn.dataset.tab !== 'prizes');
    document.getElementById('recordsPanel').classList.toggle('hidden', btn.dataset.tab !== 'records');
  };
});

canvas.addEventListener('mousedown', start);
canvas.addEventListener('mousemove', scratch);
canvas.addEventListener('mouseup', stop);
canvas.addEventListener('mouseleave', stop);

canvas.addEventListener('touchstart', start, {
  passive: false
});

canvas.addEventListener('touchmove', scratch, {
  passive: false
});

canvas.addEventListener('touchend', stop);

window.addEventListener('resize', resizeCanvas);

if (currentUser) {
  showApp();
  loadData();
} else {
  showLogin();
}

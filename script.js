/* CampusFlow – all app logic. Sections: helpers, data, scoring, planner, views, actions. */
const KEY = 'campusflow_v1';
const CATS = ['Academics', 'Assignments', 'Exams', 'Clubs', 'Events', 'Personal', 'Other'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let S = null;                                   // saved state
let ui = { view: 'dashboard', filter: 'All', sort: 'smart', q: '' };  // temporary UI state
let parsed = [];                                // last AI planner result

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const off = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const today = () => dstr(new Date());
const dayDiff = s => Math.round((new Date(s + 'T00:00') - new Date(today() + 'T00:00')) / 864e5);
const uid = () => Math.random().toString(36).slice(2, 9);
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

/* ---------- demo data (Reset Demo Data rebuilds this) ---------- */
function demoTasks() {
  const t = (title, description, category, due, time, priority, doneOff) =>
    ({ id: uid(), title, description, category, due: off(due), time, priority, done: doneOff !== undefined, completedAt: doneOff !== undefined ? off(doneOff) : null });
  return [
    t('Complete DSA assignment', 'Linked list + BST problems', 'Assignments', 1, '23:59', 'High'),
    t('Engineering Mathematics quiz', 'Chapters 3 and 4', 'Exams', 3, '10:00', 'High'),
    t('CSI poster design', 'Draft in Canva, send to core team', 'Clubs', 0, '20:00', 'Medium'),
    t('ACM meeting', 'Agenda: upcoming workshop', 'Clubs', 2, '17:00', 'Low'),
    t('Submit hackathon registration', 'Team name + member details', 'Events', 0, '18:00', 'High'),
    t('Prepare Physics notes', 'Wave optics summary', 'Academics', 4, '', 'Medium'),
    t('Club event planning', 'Book seminar hall', 'Clubs', -1, '', 'Medium'),
    t('Laundry and room cleanup', '', 'Personal', 5, '', 'Low'),
    t('Lab record submission', '', 'Assignments', -2, '', 'Medium', -3),
    t('Read OS chapter 5', '', 'Academics', -1, '', 'Low', -2),
    t('Gym session', '', 'Personal', -1, '', 'Low', -1),
    t('Chemistry worksheet', '', 'Academics', 0, '', 'Medium', 0)
  ];
}
function demoFriends() {
  const f = (name, pct, streak, done, planned, cat, week) => ({ id: uid(), name, pct, streak, done, planned, cat, week, demo: true });
  return [
    f('Ananya', 92, 5, 11, 12, 'Academics', [2, 1, 3, 1, 2, 1, 1]),
    f('Riya', 85, 4, 17, 20, 'Clubs', [3, 2, 3, 4, 2, 2, 1]),
    f('Arjun', 81, 7, 13, 16, 'Assignments', [2, 2, 3, 2, 1, 2, 1]),
    f('Kabir', 74, 2, 14, 19, 'Exams', [1, 3, 2, 2, 3, 2, 1])
  ];
}
function demoActivity() {
  return [
    { who: 'Ananya', text: 'completed 4 tasks today.' },
    { who: 'Arjun', text: 'reached a 7-day streak 🔥' },
    { who: 'Riya', text: 'completed 90% of her weekly tasks.' },
    { who: 'Kabir', text: 'moved up one place on Weekly Flow.' }
  ];
}
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
}
function freshState(name) {
  S = { user: name, joined: today(), tasks: demoTasks(), friends: demoFriends(), activity: demoActivity() };
  save();
}

/* ---------- stats & Smart Priority (rule-based, not AI) ---------- */
const isOver = t => !t.done && t.due < today();
function score(t) {
  if (t.done) return -1;
  const d = dayDiff(t.due);
  let s = d < 0 ? 100 : d === 0 ? 80 : d === 1 ? 60 : d <= 3 ? 40 : d <= 7 ? 20 : 5;
  s += { High: 30, Medium: 15, Low: 0 }[t.priority] || 0;
  return s;
}
function why(t) {
  const d = dayDiff(t.due);
  const when = d < 0 ? `Overdue by ${-d} day${d < -1 ? 's' : ''}` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`;
  return `${when} • ${t.priority} priority`;
}
function weekBounds() { const n = (new Date().getDay() + 6) % 7; return [off(-n), off(6 - n)]; }
function myWeek() {
  const [a, b] = weekBounds();
  const planned = S.tasks.filter(t => t.due >= a && t.due <= b);
  const done = planned.filter(t => t.done);
  const pct = planned.length ? Math.round(done.length / planned.length * 100) : 0;
  const byDay = [0, 0, 0, 0, 0, 0, 0], byCat = {};
  S.tasks.filter(t => t.done && t.completedAt >= a && t.completedAt <= b).forEach(t => {
    byDay[(new Date(t.completedAt + 'T00:00').getDay() + 6) % 7]++;
    byCat[t.category] = (byCat[t.category] || 0) + 1;
  });
  const top = (o, k) => Object.keys(o).sort((x, y) => o[y] - o[x])[0] || '—';
  const bestIdx = byDay.indexOf(Math.max(...byDay));
  return { planned: planned.length, done: done.length, pct, byDay, cat: top(byCat), day: Math.max(...byDay) ? DAYS[(bestIdx + 1) % 7] : '—' };
}
function streak() {
  const days = new Set(S.tasks.filter(t => t.done).map(t => t.completedAt));
  let n = 0, i = days.has(off(0)) ? 0 : -1;       // today not finished yet? streak still alive from yesterday
  while (days.has(off(i))) { n++; i--; }
  return n;
}
function overall() {
  const total = S.tasks.length, done = S.tasks.filter(t => t.done).length;
  const todayT = S.tasks.filter(t => t.due === today());
  return { total, done, pending: total - done, over: S.tasks.filter(isOver).length,
    tp: todayT.length ? Math.round(todayT.filter(t => t.done).length / todayT.length * 100) : 0 };
}
function board() {   // you + friends, ranked by completion %
  const w = myWeek();
  const rows = S.friends.map(f => ({ name: f.name, pct: f.pct, streak: f.streak, me: false }));
  rows.push({ name: S.user, pct: w.pct, streak: streak(), me: true });
  return rows.sort((a, b) => b.pct - a.pct);
}

/* ---------- AI Planning Prototype (local rules; swap parsePlan/buildSchedule for a real API later) ---------- */
function parsePlan(text) {
  const parts = text.split(/,|;|\band\b|\.(?=\s|$)/i).map(s => s.trim()).filter(s => s.length > 2);
  const out = parts.map(p => {
    const l = p.toLowerCase();
    let due = 3;
    if (/tonight|today/.test(l)) due = 0; else if (/tomorrow/.test(l)) due = 1;
    else DAYS.forEach((d, i) => { if (l.includes(d.toLowerCase())) due = ((i - new Date().getDay() + 7) % 7) || 7; });
    let category = 'Other';
    if (/test|exam|quiz/.test(l)) category = 'Exams';
    else if (/assignment|homework|submit/.test(l)) category = 'Assignments';
    else if (/club|acm|csi|meeting|poster/.test(l)) category = 'Clubs';
    else if (/event|fest/.test(l)) category = 'Events';
    else if (/notes|study|revise|lecture/.test(l)) category = 'Academics';
    const priority = due <= 1 ? 'High' : (category === 'Exams' && due <= 4) || due <= 4 ? 'Medium' : 'Low';
    let title = p.replace(/^i\s+(have|need to)\s+(an?\s+)?/i, '').replace(/\b(tonight|today|tomorrow)\b/ig, '')
      .replace(/\b(on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/ig, '').replace(/\s+/g, ' ').trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { title: title || p, category, due: off(due), dueN: due, priority, time: '' };
  });
  const rank = { High: 0, Medium: 1, Low: 2 };
  return out.sort((a, b) => a.dueN - b.dueN || rank[a.priority] - rank[b.priority]);
}
function buildSchedule(hours) {
  let left = Math.round(hours * 60);
  const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const mins = { High: 60, Medium: 45, Low: 30 };
  const slots = [];
  S.tasks.filter(t => !t.done).sort((a, b) => score(b) - score(a)).forEach(t => {
    if (left < 15) return;
    const m = Math.min(mins[t.priority], left);
    const end = new Date(d.getTime() + m * 60000);
    const f = x => `${pad(x.getHours())}:${pad(x.getMinutes())}`;
    slots.push({ t, from: f(d), to: f(end), m });
    d.setTime(end.getTime()); left -= m;
  });
  return slots;
}

/* ---------- view helpers ---------- */
function taskRow(t, actions = true) {
  const d = dayDiff(t.due);
  const badges = (t.done ? '<span class="badge ok">Done</span>' : isOver(t) ? '<span class="badge over">Overdue</span>' : '') +
    `<span class="badge ${t.priority.toLowerCase()}">${t.priority}</span>`;
  return `<div class="task ${t.done ? 'done' : ''}">
    <button class="chk" data-a="toggle" data-id="${t.id}" title="${t.done ? 'Undo completion' : 'Mark complete'}" aria-label="Toggle complete">${t.done ? '✓' : ''}</button>
    <div class="body"><div class="t">${esc(t.title)}</div>
      <div class="meta">${badges}<span>${esc(t.category)}</span><span>${d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : t.due}${t.time ? ' ' + t.time : ''}</span></div>
      ${t.description ? `<div class="meta">${esc(t.description)}</div>` : ''}</div>
    ${actions ? `<div class="acts"><button data-a="editTask" data-id="${t.id}" title="Edit">✏️</button><button data-a="delTask" data-id="${t.id}" title="Delete">🗑️</button></div>` : ''}
  </div>`;
}
const list = (arr, empty) => arr.length ? arr.map(t => taskRow(t)).join('') : `<div class="empty">${empty}</div>`;
const avatar = n => `<i>${esc(n.charAt(0).toUpperCase())}</i>`;
function chart(vals, labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
  const mx = Math.max(...vals, 1);
  return `<div class="chart">${vals.map((v, i) => `<div><span style="height:${v / mx * 90}px"></span>${labels[i]}</div>`).join('')}</div>`;
}
function weekCard(w, title = 'YOUR WEEK') {
  return `<div class="card"><h3>${title}</h3>
    <div class="big-num">${w.pct}%</div><div class="bar"><div style="width:${w.pct}%"></div></div>
    <p>${w.planned} tasks planned • ${w.done} completed</p><p>🔥 ${streak()} day streak</p>
    <p>Most productive category: <b>${esc(w.cat)}</b></p><p>Most productive day: <b>${w.day}</b></p>
    ${chart(w.byDay)}</div>`;
}

/* ---------- views ---------- */
function viewDashboard() {
  const o = overall(), h = new Date().getHours();
  const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const pending = S.tasks.filter(t => !t.done).sort((a, b) => score(b) - score(a));
  const top = pending[0];
  const todayT = S.tasks.filter(t => t.due === today());
  const upcoming = S.tasks.filter(t => !t.done && t.due > today()).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  return `<h2 style="margin-top:12px">${hi}, ${esc(S.user)}</h2><p class="lead" style="margin-top:0">Here's what's on your plate.</p>
  <div class="stats">
    <div class="card stat"><b>${o.total}</b><span>Total tasks</span></div>
    <div class="card stat good"><b>${o.done}</b><span>Completed</span></div>
    <div class="card stat"><b>${o.pending}</b><span>Pending</span></div>
    <div class="card stat bad"><b>${o.over}</b><span>Overdue</span></div>
    <div class="card stat"><b>${o.tp}%</b><span>Today's progress</span><div class="bar"><div style="width:${o.tp}%"></div></div></div>
  </div>
  <div class="card rec"><span class="tag" style="color:#aeb8ee">Smart Priority</span><p>CampusFlow recommends you work on this first.</p>
    ${top ? `<h2>${esc(top.title)}</h2><p>${why(top)}</p><button class="btn sm" style="background:var(--sun);color:var(--ink)" data-a="toggle" data-id="${top.id}">Mark complete</button>` : '<h2>All clear 🎉</h2><p>Nothing pending. Add a task or enjoy the break.</p>'}</div>
  <div class="cols">
    <div class="card"><h3>Today</h3>${list(todayT, 'Nothing due today.')}</div>
    <div class="card"><h3>Upcoming</h3>${list(upcoming, 'No upcoming deadlines.')}</div>
    <div class="card"><h3>Priority</h3>${list(pending.slice(0, 4), 'Nothing pending.')}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>AI Study Planner <span class="badge demo">AI Planning Prototype</span></h3>
    <p>Type your week in plain words. This prototype uses local rules; it can be wired to a real AI model later.</p>
    <textarea id="planText" placeholder="I have a DSA assignment tomorrow, maths test on Monday, CSI poster tonight and ACM meeting Thursday."></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" data-a="parse">Turn into tasks</button></div><div id="parsedOut"></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <h3>Plan My Day</h3>
    <div class="row"><span>I have</span><input id="hours" type="number" min="0.5" max="12" step="0.5" value="3" style="width:90px"><span>hours free today.</span>
    <button class="btn" data-a="plan">Plan My Day</button></div><div id="planOut"></div></div>`;
}
function viewTasks() {
  return `<div class="row" style="justify-content:space-between;margin-top:12px"><h2 style="margin:0">My Tasks</h2><button class="btn" data-a="addTask">+ Add task</button></div>
  <div class="tools" style="margin-top:12px"><input id="search" placeholder="Search tasks…" value="${esc(ui.q)}">
  <select id="sort"><option value="smart">Sort: Smart Priority</option><option value="due">Sort: Due date</option><option value="pri">Sort: Priority</option><option value="az">Sort: A–Z</option></select><span></span></div>
  <div class="chips" id="chips"></div><div class="card" id="taskList"></div>`;
}
function renderTaskList() {
  const f = ui.filter;
  $('#chips').innerHTML = ['All', 'Today', 'Upcoming', 'Completed', 'Overdue', 'Academics', 'Clubs', 'Personal']
    .map(c => `<button class="chip ${c === f ? 'on' : ''}" data-a="filter" data-v="${c}">${c}</button>`).join('');
  let arr = S.tasks.filter(t => {
    if (f === 'Today') return t.due === today();
    if (f === 'Upcoming') return !t.done && t.due > today();
    if (f === 'Completed') return t.done;
    if (f === 'Overdue') return isOver(t);
    if (CATS.includes(f)) return t.category === f;
    return true;
  });
  const q = ui.q.trim().toLowerCase();
  if (q) arr = arr.filter(t => (t.title + ' ' + t.description + ' ' + t.category).toLowerCase().includes(q));
  const rank = { High: 0, Medium: 1, Low: 2 };
  arr.sort({ smart: (a, b) => score(b) - score(a), due: (a, b) => a.due.localeCompare(b.due),
    pri: (a, b) => rank[a.priority] - rank[b.priority], az: (a, b) => a.title.localeCompare(b.title) }[ui.sort]);
  $('#taskList').innerHTML = list(arr, 'No tasks here. Add one or change the filter.');
}
function viewFriends() {
  return `<div class="row" style="justify-content:space-between;margin-top:12px"><h2 style="margin:0">Friends</h2><button class="btn" data-a="addFriend">+ Add friend</button></div>
  <p class="lead">Accountability without sacrificing privacy: you only see stats, never task titles. <span class="badge demo">Demo friends</span></p>
  ${S.friends.length ? `<div class="fgrid">${S.friends.map(f => `<div class="card fcard" data-a="friend" data-id="${f.id}">
    <div class="fhead">${avatar(f.name)}<b>${esc(f.name)}</b>${f.demo ? '<span class="badge demo">demo</span>' : ''}</div>
    <div class="big-num">${f.pct}%</div><div class="bar"><div style="width:${f.pct}%"></div></div>
    <p>🔥 ${f.streak} day streak</p><p>${f.done} tasks completed</p></div>`).join('')}</div>`
    : '<div class="card empty">No friends yet. Add one to start your weekly challenge.</div>'}`;
}
function viewLeaderboard() {
  const rows = board(), me = rows.findIndex(r => r.me) + 1, w = myWeek();
  const daysLeft = (7 - new Date().getDay()) % 7;
  return `<h2 style="margin-top:12px">Weekly Flow</h2><p class="lead" style="margin-top:0">This week's ranking • Resets every Monday</p>
  <p class="tag">Ranked by completion % (completed ÷ planned), not by task count.</p>
  ${rows.map((r, i) => `<div class="lb ${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span>${avatar(r.name)}<span style="width:90px;font-weight:700">${esc(r.name)}${r.me ? ' (you)' : ''}</span>
    <div class="bar"><div style="width:${r.pct}%"></div></div><b>${r.pct}%</b></div>`).join('')}
  <div class="cols">
    <div class="card"><h3>CampusFlow Weekly Challenge</h3><p><b>Goal:</b> Finish your planned tasks before Sunday.</p>
      <p>Current ranking: <b>#${me}</b> of ${rows.length} • Completion: <b>${w.pct}%</b> • Streak: <b>${streak()} 🔥</b></p>
      <p>${daysLeft === 0 ? 'Last day, finish strong!' : daysLeft + ' day(s) left'}</p>
      <div class="bar"><div style="width:${w.pct}%"></div></div>
      <div class="fun">Last place buys the canteen party ☕ <small>(just for fun and optional, no money involved)</small></div></div>
    <div class="card"><h3>Activity</h3><ul class="feed">${S.activity.map(a => `<li><b>${esc(a.who)}</b> ${esc(a.text)}</li>`).join('')}</ul></div>
  </div>`;
}
function viewProfile() {
  const w = myWeek(), total = S.tasks.filter(t => t.done).length;
  return `<h2 style="margin-top:12px">Profile</h2>
  <div class="cols"><div class="card"><div class="fhead">${avatar(S.user)}<h3 style="margin:0">${esc(S.user)}</h3></div>
    <p>Weekly completion: <b>${w.pct}%</b></p><p>Current streak: <b>${streak()} days 🔥</b></p>
    <p>Total completed tasks: <b>${total}</b></p><p>Joined: <b>${S.joined}</b></p>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-a="rename">Change name</button>
    <button class="btn ghost sm" data-a="reset">Reset Demo Data</button><button class="btn ghost sm" data-a="logout">Logout</button></div></div>
    ${weekCard(w)}</div>`;
}
const VIEWS = { dashboard: viewDashboard, tasks: viewTasks, friends: viewFriends, leaderboard: viewLeaderboard, profile: viewProfile };
function render() {
  $('#view').innerHTML = VIEWS[ui.view]();
  document.querySelectorAll('#navLinks button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.view));
  if (ui.view === 'tasks') { $('#sort').value = ui.sort; renderTaskList(); }
}
function show(id) { ['landing', 'onboard', 'app'].forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); window.scrollTo(0, 0); }

/* ---------- modals ---------- */
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); const i = $('#sheet input'); if (i) i.focus(); }
function closeModal() { $('#modal').classList.add('hidden'); }
function taskForm(t) {
  t = t || { title: '', description: '', category: 'Academics', due: today(), time: '', priority: 'Medium' };
  openModal(`<form id="taskForm" data-id="${t.id || ''}"><h3>${t.id ? 'Edit task' : 'Add task'}</h3>
    <label>Title<input name="title" required maxlength="80" value="${esc(t.title)}"></label>
    <label>Description<textarea name="description">${esc(t.description)}</textarea></label>
    <label>Category<select name="category">${CATS.map(c => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Due date<input type="date" name="due" required value="${t.due}"></label>
    <label>Due time (optional)<input type="time" name="time" value="${t.time}"></label>
    <label>Priority<select name="priority">${['High', 'Medium', 'Low'].map(p => `<option ${p === t.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <div class="row"><button class="btn" type="submit">Save task</button><button class="btn ghost" type="button" data-a="close">Cancel</button></div></form>`);
}
function friendModal(f) {
  const idx = S.friends.indexOf(f), others = Math.max(...f.week, 1);
  openModal(`<div class="fhead">${avatar(f.name)}<h3 style="margin:0">${esc(f.name)}</h3><span class="badge demo">demo data</span></div>
    <div class="big-num">${f.pct}%</div><div class="bar"><div style="width:${f.pct}%"></div></div>
    <p>Tasks completed: <b>${f.done}</b> • Tasks planned: <b>${f.planned}</b></p>
    <p>🔥 Streak: <b>${f.streak} days</b> • Top category: <b>${esc(f.cat)}</b></p>
    <p class="tag">Weekly progress (tasks finished per day)</p>${chart(f.week)}
    <p class="tag">🔒 Accountability without sacrificing privacy. Task titles, descriptions and deadlines stay private.</p>
    <div class="row"><button class="btn ghost" data-a="close">Close</button><button class="btn danger" data-a="removeFriend" data-id="${f.id}">Remove friend</button></div>`);
}

/* ---------- actions (one click handler for every data-a button) ---------- */
const actions = {
  start() { show(S && S.user ? 'app' : 'onboard'); if (S && S.user) render(); },
  how() { $('#how').scrollIntoView({ behavior: 'smooth' }); },
  nav(el) { ui.view = el.dataset.v; render(); window.scrollTo(0, 0); },
  logout() { localStorage.removeItem(KEY); S = null; show('landing'); },
  filter(el) { ui.filter = el.dataset.v; renderTaskList(); },
  addTask() { taskForm(); },
  editTask(el) { taskForm(S.tasks.find(t => t.id === el.dataset.id)); },
  delTask(el) {
    if (!confirm('Delete this task?')) return;
    S.tasks = S.tasks.filter(t => t.id !== el.dataset.id); save(); render(); toast('Task deleted');
  },
  toggle(el) {
    const t = S.tasks.find(x => x.id === el.dataset.id);
    t.done = !t.done; t.completedAt = t.done ? today() : null;
    if (t.done) { S.activity.unshift({ who: 'You', text: `completed "${t.title}".` }); S.activity = S.activity.slice(0, 8); }
    save(); render(); toast(t.done ? 'Nice! Task completed ✓' : 'Marked as pending');
  },
  close() { closeModal(); },
  addFriend() {
    openModal(`<form id="friendForm"><h3>Add friend</h3><p class="tag">Prototype: there's no backend, so we create a demo profile with sample stats.</p>
      <label>Friend's name<input name="name" required maxlength="24"></label>
      <div class="row"><button class="btn" type="submit">Add friend</button><button class="btn ghost" type="button" data-a="close">Cancel</button></div></form>`);
  },
  friend(el) { friendModal(S.friends.find(f => f.id === el.dataset.id)); },
  removeFriend(el) {
    S.friends = S.friends.filter(f => f.id !== el.dataset.id); save(); closeModal(); render(); toast('Friend removed');
  },
  rename() {
    openModal(`<form id="renameForm"><h3>Change name</h3><label>New name<input name="name" required maxlength="24" value="${esc(S.user)}"></label>
      <div class="row"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-a="close">Cancel</button></div></form>`);
  },
  reset() {
    if (!confirm('Reset all tasks, friends and activity to the demo data?')) return;
    freshState(S.user); render(); toast('Demo data reset');
  },
  parse() {
    const text = $('#planText').value.trim();
    if (!text) return toast('Type what you have to do first');
    parsed = parsePlan(text);
    $('#parsedOut').innerHTML = `<h3>Suggested order <span class="badge demo">AI Planning Prototype</span></h3><ol class="plan">${parsed.map(p =>
      `<li><b>${esc(p.title)}</b> • ${esc(p.category)} • deadline ${p.due} • <span class="badge ${p.priority.toLowerCase()}">${p.priority}</span></li>`).join('')}</ol>
      <button class="btn" data-a="addParsed">Add all to my tasks</button>`;
  },
  addParsed() {
    parsed.forEach(p => S.tasks.push({ id: uid(), title: p.title, description: 'Created by AI Planning Prototype', category: p.category,
      due: p.due, time: '', priority: p.priority, done: false, completedAt: null }));
    toast(`${parsed.length} tasks added`); parsed = []; save(); render();
  },
  plan() {
    const hrs = parseFloat($('#hours').value);
    if (!(hrs > 0)) return toast('Enter how many hours you have');
    const slots = buildSchedule(hrs);
    $('#planOut').innerHTML = slots.length ? `<h3>Your plan <span class="badge demo">AI Planning Prototype</span></h3><ol class="plan">${slots.map(s =>
      `<li><b>${s.from}–${s.to}</b> ${esc(s.t.title)} <span class="tag">(${s.m} min • ${why(s.t)})</span></li>`).join('')}</ol>`
      : '<div class="empty">No pending tasks to schedule.</div>';
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && actions[el.dataset.a]) { e.stopPropagation(); actions[el.dataset.a](el); }
  else if (e.target.id === 'modal') closeModal();
});
document.addEventListener('input', e => { if (e.target.id === 'search') { ui.q = e.target.value; renderTaskList(); } });
document.addEventListener('change', e => { if (e.target.id === 'sort') { ui.sort = e.target.value; renderTaskList(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f));
  if (f.id === 'nameForm') {
    const name = $('#nameInput').value.trim(); if (!name) return;
    freshState(name); show('app'); render(); toast(`Welcome, ${name}!`);
  } else if (f.id === 'taskForm') {
    const id = f.dataset.id;
    if (id) Object.assign(S.tasks.find(t => t.id === id), d);
    else S.tasks.push({ id: uid(), ...d, done: false, completedAt: null });
    save(); closeModal(); render(); toast(id ? 'Task updated' : 'Task added');
  } else if (f.id === 'friendForm') {
    const n = d.name.trim(), h = [...n].reduce((a, c) => a + c.charCodeAt(0), 0);   // stable fake stats from the name
    S.friends.push({ id: uid(), name: n, pct: 60 + h % 35, streak: 1 + h % 8, done: 6 + h % 10, planned: 12 + h % 6,
      cat: CATS[h % 5], week: [0, 1, 2, 3, 4, 5, 6].map(i => 1 + (h + i * 3) % 4), demo: true });
    save(); closeModal(); render(); toast(`${n} added`);
  } else if (f.id === 'renameForm') {
    S.user = d.name.trim() || S.user; save(); closeModal(); render(); toast('Name updated');
  }
});

/* ---------- start ---------- */
load();
if (S && S.user) { show('app'); render(); } else show('landing');

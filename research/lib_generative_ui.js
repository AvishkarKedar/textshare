/**
 * Generative UI Component Builder for AnonShare
 * Provides interactive, modern, responsive UI component templates and
 * dynamic component generation for live collaborative coding.
 */

export const UI_TEMPLATES = [
  {
    id: 'auth-card',
    name: 'Auth / Login Card',
    category: 'Forms',
    icon: '🔐',
    description: 'Glassmorphic login form with validation, social auth, and toggle',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login Card</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
      color: #f8fafc;
    }
    .auth-card {
      width: 100%;
      max-width: 380px;
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .auth-title { font-size: 24px; font-weight: 700; margin-bottom: 6px; text-align: center; }
    .auth-sub { font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 24px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; margin-bottom: 6px; }
    .form-input {
      width: 100%;
      height: 42px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 0 14px;
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25); }
    .form-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 20px; color: #94a3b8; }
    .form-row a { color: #818cf8; text-decoration: none; }
    .btn-submit {
      width: 100%;
      height: 44px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
      transition: transform 0.15s, opacity 0.15s;
    }
    .btn-submit:hover { opacity: 0.95; transform: translateY(-1px); }
    .btn-submit:active { transform: translateY(0); }
    .msg-box { margin-top: 14px; padding: 10px; border-radius: 6px; font-size: 12px; text-align: center; display: none; }
    .msg-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
  </style>
</head>
<body>
  <div class="auth-card">
    <h1 class="auth-title">Welcome Back</h1>
    <p class="auth-sub">Enter your credentials to continue</p>
    <form id="authForm">
      <div class="form-group">
        <label class="form-label" for="email">Email address</label>
        <input class="form-input" type="email" id="email" placeholder="alex@example.com" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input class="form-input" type="password" id="password" placeholder="••••••••" required>
      </div>
      <div class="form-row">
        <label><input type="checkbox" checked> Remember me</label>
        <a href="#forgot" onclick="alert('Password reset link simulated')">Forgot?</a>
      </div>
      <button type="submit" class="btn-submit">Sign In</button>
      <div id="authMsg" class="msg-box msg-success">Signed in successfully!</div>
    </form>
  </div>
  <script>
    document.getElementById('authForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var msg = document.getElementById('authMsg');
      var email = document.getElementById('email').value;
      msg.textContent = 'Welcome back, ' + email.split('@')[0] + '!';
      msg.style.display = 'block';
    });
  </script>
</body>
</html>`
  },
  {
    id: 'calculator',
    name: 'Interactive Calculator',
    category: 'Utilities',
    icon: '🧮',
    description: 'Clean responsive arithmetic calculator with keyboard support',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Calculator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09090b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      padding: 16px;
    }
    .calc-box {
      width: 100%;
      max-width: 320px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.6);
    }
    .calc-display {
      background: #09090b;
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 16px;
      text-align: right;
      margin-bottom: 16px;
      min-height: 68px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .calc-hist { font-size: 13px; color: #71717a; min-height: 16px; }
    .calc-val { font-size: 28px; font-weight: 700; color: #f4f4f5; word-break: break-all; }
    .calc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .calc-btn {
      height: 52px;
      border-radius: 10px;
      border: 1px solid #27272a;
      background: #27272a;
      color: #f4f4f5;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.1s;
    }
    .calc-btn:hover { background: #3f3f46; }
    .calc-btn:active { transform: scale(0.96); }
    .calc-btn.op { background: #3f3f46; color: #60a5fa; }
    .calc-btn.op:hover { background: #52525b; }
    .calc-btn.accent { background: #3b82f6; color: #fff; border-color: #3b82f6; }
    .calc-btn.accent:hover { background: #2563eb; }
    .calc-btn.clear { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }
  </style>
</head>
<body>
  <div class="calc-box">
    <div class="calc-display">
      <div class="calc-hist" id="calcHist"></div>
      <div class="calc-val" id="calcVal">0</div>
    </div>
    <div class="calc-grid">
      <button class="calc-btn clear" onclick="clearAll()">C</button>
      <button class="calc-btn op" onclick="pressKey('+/-')">±</button>
      <button class="calc-btn op" onclick="pressKey('%')">%</button>
      <button class="calc-btn op" onclick="pressOp('/')">÷</button>

      <button class="calc-btn" onclick="pressNum('7')">7</button>
      <button class="calc-btn" onclick="pressNum('8')">8</button>
      <button class="calc-btn" onclick="pressNum('9')">9</button>
      <button class="calc-btn op" onclick="pressOp('*')">×</button>

      <button class="calc-btn" onclick="pressNum('4')">4</button>
      <button class="calc-btn" onclick="pressNum('5')">5</button>
      <button class="calc-btn" onclick="pressNum('6')">6</button>
      <button class="calc-btn op" onclick="pressOp('-')">−</button>

      <button class="calc-btn" onclick="pressNum('1')">1</button>
      <button class="calc-btn" onclick="pressNum('2')">2</button>
      <button class="calc-btn" onclick="pressNum('3')">3</button>
      <button class="calc-btn op" onclick="pressOp('+')">+</button>

      <button class="calc-btn" style="grid-column: span 2" onclick="pressNum('0')">0</button>
      <button class="calc-btn" onclick="pressNum('.')">.</button>
      <button class="calc-btn accent" onclick="calculate()">=</button>
    </div>
  </div>
  <script>
    var current = '0', prev = null, op = null, resetNext = false;
    function updateDisplay() {
      document.getElementById('calcVal').textContent = current;
      document.getElementById('calcHist').textContent = prev !== null ? prev + ' ' + (op || '') : '';
    }
    function pressNum(n) {
      if (resetNext || current === '0') { current = n === '.' ? '0.' : n; resetNext = false; }
      else { if (n === '.' && current.includes('.')) return; current += n; }
      updateDisplay();
    }
    function pressOp(nextOp) {
      if (prev !== null && !resetNext) calculate();
      prev = current; op = nextOp; resetNext = true; updateDisplay();
    }
    function clearAll() { current = '0'; prev = null; op = null; resetNext = false; updateDisplay(); }
    function calculate() {
      if (prev === null || op === null) return;
      var a = parseFloat(prev), b = parseFloat(current), res = 0;
      if (op === '+') res = a + b;
      else if (op === '-') res = a - b;
      else if (op === '*') res = a * b;
      else if (op === '/') res = b !== 0 ? a / b : 'Error';
      current = String(typeof res === 'number' ? Math.round(res * 1000000) / 1000000 : res);
      prev = null; op = null; resetNext = true; updateDisplay();
    }
  </script>
</body>
</html>`
  },
  {
    id: 'todo-app',
    name: 'Collaborative Task List',
    category: 'Productivity',
    icon: '✅',
    description: 'Interactive task tracker with add, complete, delete, and filters',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #0f172a;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 30px 16px;
      display: flex;
      justify-content: center;
    }
    .todo-wrap { width: 100%; max-width: 460px; }
    .todo-head { margin-bottom: 24px; text-align: center; }
    .todo-title { font-size: 26px; font-weight: 700; color: #38bdf8; }
    .todo-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .todo-form { display: flex; gap: 8px; margin-bottom: 18px; }
    .todo-in {
      flex: 1;
      height: 42px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    .todo-in:focus { border-color: #38bdf8; }
    .todo-btn {
      height: 42px;
      padding: 0 18px;
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .todo-btn:hover { background: #0369a1; }
    .filters { display: flex; gap: 8px; margin-bottom: 14px; font-size: 12px; }
    .filter-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .filter-btn.active { background: #0284c7; color: #fff; border-color: #0284c7; }
    .todo-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .todo-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .todo-item.done span { text-decoration: line-through; opacity: 0.5; }
    .todo-item input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0284c7; cursor: pointer; }
    .todo-item span { flex: 1; font-size: 14px; }
    .todo-del { background: none; border: none; color: #ef4444; font-size: 16px; cursor: pointer; opacity: 0.7; }
    .todo-del:hover { opacity: 1; }
  </style>
</head>
<body>
  <div class="todo-wrap">
    <div class="todo-head">
      <h1 class="todo-title">Team Task Board</h1>
      <p class="todo-sub">Real-time collaborative checklist</p>
    </div>
    <form class="todo-form" id="todoForm">
      <input class="todo-in" id="taskInput" placeholder="Add a new task..." required autocomplete="off">
      <button type="submit" class="todo-btn">Add Task</button>
    </form>
    <div class="filters">
      <button class="filter-btn active" onclick="setFilter('all')">All</button>
      <button class="filter-btn" onclick="setFilter('active')">Active</button>
      <button class="filter-btn" onclick="setFilter('completed')">Completed</button>
    </div>
    <ul class="todo-list" id="todoList"></ul>
  </div>
  <script>
    var tasks = [
      { id: 1, text: 'Review team pull requests', done: true },
      { id: 2, text: 'Implement WebSocket heartbeat', done: false },
      { id: 3, text: 'Test college lab code on Android', done: false }
    ];
    var currentFilter = 'all';

    function render() {
      var list = document.getElementById('todoList');
      list.innerHTML = '';
      var filtered = tasks.filter(function(t) {
        if (currentFilter === 'active') return !t.done;
        if (currentFilter === 'completed') return t.done;
        return true;
      });
      filtered.forEach(function(t) {
        var li = document.createElement('li');
        li.className = 'todo-item' + (t.done ? ' done' : '');
        li.innerHTML = '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' onchange="toggle(' + t.id + ')">' +
          '<span>' + t.text + '</span>' +
          '<button class="todo-del" onclick="delTask(' + t.id + ')">&times;</button>';
        list.appendChild(li);
      });
    }
    function toggle(id) {
      tasks = tasks.map(function(t) { return t.id === id ? { ...t, done: !t.done } : t; });
      render();
    }
    function delTask(id) {
      tasks = tasks.filter(function(t) { return t.id !== id; });
      render();
    }
    function setFilter(f) {
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(function(b) {
        b.classList.toggle('active', b.textContent.toLowerCase() === f);
      });
      render();
    }
    document.getElementById('todoForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var inEl = document.getElementById('taskInput');
      var txt = inEl.value.trim();
      if (!txt) return;
      tasks.push({ id: Date.now(), text: txt, done: false });
      inEl.value = '';
      render();
    });
    render();
  </script>
</body>
</html>`
  },
  {
    id: 'hero-section',
    name: 'Modern Hero Landing',
    category: 'Marketing',
    icon: '🚀',
    description: 'Gradient headline, pill badge, CTA buttons, and feature counters',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hero Section</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #030712;
      color: #f9fafb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
    }
    .hero {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 20px;
      position: relative;
    }
    .hero::before {
      content: "";
      position: absolute;
      top: 15%;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%);
      pointer-events: none;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.35);
      color: #a5b4fc;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 24px;
    }
    .title {
      font-size: clamp(36px, 6vw, 64px);
      font-weight: 800;
      line-height: 1.1;
      max-width: 800px;
      margin-bottom: 20px;
      letter-spacing: -0.02em;
    }
    .title span {
      background: linear-gradient(135deg, #818cf8, #c084fc, #38bdf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .desc {
      font-size: clamp(16px, 2vw, 19px);
      color: #9ca3af;
      max-width: 580px;
      margin-bottom: 36px;
      line-height: 1.6;
    }
    .actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .btn-p {
      padding: 14px 28px;
      border-radius: 10px;
      background: #6366f1;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
      transition: transform 0.15s, background 0.15s;
    }
    .btn-p:hover { background: #4f46e5; transform: translateY(-2px); }
    .btn-s {
      padding: 14px 26px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #e5e7eb;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-s:hover { background: rgba(255, 255, 255, 0.1); }
  </style>
</head>
<body>
  <div class="hero">
    <div class="badge">✨ Generative UI Engine v2.0</div>
    <h1 class="title">Code together with <span>instant live artifacts</span></h1>
    <p class="desc">The fastest way to write, compile, and visualize applications live in browser. Zero setup, end-to-end encrypted.</p>
    <div class="actions">
      <button class="btn-p" onclick="alert('Started free room')">Get Started Free</button>
      <button class="btn-s" onclick="alert('Demo launched')">View Live Demo</button>
    </div>
  </div>
</body>
</html>`
  },
  {
    id: 'analytics-card',
    name: 'Analytics / Metric Card',
    category: 'Dashboard',
    icon: '📊',
    description: 'KPI widget with live stats and sparkline SVG chart',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Metric Card</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09090b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
    }
    .kpi-card {
      width: 100%;
      max-width: 360px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 24px;
      color: #fff;
    }
    .kpi-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .kpi-title { font-size: 13px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-badge { background: rgba(34, 197, 94, 0.15); color: #4ade80; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .kpi-val { font-size: 36px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 6px; }
    .kpi-sub { font-size: 12px; color: #71717a; margin-bottom: 20px; }
    .kpi-sub strong { color: #4ade80; }
    .sparkline-svg { width: 100%; height: 64px; overflow: visible; }
  </style>
</head>
<body>
  <div class="kpi-card">
    <div class="kpi-head">
      <span class="kpi-title">Active Connections</span>
      <span class="kpi-badge">+18.4%</span>
    </div>
    <div class="kpi-val" id="metricCounter">1,428</div>
    <div class="kpi-sub"><strong>↑ 214</strong> compared to last 24h</div>
    <svg class="sparkline-svg" viewBox="0 0 300 60">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,50 Q40,40 75,32 T150,22 T225,35 T300,10 L300,60 L0,60 Z" fill="url(#grad)"/>
      <path d="M0,50 Q40,40 75,32 T150,22 T225,35 T300,10" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
    </svg>
  </div>
  <script>
    var c = 1428;
    setInterval(function() {
      c += Math.floor(Math.random() * 5) - 2;
      document.getElementById('metricCounter').textContent = c.toLocaleString();
    }, 2000);
  </script>
</body>
</html>`
  },
  {
    id: 'pricing-table',
    name: 'Pricing Cards',
    category: 'Commercial',
    icon: '💳',
    description: 'Responsive subscription pricing tier cards',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pricing</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0f19;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 40px 16px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .pricing-grid { display: flex; gap: 20px; max-width: 720px; width: 100%; flex-wrap: wrap; justify-content: center; }
    .p-card {
      flex: 1;
      min-width: 280px;
      max-width: 340px;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 30px 24px;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .p-card.featured { border-color: #6366f1; box-shadow: 0 0 24px rgba(99, 102, 241, 0.25); }
    .p-badge {
      position: absolute;
      top: -12px;
      right: 20px;
      background: #6366f1;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .p-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .p-price { font-size: 38px; font-weight: 800; margin-bottom: 16px; }
    .p-price span { font-size: 14px; font-weight: 400; color: #9ca3af; }
    .p-list { list-style: none; margin-bottom: 24px; flex: 1; display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #d1d5db; }
    .p-list li::before { content: "✓ "; color: #34d399; font-weight: bold; }
    .p-btn {
      padding: 12px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      background: #374151;
      color: #fff;
      transition: background 0.15s;
    }
    .p-card.featured .p-btn { background: #6366f1; }
    .p-card.featured .p-btn:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="pricing-grid">
    <div class="p-card">
      <h3 class="p-title">Free Tier</h3>
      <div class="p-price">$0<span> / month</span></div>
      <ul class="p-list">
        <li>Unlimited temporary rooms</li>
        <li>AES-GCM client encryption</li>
        <li>25MB ephemeral file sharing</li>
        <li>Sandboxed code execution</li>
      </ul>
      <button class="p-btn" onclick="alert('Free tier selected')">Get Started</button>
    </div>
    <div class="p-card featured">
      <div class="p-badge">Most Popular</div>
      <h3 class="p-title">Pro Team</h3>
      <div class="p-price">$12<span> / month</span></div>
      <ul class="p-list">
        <li>All Free features</li>
        <li>Custom room domains</li>
        <li>Persistent cloud backups</li>
        <li>Dedicated runner priority</li>
        <li>WebRTC voice & video mesh</li>
      </ul>
      <button class="p-btn" onclick="alert('Pro tier selected')">Start 14-day Trial</button>
    </div>
  </div>
</body>
</html>`
  }
]

/**
 * Generate code from dynamic prompt
 */
export function generateUiFromPrompt(prompt = '') {
  const q = prompt.toLowerCase().trim()

  // Match existing presets if keyword is matched
  if (q.includes('login') || q.includes('auth') || q.includes('sign in') || q.includes('signup')) {
    return UI_TEMPLATES.find(t => t.id === 'auth-card').html
  }
  if (q.includes('calc') || q.includes('math') || q.includes('number')) {
    return UI_TEMPLATES.find(t => t.id === 'calculator').html
  }
  if (q.includes('todo') || q.includes('task') || q.includes('checklist') || q.includes('list')) {
    return UI_TEMPLATES.find(t => t.id === 'todo-app').html
  }
  if (q.includes('hero') || q.includes('landing') || q.includes('header') || q.includes('banner')) {
    return UI_TEMPLATES.find(t => t.id === 'hero-section').html
  }
  if (q.includes('metric') || q.includes('kpi') || q.includes('stat') || q.includes('chart') || q.includes('graph')) {
    return UI_TEMPLATES.find(t => t.id === 'analytics-card').html
  }
  if (q.includes('price') || q.includes('tier') || q.includes('subscription')) {
    return UI_TEMPLATES.find(t => t.id === 'pricing-table').html
  }

  // Dynamic synthesizer for arbitrary prompts
  const cleanTitle = prompt ? prompt.charAt(0).toUpperCase() + prompt.slice(1) : 'Interactive Component'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${cleanTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px 16px;
    }
    .synth-card {
      width: 100%;
      max-width: 440px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 16px 32px rgba(0,0,0,0.5);
    }
    .synth-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .synth-title { font-size: 22px; font-weight: 700; color: #f0f6fc; margin-bottom: 8px; }
    .synth-desc { font-size: 13.5px; color: #8b949e; line-height: 1.6; margin-bottom: 20px; }
    .interactive-zone {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .counter-val { font-size: 32px; font-weight: 800; color: #58a6ff; text-align: center; }
    .btn-row { display: flex; gap: 10px; }
    .act-btn {
      flex: 1;
      height: 40px;
      border-radius: 8px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #c9d1d9;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .act-btn:hover { background: #30363d; color: #fff; }
    .act-btn.primary { background: #238636; border-color: #2ea043; color: #fff; }
    .act-btn.primary:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="synth-card">
    <span class="synth-badge">✨ Generated Component</span>
    <h2 class="synth-title">${cleanTitle}</h2>
    <p class="synth-desc">Interactive component generated from prompt: <em>"${prompt || 'custom component'}"</em>.</p>
    
    <div class="interactive-zone">
      <div class="counter-val" id="countVal">0</div>
      <div class="btn-row">
        <button class="act-btn" onclick="step(-1)">- Decrease</button>
        <button class="act-btn" onclick="reset()">Reset</button>
        <button class="act-btn primary" onclick="step(1)">+ Increase</button>
      </div>
    </div>
  </div>
  <script>
    var val = 0;
    function step(d) {
      val += d;
      document.getElementById('countVal').textContent = val;
    }
    function reset() {
      val = 0;
      document.getElementById('countVal').textContent = val;
    }
  </script>
</body>
</html>`
}

/* ================================================================
   Hotel Procurement — Frontend
   Single JS file: auth + login + extract + preview + submit
   ================================================================ */

const App = {
  user: null,
  step: 'input',       // input | processing | preview | success
  extractedItems: [],
  lastResult: null,
  activeTab: 'paste',  // paste | file
  selectedFile: null,
  history: [],         // session history of submissions

  // ── Boot ──────────────────────────────────────────────────
  async init() {
    this.render('splash');
    try {
      const res  = await fetch('/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.user) {
        this.user = data.user;
        this.render('app');
      } else {
        this.render('login');
      }
    } catch { this.render('login'); }
  },

  // ── Auth ──────────────────────────────────────────────────
  async login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errEl    = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');

    if (!username || !password) {
      errEl.textContent = 'Masukkan username dan password.';
      errEl.style.display = 'block'; return;
    }
    btn.disabled = true; btn.textContent = 'Masuk...';
    errEl.style.display = 'none';

    try {
      const res  = await fetch('/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) { this.user = data.user; this.render('app'); }
      else {
        errEl.textContent = data.error || 'Login gagal.';
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Masuk';
      }
    } catch {
      errEl.textContent = 'Koneksi error.';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Masuk';
    }
  },

  async logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    this.user = null; this.step = 'input'; this.extractedItems = [];
    this.render('login');
  },

  // ── Tab switching ──────────────────────────────────────────
  setTab(tab) {
    this.activeTab = tab;
    this.selectedFile = null;
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.getElementById('paste-panel').style.display = tab === 'paste' ? 'block' : 'none';
    document.getElementById('file-panel').style.display  = tab === 'file'  ? 'block' : 'none';
  },

  // ── File handling ──────────────────────────────────────────
  handleFileDrop(e) {
    e.preventDefault();
    const zone = document.getElementById('drop-zone');
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0] || e.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(txt|pdf)$/i)) {
      this.toast('Hanya file .txt atau .pdf yang diperbolehkan.', 'error'); return;
    }
    this.selectedFile = file;
    document.getElementById('drop-file-chosen').textContent = `📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    document.getElementById('extract-btn').disabled = false;
  },

  // ── Extract ────────────────────────────────────────────────
  async extract() {
    this.step = 'processing';
    this.renderContent();

    try {
      let res;
      if (this.activeTab === 'file' && this.selectedFile) {
        const form = new FormData();
        form.append('file', this.selectedFile);
        res = await fetch('/api/extract', { method: 'POST', credentials: 'include', body: form });
      } else {
        const text = document.getElementById('ticket-input')?.value?.trim() || '';
        if (!text) { this.step = 'input'; this.renderContent(); this.toast('Teks tiket tidak boleh kosong.', 'error'); return; }
        res = await fetch('/api/extract', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketText: text })
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses tiket.');
      if (!data.items || data.items.length === 0) {
        this.step = 'input'; this.renderContent();
        this.toast('Tidak ditemukan item pengadaan dalam tiket tersebut.', 'error'); return;
      }

      this.extractedItems = data.items;
      this.lastResult     = data;
      this.step = 'preview';
      this.renderContent();
    } catch (err) {
      this.step = 'input'; this.renderContent();
      this.toast(err.message, 'error');
    }
  },

  // ── Remove item from preview ───────────────────────────────
  removeItem(index) {
    this.extractedItems.splice(index, 1);
    if (this.extractedItems.length === 0) { this.step = 'input'; this.renderContent(); return; }
    this.renderContent();
  },

  // ── Submit to Google Sheets ────────────────────────────────
  async submit() {
    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = '⏳ Menyimpan ke Google Sheets...';

    try {
      const res  = await fetch('/api/submit', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: this.extractedItems })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.history.unshift({
        date:   new Date().toLocaleString('id-ID'),
        count:  this.extractedItems.length,
        url:    data.spreadsheetUrl
      });
      this.lastResult = { ...this.lastResult, ...data };
      this.step = 'success';
      this.renderContent();
    } catch (err) {
      btn.disabled = false; btn.textContent = '✅ Submit ke Google Sheets';
      this.toast('Gagal menyimpan: ' + err.message, 'error');
    }
  },

  // ── Reset for new batch ────────────────────────────────────
  reset() {
    this.step = 'input'; this.extractedItems = []; this.lastResult = null; this.selectedFile = null;
    this.renderContent();
  },

  // ── Toast ──────────────────────────────────────────────────
  toast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`; t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  },

  // ── Render: splash ─────────────────────────────────────────
  // ── Render: router ─────────────────────────────────────────
  render(page) {
    const app = document.getElementById('app');
    if (page === 'splash') {
      app.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--navy-900)">
        <div style="text-align:center;color:white">
          <div style="font-size:3rem;margin-bottom:12px">🏨</div>
          <div style="font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--gold-400)">Hotel Procurement</div>
        </div></div>`;
      return;
    }
    if (page === 'login') {
      app.innerHTML = `
        <div class="login-page">
          <div class="login-card">
            <div class="login-icon">🏨</div>
            <h1 class="login-title">Hotel Procurement</h1>
            <p class="login-sub">Ekstrak kebutuhan pengadaan dari tiket support</p>
            <div id="login-error" class="alert alert-error" style="display:none"></div>
            <div class="form-group">
              <label class="form-label">Username</label>
              <input class="input" type="text" id="username" placeholder="Username" autocomplete="username" />
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input class="input" type="password" id="password" placeholder="Password" autocomplete="current-password" />
            </div>
            <button class="btn btn-primary btn-full" id="login-btn" onclick="App.login()">Masuk</button>
          </div>
        </div>`;
      document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') App.login(); });
      document.getElementById('username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('password').focus(); });
      return;
    }
    if (page === 'app') {
      app.innerHTML = `
        <div class="app-wrap">
          <header class="topbar">
            <div class="topbar-brand">🏨 HotelProcure</div>
            <div class="topbar-user">
              <span>👤 ${this.user?.name || 'User'}</span>
              <button class="btn-logout-top" onclick="App.logout()">Keluar</button>
            </div>
          </header>
          <main class="main" id="main-content"></main>
        </div>
        <div id="toast-container"></div>`;
      this.renderContent();
    }
  },

  renderContent() {
    const main = document.getElementById('main-content');
    if (!main) return;

    const stepHtml = `
      <div class="steps">
        <div class="step ${this.step==='input'?'active':['preview','success'].includes(this.step)?'done':''}">
          <div class="step-num">${['preview','success'].includes(this.step)?'✓':'1'}</div> Input Tiket
        </div>
        <div class="step-sep">›</div>
        <div class="step ${this.step==='processing'?'active':this.step==='preview'||this.step==='success'?'done':''}">
          <div class="step-num">${this.step==='preview'||this.step==='success'?'✓':'2'}</div> AI Membaca
        </div>
        <div class="step-sep">›</div>
        <div class="step ${this.step==='preview'?'active':this.step==='success'?'done':''}">
          <div class="step-num">${this.step==='success'?'✓':'3'}</div> Preview
        </div>
        <div class="step-sep">›</div>
        <div class="step ${this.step==='success'?'active':''}">
          <div class="step-num">4</div> Simpan
        </div>
      </div>`;

    if (this.step === 'input')      main.innerHTML = stepHtml + this.renderInput();
    else if (this.step === 'processing') main.innerHTML = stepHtml + this.renderProcessing();
    else if (this.step === 'preview')    main.innerHTML = stepHtml + this.renderPreview();
    else if (this.step === 'success')    main.innerHTML = stepHtml + this.renderSuccess();

    // Re-attach file events after render
    if (this.step === 'input') {
      const zone    = document.getElementById('drop-zone');
      const fileInp = document.getElementById('file-input');
      if (zone) {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => App.handleFileDrop(e));
        zone.addEventListener('click', () => fileInp?.click());
      }
      if (fileInp) fileInp.addEventListener('change', e => App.handleFileDrop(e));
    }
  },

  renderInput() {
    return `
      <div class="card">
        <div class="card-title">📋 Input Tiket Support</div>
        <div class="card-sub">Paste satu atau beberapa tiket sekaligus, atau upload file .txt / .pdf</div>

        <div class="input-tabs">
          <button class="tab-btn ${this.activeTab==='paste'?'active':''}" data-tab="paste" onclick="App.setTab('paste')">📝 Paste Teks</button>
          <button class="tab-btn ${this.activeTab==='file' ?'active':''}" data-tab="file"  onclick="App.setTab('file')">📁 Upload File</button>
        </div>

        <div id="paste-panel" style="display:${this.activeTab==='paste'?'block':'none'}">
          <textarea id="ticket-input" class="ticket-textarea"
            placeholder="Paste isi tiket di sini...

Contoh:
Ticket #8414 - LG senayan - sensor pintu 208 dimakan rayap
Departemen: Information Technology
Tanggal: 05/06/2025

Dear pierre, mohon bantuannya untuk pembelian atau perbaikan sensor pintu 208 karena di makan rayap.

Status: Closed
---
Ticket #8500 - AC kamar 301 tidak dingin
..."></textarea>
        </div>

        <div id="file-panel" style="display:${this.activeTab==='file'?'block':'none'}">
          <div class="drop-zone" id="drop-zone">
            <div class="drop-icon">📂</div>
            <div class="drop-label">Drag & drop file di sini, atau klik untuk memilih</div>
            <div class="drop-hint">Format: .txt atau .pdf · Maksimal 10MB</div>
            <div class="drop-file-chosen" id="drop-file-chosen"></div>
          </div>
          <input type="file" id="file-input" accept=".txt,.pdf" />
        </div>

        <div class="btn-actions">
          <button class="btn btn-primary" id="extract-btn" onclick="App.extract()">
            🤖 Proses dengan AI
          </button>
        </div>
      </div>

      ${this.history.length > 0 ? `
      <div class="card">
        <div class="card-title">🕓 Riwayat Sesi Ini</div>
        <table class="table" style="margin-top:12px">
          <thead><tr><th>Waktu</th><th>Item Dikirim</th><th>Sheet</th></tr></thead>
          <tbody>
            ${this.history.map(h => `<tr>
              <td class="text-sm">${h.date}</td>
              <td><strong>${h.count}</strong> item</td>
              <td>${h.url ? `<a href="${h.url}" target="_blank">Buka Google Sheet ↗</a>` : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}`;
  },

  renderProcessing() {
    return `
      <div class="card">
        <div class="processing">
          <div class="processing-spinner"></div>
          <div class="processing-label">AI sedang membaca tiket & mencari harga...</div>
          <div class="processing-sub">Mengekstrak kebutuhan pengadaan dan mencari kisaran harga di toko online — mungkin butuh waktu lebih lama untuk banyak item</div>
        </div>
      </div>`;
  },

  renderPreview() {
    const urgencyBadge = u => {
      if (u === 'critical') return '<span class="badge badge-red">Critical</span>';
      if (u === 'urgent')   return '<span class="badge badge-yellow">Urgent</span>';
      return '<span class="badge badge-gray">Normal</span>';
    };

    return `
      <div class="card">
        <div class="card-title">🔍 Preview Hasil Ekstraksi</div>
        <div class="card-sub">Periksa dan hapus item yang tidak perlu sebelum disimpan ke Google Sheets</div>

        <div class="preview-summary">
          <div class="summary-pill">📄 Tiket dibaca: <strong>${this.lastResult?.totalTicketsRead || '?'}</strong></div>
          <div class="summary-pill">✅ Item ditemukan: <strong>${this.extractedItems.length}</strong></div>
          ${this.lastResult?.skippedTickets > 0 ? `<div class="summary-pill">⏭️ Dilewati: <strong>${this.lastResult.skippedTickets}</strong></div>` : ''}
        </div>

        ${this.lastResult?.summary ? `<div class="alert alert-warning" style="margin-bottom:16px">💬 ${this.lastResult.summary}</div>` : ''}

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>No. Tiket</th>
                <th>Cabang</th>
                <th>Dept</th>
                <th>Deskripsi</th>
                <th>Estimasi Harga</th>
                <th>Urgensi</th>
                <th>Hapus</th>
              </tr>
            </thead>
            <tbody>
              ${this.extractedItems.map((item, i) => `
                <tr>
                  <td class="text-muted">${i+1}</td>
                  <td class="text-sm">${item.ticketNumber || '-'}</td>
                  <td class="text-sm">${item.branch || '-'}</td>
                  <td><span class="badge badge-blue">${item.department || '-'}</span></td>
                  <td class="text-sm" style="max-width:220px">${item.description}</td>
                  <td class="text-sm text-muted" style="white-space:nowrap">
                    ${item.estimatedPriceMin && item.estimatedPriceMax
                      ? `Rp ${Number(item.estimatedPriceMin).toLocaleString('id-ID')} –<br>Rp ${Number(item.estimatedPriceMax).toLocaleString('id-ID')}
                         ${item.confidence ? `<br><span class="badge ${item.confidence==='high'?'badge-blue':item.confidence==='medium'?'badge-yellow':'badge-gray'}" style="margin-top:4px">🔍 ${item.confidence}</span>` : ''}`
                      : '<span class="text-muted">Tidak ditemukan</span>'}
                  </td>
                  <td>${urgencyBadge(item.urgency)}</td>
                  <td><button class="remove-btn" onclick="App.removeItem(${i})" title="Hapus item ini">✕</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="btn-actions">
          <button class="btn btn-outline" onclick="App.reset()">← Kembali</button>
          <button class="btn btn-green" id="submit-btn" onclick="App.submit()">
            ✅ Submit ke Google Sheets (${this.extractedItems.length} item)
          </button>
        </div>
      </div>`;
  },

  renderSuccess() {
    return `
      <div class="card">
        <div class="success-wrap">
          <div class="success-icon">🎉</div>
          <div class="success-title">${this.lastResult?.rowsAdded || this.extractedItems.length} item berhasil disimpan!</div>
          <div class="success-sub">
            Data pengadaan telah ditambahkan ke Google Sheets.<br>
            Tim purchasing dapat langsung mengisi kolom Harga Fix, Lunas, dan Status di sana.
          </div>
          ${this.lastResult?.spreadsheetUrl
            ? `<div><a href="${this.lastResult.spreadsheetUrl}" target="_blank" class="success-link">📊 Buka Google Sheets ↗</a></div>`
            : ''}
          <div style="margin-top:16px">
            <button class="btn btn-outline" onclick="App.reset()">📋 Proses Tiket Lagi</button>
          </div>
        </div>
      </div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

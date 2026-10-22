(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const config = window.SITE_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY && !config.SUPABASE_URL.includes('PASTE_') && !config.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
  let db = null, session = null, currentUser = null, isAdmin = false, poems = [], knowledge = [], authMode = 'login', toastTimer = null;

  if (configured && window.supabase?.createClient) {
    db = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } else {
    $('#poem-list').innerHTML = '<div class="empty-state">Website đã sẵn sàng về giao diện. Hãy điền URL và publishable key trong <code>config.js</code>, sau đó chạy SQL trong Supabase để kết nối dữ liệu.</div>';
    $('#poem-count').textContent = 'CHƯA KẾT NỐI CƠ SỞ DỮ LIỆU';
    $('#account-message').textContent = 'Cần kết nối Supabase để bật tài khoản và bảng quản trị.';
  }

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function showToast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function setStatus(selector, message, isError = false) {
    const el = $(selector); if (!el) return; el.textContent = message; el.style.color = isError ? '#a35f47' : '';
  }
  function formatDate(value) {
    if (!value) return 'KHÔNG GHI NGÀY';
    return new Date(value).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  function normalize(s) {
    return String(s || '').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function wordSet(s) {
    const stop = new Set(['va','la','cua','cho','toi','minh','ban','nhung','mot','co','gi','nao','ve','trong','voi','hay','duoc','khong','the','nay','do','nay','em','anh','ta','da','roi','o','den','tu','thi','ma','sao','giup','tim','bai','tho']);
    return normalize(s).split(' ').filter(w => w.length > 2 && !stop.has(w));
  }

  async function loadPoems() {
    if (!db) return;
    const { data, error } = await db.from('poems').select('id,title,category,content,notes,is_published,created_at,updated_at').order('created_at', { ascending: false });
    if (error) { console.error(error); $('#poem-list').innerHTML = '<div class="empty-state">Chưa tải được thư viện. Hãy kiểm tra SQL và chính sách quyền truy cập Supabase.</div>'; $('#poem-count').textContent = 'LỖI TẢI THƯ VIỆN'; return; }
    poems = data || [];
    renderPoems();
    if (isAdmin) renderAdminPoems();
  }
  async function loadKnowledge() {
    if (!db) return;
    const { data, error } = await db.from('knowledge_notes').select('id,title,content,is_published,created_at').order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    knowledge = data || [];
    if (isAdmin) renderKnowledge();
  }
  function renderPoems() {
    const search = normalize($('#poem-search').value), category = $('#poem-category').value;
    const publicPoems = poems.filter(p => isAdmin || p.is_published);
    const filtered = publicPoems.filter(p => (!category || p.category === category) && (!search || normalize([p.title,p.category,p.content,p.notes].join(' ')).includes(search)));
    const categories = [...new Set(publicPoems.map(p => p.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'vi'));
    const select = $('#poem-category'), old = select.value;
    select.innerHTML = '<option value="">Tất cả chủ đề</option>' + categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    if (categories.includes(old)) select.value = old;
    if (!filtered.length) {
      $('#poem-list').innerHTML = `<div class="empty-state">${publicPoems.length ? 'Chưa tìm thấy bài thơ phù hợp. Thử từ khóa khác nhé.' : (isAdmin ? 'Thư viện còn trống. Hãy dùng bảng quản trị để viết bài đầu tiên.' : 'Những bài thơ sẽ xuất hiện ở đây khi tác giả xuất bản.')}</div>`;
    } else {
      $('#poem-list').innerHTML = filtered.map(p => `<article class="poem-card" tabindex="0" role="button" data-poem-id="${p.id}" aria-label="Đọc bài thơ ${escapeHTML(p.title)}"><p class="eyebrow">${escapeHTML(p.category || 'THƠ TỰ DO')}${!p.is_published ? ' · BẢN NHÁP RIÊNG' : ''}</p><h3>${escapeHTML(p.title)}</h3><p class="poem-excerpt">${escapeHTML(p.content)}</p><div class="poem-card-foot"><span>${formatDate(p.created_at)}</span><span>ĐỌC BÀI ↗</span></div></article>`).join('');
      $$('#poem-list [data-poem-id]').forEach(card => {
        const open = () => openPoem(card.dataset.poemId);
        card.addEventListener('click', open); card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }
    $('#poem-count').textContent = `${filtered.length.toString().padStart(2,'0')} BÀI THƠ${search || category ? ' · ĐÃ LỌC' : ''}`;
  }
  function openPoem(id) {
    const p = poems.find(x => x.id === id); if (!p) return;
    const dlg = document.createElement('dialog'); dlg.className = 'poem-dialog';
    dlg.innerHTML = `<button class="dialog-close" aria-label="Đóng">×</button><p class="eyebrow">${escapeHTML(p.category || 'THƠ TỰ DO')}</p><h2>${escapeHTML(p.title)}</h2><p class="poem-date">${formatDate(p.created_at)}${!p.is_published ? ' · BẢN NHÁP' : ''}</p><div class="poem-full-content">${escapeHTML(p.content)}</div>${p.notes && isAdmin ? `<hr><p class="muted">Ghi chú riêng: ${escapeHTML(p.notes)}</p>` : ''}`;
    document.body.appendChild(dlg); dlg.querySelector('.dialog-close').addEventListener('click', () => dlg.close()); dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }
  function setAuthMode(mode) {
    authMode = mode;
    $('#tab-login').classList.toggle('active', mode === 'login'); $('#tab-signup').classList.toggle('active', mode === 'signup');
    $('#auth-title').textContent = mode === 'login' ? 'Chào bạn.' : 'Mở một góc nhỏ.';
    $('#auth-description').textContent = mode === 'login' ? 'Đăng nhập để tiếp tục.' : 'Tạo tài khoản khách để đăng nhập vào trang thơ.';
    $('#auth-submit').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    $('#auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; setStatus('#auth-status','');
  }
  async function updateAccount() {
    if (!db) return;
    const { data: { session: activeSession } } = await db.auth.getSession();
    session = activeSession; currentUser = session?.user || null; isAdmin = false;
    if (currentUser) {
      const { data: roleRow, error } = await db.from('user_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
      if (!error && roleRow?.role === 'admin') isAdmin = true;
    }
    $('#auth-open').textContent = currentUser ? (isAdmin ? 'Quản trị' : 'Tài khoản') : 'Đăng nhập';
    $('#account-area').classList.toggle('hidden', !currentUser);
    $('#admin-panel').classList.toggle('hidden', !isAdmin);
    if (currentUser) {
      $('#account-title').textContent = isAdmin ? 'Góc quản trị.' : 'Góc tài khoản.';
      $('#account-message').textContent = `${currentUser.email || 'Tài khoản khách'} · ${isAdmin ? 'Quản trị viên' : 'Khách đã đăng nhập'}`;
    }
    renderPoems();
    if (isAdmin) { await loadPoems(); await loadKnowledge(); }
  }

  $('#auth-open').addEventListener('click', () => {
    if (!db) { showToast('Hãy kết nối Supabase trong config.js trước.'); return; }
    if (currentUser) { $('#account-area').scrollIntoView({ behavior: 'smooth' }); return; }
    setAuthMode('login'); $('#auth-dialog').showModal();
  });
  $('#auth-close').addEventListener('click', () => $('#auth-dialog').close());
  $('#tab-login').addEventListener('click', () => setAuthMode('login'));
  $('#tab-signup').addEventListener('click', () => setAuthMode('signup'));
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault(); if (!db) return;
    const email = $('#auth-email').value.trim(), password = $('#auth-password').value;
    const submit = $('#auth-submit'); submit.disabled = true; setStatus('#auth-status', 'Đang xử lý...');
    try {
      let result;
      if (authMode === 'login') result = await db.auth.signInWithPassword({ email, password });
      else result = await db.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) {
        setStatus('#auth-status', 'Tài khoản đã tạo. Hãy mở email để xác nhận, rồi quay lại đăng nhập.');
      } else {
        $('#auth-dialog').close(); $('#auth-form').reset(); await updateAccount(); await loadPoems(); showToast(authMode === 'login' ? 'Đăng nhập thành công.' : 'Tạo tài khoản thành công.');
      }
    } catch (err) { setStatus('#auth-status', err.message || 'Không thể đăng nhập.', true); }
    finally { submit.disabled = false; }
  });
  $('#sign-out').addEventListener('click', async () => { if (!db) return; const { error } = await db.auth.signOut(); if (error) showToast(error.message); else { await updateAccount(); await loadPoems(); showToast('Đã đăng xuất.'); } });
  $('#poem-search').addEventListener('input', renderPoems); $('#poem-category').addEventListener('change', renderPoems);

  function resetEditor() {
    $('#poem-editor').reset(); $('#edit-id').value = ''; $('#edit-published').value = 'false'; $('#editor-status').textContent = '';
  }
  $('#new-poem').addEventListener('click', () => { resetEditor(); $('#poem-editor').classList.remove('hidden'); $('#edit-title').focus(); });
  $('#cancel-edit').addEventListener('click', () => { resetEditor(); $('#poem-editor').classList.add('hidden'); });
  function renderAdminPoems() {
    $('#admin-poem-list').innerHTML = poems.length ? poems.map(p => `<div class="admin-row"><div><strong>${escapeHTML(p.title)}</strong><small>${escapeHTML(p.category || 'Chưa phân loại')} · ${p.is_published ? 'Đã xuất bản' : 'Bản nháp'}</small></div><div class="admin-row-actions"><button class="mini-button" data-edit-poem="${p.id}">Sửa</button><button class="mini-button" data-toggle-poem="${p.id}">${p.is_published ? 'Chuyển thành nháp' : 'Xuất bản'}</button><button class="mini-button danger" data-delete-poem="${p.id}">Xóa</button></div></div>`).join('') : '<p class="muted">Chưa có bài thơ nào.</p>';
    $$('[data-edit-poem]').forEach(b => b.addEventListener('click', () => {
      const p = poems.find(x => x.id === b.dataset.editPoem); if (!p) return;
      $('#edit-id').value = p.id; $('#edit-title').value = p.title; $('#edit-category').value = p.category || ''; $('#edit-content').value = p.content; $('#edit-notes').value = p.notes || ''; $('#edit-published').value = String(p.is_published); $('#poem-editor').classList.remove('hidden'); $('#poem-editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    $$('[data-toggle-poem]').forEach(b => b.addEventListener('click', async () => {
      const p = poems.find(x => x.id === b.dataset.togglePoem); if (!p) return;
      const { error } = await db.from('poems').update({ is_published: !p.is_published }).eq('id', p.id);
      if (error) showToast('Không thể đổi trạng thái: ' + error.message); else { showToast('Đã cập nhật trạng thái.'); await loadPoems(); }
    }));
    $$('[data-delete-poem]').forEach(b => b.addEventListener('click', async () => {
      const p = poems.find(x => x.id === b.dataset.deletePoem); if (!p || !confirm(`Xóa bài “${p.title}”? Thao tác này không thể hoàn tác.`)) return;
      const { error } = await db.from('poems').delete().eq('id', p.id);
      if (error) showToast('Không thể xóa: ' + error.message); else { showToast('Đã xóa bài thơ.'); await loadPoems(); }
    }));
  }
  $('#poem-editor').addEventListener('submit', async e => {
    e.preventDefault(); if (!db || !isAdmin) return;
    const id = $('#edit-id').value;
    const row = { title: $('#edit-title').value.trim(), category: $('#edit-category').value.trim() || 'Thơ tự do', content: $('#edit-content').value, notes: $('#edit-notes').value.trim(), is_published: $('#edit-published').value === 'true', updated_at: new Date().toISOString() };
    if (!row.title || !row.content.trim()) return setStatus('#editor-status', 'Hãy nhập tiêu đề và nội dung.', true);
    setStatus('#editor-status', 'Đang lưu...');
    const result = id ? await db.from('poems').update(row).eq('id', id) : await db.from('poems').insert(row);
    if (result.error) { setStatus('#editor-status', result.error.message, true); return; }
    resetEditor(); $('#poem-editor').classList.add('hidden'); showToast('Đã lưu bài thơ.'); await loadPoems();
  });

  function renderKnowledge() {
    $('#knowledge-list').innerHTML = knowledge.length ? knowledge.map(k => `<div class="knowledge-row"><span><strong>${escapeHTML(k.title)}</strong><br><small>${k.is_published ? 'Đang dùng cho trợ lý' : 'Đang tắt'}</small></span><span><button class="mini-button" data-k-toggle="${k.id}">${k.is_published ? 'Tắt' : 'Bật'}</button> <button class="mini-button danger" data-k-delete="${k.id}">Xóa</button></span></div>`).join('') : '<p class="muted">Kho kiến thức đang trống.</p>';
    $$('[data-k-toggle]').forEach(b => b.addEventListener('click', async () => { const k = knowledge.find(x => x.id === b.dataset.kToggle); if (!k) return; const { error } = await db.from('knowledge_notes').update({ is_published: !k.is_published }).eq('id', k.id); if (error) showToast(error.message); else await loadKnowledge(); }));
    $$('[data-k-delete]').forEach(b => b.addEventListener('click', async () => { const k = knowledge.find(x => x.id === b.dataset.kDelete); if (!k || !confirm(`Xóa ghi chú “${k.title}”?`)) return; const { error } = await db.from('knowledge_notes').delete().eq('id', k.id); if (error) showToast(error.message); else { showToast('Đã xóa ghi chú.'); await loadKnowledge(); } }));
  }
  $('#knowledge-form').addEventListener('submit', async e => {
    e.preventDefault(); if (!db || !isAdmin) return;
    const row = { title: $('#knowledge-title').value.trim(), content: $('#knowledge-content').value.trim(), is_published: $('#knowledge-published').checked };
    const { error } = await db.from('knowledge_notes').insert(row);
    if (error) setStatus('#knowledge-status', error.message, true); else { e.target.reset(); $('#knowledge-published').checked = true; setStatus('#knowledge-status', 'Đã thêm ghi chú.'); await loadKnowledge(); }
  });

  function addChatMessage(text, who = 'bot') {
    const el = document.createElement('div'); el.className = `chat-message ${who === 'user' ? 'user-message' : 'bot-message'}`;
    const content = document.createElement('div'); content.textContent = text; el.appendChild(content);
    const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = who === 'user' ? 'BẠN' : 'NGƯỜI GIỮ TRANG THƠ'; el.appendChild(meta);
    $('#chat-messages').appendChild(el); $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  }
  function answerFromKnowledge(question) {
    const q = normalize(question), words = wordSet(question);
    if (!words.length) return 'Bạn thử hỏi bằng một chủ đề hoặc vài từ cụ thể nhé, chẳng hạn “nỗi nhớ”, “bình yên” hay tên một bài thơ.';
    const candidates = [];
    poems.filter(p => p.is_published || isAdmin).forEach(p => {
      const hay = normalize([p.title,p.category,p.content,p.notes].join(' '));
      let score = 0; for (const w of words) if (hay.includes(w)) score += (normalize(p.title).includes(w) ? 4 : normalize(p.category).includes(w) ? 3 : 1);
      if (score) candidates.push({ type: 'poem', item: p, score });
    });
    knowledge.filter(k => k.is_published || isAdmin).forEach(k => {
      const hay = normalize(k.title + ' ' + k.content); let score = 0;
      for (const w of words) if (hay.includes(w)) score += (normalize(k.title).includes(w) ? 3 : 1);
      if (score) candidates.push({ type: 'knowledge', item: k, score });
    });
    candidates.sort((a,b) => b.score - a.score);
    if (!candidates.length) return 'Mình chưa tìm thấy câu chữ phù hợp trong kho thơ và ghi chú hiện có. Bạn có thể thử một từ khóa khác, hoặc tác giả có thể bổ sung thêm bài thơ và kiến thức trong bảng quản trị.';
    const top = candidates.slice(0,3);
    const lines = top.map((c,i) => c.type === 'poem' ? `${i+1}. “${c.item.title}”${c.item.category ? ` · ${c.item.category}` : ''}\n${c.item.content.split('\n').filter(Boolean).slice(0,3).join('\n')}${c.item.content.split('\n').filter(Boolean).length > 3 ? '\n…' : ''}` : `${i+1}. ${c.item.title}\n${c.item.content.slice(0,280)}${c.item.content.length > 280 ? '…' : ''}`);
    let intro = 'Mình tìm thấy vài điều có thể gần với câu hỏi của bạn trong kho chữ:';
    if (/y nghia|phan tich|noi dung|cam xuc|thong diep/.test(q)) intro = 'Dựa trên những ghi chép có sẵn, đây là những nội dung gần nhất mình tìm được. Mình chỉ tổng hợp từ kho chữ, không tự khẳng định ý nghĩa mà tác giả chưa ghi lại:';
    else if (/viet|sang tac|goi y|lam tho/.test(q)) intro = 'Mình chưa thể sáng tác linh hoạt như một mô hình ngôn ngữ, nhưng có thể gợi ý chất liệu từ kho thơ hiện có:';
    return intro + '\n\n' + lines.join('\n\n') + '\n\nBạn có thể thử thêm một từ khóa cụ thể để tìm sát hơn.';
  }
  $('#chat-form').addEventListener('submit', e => {
    e.preventDefault(); const input = $('#chat-input'), question = input.value.trim(); if (!question) return;
    addChatMessage(question, 'user'); input.value = '';
    window.setTimeout(() => addChatMessage(answerFromKnowledge(question)), 180);
  });
  $$('.suggestion').forEach(b => b.addEventListener('click', () => { $('#chat-input').value = b.textContent; $('#chat-form').requestSubmit(); }));
  $('#clear-chat').addEventListener('click', () => { $('#chat-messages').innerHTML = ''; addChatMessage('Cuộc trò chuyện đã được làm mới. Bạn muốn tìm điều gì trong kho thơ hôm nay?'); });
  $('#menu-toggle').addEventListener('click', () => $('.main-nav').classList.toggle('open'));
  $$('.main-nav a').forEach(a => a.addEventListener('click', () => $('.main-nav').classList.remove('open')));

  if (db) {
    db.auth.onAuthStateChange((_event, _session) => { setTimeout(async () => { await updateAccount(); await loadPoems(); }, 0); });
    (async () => { await updateAccount(); await loadPoems(); if (isAdmin) await loadKnowledge(); })();
  }
})();

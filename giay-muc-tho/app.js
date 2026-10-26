(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const config = window.SITE_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY && !config.SUPABASE_URL.includes('PASTE_') && !config.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
  let db = null, session = null, currentUser = null, isAdmin = false, isCollaborator = false, canEditContent = false, poems = [], knowledge = [], stories = [], storyChapters = [], selectedStoryId = null, vipActive = false, vipRequest = null, authMode = 'login', toastTimer = null;

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
    if (canEditContent) renderAdminPoems();
    const sharedPoemId = new URLSearchParams(window.location.search).get('poem');
    if (sharedPoemId && !window.__mienChuSharedPoemOpened) {
      const sharedPoem = poems.find(p => p.id === sharedPoemId);
      if (sharedPoem && (canEditContent || sharedPoem.is_published)) {
        window.__mienChuSharedPoemOpened = true;
        openPoem(sharedPoemId);
      }
    }
  }
  async function loadStories() {
    if (!db) return;
    const { data: storyData, error: storyError } = await db.from('stories')
      .select('id,title,category,synopsis,is_published,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (storyError) {
      console.error('Không tải được stories:', storyError);
      $('#story-list').innerHTML = '<div class="empty-state story-error">Chưa tải được thư viện truyện. Hãy chạy file <code>migration-stories.sql</code> trong Supabase SQL Editor rồi tải lại trang.</div>';
      $('#story-count').textContent = 'CHƯA KẾT NỐI KHO TRUYỆN';
      return;
    }
    stories = storyData || [];
    const { data: chapterData, error: chapterError } = await db.from('story_chapters')
      .select('id,story_id,chapter_number,title,content,is_published,created_at,updated_at')
      .order('chapter_number', { ascending: true });
    if (chapterError) {
      console.error('Không tải được story_chapters:', chapterError);
      $('#story-list').innerHTML = '<div class="empty-state story-error">Đã tải truyện nhưng chưa tải được chương. Kiểm tra migration-stories.sql trong Supabase.</div>';
      $('#story-count').textContent = 'LỖI TẢI CHƯƠNG';
      return;
    }
    storyChapters = chapterData || [];
    renderStories();
    if (canEditContent) renderAdminStories();
    const sharedChapterId = new URLSearchParams(window.location.search).get('chapter');
    const sharedStoryId = new URLSearchParams(window.location.search).get('story');
    if (sharedChapterId && !window.__mienChuSharedRouteOpened) {
      const sharedChapter = storyChapters.find(ch => ch.id === sharedChapterId);
      if (sharedChapter && (canEditContent || sharedChapter.is_published)) { window.__mienChuSharedRouteOpened = true; openChapter(sharedChapterId); }
    } else if (sharedStoryId && !window.__mienChuSharedRouteOpened) {
      const sharedStory = stories.find(st => st.id === sharedStoryId);
      if (sharedStory && (canEditContent || sharedStory.is_published)) { window.__mienChuSharedRouteOpened = true; openStory(sharedStoryId); }
    }
  }

  async function loadKnowledge() {
    if (!db) return;
    const { data, error } = await db.from('knowledge_notes').select('id,title,content,is_published,created_at').order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    knowledge = data || [];
    if (canEditContent) renderKnowledge();
  }
  function renderPoems() {
    const search = normalize($('#poem-search').value), category = $('#poem-category').value;
    const publicPoems = poems.filter(p => canEditContent || p.is_published);
    const filtered = publicPoems.filter(p => (!category || p.category === category) && (!search || normalize([p.title,p.category,p.content,p.notes].join(' ')).includes(search)));
    const categories = [...new Set(publicPoems.map(p => p.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'vi'));
    const select = $('#poem-category'), old = select.value;
    select.innerHTML = '<option value="">Tất cả chủ đề</option>' + categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    if (categories.includes(old)) select.value = old;
    if (!filtered.length) {
      $('#poem-list').innerHTML = `<div class="empty-state">${publicPoems.length ? 'Chưa tìm thấy bài thơ phù hợp. Thử từ khóa khác nhé.' : (canEditContent ? 'Thư viện còn trống. Hãy dùng bảng quản trị để viết bài đầu tiên.' : 'Những bài thơ sẽ xuất hiện ở đây khi tác giả xuất bản.')}</div>`;
    } else {
      $('#poem-list').innerHTML = filtered.map(p => `<article class="poem-card" tabindex="0" role="button" data-poem-id="${p.id}" aria-label="Đọc bài thơ ${escapeHTML(p.title)}"><p class="eyebrow">${escapeHTML(p.category || 'THƠ TỰ DO')}${!p.is_published ? ' · BẢN NHÁP RIÊNG' : ''}</p><h3>${escapeHTML(p.title)}</h3><p class="poem-excerpt">${escapeHTML(p.content)}</p><div class="poem-card-foot"><span>${formatDate(p.created_at)}</span><span>ĐỌC BÀI ↗</span></div></article>`).join('');
      $$('#poem-list [data-poem-id]').forEach(card => {
        const open = () => openPoem(card.dataset.poemId);
        card.addEventListener('click', open); card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }
    $('#poem-count').textContent = `${filtered.length.toString().padStart(2,'0')} BÀI THƠ${search || category ? ' · ĐÃ LỌC' : ''}`;
  }
  function renderStories() {
    const search = normalize($('#story-search').value), category = $('#story-category').value;
    const visibleStories = stories.filter(s => canEditContent || s.is_published);
    const filtered = visibleStories.filter(s =>
      (!category || s.category === category) &&
      (!search || normalize([s.title, s.category, s.synopsis].join(' ')).includes(search))
    );
    const categories = [...new Set(visibleStories.map(s => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    const select = $('#story-category'), old = select.value;
    select.innerHTML = '<option value="">Tất cả thể loại</option>' + categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    if (categories.includes(old)) select.value = old;
    if (!filtered.length) {
      $('#story-list').innerHTML = `<div class="empty-state">${visibleStories.length ? 'Chưa tìm thấy truyện phù hợp. Thử từ khóa khác nhé.' : (canEditContent ? 'Kho truyện còn trống. Hãy thêm truyện trong khu vực quản trị.' : 'Truyện sẽ xuất hiện ở đây khi được xuất bản.')}</div>`;
    } else {
      $('#story-list').innerHTML = filtered.map(s => {
        const chapterCount = storyChapters.filter(ch => ch.story_id === s.id && (canEditContent || ch.is_published)).length;
        return `<article class="poem-card story-card" tabindex="0" role="button" data-story-id="${s.id}" aria-label="Mở truyện ${escapeHTML(s.title)}"><p class="eyebrow">${escapeHTML(s.category || 'TRUYỆN')}${!s.is_published ? ' · BẢN NHÁP RIÊNG' : ''}</p><h3>${escapeHTML(s.title)}</h3><p class="story-synopsis">${escapeHTML(s.synopsis || 'Chưa có phần giới thiệu cho truyện này.')}</p><div class="poem-card-foot"><span class="story-chapter-count">${chapterCount} chương${!s.is_published ? ' · BẢN NHÁP' : ''}</span><span>ĐỌC TRUYỆN ↗</span></div></article>`;
      }).join('');
      $$('#story-list [data-story-id]').forEach(card => {
        const open = () => openStory(card.dataset.storyId);
        card.addEventListener('click', open);
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }
    $('#story-count').textContent = `${filtered.length.toString().padStart(2, '0')} TRUYỆN${search || category ? ' · ĐÃ LỌC' : ''}`;
  }

  async function shareLiteraryItem({ title, description = '', storyId = '', chapterId = '', poemId = '' }) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    if (storyId) url.searchParams.set('story', storyId);
    if (chapterId) url.searchParams.set('chapter', chapterId);
    if (poemId) url.searchParams.set('poem', poemId);
    const shareData = { title: `${title} · Gió`, text: description || `Đọc “${title}” trên Gió.`, url: url.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url.href);
        showToast('Đã sao chép liên kết chia sẻ!');
      } else {
        window.prompt('Sao chép liên kết này để chia sẻ:', url.href);
      }
    } catch (error) {
      if (error && error.name !== 'AbortError') showToast('Chưa chia sẻ được. Bạn có thể sao chép đường dẫn trên thanh địa chỉ.');
    }
  }

  async function openStory(id) {
    const story = stories.find(s => s.id === id);
    if (!story || (!story.is_published && !canEditContent)) return;
    if (!canEditContent && !vipActive) { showToast('Truyện dành cho thành viên VIP đã được duyệt. Hãy đăng nhập và đăng ký VIP nhé.'); $('#vip-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    await logSiteEvent('story_open', `/stories/${story.id}`);
    saveReadingHistory({ type: 'story', storyId: story.id, title: story.title, subtitle: story.category || 'Truyện', at: new Date().toISOString() });
    const chapters = storyChapters.filter(ch => ch.story_id === id && (canEditContent || (story.is_published && ch.is_published)))
      .sort((a, b) => a.chapter_number - b.chapter_number);
    const chapterHtml = chapters.length
      ? chapters.map(ch => `<button class="chapter-link" type="button" data-open-chapter="${ch.id}"><span>CHƯƠNG ${ch.chapter_number}${!ch.is_published ? ' · NHÁP' : ''}</span><strong>${escapeHTML(ch.title)}</strong></button>`).join('')
      : '<p class="muted">Chưa có chương nào được xuất bản.</p>';
    const dlg = document.createElement('dialog');
    dlg.className = 'poem-dialog story-dialog';
    dlg.innerHTML = `<button class="dialog-close" aria-label="Đóng">×</button><p class="eyebrow">${escapeHTML(story.category || 'TRUYỆN')}${!story.is_published ? ' · BẢN NHÁP RIÊNG' : ''}</p><h2>${escapeHTML(story.title)}</h2><p class="poem-date">${formatDate(story.created_at)}</p><div class="story-dialog-synopsis">${escapeHTML(story.synopsis || 'Truyện chưa có phần giới thiệu.')}</div><div class="story-dialog-chapters"><h3>Các chương</h3>${chapterHtml}</div><div class="reader-controls"><button class="button button-outline reading-save" type="button" data-bookmark-story="${story.id}">☆ Lưu truyện</button><button class="button button-outline" type="button" data-share-story="${story.id}">↗ Chia sẻ truyện</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('.dialog-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-bookmark-story]')?.addEventListener('click', () => toggleBookmark({ type: 'story', storyId: story.id, title: story.title, subtitle: story.category || 'Truyện' }));
    dlg.querySelector('[data-share-story]')?.addEventListener('click', () => shareLiteraryItem({ title: story.title, description: story.synopsis || '', storyId: story.id }));
    renderDiscussion(dlg, story, null);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelectorAll('[data-open-chapter]').forEach(button => button.addEventListener('click', () => {
      const chapterId = button.dataset.openChapter;
      dlg.close();
      window.setTimeout(() => openChapter(chapterId), 0);
    }));
    dlg.showModal();
  }

  async function openChapter(id) {
    const chapter = storyChapters.find(ch => ch.id === id);
    if (!chapter) return;
    const story = stories.find(s => s.id === chapter.story_id);
    if (!story || ((!story.is_published || !chapter.is_published) && !canEditContent)) return;
    if (!canEditContent && !vipActive) { showToast('Chỉ thành viên VIP đã được duyệt mới đọc chương truyện.'); $('#vip-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    await logSiteEvent('chapter_open', `/stories/${story.id}/chapters/${chapter.id}`);
    saveReadingHistory({ type: 'chapter', storyId: story.id, chapterId: chapter.id, title: story.title, subtitle: `Chương ${chapter.chapter_number}: ${chapter.title}`, at: new Date().toISOString() });
    const dlg = document.createElement('dialog');
    dlg.className = 'poem-dialog chapter-dialog';
    dlg.innerHTML = `<button class="dialog-close" aria-label="Đóng">×</button><p class="chapter-dialog-story">${escapeHTML(story.title)}</p><p class="chapter-dialog-label">CHƯƠNG ${chapter.chapter_number}${!chapter.is_published ? ' · BẢN NHÁP RIÊNG' : ''}</p><h2 class="chapter-dialog-title">${escapeHTML(chapter.title)}</h2><p class="poem-date">${formatDate(chapter.created_at)}</p><div class="poem-full-content reader-content">${escapeHTML(chapter.content)}</div><div class="reader-controls"><button class="button button-outline" type="button" data-reader-size="minus">A−</button><button class="button button-outline" type="button" data-reader-size="plus">A+</button><button class="button button-outline" type="button" data-bookmark-chapter="${chapter.id}">☆ Đánh dấu chương</button><button class="button button-outline" type="button" data-share-chapter="${chapter.id}">↗ Chia sẻ chương</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('.dialog-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-bookmark-chapter]')?.addEventListener('click', () => toggleBookmark({ type: 'chapter', storyId: story.id, chapterId: chapter.id, title: story.title, subtitle: `Chương ${chapter.chapter_number}: ${chapter.title}` }));
    dlg.querySelector('[data-share-chapter]')?.addEventListener('click', () => shareLiteraryItem({ title: `${story.title} · Chương ${chapter.chapter_number}: ${chapter.title}`, description: story.synopsis || '', storyId: story.id, chapterId: chapter.id }));
    dlg.querySelector('[data-reader-size="minus"]')?.addEventListener('click', () => changeReaderSize(-1));
    dlg.querySelector('[data-reader-size="plus"]')?.addEventListener('click', () => changeReaderSize(1));
    renderDiscussion(dlg, story, chapter);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  function renderDiscussion(dialog, story, chapter) {
    const section = document.createElement('section');
    section.className = 'reader-interactions';
    section.innerHTML = `
      <hr><p class="eyebrow">GÓC ĐỘC GIẢ</p><h3>Bình luận</h3>
      <div class="comment-list"><p class="muted">Đang tải bình luận...</p></div>
      <form class="comment-form editor-form">
        <label>Chia sẻ suy nghĩ<textarea name="body" rows="3" maxlength="2000" required placeholder="Viết bình luận lịch sự, tối đa 2.000 ký tự..."></textarea></label>
        <button class="button button-dark" type="submit">Đăng bình luận</button><p class="form-status" aria-live="polite"></p>
      </form>
      <details class="report-box"><summary>Báo lỗi nội dung</summary>
        <form class="report-form editor-form">
          <label>Loại lỗi<select name="reason"><option value="typo">Lỗi chính tả</option><option value="missing">Thiếu nội dung/chương</option><option value="inappropriate">Nội dung không phù hợp</option><option value="other">Lỗi khác</option></select></label>
          <label>Mô tả thêm (không bắt buộc)<textarea name="details" rows="2" maxlength="2000" placeholder="Mô tả lỗi để admin kiểm tra..."></textarea></label>
          <button class="button button-outline" type="submit">Gửi báo lỗi</button><p class="form-status" aria-live="polite"></p>
        </form>
      </details>`;
    dialog.append(section);
    const list = section.querySelector('.comment-list');
    const commentForm = section.querySelector('.comment-form');
    const reportForm = section.querySelector('.report-form');
    if (!currentUser) {
      commentForm.innerHTML = '<p class="muted">Bạn cần đăng nhập để bình luận.</p><button class="button button-outline" type="button" data-discussion-login>Đăng nhập</button>';
      reportForm.innerHTML = '<p class="muted">Bạn cần đăng nhập để gửi báo lỗi.</p><button class="button button-outline" type="button" data-discussion-login>Đăng nhập</button>';
      section.querySelectorAll('[data-discussion-login]').forEach(b => b.addEventListener('click', () => { dialog.close(); $('#auth-open')?.click(); }));
    }
    async function loadComments() {
      if (!db || !currentUser) { list.innerHTML = '<p class="muted">Đăng nhập để xem và tham gia bình luận.</p>'; return; }
      let query = db.from('reader_comments').select('id,user_id,body,is_hidden,created_at').eq('story_id', story.id).order('created_at', { ascending: true }).limit(100);
      query = chapter ? query.eq('chapter_id', chapter.id) : query.is('chapter_id', null);
      const { data, error } = await query;
      if (error) { list.innerHTML = `<p class="muted">Chưa tải được bình luận. Hãy kiểm tra migration-interactions.sql. ${escapeHTML(error.message)}</p>`; return; }
      const visible = (data || []).filter(c => !c.is_hidden || isAdmin);
      list.innerHTML = visible.length ? visible.map(c => `<article class="reader-comment ${c.is_hidden ? 'comment-hidden' : ''}"><div class="comment-meta"><strong>${c.user_id === currentUser.id ? 'Bạn' : 'Độc giả'}</strong><time>${new Date(c.created_at).toLocaleString('vi-VN')}</time>${c.is_hidden ? '<span class="status-pill">Đã ẩn</span>' : ''}</div><p>${escapeHTML(c.body)}</p>${(c.user_id === currentUser.id || isAdmin) ? `<button class="mini-button danger" type="button" data-delete-comment="${c.id}">Xóa</button>` : ''}${isAdmin ? `<button class="mini-button" type="button" data-hide-comment="${c.id}" data-hidden="${c.is_hidden}">${c.is_hidden ? 'Hiện lại' : 'Ẩn'}</button>` : ''}</article>`).join('') : '<p class="muted">Chưa có bình luận. Bạn có thể là người đầu tiên.</p>';
      list.querySelectorAll('[data-delete-comment]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Xóa bình luận này?')) return;
        const { error } = await db.from('reader_comments').delete().eq('id', b.dataset.deleteComment);
        if (error) showToast('Không xóa được: ' + error.message); else { showToast('Đã xóa bình luận.'); await loadComments(); }
      }));
      list.querySelectorAll('[data-hide-comment]').forEach(b => b.addEventListener('click', async () => {
        const { error } = await db.from('reader_comments').update({ is_hidden: b.dataset.hidden !== 'true' }).eq('id', b.dataset.hideComment);
        if (error) showToast('Không cập nhật được: ' + error.message); else await loadComments();
      }));
    }
    commentForm.addEventListener('submit', async e => {
      e.preventDefault(); if (!currentUser) return;
      const body = new FormData(commentForm).get('body').toString().trim();
      const status = commentForm.querySelector('.form-status');
      if (!body || body.length > 2000) { status.textContent = 'Bình luận phải có 1–2.000 ký tự.'; return; }
      status.textContent = 'Đang đăng...';
      const { error } = await db.from('reader_comments').insert({ user_id: currentUser.id, story_id: story.id, chapter_id: chapter?.id || null, body });
      if (error) { status.textContent = 'Không đăng được. ' + error.message; return; }
      commentForm.reset(); status.textContent = 'Đã đăng bình luận.'; await loadComments();
    });
    reportForm.addEventListener('submit', async e => {
      e.preventDefault(); if (!currentUser) return;
      const form = new FormData(reportForm); const status = reportForm.querySelector('.form-status');
      const details = String(form.get('details') || '').trim();
      status.textContent = 'Đang gửi...';
      const { error } = await db.from('content_reports').insert({ user_id: currentUser.id, story_id: story.id, chapter_id: chapter?.id || null, reason: form.get('reason'), details });
      if (error) { status.textContent = 'Không gửi được. ' + error.message; return; }
      reportForm.reset(); status.textContent = 'Đã gửi báo lỗi cho admin.';
    });
    loadComments();
  }

  async function loadModerationQueue() {
    if (!db || !isAdmin) return;
    const host = $('#moderation-list'); if (!host) return;
    host.innerHTML = '<p class="muted">Đang tải báo lỗi và bình luận...</p>';
    const [{ data: reports, error: reportError }, { data: comments, error: commentError }] = await Promise.all([
      db.from('content_reports').select('id,user_id,story_id,chapter_id,reason,details,status,admin_note,created_at').order('created_at', { ascending: false }).limit(200),
      db.from('reader_comments').select('id,user_id,story_id,chapter_id,body,is_hidden,created_at').order('created_at', { ascending: false }).limit(200)
    ]);
    if (reportError && commentError) { host.innerHTML = `<p class="muted">Không tải được dữ liệu kiểm duyệt. Hãy chạy migration-interactions.sql. ${escapeHTML(reportError.message)}</p>`; return; }
    const storyName = id => stories.find(s => String(s.id) === String(id))?.title || 'Truyện không xác định';
    const chapterName = id => storyChapters.find(c => String(c.id) === String(id));
    const reportHTML = (reports || []).map(r => {
      const ch = r.chapter_id ? chapterName(r.chapter_id) : null;
      const reason = ({typo:'Lỗi chính tả',missing:'Thiếu nội dung/chương',inappropriate:'Nội dung không phù hợp',other:'Lỗi khác'})[r.reason] || r.reason;
      return `<article class="moderation-item"><div><strong>${escapeHTML(storyName(r.story_id))}${ch ? ' · Chương ' + ch.chapter_number + ': ' + escapeHTML(ch.title) : ''}</strong><small>${escapeHTML(reason)} · ${new Date(r.created_at).toLocaleString('vi-VN')} · ${escapeHTML(r.status)}</small><p>${escapeHTML(r.details || 'Không có mô tả thêm')}</p>${r.admin_note ? `<small>Ghi chú admin: ${escapeHTML(r.admin_note)}</small>` : ''}</div><div class="admin-row-actions">${r.status === 'open' ? `<button class="mini-button" data-report-status="resolved" data-report-id="${r.id}">Đã xử lý</button><button class="mini-button" data-report-status="dismissed" data-report-id="${r.id}">Bỏ qua</button>` : ''}</div></article>`;
    }).join('');
    const commentHTML = (comments || []).map(c => {
      const ch = c.chapter_id ? chapterName(c.chapter_id) : null;
      return `<article class="moderation-item"><div><strong>${escapeHTML(storyName(c.story_id))}${ch ? ' · Chương ' + ch.chapter_number + ': ' + escapeHTML(ch.title) : ''}</strong><small>${new Date(c.created_at).toLocaleString('vi-VN')} · ${c.is_hidden ? 'ĐÃ ẨN' : 'ĐANG HIỂN THỊ'}</small><p>${escapeHTML(c.body)}</p></div><div class="admin-row-actions"><button class="mini-button" data-moderate-hide="${c.id}" data-hidden="${c.is_hidden}">${c.is_hidden ? 'Hiện lại' : 'Ẩn'}</button><button class="mini-button danger" data-moderate-delete="${c.id}">Xóa</button></div></article>`;
    }).join('');
    host.innerHTML = `<h4>Báo lỗi nội dung (${(reports || []).filter(r => r.status === 'open').length} đang mở)</h4>${reportHTML || '<p class="muted">Chưa có báo lỗi.</p>'}<h4>Bình luận gần đây</h4>${commentHTML || '<p class="muted">Chưa có bình luận.</p>'}`;
    host.querySelectorAll('[data-report-status]').forEach(b => b.addEventListener('click', async () => {
      const { error } = await db.from('content_reports').update({ status: b.dataset.reportStatus, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() }).eq('id', b.dataset.reportId);
      if (error) showToast('Không cập nhật được báo lỗi: ' + error.message); else { showToast('Đã cập nhật báo lỗi.'); loadModerationQueue(); }
    }));
    host.querySelectorAll('[data-moderate-hide]').forEach(b => b.addEventListener('click', async () => {
      const { error } = await db.from('reader_comments').update({ is_hidden: b.dataset.hidden !== 'true' }).eq('id', b.dataset.moderateHide);
      if (error) showToast('Không cập nhật được bình luận: ' + error.message); else loadModerationQueue();
    }));
    host.querySelectorAll('[data-moderate-delete]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Xóa bình luận này vĩnh viễn?')) return;
      const { error } = await db.from('reader_comments').delete().eq('id', b.dataset.moderateDelete);
      if (error) showToast('Không xóa được bình luận: ' + error.message); else loadModerationQueue();
    }));
  }

  function openPoem(id) {
    const p = poems.find(x => x.id === id); if (!p) return;
    const dlg = document.createElement('dialog'); dlg.className = 'poem-dialog';
    dlg.innerHTML = `<button class="dialog-close" aria-label="Đóng">×</button><p class="eyebrow">${escapeHTML(p.category || 'THƠ TỰ DO')}</p><h2>${escapeHTML(p.title)}</h2><p class="poem-date">${formatDate(p.created_at)}${!p.is_published ? ' · BẢN NHÁP' : ''}</p><div class="poem-full-content">${escapeHTML(p.content)}</div><div class="reader-controls"><button class="button button-outline" type="button" data-share-poem="${p.id}">↗ Chia sẻ bài thơ</button></div>${p.notes && isAdmin ? `<hr><p class="muted">Ghi chú riêng: ${escapeHTML(p.notes)}</p>` : ''}`;
    document.body.appendChild(dlg);
    dlg.querySelector('.dialog-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-share-poem]')?.addEventListener('click', () => shareLiteraryItem({ title: p.title, description: p.content, poemId: p.id }));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }
  function setAuthMode(mode) {
    authMode = mode;
    $('#tab-login').classList.toggle('active', mode === 'login'); $('#tab-signup').classList.toggle('active', mode === 'signup');
    $('#auth-title').textContent = mode === 'login' ? 'Chào bạn.' : 'Mở một góc nhỏ.';
    $('#auth-description').textContent = mode === 'login' ? 'Đăng nhập để tiếp tục.' : 'Tạo tài khoản khách để đăng nhập vào Gió.';
    $('#auth-submit').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    $('#auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; setStatus('#auth-status','');
  }
  async function updateAccount() {
    if (!db) return;
    const { data: { session: activeSession } } = await db.auth.getSession();
    session = activeSession; currentUser = session?.user || null; isAdmin = false; isCollaborator = false; canEditContent = false;
    if (currentUser) {
      const { data: roleRow, error } = await db.from('user_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
      if (!error) {
        isAdmin = roleRow?.role === 'admin';
        isCollaborator = roleRow?.role === 'collaborator';
        canEditContent = isAdmin || isCollaborator;
      }
    }
    syncRoleUI();
    vipActive = false; vipRequest = null;
    if (currentUser && db) {
      const { data: member } = await db.from('vip_members').select('active').eq('user_id', currentUser.id).maybeSingle();
      vipActive = !!member?.active || isAdmin;
      const { data: request } = await db.from('vip_requests').select('id,status,discovery_source,vip_reason,literature_background,created_at').eq('user_id', currentUser.id).maybeSingle();
      vipRequest = request || null;
    }
    $('#auth-open').textContent = currentUser ? (isAdmin ? 'Quản trị' : (isCollaborator ? 'Cộng tác viên' : 'Tài khoản')) : 'Đăng nhập';
    $('#account-area').classList.toggle('hidden', !currentUser);
    $('#admin-panel').classList.toggle('hidden', !canEditContent);
    if (currentUser) {
      $('#account-title').textContent = isAdmin ? 'Góc quản trị.' : (isCollaborator ? 'Góc cộng tác viên.' : 'Góc tài khoản.');
      $('#account-message').textContent = `${currentUser.email || 'Tài khoản khách'} · ${isAdmin ? 'Quản trị viên' : (isCollaborator ? 'Cộng tác viên biên tập thơ, truyện và kho kiến thức' : (vipActive ? 'Thành viên VIP' : 'Tài khoản khách'))}`;
      $('#vip-status').textContent = canEditContent ? 'Tài khoản biên tập có thể xem bản thảo để làm việc.' : vipActive ? 'VIP đã được duyệt. Bạn có thể đọc các chương đã xuất bản.' : vipRequest?.status === 'pending' ? 'Đơn của bạn đang chờ admin xét duyệt trong mục “Duyệt VIP”.' : vipRequest?.status === 'approved' ? 'Đơn đã được duyệt. Nếu quyền đọc chưa hoạt động, hãy báo admin kiểm tra quyền thành viên.' : vipRequest?.status === 'rejected' ? 'Đơn trước chưa được duyệt. Bạn có thể gửi lại sau khi chỉnh sửa câu trả lời.' : 'VIP hoàn toàn miễn phí. Hãy trả lời các câu hỏi bên dưới để gửi đơn xét duyệt.';
      $('#vip-request-form').classList.toggle('hidden', canEditContent || vipActive || ['pending', 'approved'].includes(vipRequest?.status));
      if (vipRequest) {
        $('#vip-discovery-source').value = vipRequest.discovery_source || '';
        $('#vip-reason').value = vipRequest.vip_reason || '';
        $('#vip-literature-background').value = vipRequest.literature_background || '';
      }
    } else {
      $('#vip-status').textContent = 'Đăng nhập hoặc tạo tài khoản trước khi đăng ký VIP miễn phí.';
      $('#vip-request-form').classList.add('hidden');
    }
    renderPoems();
    if (canEditContent) { await loadPoems(); await loadKnowledge(); }
    await loadStories();
  }


async function logSiteEvent(eventType = 'page_view', pagePath = null) {
  try {
    if (eventType !== 'page_view') {
      if (db) {
        await db.rpc('log_site_event', {
          p_page_path: pagePath || (location.pathname + location.hash),
          p_event_type: eventType
        });
      }
      return;
    }

    await fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_path: pagePath || (location.pathname + location.hash)
      })
    });
  } catch (_) {
    // Logging should not interrupt reading
  }
}


  async function loadVipRequests() {
    if (!db || !isAdmin) return;
    const host = $('#vip-request-list'); host.innerHTML = '<p class="muted">Đang tải...</p>';
    const { data, error } = await db.from('vip_requests').select('id,user_id,email,discovery_source,vip_reason,literature_background,status,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) { host.innerHTML = `<p class="muted">Không tải được đơn VIP: ${escapeHTML(error.message)}</p>`; return; }
    host.innerHTML = data?.length ? data.map(r => `<div class="admin-row vip-review-row"><div><strong>${escapeHTML(r.email || 'Tài khoản không có email')}</strong><small>Trạng thái: ${escapeHTML(r.status)} · Gửi lúc ${new Date(r.created_at).toLocaleString('vi-VN')}</small><div class="vip-answer"><b>Biết đến Gió từ đâu?</b><p>${escapeHTML(r.discovery_source || 'Đơn cũ chưa có câu trả lời')}</p></div><div class="vip-answer"><b>Lý do đăng ký VIP</b><p>${escapeHTML(r.vip_reason || 'Đơn cũ chưa có câu trả lời')}</p></div><div class="vip-answer"><b>Mức độ yêu thích văn thơ / kinh nghiệm học Văn</b><p>${escapeHTML(r.literature_background || 'Đơn cũ chưa có câu trả lời')}</p></div></div><div class="admin-row-actions">${r.status === 'pending' ? `<button class="mini-button" data-vip-approve="${r.id}">Duyệt VIP</button><button class="mini-button danger" data-vip-reject="${r.id}">Từ chối</button>` : r.status === 'approved' ? `<button class="mini-button danger" data-vip-kick="${r.id}" title="Thu hồi quyền VIP, không khóa tài khoản">Thu hồi VIP</button>` : ''}</div></div>`).join('') : '<p class="muted">Chưa có đơn đăng ký VIP.</p>';
    $$('[data-vip-approve]').forEach(b => b.addEventListener('click', () => reviewVip(b.dataset.vipApprove, true)));
    $$('[data-vip-reject]').forEach(b => b.addEventListener('click', () => reviewVip(b.dataset.vipReject, false)));
    $$('[data-vip-kick]').forEach(b => b.addEventListener('click', () => { if (confirm('Thu hồi quyền VIP của tài khoản này? Tài khoản vẫn đăng nhập được.')) reviewVip(b.dataset.vipKick, false); }));
  }
  async function reviewVip(id, approve) {
    if (!isAdmin) return;
    const { error } = await db.rpc('admin_review_vip_request', { request_id: id, approve });
    if (error) { showToast('Không thể cập nhật VIP: ' + error.message); return; }
    showToast(approve ? 'Đã duyệt thành viên VIP.' : 'Đã từ chối đơn VIP.'); await loadVipRequests();
  }
  async function loadAccessLogs() {
    if (!db || !isAdmin) return;
    const host = $('#access-log-list'); host.innerHTML = '<p class="muted">Đang tải...</p>';
    const { data, error } = await db.from('access_logs').select('id,email,page_path,event_type,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) { host.innerHTML = `<p class="muted">Không tải được nhật ký: ${escapeHTML(error.message)}</p>`; return; }
    host.innerHTML = data?.length ? data.map(r => `<div class="admin-row"><div><strong>${escapeHTML(r.email || 'Khách chưa đăng nhập')} · ${escapeHTML(r.event_type)}</strong><small>${escapeHTML(r.page_path)} · ${new Date(r.created_at).toLocaleString('vi-VN')}</small></div></div>`).join('') : '<p class="muted">Chưa có nhật ký. Các lượt truy cập mới sẽ được ghi nhận sau khi chạy SQL.</p>';
  }
  $('#vip-request-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!db || !currentUser) { showToast('Hãy đăng nhập trước.'); return; }
    if (canEditContent || vipActive || vipRequest?.status === 'pending') return;

    const discoverySource = $('#vip-discovery-source').value.trim();
    const reason = $('#vip-reason').value.trim();
    const literatureBackground = $('#vip-literature-background').value.trim();
    if (!discoverySource || !reason || !literatureBackground) {
      setStatus('#vip-request-status', 'Hãy trả lời đủ cả ba câu hỏi.', true);
      return;
    }

    const submitButton = $('#vip-request-form button[type="submit"]');
    submitButton.disabled = true;
    setStatus('#vip-request-status', 'Đang gửi đơn xét duyệt VIP miễn phí...');
    const row = {
      user_id: currentUser.id,
      email: currentUser.email || $('#auth-email').value.trim(),
      // Giữ các cột cũ để tương thích bảng hiện tại, không yêu cầu liên hệ riêng.
      contact_method: 'email',
      contact_detail: '',
      message: '',
      discovery_source: discoverySource,
      vip_reason: reason,
      literature_background: literatureBackground,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null
    };
    const { error } = await db.from('vip_requests').upsert(row, { onConflict: 'user_id' });
    submitButton.disabled = false;
    if (error) {
      setStatus('#vip-request-status', 'Không gửi được: ' + error.message, true);
      return;
    }
    await logSiteEvent('vip_request');
    setStatus('#vip-request-status', 'Đã gửi đơn. Admin sẽ xét duyệt trong mục “Duyệt VIP”. VIP hoàn toàn miễn phí.');
    await updateAccount();
  });
  $('#refresh-vip').addEventListener('click', loadVipRequests);
  $('#refresh-access-logs').addEventListener('click', loadAccessLogs);

  $('#vip-login-cta').addEventListener('click', () => { if (currentUser) { $('#account-area').scrollIntoView({ behavior: 'smooth' }); } else { setAuthMode('login'); $('#auth-dialog').showModal(); } });

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
        $('#auth-dialog').close(); $('#auth-form').reset(); await logSiteEvent(authMode === 'login' ? 'login' : 'signup'); await updateAccount(); await loadPoems(); await loadStories(); showToast(authMode === 'login' ? 'Đăng nhập thành công.' : 'Tạo tài khoản thành công.');
      }
    } catch (err) { setStatus('#auth-status', err.message || 'Không thể đăng nhập.', true); }
    finally { submit.disabled = false; }
  });
  $('#sign-out').addEventListener('click', async () => { if (!db) return; const { error } = await db.auth.signOut(); if (error) showToast(error.message); else { await updateAccount(); await loadPoems(); await loadStories(); showToast('Đã đăng xuất.'); } });
  $('#poem-search').addEventListener('input', renderPoems); $('#poem-category').addEventListener('change', renderPoems);
  $('#story-search').addEventListener('input', renderStories); $('#story-category').addEventListener('change', renderStories);

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
    e.preventDefault(); if (!db || !canEditContent) return;
    const id = $('#edit-id').value;
    const row = { title: $('#edit-title').value.trim(), category: $('#edit-category').value.trim() || 'Thơ tự do', content: $('#edit-content').value, notes: $('#edit-notes').value.trim(), is_published: $('#edit-published').value === 'true', updated_at: new Date().toISOString() };
    if (!row.title || !row.content.trim()) return setStatus('#editor-status', 'Hãy nhập tiêu đề và nội dung.', true);
    setStatus('#editor-status', 'Đang lưu...');
    const result = id ? await db.from('poems').update(row).eq('id', id) : await db.from('poems').insert(row);
    if (result.error) { setStatus('#editor-status', result.error.message, true); return; }
    resetEditor(); $('#poem-editor').classList.add('hidden'); showToast('Đã lưu bài thơ.'); await loadPoems();
  });

  function resetStoryEditor() {
    $('#story-editor').reset(); $('#story-edit-id').value = ''; $('#story-edit-published').value = 'false'; $('#story-editor-status').textContent = '';
  }
  $('#new-story').addEventListener('click', () => { resetStoryEditor(); $('#story-editor').classList.remove('hidden'); $('#story-edit-title').focus(); $('#story-editor').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#cancel-story-edit').addEventListener('click', () => { resetStoryEditor(); $('#story-editor').classList.add('hidden'); });

  function renderAdminStories() {
    const host = $('#admin-story-list');
    host.innerHTML = stories.length ? stories.map(s => `<div class="admin-row"><div><strong>${escapeHTML(s.title)}</strong><small>${escapeHTML(s.category || 'Chưa phân loại')} · ${s.is_published ? 'Đã xuất bản' : 'Bản nháp'} · ${storyChapters.filter(ch => ch.story_id === s.id).length} chương</small></div><div class="admin-row-actions"><button class="mini-button" data-edit-story="${s.id}">Sửa</button><button class="mini-button" data-manage-story-chapters="${s.id}">Chương</button><button class="mini-button" data-toggle-story="${s.id}">${s.is_published ? 'Chuyển nháp' : 'Xuất bản'}</button><button class="mini-button danger" data-delete-story="${s.id}">Xóa</button></div></div>`).join('') : '<p class="muted">Chưa có truyện nào. Nhấn “Thêm truyện” để bắt đầu.</p>';
    $$('[data-edit-story]').forEach(b => b.addEventListener('click', () => {
      const s = stories.find(x => x.id === b.dataset.editStory); if (!s) return;
      resetStoryEditor(); $('#story-edit-id').value = s.id; $('#story-edit-title').value = s.title; $('#story-edit-category').value = s.category || ''; $('#story-edit-synopsis').value = s.synopsis || ''; $('#story-edit-published').value = String(s.is_published); $('#story-editor').classList.remove('hidden'); $('#story-editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    $$('[data-manage-story-chapters]').forEach(b => b.addEventListener('click', () => {
      const s = stories.find(x => x.id === b.dataset.manageStoryChapters); if (!s) return;
      selectedStoryId = s.id; $('#chapter-manager-title').textContent = s.title; $('#chapter-manager').classList.remove('hidden'); resetChapterEditor(); renderAdminChapters(); $('#chapter-manager').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    $$('[data-toggle-story]').forEach(b => b.addEventListener('click', async () => {
      const s = stories.find(x => x.id === b.dataset.toggleStory); if (!s) return;
      const { error } = await db.from('stories').update({ is_published: !s.is_published, updated_at: new Date().toISOString() }).eq('id', s.id);
      if (error) showToast('Không thể đổi trạng thái: ' + error.message); else { showToast('Đã cập nhật trạng thái truyện.'); await loadStories(); }
    }));
    $$('[data-delete-story]').forEach(b => b.addEventListener('click', async () => {
      const s = stories.find(x => x.id === b.dataset.deleteStory); if (!s || !confirm(`Xóa truyện “${s.title}” và toàn bộ chương của truyện?`)) return;
      const { error } = await db.from('stories').delete().eq('id', s.id);
      if (error) showToast('Không thể xóa: ' + error.message); else { if (selectedStoryId === s.id) { selectedStoryId = null; $('#chapter-manager').classList.add('hidden'); } showToast('Đã xóa truyện và các chương.'); await loadStories(); }
    }));
  }

  $('#story-editor').addEventListener('submit', async e => {
    e.preventDefault(); if (!db || !canEditContent) return;
    const id = $('#story-edit-id').value;
    const row = { title: $('#story-edit-title').value.trim(), category: $('#story-edit-category').value.trim() || 'Truyện', synopsis: $('#story-edit-synopsis').value.trim(), is_published: $('#story-edit-published').value === 'true', updated_at: new Date().toISOString() };
    if (!row.title) return setStatus('#story-editor-status', 'Hãy nhập tên truyện.', true);
    setStatus('#story-editor-status', 'Đang lưu truyện...');
    const result = id ? await db.from('stories').update(row).eq('id', id) : await db.from('stories').insert(row);
    if (result.error) { setStatus('#story-editor-status', result.error.message, true); return; }
    resetStoryEditor(); $('#story-editor').classList.add('hidden'); showToast('Đã lưu truyện.'); await loadStories();
  });

  function resetChapterEditor() {
    $('#chapter-editor').reset(); $('#chapter-edit-id').value = ''; $('#chapter-edit-published').value = 'false';
    const existing = storyChapters.filter(ch => ch.story_id === selectedStoryId);
    $('#chapter-edit-number').value = existing.length ? Math.max(...existing.map(ch => ch.chapter_number)) + 1 : 1;
    $('#chapter-edit-title').value = existing.length ? `Chương ${Math.max(...existing.map(ch => ch.chapter_number)) + 1}` : 'Chương 1';
    $('#chapter-editor-status').textContent = '';
  }
  $('#new-chapter').addEventListener('click', () => {
    if (!selectedStoryId) return showToast('Hãy chọn truyện trước.');
    resetChapterEditor(); $('#chapter-editor').classList.remove('hidden'); $('#chapter-edit-title').focus(); $('#chapter-editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#cancel-chapter-edit').addEventListener('click', () => { resetChapterEditor(); $('#chapter-editor').classList.add('hidden'); });
  $('#close-chapter-manager').addEventListener('click', () => { $('#chapter-manager').classList.add('hidden'); selectedStoryId = null; });

  function renderAdminChapters() {
    if (!selectedStoryId) { $('#admin-chapter-list').innerHTML = ''; return; }
    const rows = storyChapters.filter(ch => ch.story_id === selectedStoryId).sort((a, b) => a.chapter_number - b.chapter_number);
    $('#admin-chapter-list').innerHTML = rows.length ? rows.map(ch => `<div class="admin-row"><div><strong>Chương ${ch.chapter_number}: ${escapeHTML(ch.title)}</strong><small>${ch.is_published ? 'Đã xuất bản' : 'Bản nháp'} · ${ch.content.length.toLocaleString('vi-VN')} ký tự</small></div><div class="admin-row-actions"><button class="mini-button" data-edit-chapter="${ch.id}">Sửa</button><button class="mini-button" data-toggle-chapter="${ch.id}">${ch.is_published ? 'Chuyển nháp' : 'Xuất bản'}</button><button class="mini-button danger" data-delete-chapter="${ch.id}">Xóa</button></div></div>`).join('') : '<p class="muted">Truyện này chưa có chương nào. Nhấn “Thêm chương”.</p>';
    $$('[data-edit-chapter]').forEach(b => b.addEventListener('click', () => {
      const ch = storyChapters.find(x => x.id === b.dataset.editChapter); if (!ch) return;
      $('#chapter-edit-id').value = ch.id; $('#chapter-edit-number').value = ch.chapter_number; $('#chapter-edit-title').value = ch.title; $('#chapter-edit-content').value = ch.content; $('#chapter-edit-published').value = String(ch.is_published); $('#chapter-editor').classList.remove('hidden'); $('#chapter-editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    $$('[data-toggle-chapter]').forEach(b => b.addEventListener('click', async () => {
      const ch = storyChapters.find(x => x.id === b.dataset.toggleChapter); if (!ch) return;
      const { error } = await db.from('story_chapters').update({ is_published: !ch.is_published, updated_at: new Date().toISOString() }).eq('id', ch.id);
      if (error) showToast('Không thể đổi trạng thái chương: ' + error.message); else { showToast('Đã cập nhật chương.'); await loadStories(); renderAdminChapters(); }
    }));
    $$('[data-delete-chapter]').forEach(b => b.addEventListener('click', async () => {
      const ch = storyChapters.find(x => x.id === b.dataset.deleteChapter); if (!ch || !confirm(`Xóa chương “${ch.title}”?`)) return;
      const { error } = await db.from('story_chapters').delete().eq('id', ch.id);
      if (error) showToast('Không thể xóa chương: ' + error.message); else { showToast('Đã xóa chương.'); await loadStories(); renderAdminChapters(); resetChapterEditor(); }
    }));
  }

  $('#chapter-editor').addEventListener('submit', async e => {
    e.preventDefault(); if (!db || !canEditContent || !selectedStoryId) return;
    const id = $('#chapter-edit-id').value;
    const row = { story_id: selectedStoryId, chapter_number: Number($('#chapter-edit-number').value), title: $('#chapter-edit-title').value.trim(), content: $('#chapter-edit-content').value, is_published: $('#chapter-edit-published').value === 'true', updated_at: new Date().toISOString() };
    if (!Number.isInteger(row.chapter_number) || row.chapter_number < 1 || row.chapter_number > 9999) return setStatus('#chapter-editor-status', 'Số chương phải từ 1 đến 9999.', true);
    if (!row.title || !row.content.trim()) return setStatus('#chapter-editor-status', 'Hãy nhập tên và nội dung chương.', true);
    setStatus('#chapter-editor-status', 'Đang lưu chương...');
    const result = id ? await db.from('story_chapters').update(row).eq('id', id) : await db.from('story_chapters').insert(row);
    if (result.error) { setStatus('#chapter-editor-status', result.error.message.includes('story_chapters_story_id_chapter_number_key') ? 'Số chương này đã tồn tại trong truyện. Hãy chọn số khác.' : result.error.message, true); return; }
    resetChapterEditor(); $('#chapter-editor').classList.add('hidden'); showToast('Đã lưu chương.'); await loadStories(); renderAdminChapters();
  });

  function renderKnowledge() {
    $('#knowledge-list').innerHTML = knowledge.length ? knowledge.map(k => `<div class="knowledge-row"><span><strong>${escapeHTML(k.title)}</strong><br><small>${k.is_published ? 'Đang dùng cho trợ lý' : 'Đang tắt'}</small></span><span><button class="mini-button" data-k-toggle="${k.id}">${k.is_published ? 'Tắt' : 'Bật'}</button> <button class="mini-button danger" data-k-delete="${k.id}">Xóa</button></span></div>`).join('') : '<p class="muted">Kho kiến thức đang trống.</p>';
    $$('[data-k-toggle]').forEach(b => b.addEventListener('click', async () => { const k = knowledge.find(x => x.id === b.dataset.kToggle); if (!k) return; const { error } = await db.from('knowledge_notes').update({ is_published: !k.is_published }).eq('id', k.id); if (error) showToast(error.message); else await loadKnowledge(); }));
    $$('[data-k-delete]').forEach(b => b.addEventListener('click', async () => { const k = knowledge.find(x => x.id === b.dataset.kDelete); if (!k || !confirm(`Xóa ghi chú “${k.title}”?`)) return; const { error } = await db.from('knowledge_notes').delete().eq('id', k.id); if (error) showToast(error.message); else { showToast('Đã xóa ghi chú.'); await loadKnowledge(); } }));
  }
  $('#knowledge-form').addEventListener('submit', async e => {
    e.preventDefault(); if (!db || !canEditContent) return;
    const row = { title: $('#knowledge-title').value.trim(), content: $('#knowledge-content').value.trim(), is_published: $('#knowledge-published').checked };
    const { error } = await db.from('knowledge_notes').insert(row);
    if (error) setStatus('#knowledge-status', error.message, true); else { e.target.reset(); $('#knowledge-published').checked = true; setStatus('#knowledge-status', 'Đã thêm ghi chú.'); await loadKnowledge(); }
  });

  function addChatMessage(text, who = 'bot') {
    const el = document.createElement('div'); el.className = `chat-message ${who === 'user' ? 'user-message' : 'bot-message'}`;
    const content = document.createElement('div'); content.textContent = text; el.appendChild(content);
    const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = who === 'user' ? 'BẠN' : 'NGƯỜI GIỮ TRANG GIÓ'; el.appendChild(meta);
    $('#chat-messages').appendChild(el); $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  }

function answerFromKnowledge(question) {
  const q = normalize(question);
  const meaningIntent = /\b(noi ve|y nghia|phan tich|noi dung|thong diep|cam xuc|bai hoc|noi gi|muon noi gi|the hien gi|muon truyen tai gi|tom tat|ke ve|nhan vat)\b/.test(q);
  const storyIntent = /\b(truyen|chuong|tieu thuyet|nhan vat)\b/.test(q);
  const visiblePoems = poems.filter(p => p.is_published || canEditContent);
  const visibleKnowledge = knowledge.filter(k => k.is_published || canEditContent);
  const visibleStories = stories.filter(s => s.is_published || canEditContent);
  const visibleChapters = storyChapters.filter(ch => {
    const parent = visibleStories.find(s => s.id === ch.story_id);
    return !!parent && (canEditContent || (parent.is_published && ch.is_published));
  });

  // Ưu tiên tìm truyện bằng tên đầy đủ, không trả nhầm bài thơ cùng từ khóa.
  const matchedStory = [...visibleStories]
    .filter(s => normalize(s.title).length >= 3 && q.includes(normalize(s.title)))
    .sort((a, b) => normalize(b.title).length - normalize(a.title).length)[0];

  if (matchedStory) {
    const chapters = visibleChapters.filter(ch => ch.story_id === matchedStory.id).sort((a, b) => a.chapter_number - b.chapter_number);
    const chapterMatch = q.match(/\bchuong\s+(\d{1,4})\b/);
    if (chapterMatch) {
      const chapterNumber = Number(chapterMatch[1]);
      const chapter = chapters.find(ch => ch.chapter_number === chapterNumber);
      if (!chapter) return `Mình tìm thấy truyện "${matchedStory.title}", nhưng chưa tìm thấy chương ${chapterNumber} được phép đọc trong kho.`;
      return `${matchedStory.title}\nChương ${chapter.chapter_number}: ${chapter.title}\n\n${chapter.content}`;
    }
    if (meaningIntent) {
      if (matchedStory.synopsis?.trim()) return `Truyện "${matchedStory.title}" nói về:\n\n${matchedStory.synopsis}`;
      return `Mình đã tìm thấy truyện "${matchedStory.title}", nhưng truyện chưa có phần tóm tắt. Bạn có thể thêm tóm tắt trong khu vực quản trị.`;
    }
    const chapterList = chapters.length ? chapters.map(ch => `• Chương ${ch.chapter_number}: ${ch.title}`).join('\n') : 'Chưa có chương nào được xuất bản.';
    return `Mình tìm thấy truyện "${matchedStory.title}"${matchedStory.category ? ` · ${matchedStory.category}` : ''}.\n\n${matchedStory.synopsis || 'Truyện chưa có phần giới thiệu.'}\n\nCác chương:\n${chapterList}\n\nBạn có thể hỏi "Đọc chương 1 truyện ${matchedStory.title}" để xem một chương cụ thể.`;
  }

  // Khi câu hỏi có nhắc truyện/chương, tìm trong kho truyện trước.
  if (storyIntent) {
    const chapterTitleMatch = visibleChapters
      .filter(ch => normalize(ch.title).length >= 3 && q.includes(normalize(ch.title)))
      .sort((a, b) => normalize(b.title).length - normalize(a.title).length)[0];
    if (chapterTitleMatch) {
      const parent = visibleStories.find(s => s.id === chapterTitleMatch.story_id);
      return `${parent?.title || 'Truyện'}\nChương ${chapterTitleMatch.chapter_number}: ${chapterTitleMatch.title}\n\n${chapterTitleMatch.content}`;
    }
    const words = wordSet(question).filter(w => !['truyen','chuong','tieu','thuyet','nhan','vat','doc','tom','tat','noi','dung','tim','kiem'].includes(w));
    const scoredStories = visibleStories.map(item => {
      const title = normalize(item.title), category = normalize(item.category), synopsis = normalize(item.synopsis);
      let score = 0;
      for (const word of words) {
        if (title.includes(word)) score += 8;
        else if (category.includes(word)) score += 4;
        else if (synopsis.includes(word)) score += 2;
      }
      return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scoredStories.length) return 'Mình chưa tìm thấy truyện phù hợp trong kho. Bạn thử nhập tên truyện hoặc một chủ đề cụ thể nhé.';
    const best = scoredStories[0].item;
    if (meaningIntent && best.synopsis?.trim()) return `Truyện "${best.title}" nói về:\n\n${best.synopsis}`;
    const chapterCount = visibleChapters.filter(ch => ch.story_id === best.id).length;
    return `Mình tìm thấy truyện "${best.title}"${best.category ? ` · ${best.category}` : ''}.\n\n${best.synopsis || 'Truyện chưa có phần giới thiệu.'}\n\nHiện có ${chapterCount} chương được phép đọc. Hỏi tên truyện kèm số chương để đọc chương cụ thể.`;
  }

  // Xử lý kho thơ và ghi chú như trước.
  const titleQuery = q
    .replace(/\b(bai tho|bai|tho|noi ve|noi dung|y nghia|phan tich|cam xuc|thong diep|muon noi gi|noi gi|la gi|la the nao|gi|tom tat)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const exactTitleMatch = item => {
    const title = normalize(item.title);
    return title.length > 0 && (title === titleQuery || q.includes(title));
  };
  const exactPoems = visiblePoems.filter(exactTitleMatch).sort((a, b) => normalize(b.title).length - normalize(a.title).length);
  const exactNotes = visibleKnowledge.filter(exactTitleMatch).sort((a, b) => normalize(b.title).length - normalize(a.title).length);
  if (meaningIntent && exactNotes.length) {
    const note = exactNotes[0];
    return `Ghi chú "${note.title}":\n\n${note.content}`;
  }
  if (exactPoems.length) {
    const poem = exactPoems[0];
    if (meaningIntent) {
      const poemNotes = poem.notes?.trim();
      if (poemNotes) return `Bài thơ "${poem.title}" nói về:\n\n${poemNotes}`;
      return `Mình đã tìm thấy đúng bài thơ "${poem.title}".\n\nKho kiến thức chưa có phần giải thích riêng cho bài này nên mình không muốn tự suy diễn ý nghĩa.\n\nNội dung bài thơ:\n${poem.content}`;
    }
    return `Mình tìm thấy đúng bài thơ "${poem.title}"${poem.category ? ` · ${poem.category}` : ''}:\n\n${poem.content}`;
  }

  const words = wordSet(question);
  if (!words.length) return 'Bạn cho mình biết tên bài thơ, truyện hoặc một chủ đề cụ thể nhé.';
  const candidates = [];
  visibleKnowledge.forEach(item => {
    const title = normalize(item.title), content = normalize(item.content); let score = 0;
    for (const word of words) { if (title.includes(word)) score += 8; else if (content.includes(word)) score += 1; }
    if (score > 0) candidates.push({ type: 'knowledge', item, score });
  });
  visiblePoems.forEach(item => {
    const title = normalize(item.title), content = normalize(item.content), category = normalize(item.category); let score = 0;
    for (const word of words) { if (title.includes(word)) score += 8; else if (category.includes(word)) score += 3; else if (content.includes(word)) score += 1; }
    if (score > 0) candidates.push({ type: 'poem', item, score });
  });
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return 'Mình chưa tìm thấy nội dung phù hợp trong kho thơ hoặc ghi chú. Bạn thử nhập tên tác phẩm chính xác hơn nhé.';
  const best = candidates[0];
  if (meaningIntent && best.type === 'poem') {
    if (best.item.notes?.trim()) return `Bài thơ "${best.item.title}" nói về:\n\n${best.item.notes}`;
    return `Mình tìm thấy bài thơ "${best.item.title}", nhưng kho chưa có ghi chú giải thích đủ phù hợp. Bạn có thể bổ sung ghi chú để mình trả lời chính xác hơn.`;
  }
  if (best.type === 'knowledge') return `${best.item.title}\n\n${best.item.content}`;
  return `Mình tìm thấy bài thơ "${best.item.title}"${best.item.category ? ` · ${best.item.category}` : ''}:\n\n${best.item.content}`;
}  $('#chat-form').addEventListener('submit', e => {
    e.preventDefault(); const input = $('#chat-input'), question = input.value.trim(); if (!question) return;
    addChatMessage(question, 'user'); input.value = '';
    window.setTimeout(() => addChatMessage(answerFromKnowledge(question)), 180);
  });
  $$('.suggestion').forEach(b => b.addEventListener('click', () => { $('#chat-input').value = b.textContent; $('#chat-form').requestSubmit(); }));
  $('#clear-chat').addEventListener('click', () => { $('#chat-messages').innerHTML = ''; addChatMessage('Cuộc trò chuyện đã được làm mới. Bạn muốn tìm điều gì trong kho chữ của Gió hôm nay?'); });
  $('#menu-toggle').addEventListener('click', () => $('.main-nav').classList.toggle('open'));
  $$('.main-nav a').forEach(a => a.addEventListener('click', () => $('.main-nav').classList.remove('open')));

  const READING_HISTORY_KEY = 'giay-muc-tho-reading-history-v1';
  const READING_BOOKMARK_KEY = 'giay-muc-tho-reading-bookmarks-v1';
  function readLocalList(key) { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function saveReadingHistory(item) { const list = readLocalList(READING_HISTORY_KEY).filter(x => !(x.type === item.type && x.chapterId === item.chapterId && x.storyId === item.storyId)); list.unshift(item); localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(list.slice(0,30))); renderReadingShelf(); }
  function toggleBookmark(item) { const list = readLocalList(READING_BOOKMARK_KEY); const key = x => `${x.type}:${x.storyId}:${x.chapterId || ''}`; const exists = list.some(x => key(x) === key(item)); const next = exists ? list.filter(x => key(x) !== key(item)) : [{ ...item, at: new Date().toISOString() }, ...list]; localStorage.setItem(READING_BOOKMARK_KEY, JSON.stringify(next.slice(0,100))); renderReadingShelf(); showToast(exists ? 'Đã bỏ đánh dấu.' : 'Đã lưu vào sổ đọc.'); }
  function renderReadingShelf() {
    const render = (list, empty, key) => list.length ? list.map((item, i) => `<div class="reading-item"><div><strong>${escapeHTML(item.title || 'Truyện')}</strong><small>${escapeHTML(item.subtitle || '')}${item.at ? ' · ' + new Date(item.at).toLocaleDateString('vi-VN') : ''}</small></div><div class="reading-item-actions">${key === 'history' ? `<button class="mini-button" type="button" data-reading-resume="${item.type}" data-story-id="${escapeHTML(item.storyId || '')}" data-chapter-id="${escapeHTML(item.chapterId || '')}">Tiếp tục</button>` : ''}<button class="mini-button" type="button" data-reading-remove="${key}" data-reading-index="${i}">Bỏ</button></div></div>`).join('') : `<p class="muted">${empty}</p>`;
    const history = readLocalList(READING_HISTORY_KEY), bookmarks = readLocalList(READING_BOOKMARK_KEY);
    $('#reading-history')?.replaceChildren(); if ($('#reading-history')) $('#reading-history').innerHTML = render(history, 'Chưa có lịch sử đọc trên thiết bị này.', 'history');
    if ($('#reading-bookmarks')) $('#reading-bookmarks').innerHTML = render(bookmarks, 'Bạn chưa lưu mục nào.', 'bookmarks');
    $$('[data-reading-remove]').forEach(btn => btn.addEventListener('click', () => { const key = btn.dataset.readingRemove === 'history' ? READING_HISTORY_KEY : READING_BOOKMARK_KEY; const list = readLocalList(key); list.splice(Number(btn.dataset.readingIndex),1); localStorage.setItem(key, JSON.stringify(list)); renderReadingShelf(); }));
    $$('[data-reading-resume]').forEach(btn => btn.addEventListener('click', () => { if (btn.dataset.readingResume === 'chapter' && btn.dataset.chapterId) openChapter(btn.dataset.chapterId); else if (btn.dataset.storyId) openStory(btn.dataset.storyId); }));
  }
  function changeReaderSize(delta) { const content = document.querySelector('.chapter-dialog .reader-content'); if (!content) return; const current = Number(localStorage.getItem('giay-muc-tho-reader-size') || 17); const next = Math.max(14, Math.min(26, current + delta)); localStorage.setItem('giay-muc-tho-reader-size', String(next)); content.style.fontSize = `${next}px`; }
  function applyReaderTheme(theme) { const allowed = ['paper','night','warm']; const selected = allowed.includes(theme) ? theme : 'paper'; document.documentElement.dataset.readerTheme = selected; localStorage.setItem('giay-muc-tho-reader-theme', selected); const button = $('#reader-theme'); if (button) button.textContent = selected === 'night' ? 'Giao diện: Tối' : selected === 'warm' ? 'Giao diện: Ấm' : 'Giao diện: Giấy'; }
  $('#reader-theme')?.addEventListener('click', () => { const current = document.documentElement.dataset.readerTheme || 'paper'; applyReaderTheme(current === 'paper' ? 'night' : current === 'night' ? 'warm' : 'paper'); });
  applyReaderTheme(localStorage.getItem('giay-muc-tho-reader-theme') || 'paper'); renderReadingShelf();

  function syncRoleUI() {
    const editorHeading = $('#admin-panel .admin-heading .eyebrow');
    if (editorHeading) editorHeading.textContent = isAdmin ? 'CHỈ DÀNH CHO QUẢN TRỊ VIÊN' : 'KHU VỰC CỘNG TÁC VIÊN';
    $$('#admin-tabs [data-admin-tab]').forEach(btn => {
      const key = btn.dataset.adminTab;
      btn.hidden = !isAdmin && !(isCollaborator && ['library', 'notes'].includes(key));
    });
    if (!canEditContent) {
      $$('.admin-tab-panel').forEach(panel => { panel.hidden = true; });
      return;
    }
    const active = $('#admin-tabs [data-admin-tab].active');
    if (!active || active.hidden) {
      $('#admin-tabs [data-admin-tab="library"]')?.click();
    } else {
      // Re-activate the selected tab so a previous collaborator session cannot
      // leave an admin panel accidentally hidden after switching accounts.
      active.click();
    }
  }

  function setupAdminTabs() {
    const nav = $('#admin-tabs'), host = $('#admin-tab-content');
    if (!nav || !host || host.dataset.ready) return;
    host.dataset.ready = '1';
    const boxes = $$('.vip-admin-box');
    const groups = {
      library: [$('#poem-editor'), $('#admin-poem-list'), $('.story-admin-box')],
      vip: [boxes[0]], members: [], views: [], notes: [$('.knowledge-box')], logs: [boxes[1]], moderation: []
    };
    Object.entries(groups).forEach(([key, nodes]) => {
      const section = document.createElement('section'); section.className = 'admin-tab-panel'; section.dataset.adminPanel = key;
      if (key === 'members') {
        const card = document.createElement('div'); card.className = 'vip-admin-box';
        card.innerHTML = '<div class="admin-heading"><div><p class="eyebrow">THÀNH VIÊN</p><h3>Danh sách thành viên đã tương tác VIP</h3></div><button type="button" class="button button-outline" id="refresh-members">Làm mới</button></div><p class="muted">Danh sách này gồm người đã gửi đơn VIP hoặc có bản ghi VIP. Không liệt kê mọi tài khoản Auth vì Supabase không cho frontend đọc toàn bộ người dùng.</p><div id="member-list" class="admin-list"><p class="muted">Đang tải...</p></div>'; section.append(card);
      }
      if (key === 'moderation') {
        const card = document.createElement('div'); card.className = 'vip-admin-box';
        card.innerHTML = '<div class="admin-heading"><div><p class="eyebrow">TƯƠNG TÁC ĐỘC GIẢ</p><h3>Báo lỗi và kiểm duyệt bình luận</h3></div><button type="button" class="button button-outline" id="refresh-moderation">Làm mới</button></div><p class="muted">Bình luận hiển thị ngay. Admin có thể ẩn/hiện hoặc xóa; báo lỗi có thể đánh dấu đã xử lý hoặc bỏ qua.</p><div id="moderation-list" class="admin-list"><p class="muted">Đang tải...</p></div>'; section.append(card);
      }
      if (key === 'views') {
        const card = document.createElement('div'); card.className = 'vip-admin-box';
        card.innerHTML = '<div class="admin-heading"><div><p class="eyebrow">THỐNG KÊ</p><h3>Lượt xem ghi nhận</h3></div><button type="button" class="button button-outline" id="refresh-views">Làm mới</button></div><p class="muted">Dựa trên sự kiện page_view đã ghi trong nhật ký, không phải số người dùng duy nhất.</p><div id="view-stats" class="view-stats"><p class="muted">Đang tổng hợp...</p></div>';
        section.append(card);
      }
      nodes.filter(Boolean).forEach(node => section.append(node)); host.append(section);
    });
    function activate(key) {
      $$('.admin-tab-panel').forEach(el => el.hidden = el.dataset.adminPanel !== key);
      $$('#admin-tabs [data-admin-tab]').forEach(btn => { const on = btn.dataset.adminTab === key; btn.classList.toggle('active', on); btn.setAttribute('aria-selected', String(on)); });
      if (key === 'views') loadViewStats();
      if (key === 'members') loadVipMembers();
      if (key === 'moderation') loadModerationQueue();
    }
    nav.querySelectorAll('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.adminTab)));
    $('#refresh-views')?.addEventListener('click', loadViewStats); $('#refresh-members')?.addEventListener('click', loadVipMembers); $('#refresh-moderation')?.addEventListener('click', loadModerationQueue); activate('library');
  }
  async function loadVipMembers() {
    if (!db || !isAdmin) return; const host = $('#member-list'); if (!host) return;
    host.innerHTML = '<p class="muted">Đang tải...</p>';
    const [{ data: requests, error: requestError }, { data: members, error: memberError }] = await Promise.all([
      db.from('vip_requests').select('user_id,email,status,created_at').order('created_at', { ascending: false }).limit(200),
      db.from('vip_members').select('user_id,active').limit(200)
    ]);
    if (requestError && memberError) { host.innerHTML = `<p class="muted">Không tải được thành viên: ${escapeHTML(requestError.message || memberError.message)}</p>`; return; }
    const active = new Set((members || []).filter(m => m.active).map(m => m.user_id));
    const rows = new Map();
    (requests || []).forEach(r => rows.set(r.user_id, { ...r, active: active.has(r.user_id) }));
    (members || []).forEach(m => { const old = rows.get(m.user_id) || { user_id: m.user_id, email: 'Tài khoản chưa gửi đơn VIP', status: 'chưa gửi đơn', created_at: null }; rows.set(m.user_id, { ...old, active: !!m.active }); });
    const list = [...rows.values()];
    host.innerHTML = list.length ? list.map(r => `<div class="admin-row"><div><strong>${escapeHTML(r.email || 'Không có email')}</strong><small>ID: ${escapeHTML(r.user_id)}</small><small>Trạng thái VIP: ${r.active ? 'ĐANG HOẠT ĐỘNG' : escapeHTML(r.status || 'Chưa có VIP')} ${r.created_at ? ' · Đơn lúc ' + new Date(r.created_at).toLocaleString('vi-VN') : ''}</small></div><div class="admin-row-actions"><span class="status-pill ${r.active ? 'status-active' : ''}">${r.active ? 'VIP' : 'Thường / chờ duyệt'}</span></div></div>`).join('') : '<p class="muted">Chưa có thành viên nào gửi đơn VIP.</p>';
  }
  async function loadViewStats() {
    if (!db || !isAdmin) return; const host = $('#view-stats'); if (!host) return;
    host.innerHTML = '<p class="muted">Đang tải...</p>';
    const { data, error } = await db.from('access_logs').select('page_path,event_type,created_at').order('created_at', { ascending: false }).limit(5000);
    if (error) { host.innerHTML = `<p class="muted">Không tải được thống kê: ${escapeHTML(error.message)}</p>`; return; }
    const rows = data || []; const views = rows.filter(r => ['page_view','story_open','chapter_open'].includes(r.event_type));
    const todayKey = new Date().toLocaleDateString('en-CA');
    const todayViews = views.filter(r => new Date(r.created_at).toLocaleDateString('en-CA') === todayKey).length;
    const byStory = new Map(); const byDay = new Map();
    views.forEach(r => { const path = r.page_path || '/'; const match = path.match(/^\/stories\/([^/]+)/); const key = match ? match[1] : (r.event_type === 'page_view' ? 'Trang chủ / trang khác' : path); byStory.set(key, (byStory.get(key)||0)+1); const day = new Date(r.created_at).toLocaleDateString('vi-VN'); byDay.set(day, (byDay.get(day)||0)+1); });
    const storyRows = [...byStory.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>`<div class="admin-row"><div><strong>${escapeHTML(name)}</strong><small>Lượt mở trang/truyện/chương đã ghi nhận</small></div><strong>${count}</strong></div>`).join('');
    const dayRows = [...byDay.entries()].slice(0,14).map(([day,count])=>`<div class="admin-row"><div><strong>${escapeHTML(day)}</strong></div><strong>${count}</strong></div>`).join('');
    host.innerHTML = `<div class="view-stat-grid"><article><strong>${views.length}</strong><span>Sự kiện xem trong 5.000 log gần nhất</span></article><article><strong>${todayViews}</strong><span>Sự kiện xem hôm nay trong dữ liệu đã tải</span></article><article><strong>${byStory.size}</strong><span>Trang/truyện có lượt xem</span></article></div><div class="view-detail-grid"><div><h4>Lượt xem theo truyện / trang</h4>${storyRows || '<p class="muted">Chưa có dữ liệu.</p>'}</div><div><h4>Lượt xem theo ngày</h4>${dayRows || '<p class="muted">Chưa có dữ liệu.</p>'}</div></div>`;
  }
  setupAdminTabs();

  if (db) {
    db.auth.onAuthStateChange((_event, _session) => { setTimeout(async () => { await updateAccount(); await loadPoems(); await loadStories(); if (isAdmin) { await loadVipRequests(); await loadAccessLogs(); } }, 0); });
    (async () => { await logSiteEvent('page_view'); await updateAccount(); await loadPoems(); await loadStories(); if (isAdmin) { await loadKnowledge(); await loadVipRequests(); await loadAccessLogs(); } })();
  }
})();

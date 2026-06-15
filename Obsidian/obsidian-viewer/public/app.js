// --- APP STATE ---
let activeNotePath = null;
let expandedDirectories = new Set();
let allTags = {};
let vaultStats = { notesCount: 0, tagsCount: 0 };
let currentTab = 'home'; // 'home' or 'graph' or 'note'

// Quiz State
let activeQuiz = null;
let currentQuestionIdx = 0;
let userScore = 0;

// --- STATIC DATA (loaded from data.json) ---
// window.vaultData is set by initApp() before this runs
function getNote(path) {
  return window.vaultData ? window.vaultData.notes[path] : null;
}
function getAllNotes() {
  return window.vaultData ? Object.values(window.vaultData.notes) : [];
}
function getTree() {
  return window.vaultData ? window.vaultData.tree : null;
}
function getTags() {
  return window.vaultData ? window.vaultData.tags : {};
}
function getGraph() {
  return window.vaultData ? window.vaultData.graph : { nodes: [], links: [] };
}

// Client-side search over in-memory notes
function searchNotes(query) {
  if (!window.vaultData || !query) return [];
  const lowerQuery = query.toLowerCase();
  const results = [];
  Object.values(window.vaultData.notes).forEach(note => {
    const inTitle = note.title.toLowerCase().includes(lowerQuery);
    const bodyText = note.raw || '';
    const inBody = bodyText.toLowerCase().includes(lowerQuery);
    if (inTitle || inBody) {
      let snippet = '';
      if (inBody) {
        const idx = bodyText.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 40);
        const end = Math.min(bodyText.length, idx + lowerQuery.length + 60);
        snippet = bodyText.substring(start, end).replace(/\r?\n/g, ' ');
        if (start > 0) snippet = '...' + snippet;
        if (end < bodyText.length) snippet = snippet + '...';
      } else {
        snippet = bodyText.substring(0, 100).replace(/\r?\n/g, ' ') + '...';
      }
      results.push({ title: note.title, name: note.name, path: note.path, snippet, score: inTitle ? 10 : 1 });
    }
  });
  return results.sort((a, b) => b.score - a.score);
}

// --- MAIN INITIALIZATION (called after data.js script is loaded) ---
function initApp() {
  initTheme();
  initNavbarScroll();
  initRouting();
  initSearch();
  initGraphView();
  initMobileMenu();
  initQuizSystem();
  initSidebarToggle();
  initEditorEvents();
  loadDirectoryTree();
  loadTags();
  loadStats();
  initScrollAnimationObserver();
}

document.addEventListener('DOMContentLoaded', () => {
  // window.vaultData sudah tersedia karena data.js dimuat
  // via <script src="data.js"> sebelum app.js di index.html.
  // Tidak perlu fetch — ini bekerja di file://, http://, dan Netlify.
  const loadingEl = document.getElementById('app-loading-overlay');

  if (window.vaultData) {
    allTags = window.vaultData.tags || {};
    if (loadingEl) loadingEl.style.display = 'none';
    initApp();
  } else {
    // data.js belum ada — tampilkan pesan panduan
    console.error('window.vaultData tidak tersedia. Pastikan data.js sudah di-build.');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div style="text-align:center;padding:2rem;max-width:480px;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
          <h2 style="font-size:1.1rem;margin-bottom:0.75rem;letter-spacing:0.05em;">DATA VAULT TIDAK DITEMUKAN</h2>
          <p style="color:#94a3b8;font-size:0.875rem;line-height:1.6;">
            File <code style="background:#1e293b;padding:0.2em 0.5em;border-radius:3px;color:#38bdf8;">data.js</code> belum tersedia.<br>
            Jalankan perintah berikut di terminal:
          </p>
          <pre style="background:#0f172a;color:#38bdf8;padding:1rem;border-radius:6px;margin-top:1rem;font-size:0.9rem;text-align:left;">npm run build</pre>
        </div>
      `;
    }
  }
});


// --- SCROLL ANIMATION OBSERVER ---
let scrollObserver = null;
function initScrollAnimationObserver() {
  if (scrollObserver) scrollObserver.disconnect();

  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        scrollObserver.unobserve(entry.target); // Animate once
      }
    });
  }, {
    threshold: 0.05,
    rootMargin: '0px 0px -30px 0px'
  });

  // Observe all fade-in-up items
  document.querySelectorAll('.fade-in-up').forEach(el => {
    scrollObserver.observe(el);
  });
}

// Trigger animations for newly added elements
function refreshScrollAnimations() {
  if (!scrollObserver) return;
  document.querySelectorAll('.fade-in-up:not(.visible)').forEach(el => {
    scrollObserver.observe(el);
  });
}

// --- SLIDING UNDERLINE FOR NAVBAR ---
function updateSlidingUnderline() {
  const activeLink = document.querySelector('.nav-links .nav-link.active');
  const underline = document.getElementById('nav-underline');
  
  if (activeLink && underline) {
    underline.style.left = `${activeLink.offsetLeft}px`;
    underline.style.width = `${activeLink.offsetWidth}px`;
  }
}

// Recalculate underline on resize
window.addEventListener('resize', updateSlidingUnderline);

// --- STICKY HEADER & NAVBAR GLASSMORPHISM ---
function initNavbarScroll() {
  const header = document.getElementById('app-header');
  const mainContent = document.getElementById('main-content-panel');
  const appContainer = document.querySelector('.app-container');

  if (mainContent && header) {
    mainContent.addEventListener('scroll', () => {
      if (mainContent.scrollTop > 20) {
        header.classList.add('scrolled');
        if (appContainer) appContainer.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
        if (appContainer) appContainer.classList.remove('scrolled');
      }
    });
  }
}

// --- MOBILE MENU HAMBURGER MORPHING & DRAWER ---
function initMobileMenu() {
  const menuBtn = document.getElementById('menu-toggle-btn');
  const metaBtn = document.getElementById('meta-toggle-btn');
  const drawer = document.getElementById('mobile-drawer');
  const metaPanel = document.querySelector('.panel-meta');
  
  // Create backdrop overlay dynamically if missing
  let backdrop = document.getElementById('drawer-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'drawer-backdrop';
    backdrop.className = 'drawer-backdrop';
    document.body.appendChild(backdrop);
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const isOpen = menuBtn.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', isOpen);
      
      if (isOpen) {
        if (drawer) drawer.classList.add('open');
        backdrop.style.display = 'block';
        if (metaPanel) metaPanel.classList.remove('open');
      } else {
        if (drawer) drawer.classList.remove('open');
        backdrop.style.display = 'none';
      }
    });
  }

  if (metaBtn) {
    metaBtn.addEventListener('click', () => {
      if (metaPanel) {
        const isOpen = metaPanel.classList.toggle('open');
        if (isOpen) {
          backdrop.style.display = 'block';
          if (menuBtn) {
            menuBtn.classList.remove('open');
            menuBtn.setAttribute('aria-expanded', 'false');
          }
          if (drawer) drawer.classList.remove('open');
        } else {
          backdrop.style.display = 'none';
        }
      }
    });
  }

  backdrop.addEventListener('click', () => {
    if (menuBtn) {
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    if (drawer) drawer.classList.remove('open');
    if (metaPanel) metaPanel.classList.remove('open');
    backdrop.style.display = 'none';
  });

  // Close menus on page switch
  window.addEventListener('hashchange', () => {
    if (menuBtn) {
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    if (drawer) drawer.classList.remove('open');
    if (metaPanel) metaPanel.classList.remove('open');
    backdrop.style.display = 'none';
  });
}

// --- THEME SYSTEM ---
function initTheme() {
  const themeBtn = document.getElementById('theme-btn');
  const savedTheme = localStorage.getItem('swiss-theme') || 'light'; // Light mode default
  
  document.documentElement.setAttribute('data-theme', savedTheme);
  bodyThemeUpdate(savedTheme);

  themeBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    bodyThemeUpdate(newTheme);
    localStorage.setItem('swiss-theme', newTheme);
  });
}

function bodyThemeUpdate(theme) {
  const themeBtn = document.getElementById('theme-btn');
  themeBtn.textContent = theme === 'light' ? 'DARK MODE' : 'LIGHT MODE';
  document.body.setAttribute('data-theme', theme);
}

// --- ROUTING SYSTEM ---
function initRouting() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash;
  updateLayoutMode(hash);
  
  const mainContent = document.getElementById('main-content-panel');
  
  // Reset scroll bar of central pane on route switch so user doesn't have to scroll manually
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  
  // Reset tabs highlight
  document.querySelectorAll('.nav-links .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelectorAll('.mobile-drawer-links .mobile-drawer-link').forEach(link => {
    link.classList.remove('active');
  });

  // Automatically close graph overlay if we navigate away from #graph
  if (hash !== '#graph') {
    closeGraphView();
  }

  // Automatically close/hide quiz screen pane if we navigate away from quiz tabs
  if (!hash.startsWith('#/quiz/') && hash !== '#quiz') {
    const quizViewer = document.getElementById('quiz-viewer-pane');
    if (quizViewer) quizViewer.classList.add('hidden');
  }

  // Automatically close/hide note editor if we navigate away from /new-note
  if (hash !== '#/new-note') {
    const editorViewer = document.getElementById('note-editor-pane');
    if (editorViewer) editorViewer.classList.add('hidden');
  }

  if (hash.startsWith('#/note/')) {
    const encodedPath = hash.replace('#/note/', '');
    const notePath = decodeURIComponent(encodedPath);
    loadNote(notePath);
    currentTab = 'note';
  } else if (hash.startsWith('#/tag/')) {
    const encodedTag = hash.replace('#/tag/', '');
    const tag = decodeURIComponent(encodedTag);
    filterByTag(tag);
    currentTab = 'note';
  } else if (hash.startsWith('#/quiz/')) {
    const encodedPath = hash.replace('#/quiz/', '');
    const notePath = decodeURIComponent(encodedPath);
    showQuizScreen(notePath);
    currentTab = 'quiz';
    const quizLinks = document.querySelectorAll('[data-tab="quiz"]');
    quizLinks.forEach(l => l.classList.add('active'));
  } else if (hash === '#/new-note') {
    showNewNoteScreen();
    currentTab = 'home';
  } else if (hash === '#quiz') {
    showQuizHubScreen();
    currentTab = 'quiz';
    const quizLinks = document.querySelectorAll('[data-tab="quiz"]');
    quizLinks.forEach(l => l.classList.add('active'));
  } else if (hash === '#graph') {
    openGraphView();
    currentTab = 'graph';
    
    // Highlight Graph links
    const graphLinks = document.querySelectorAll('[data-tab="graph"]');
    graphLinks.forEach(l => l.classList.add('active'));
  } else {
    // Default home tab
    showHomeScreen();
    currentTab = 'home';
    const homeLinks = document.querySelectorAll('[data-tab="home"]');
    homeLinks.forEach(l => l.classList.add('active'));
  }
  
  updateSlidingUnderline();
}

// --- HOME GRID CARDS LOADER ---
// Helper to get parent folder name from note path
function getParentFolder(notePath) {
  const parts = notePath.split('/');
  if (parts.length > 1) {
    return parts.slice(0, -1).join(' / ');
  }
  return 'Utama (Root)';
}

// --- HOME GRID CARDS LOADER ---
async function showHomeScreen() {
  activeNotePath = null;
  showReadingView();
  
  const mainContent = document.getElementById('main-content-panel');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  
  const quizToggleBtn = document.getElementById('quiz-toggle-btn');
  if (quizToggleBtn) {
    quizToggleBtn.classList.add('hidden');
  }
  document.getElementById('breadcrumbs-bar-container').classList.add('hidden');
  
  document.getElementById('note-viewer-pane').classList.add('hidden');
  document.getElementById('note-skeleton-pane').classList.add('hidden');
  document.getElementById('home-grid-container').classList.remove('hidden');

  const gridContainer = document.getElementById('notes-grid');
  gridContainer.innerHTML = '<div class="loading-placeholder">Memuat catatan...</div>';
  
  try {
    const notes = getAllNotes();
    
    gridContainer.innerHTML = '';
    
    if (notes.length === 0) {
      gridContainer.innerHTML = '<div class="empty-placeholder">Tidak ada catatan di vault.</div>';
      return;
    }

    // Kelompokkan catatan berdasarkan parent folder
    const groups = {};
    notes.forEach(note => {
      const folder = getParentFolder(note.path);
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(note);
    });

    let globalIdx = 0;
    // Urutkan folder: Utama (Root) paling atas, selebihnya alfabetis
    const sortedFolders = Object.keys(groups).sort((a, b) => {
      if (a === 'Utama (Root)') return -1;
      if (b === 'Utama (Root)') return 1;
      return a.localeCompare(b);
    });

    sortedFolders.forEach(folder => {
      const folderSection = document.createElement('section');
      folderSection.className = 'folder-group fade-in-up';
      
      const folderTitle = document.createElement('h2');
      folderTitle.className = 'folder-group-title';
      folderTitle.innerHTML = `<span class="folder-icon">📁</span> <span>${folder.toUpperCase()}</span>`;
      folderSection.appendChild(folderTitle);
      
      const subGrid = document.createElement('div');
      subGrid.className = 'notes-grid';
      
      groups[folder].forEach(note => {
        const card = document.createElement('article');
        card.className = 'note-card';
        card.setAttribute('aria-labelledby', `card-title-${globalIdx}`);
        card.style.transitionDelay = `${(globalIdx % 6) * 0.05}s`;

        const tagsHtml = note.tags.slice(0, 2).map(t => `<span class="card-tag">#${t}</span>`).join(' ');

        card.innerHTML = `
          <div class="card-body">
            <h3 id="card-title-${globalIdx}">${note.title}</h3>
            <p class="card-snippet">${note.snippet || 'Catatan kosong.'}</p>
          </div>
          <div class="card-footer">
            <div class="card-tags">${tagsHtml}</div>
            <div class="card-icon-bounce">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </div>
          </div>
        `;

        card.addEventListener('click', () => {
          card.style.transform = 'scale(0.97)';
          card.style.opacity = '0.5';
          setTimeout(() => {
            window.location.hash = `#/note/${encodeURIComponent(note.path)}`;
          }, 150);
        });

        subGrid.appendChild(card);
        globalIdx++;
      });
      
      folderSection.appendChild(subGrid);
      gridContainer.appendChild(folderSection);
    });

    // Stats
    document.getElementById('cards-count-label').textContent = `Menampilkan ${notes.length} catatan dalam ${sortedFolders.length} kategori folder`;
    
    // Trigger scroll fade-ins
    refreshScrollAnimations();

  } catch (err) {
    console.error('Failed to load home notes grid:', err);
    gridContainer.innerHTML = '<div class="error-msg">Gagal memuat catatan beranda.</div>';
  }
}

// --- DATA RETRIEVAL (in-memory from window.vaultData) ---
function loadDirectoryTree() {
  const treeContainer = document.getElementById('directory-tree');
  const mobileTreeContainer = document.getElementById('mobile-drawer-tree');
  try {
    const treeData = getTree();
    if (!treeData) throw new Error('No tree data');
    
    treeContainer.innerHTML = '';
    renderTreeNode(treeData, treeContainer);
    
    mobileTreeContainer.innerHTML = '';
    renderTreeNode(treeData, mobileTreeContainer);
  } catch (err) {
    console.error('Failed to load directory tree:', err);
    treeContainer.innerHTML = '<div class="error-msg">Gagal memuat direktori.</div>';
  }
}

// --- DIRECTORY TREE RENDERER ---
function renderTreeNode(node, container) {
  if (!node) return;
  
  // Skip rendering root node to prevent redundant wrapping
  if (node.path === '' && node.isDir) {
    if (node.children) {
      node.children.forEach(child => {
        createNodeElements(child, container);
      });
    }
    return;
  }
  
  createNodeElements(node, container);
}

function createNodeElements(node, container) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';

  const headerEl = document.createElement('div');
  headerEl.className = 'tree-node-header';
  headerEl.dataset.path = node.path; // Attach path for dynamic highlights
  
  if (!node.isDir && activeNotePath === node.path) {
    headerEl.classList.add('active');
  }

  const iconEl = document.createElement('span');
  iconEl.className = 'tree-node-icon';
  iconEl.innerHTML = node.isDir ? '▶' : '📄';
  if (node.isDir) {
    iconEl.style.transition = 'transform 0.2s ease';
    if (expandedDirectories.has(node.path)) {
      iconEl.style.transform = 'rotate(90deg)';
    } else {
      iconEl.style.transform = 'rotate(0deg)';
    }
  }

  const labelEl = document.createElement('span');
  labelEl.className = 'tree-node-label';
  labelEl.textContent = node.name;

  headerEl.appendChild(iconEl);
  headerEl.appendChild(labelEl);
  nodeEl.appendChild(headerEl);

  if (node.isDir) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-node-children';
    
    if (expandedDirectories.has(node.path)) {
      childrenContainer.classList.remove('collapsed');
      iconEl.style.transform = 'rotate(90deg)';
    } else {
      childrenContainer.classList.add('collapsed');
      iconEl.style.transform = 'rotate(0deg)';
    }

    if (node.children) {
      node.children.forEach(child => {
        createNodeElements(child, childrenContainer);
      });
    }
    
    nodeEl.appendChild(childrenContainer);

    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = childrenContainer.classList.toggle('collapsed');
      if (isCollapsed) {
        expandedDirectories.delete(node.path);
        iconEl.style.transform = 'rotate(0deg)';
      } else {
        expandedDirectories.add(node.path);
        iconEl.style.transform = 'rotate(90deg)';
      }
    });
  } else {
    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#/note/${encodeURIComponent(node.path)}`;
    });
  }

  container.appendChild(nodeEl);
}

function updateTreeActiveHighlight() {
  document.querySelectorAll('.tree-node-header').forEach(header => {
    if (header.dataset.path && header.dataset.path === activeNotePath) {
      header.classList.add('active');
    } else {
      header.classList.remove('active');
    }
  });
}

function loadTags() {
  const tagsContainer = document.getElementById('tags-container');
  try {
    allTags = getTags();
    
    tagsContainer.innerHTML = '';
    const tagList = Object.keys(allTags);
    
    if (tagList.length === 0) {
      tagsContainer.innerHTML = '<div class="empty-placeholder">Tidak ada tag</div>';
      return;
    }

    tagList.sort().forEach(tag => {
      const count = allTags[tag].length;
      const tagEl = document.createElement('span');
      tagEl.className = 'swiss-tag';
      tagEl.textContent = `${tag} (${count})`;
      tagEl.dataset.tag = tag;
      tagEl.addEventListener('click', () => {
        window.location.hash = `#/tag/${encodeURIComponent(tag)}`;
      });
      tagsContainer.appendChild(tagEl);
    });
  } catch (err) {
    console.error('Failed to load tags:', err);
    tagsContainer.innerHTML = '<div class="error-msg">Gagal memuat tag.</div>';
  }
}

function loadStats() {
  try {
    const notes = getAllNotes();
    const fileCount = notes.length;
    const tagsData = getTags();
    const tagsCount = Object.keys(tagsData).length;

    vaultStats = { notesCount: fileCount, tagsCount };
    
    // Update footer stats
    document.getElementById('footer-stats-text').textContent = `Total Catatan: ${fileCount} | Total Tag Indeks: ${tagsCount}`;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// --- NOTE DETAIL READER (SKELETON SIMULATOR) ---
async function loadNote(notePath) {
  activeNotePath = notePath;
  updateTreeActiveHighlight();
  showReadingView();
  
  const mainContent = document.getElementById('main-content-panel');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  
  // Hide Home grid
  document.getElementById('home-grid-container').classList.add('hidden');
  document.getElementById('note-viewer-pane').classList.add('hidden');
  
  // Show Loading Skeleton
  const skeletonPane = document.getElementById('note-skeleton-pane');
  skeletonPane.classList.remove('hidden');

  // Breadcrumbs
  document.getElementById('breadcrumbs-bar-container').classList.remove('hidden');
  const crumbs = notePath.split('/');
  document.getElementById('breadcrumbs-bar').innerHTML = crumbs.map((c, i) => {
    if (i === crumbs.length - 1) return `<span>${c.replace('.md', '')}</span>`;
    return `<span>${c.toUpperCase()}</span>`;
  }).join(' &gt; ');

  try {
    const note = getNote(notePath);
    if (!note) throw new Error('Note not found');
    
    // Simulate Decrypting / Loading delay of 500ms to show Shimmering Skeleton Loader
    setTimeout(() => {
      skeletonPane.classList.add('hidden');
      
      const viewer = document.getElementById('note-viewer-pane');
      viewer.classList.remove('hidden');
      viewer.innerHTML = `
        <h1 class="note-title fade-in-up">${note.title}</h1>
        <div class="note-body fade-in-up">${note.html}</div>
      `;

      const quizToggleBtn = document.getElementById('quiz-toggle-btn');
      if (quizToggleBtn) {
        quizToggleBtn.href = `#/quiz/${encodeURIComponent(notePath)}`;
        quizToggleBtn.classList.remove('hidden');
      }

      renderOutline(viewer);
      renderActiveTags(note.tags);
      renderBacklinks(note.backlinks);
      setupNoteInteractivity();
      
      // Animate entry
      refreshScrollAnimations();
    }, 500);

  } catch (err) {
    console.error('Error loading note:', err);
    skeletonPane.classList.add('hidden');
    const viewer = document.getElementById('note-viewer-pane');
    viewer.classList.remove('hidden');
    viewer.innerHTML = `
      <div class="welcome-screen">
        <h1 class="welcome-title">404 NOT FOUND</h1>
        <p class="welcome-desc">Catatan tidak dapat dimuat atau tidak ditemukan di direktori.</p>
        <button class="swiss-btn" onclick="window.location.hash=''">Kembali ke Beranda</button>
      </div>
    `;
    const quizToggleBtn = document.getElementById('quiz-toggle-btn');
    if (quizToggleBtn) {
      quizToggleBtn.classList.add('hidden');
    }
  }
}

// Outline TOC
function renderOutline(viewerEl) {
  const container = document.getElementById('outline-container');
  container.innerHTML = '';

  const headings = viewerEl.querySelectorAll('.note-body h1, .note-body h2, .note-body h3');
  
  if (headings.length === 0) {
    container.innerHTML = '<div class="empty-placeholder">Tidak ada outline</div>';
    return;
  }

  headings.forEach((heading, idx) => {
    if (!heading.id) heading.id = `heading-${idx}`;
    const item = document.createElement('div');
    item.className = `outline-item outline-${heading.tagName.toLowerCase()}`;
    item.textContent = heading.textContent;
    item.addEventListener('click', () => {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    container.appendChild(item);
  });
}

function renderActiveTags(tags) {
  const container = document.getElementById('active-note-tags');
  container.innerHTML = '';
  if (!tags || tags.length === 0) {
    container.innerHTML = '<div class="empty-placeholder">Tidak ada tag</div>';
    return;
  }
  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'swiss-tag-sm';
    tagEl.textContent = `#${tag}`;
    tagEl.addEventListener('click', () => {
      window.location.hash = `#/tag/${encodeURIComponent(tag)}`;
    });
    container.appendChild(tagEl);
  });
}

function renderBacklinks(backlinks) {
  const container = document.getElementById('backlinks-container');
  container.innerHTML = '';
  if (!backlinks || backlinks.length === 0) {
    container.innerHTML = '<div class="empty-placeholder">Tidak ada backlinks</div>';
    return;
  }
  backlinks.forEach(bl => {
    const blEl = document.createElement('a');
    blEl.className = 'backlink-item';
    blEl.href = `#/note/${encodeURIComponent(bl.path)}`;
    blEl.innerHTML = `<div class="backlink-title">${bl.title}</div>`;
    container.appendChild(blEl);
  });
}

// --- SEARCH SYSTEM ---
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let debounceTimer;

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();

    if (query.length < 2) {
      searchResults.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(() => {
      try {
        const data = searchNotes(query);
        renderSearchResults(data);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.classList.add('hidden');
    }
  });
}

function renderSearchResults(results) {
  const searchResults = document.getElementById('search-results');
  searchResults.innerHTML = '';

  if (results.length === 0) {
    searchResults.innerHTML = '<div class="search-item"><div class="item-title">Tidak ada hasil ditemukan</div></div>';
    searchResults.classList.remove('hidden');
    return;
  }

  results.forEach(result => {
    const el = document.createElement('div');
    el.className = 'search-item';
    el.innerHTML = `
      <div class="item-title">${result.title}</div>
      <div class="item-snippet">${result.snippet}</div>
    `;
    el.addEventListener('click', () => {
      window.location.hash = `#/note/${encodeURIComponent(result.path)}`;
      searchResults.classList.add('hidden');
      document.getElementById('search-input').value = '';
    });
    searchResults.appendChild(el);
  });

  searchResults.classList.remove('hidden');
}

// --- TAG FILTERING ---
async function filterByTag(tag) {
  activeNotePath = null;
  showReadingView();
  
  document.getElementById('quiz-toggle-btn').classList.add('hidden');
  document.getElementById('home-grid-container').classList.add('hidden');
  
  document.getElementById('breadcrumbs-bar-container').classList.remove('hidden');
  document.getElementById('breadcrumbs-bar').textContent = `TAGS > ${tag.toUpperCase()}`;

  const viewer = document.getElementById('note-viewer-pane');
  viewer.classList.remove('hidden');
  viewer.innerHTML = `
    <h1 class="note-title">Tag: #${tag}</h1>
    <div class="note-body">
      <p>Berikut adalah catatan yang memiliki indeks tag <strong>#${tag}</strong>:</p>
      <ul id="tag-notes-list" style="margin-top: 1.5rem; padding-left: 1.5rem;">
        <div class="loading-placeholder">Memuat daftar catatan...</div>
      </ul>
    </div>
  `;

  document.getElementById('outline-container').innerHTML = '<div class="empty-placeholder">Tampilan filter tag</div>';
  document.getElementById('active-note-tags').innerHTML = `<span class="swiss-tag-sm">#${tag}</span>`;
  document.getElementById('backlinks-container').innerHTML = '<div class="empty-placeholder">Tampilan filter tag</div>';

  try {
    const listContainer = document.getElementById('tag-notes-list');
    const matchingNotes = allTags[tag.toLowerCase()] || [];
    
    if (matchingNotes.length === 0) {
      listContainer.innerHTML = '<li>Tidak ada catatan yang cocok.</li>';
      return;
    }

    listContainer.innerHTML = '';
    matchingNotes.forEach(note => {
      const li = document.createElement('li');
      li.style.marginBottom = '0.5rem';
      const a = document.createElement('a');
      a.href = `#/note/${encodeURIComponent(note.path)}`;
      a.textContent = note.title;
      li.appendChild(a);
      listContainer.appendChild(li);
    });
  } catch (err) {
    console.error('Error filtering tags:', err);
  }
}

// --- LINK PREVIEWS ---
let hoverTimeout;
const previewPopup = document.getElementById('link-preview-popup');

function setupNoteInteractivity() {
  const internalLinks = document.querySelectorAll('.note-body a.internal-link');

  internalLinks.forEach(link => {
    link.addEventListener('mouseenter', (e) => {
      const notePath = link.dataset.notePath;
      if (!notePath) return;

      clearTimeout(hoverTimeout);
      const x = e.pageX + 10;
      const y = e.pageY + 10;

      hoverTimeout = setTimeout(() => {
        try {
          previewPopup.style.left = `${x}px`;
          previewPopup.style.top = `${y}px`;
          previewPopup.classList.remove('hidden');
          
          document.getElementById('preview-popup-title').textContent = link.textContent;

          const data = getNote(notePath);
          if (data) {
            let bodyText = data.html.replace(/<[^>]*>/g, ''); 
            bodyText = bodyText.substring(0, 180).trim();
            if (bodyText.length >= 180) bodyText += '...';
            document.getElementById('preview-popup-body').textContent = bodyText || 'Catatan kosong.';
          } else {
            document.getElementById('preview-popup-body').textContent = 'Catatan tidak ditemukan.';
          }
        } catch (err) {
          console.error(err);
        }
      }, 400); 
    });

    link.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
      previewPopup.classList.add('hidden');
    });

    link.addEventListener('mousemove', (e) => {
      if (!previewPopup.classList.contains('hidden')) {
        previewPopup.style.left = `${e.pageX + 10}px`;
        previewPopup.style.top = `${e.pageY + 10}px`;
      }
    });
  });
}

// --- QUIZ SYSTEM ---
function initQuizSystem() {
  const quizToggleBtn = document.getElementById('quiz-toggle-btn');
  
  if (quizToggleBtn) {
    quizToggleBtn.addEventListener('click', (e) => {
      // Let hashchange routing handle the switch naturally
    });
  }

  document.getElementById('quiz-next-btn').addEventListener('click', nextQuestion);
  document.getElementById('quiz-restart-btn').addEventListener('click', restartQuiz);
  
  const closeBtn = document.getElementById('quiz-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', showReadingView);
  }
}

// showReadingView is defined below near quiz functions

// Show Quiz Hub - Let user choose which note to take a quiz on
async function showQuizHubScreen() {
  activeNotePath = null;
  
  // Reset central scroll
  const mainContent = document.getElementById('main-content-panel');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  
  // Hide other views
  document.getElementById('home-grid-container').classList.add('hidden');
  document.getElementById('note-skeleton-pane').classList.add('hidden');
  document.getElementById('quiz-viewer-pane').classList.add('hidden');
  
  const breadcrumbs = document.getElementById('breadcrumbs-bar-container');
  if (breadcrumbs) {
    breadcrumbs.classList.add('hidden');
  }
  
  // Clear sidebar details for Quiz selection
  document.getElementById('outline-container').innerHTML = '<div class="empty-placeholder">Tampilan Latihan Soal</div>';
  document.getElementById('active-note-tags').innerHTML = '<div class="empty-placeholder">Tampilan Latihan Soal</div>';
  document.getElementById('backlinks-container').innerHTML = '<div class="empty-placeholder">Tampilan Latihan Soal</div>';

  const viewer = document.getElementById('note-viewer-pane');
  viewer.classList.remove('hidden');
  viewer.innerHTML = '<div class="loading-placeholder">Memuat daftar latihan soal...</div>';

  try {
    const notes = getAllNotes();
    
    // Group notes by parent folder
    const groups = {};
    notes.forEach(note => {
      const folder = getParentFolder(note.path);
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(note);
    });

    let html = `
      <div class="quiz-hub-container">
        <div class="quiz-hub-header">
          <span class="quiz-hub-badge">EVALUASI KOGNITIF</span>
          <h1 class="quiz-hub-title">Practice Quiz Selector</h1>
          <p class="quiz-hub-desc">Pilih materi pembelajaran dari direktori catatan Anda di bawah ini untuk memulai latihan soal pilihan ganda dinamis.</p>
        </div>
        <div class="quiz-hub-folders">
    `;

    const sortedFolders = Object.keys(groups).sort((a, b) => {
      if (a === 'Utama (Root)') return -1;
      if (b === 'Utama (Root)') return 1;
      return a.localeCompare(b);
    });

    sortedFolders.forEach(folder => {
      html += `
        <section class="quiz-hub-folder-section">
          <h3 class="quiz-hub-folder-title">${folder.toUpperCase()}</h3>
          <div class="quiz-hub-grid">
      `;

      groups[folder].forEach(note => {
        html += `
          <article class="quiz-hub-card" onclick="window.location.hash='#/quiz/${encodeURIComponent(note.path)}'">
            <div>
              <h4>${note.title}</h4>
              <p class="quiz-card-desc">${note.snippet || 'Kuis latihan materi.'}</p>
            </div>
            <div class="quiz-card-action">
              Mulai Latihan <span>&rarr;</span>
            </div>
          </article>
        `;
      });

      html += `
          </div>
        </section>
      `;
    });

    html += `
        </div>
      </div>
    `;

    viewer.innerHTML = html;
  } catch (err) {
    console.error(err);
    viewer.innerHTML = '<div class="error-msg">Gagal memuat daftar kuis.</div>';
  }
}

// Show specific quiz page
async function showQuizScreen(notePath) {
  activeNotePath = notePath;
  
  // Reset scroll
  const mainContent = document.getElementById('main-content-panel');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  
  document.getElementById('home-grid-container').classList.add('hidden');
  document.getElementById('note-viewer-pane').classList.add('hidden');
  document.getElementById('note-skeleton-pane').classList.add('hidden');
  
  // Breadcrumbs
  const breadcrumbs = document.getElementById('breadcrumbs-bar-container');
  if (breadcrumbs) {
    breadcrumbs.classList.remove('hidden');
    const crumbs = notePath.split('/');
    document.getElementById('breadcrumbs-bar').innerHTML = crumbs.map((c, i) => {
      if (i === crumbs.length - 1) return `<span>QUIZ: ${c.replace('.md', '')}</span>`;
      return `<span>${c.toUpperCase()}</span>`;
    }).join(' &gt; ');
  }
  
  const quizToggleBtn = document.getElementById('quiz-toggle-btn');
  if (quizToggleBtn) {
    quizToggleBtn.textContent = 'BACA CATATAN';
    quizToggleBtn.href = `#/note/${encodeURIComponent(notePath)}`;
    quizToggleBtn.classList.remove('hidden');
  }

  // Start the actual quiz rendering
  startQuiz(notePath);
}

async function startQuiz(notePath) {
  if (notePath) {
    activeNotePath = notePath;
  }
  if (!activeNotePath) return;
  
  const noteViewer = document.getElementById('note-viewer-pane');
  const quizViewer = document.getElementById('quiz-viewer-pane');
  
  noteViewer.classList.add('hidden');
  quizViewer.classList.remove('hidden');
  
  document.getElementById('quiz-results-pane').classList.add('hidden');
  document.getElementById('quiz-body-section').classList.remove('hidden');

  try {
    const noteData = getNote(activeNotePath);
    activeQuiz = noteData ? noteData.quiz : [];
    
    let noteTitle = 'Materi';
    if (noteData) {
      noteTitle = noteData.title;
      
      // Populate outline nodes from pre-built HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = noteData.html;
      renderOutline(tempDiv);
      renderActiveTags(noteData.tags);
      renderBacklinks(noteData.backlinks);
    }
    
    document.getElementById('quiz-question-title').textContent = `Materi: ${noteTitle}`;

    currentQuestionIdx = 0;
    userScore = 0;
    renderQuestion();
  } catch (err) {
    console.error('Failed to start quiz:', err);
    document.getElementById('quiz-body-section').innerHTML = `<div class="error-msg" style="color:var(--accent-teal); font-weight:bold;">Gagal memuat kuis latihan soal.</div>`;
  }
}

function renderQuestion() {
  if (!activeQuiz || activeQuiz.length === 0) return;
  const q = activeQuiz[currentQuestionIdx];
  
  const progressPercent = (currentQuestionIdx / activeQuiz.length) * 100;
  document.getElementById('quiz-progress-bar').style.width = `${progressPercent}%`;
  document.getElementById('quiz-step-info').textContent = `Soal ${currentQuestionIdx + 1} dari ${activeQuiz.length}`;
  document.getElementById('quiz-question-text').innerHTML = q.question;
  
  const optionsContainer = document.getElementById('quiz-options-container');
  optionsContainer.innerHTML = '';
  
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-opt-btn';
    btn.innerHTML = opt;
    btn.addEventListener('click', () => handleOptionSelection(idx));
    optionsContainer.appendChild(btn);
  });
  
  document.getElementById('quiz-feedback-box').classList.add('hidden');
}

function handleOptionSelection(selectedIndex) {
  const q = activeQuiz[currentQuestionIdx];
  const optionsContainer = document.getElementById('quiz-options-container');
  const buttons = optionsContainer.querySelectorAll('.quiz-opt-btn');
  
  buttons.forEach(btn => btn.disabled = true);
  
  const feedbackBox = document.getElementById('quiz-feedback-box');
  const statusEl = document.getElementById('feedback-status');
  const explanationEl = document.getElementById('feedback-explanation');
  
  if (selectedIndex === q.answer) {
    userScore++;
    buttons[selectedIndex].classList.add('correct');
    statusEl.textContent = '✓ BENAR!';
    statusEl.className = 'feedback-status correct-text';
  } else {
    buttons[selectedIndex].classList.add('incorrect');
    buttons[q.answer].classList.add('correct'); 
    statusEl.textContent = '✗ SALAH';
    statusEl.className = 'feedback-status incorrect-text';
  }
  
  explanationEl.innerHTML = q.explanation;
  feedbackBox.classList.remove('hidden');
}

function nextQuestion() {
  currentQuestionIdx++;
  if (currentQuestionIdx < activeQuiz.length) {
    renderQuestion();
  } else {
    showQuizResults();
  }
}

function showQuizResults() {
  document.getElementById('quiz-body-section').classList.add('hidden');
  const resultsPane = document.getElementById('quiz-results-pane');
  resultsPane.classList.remove('hidden');
  
  document.getElementById('quiz-progress-bar').style.width = '100%';
  const scorePercent = Math.round((userScore / activeQuiz.length) * 100);
  document.getElementById('quiz-score-val').textContent = `${scorePercent}%`;
  
  const headingEl = document.getElementById('quiz-results-heading');
  const descEl = document.getElementById('quiz-results-desc');
  
  if (scorePercent === 100) {
    headingEl.textContent = 'LUAR BIASA! 🏆';
    descEl.textContent = `Anda berhasil menjawab seluruh (${userScore} dari ${activeQuiz.length}) soal dengan sempurna!`;
  } else if (scorePercent >= 75) {
    headingEl.textContent = 'BAGUS SEKALI! 👍';
    descEl.textContent = `Anda berhasil menjawab ${userScore} dari ${activeQuiz.length} soal dengan benar.`;
  } else {
    headingEl.textContent = 'TETAP SEMANGAT! 💪';
    descEl.textContent = `Anda menjawab ${userScore} dari ${activeQuiz.length} soal dengan benar. Ulangi kuis untuk memperdalam pemahaman.`;
  }
}

function restartQuiz() {
  startQuiz();
}

function showReadingView() {
  if (activeNotePath) {
    window.location.hash = `#/note/${encodeURIComponent(activeNotePath)}`;
  } else {
    window.location.hash = '#home';
  }
}

// Global Graph View Control Functions
function openGraphView() {
  const overlay = document.getElementById('graph-overlay');
  if (overlay && overlay.classList.contains('hidden')) {
    overlay.classList.remove('hidden');
    startGraphSimulation();
  }
}

function closeGraphView() {
  const overlay = document.getElementById('graph-overlay');
  if (overlay && !overlay.classList.contains('hidden')) {
    overlay.classList.add('hidden');
    stopGraphSimulation();
  }
}

// --- GRAPH VIEW SYSTEM (Teal Minimalist Theme) ---
function initGraphView() {
  const toggleBtn = document.getElementById('nav-graph-btn'); // Updated selector matching index.html
  const footerLink = document.getElementById('footer-graph-link');
  const closeBtn = document.getElementById('close-graph-btn');
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '#graph';
    });
  }

  if (footerLink) {
    footerLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '#graph';
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (window.location.hash === '#graph') {
        window.location.hash = '#home'; // Router automatically closes the overlay
      } else {
        closeGraphView();
      }
    });
  }
}

let canvas = null;
let ctx = null;
let simNodes = [];
let simLinks = [];
let animationFrameId = null;
let graphZoom = 1;
let graphPan = { x: 0, y: 0 };
let draggedNode = null;
let isDraggingCanvas = false;
let dragStart = { x: 0, y: 0 };
let particleTime = 0; 
let alpha = 1.0; 

async function startGraphSimulation() {
  canvas = document.getElementById('graph-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  try {
    const graphData = getGraph();
    const width = canvas.width;
    const height = canvas.height;
    
    alpha = 1.0; 
    
    simNodes = graphData.nodes.map(n => {
      const existing = simNodes.find(en => en.id === n.id);
      return {
        id: n.id,
        name: n.name,
        title: n.title,
        val: n.val,
        x: existing ? existing.x : width / 2 + (Math.random() - 0.5) * 300,
        y: existing ? existing.y : height / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0
      };
    });

    simLinks = graphData.links.map(l => {
      return {
        source: simNodes.find(n => n.id === l.source),
        target: simNodes.find(n => n.id === l.target)
      };
    }).filter(l => l.source && l.target);

    canvas.addEventListener('mousedown', handleGraphMouseDown);
    canvas.addEventListener('mousemove', handleGraphMouseMove);
    window.addEventListener('mouseup', handleGraphMouseUp);
    canvas.addEventListener('wheel', handleGraphWheel, { passive: false });

    document.getElementById('graph-zoom-in').onclick = () => graphZoom *= 1.2;
    document.getElementById('graph-zoom-out').onclick = () => graphZoom /= 1.2;
    document.getElementById('graph-reset').onclick = () => {
      graphZoom = 1;
      graphPan = { x: 0, y: 0 };
    };

    simTick();
  } catch (err) {
    console.error('Failed to load graph view:', err);
  }
}

function stopGraphSimulation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  window.removeEventListener('resize', resizeCanvas);
  if (canvas) {
    canvas.removeEventListener('mousedown', handleGraphMouseDown);
    canvas.removeEventListener('mousemove', handleGraphMouseMove);
    window.removeEventListener('mouseup', handleGraphMouseUp);
    canvas.removeEventListener('wheel', handleGraphWheel);
  }
}

function resizeCanvas() {
  if (canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
}

function simTick() {
  const K_repel = 350; 
  const K_attract = 0.04; 
  const K_gravity = 0.01; 
  const L_rest = 80; 
  const DAMPING = 0.8;

  if (draggedNode) {
    alpha = Math.max(alpha, 0.4);
  }

  if (alpha > 0.005) {
    for (let i = 0; i < simNodes.length; i++) {
      const nodeA = simNodes[i];
      for (let j = i + 1; j < simNodes.length; j++) {
        const nodeB = simNodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 0.1;
        
        if (dist < 300) {
          const force = K_repel / (dist * dist);
          const fx = (dx / dist) * force * alpha;
          const fy = (dy / dist) * force * alpha;
          nodeA.vx -= fx;
          nodeA.vy -= fy;
          nodeB.vx += fx;
          nodeB.vy += fy;
        }
      }
    }

    simLinks.forEach(link => {
      const source = link.source;
      const target = link.target;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 0.1;
      const force = K_attract * (dist - L_rest);
      const fx = (dx / dist) * force * alpha;
      const fy = (dy / dist) * force * alpha;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    simNodes.forEach(node => {
      if (node === draggedNode) {
        node.vx = 0;
        node.vy = 0;
        return;
      }
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      node.vx += dx * K_gravity * alpha;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
    });

    alpha *= 0.97;
  } else {
    simNodes.forEach(node => { node.vx = 0; node.vy = 0; });
  }

  particleTime += 0.004;
  drawGraph();
  animationFrameId = requestAnimationFrame(simTick);
}

function drawGraph() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(canvas.width / 2 + graphPan.x, canvas.height / 2 + graphPan.y);
  ctx.scale(graphZoom, graphZoom);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  
  // Minimalist Teal/Blue Colors
  const lineColor = isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)';
  const textCol = isDarkMode ? '#e2e8f0' : '#475569';
  const nodeDefaultColor = isDarkMode ? '#38bdf8' : '#0284c7';
  const activeColor = isDarkMode ? '#f472b6' : '#db2777'; // pink for active note
  const particleColor = isDarkMode ? '#f472b6' : '#db2777';

  // 1. Draw Links
  ctx.lineWidth = 1;
  ctx.strokeStyle = lineColor;
  simLinks.forEach(link => {
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();
  });

  // 2. Draw Moving Particles (plasma flow)
  ctx.fillStyle = particleColor;
  simLinks.forEach(link => {
    const phase = (particleTime + (link.source.x + link.source.y) * 0.0035) % 1.0;
    const px = link.source.x + (link.target.x - link.source.x) * phase;
    const py = link.source.y + (link.target.y - link.source.y) * phase;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, 2 * Math.PI);
    ctx.fill();
  });

  // 3. Draw Nodes
  simNodes.forEach(node => {
    const isNodeActive = node.id === activeNotePath;
    const size = 5 + Math.sqrt(node.val) * 1.8;
    
    // Active Node outer ring glow
    if (isNodeActive) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = activeColor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI);
      ctx.fillStyle = isDarkMode ? 'rgba(244, 114, 182, 0.2)' : 'rgba(219, 39, 119, 0.15)';
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = isNodeActive ? activeColor : nodeDefaultColor;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = isDarkMode ? '#0b0f19' : '#ffffff';
    ctx.stroke();

    // Node Label
    ctx.font = isNodeActive ? '600 10px Inter, sans-serif' : '500 9px Inter, sans-serif';
    ctx.fillStyle = textCol;
    ctx.textAlign = 'center';
    ctx.fillText(node.name, node.x, node.y + size + 12);
  });

  ctx.restore();
}

function getMouseCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  
  const worldX = (rawX - cx - graphPan.x) / graphZoom + cx;
  const worldY = (rawY - cy - graphPan.y) / graphZoom + cy;
  
  return { worldX, worldY, rawX, rawY };
}

function handleGraphMouseDown(e) {
  const coords = getMouseCoords(e);
  
  let clickedNode = null;
  for (let node of simNodes) {
    const size = 5 + Math.sqrt(node.val) * 1.8;
    const dx = coords.worldX - node.x;
    const dy = coords.worldY - node.y;
    if (dx*dx + dy*dy <= (size + 5) * (size + 5)) {
      clickedNode = node;
      break;
    }
  }

  if (clickedNode) {
    draggedNode = clickedNode;
    alpha = 0.5; 
  } else {
    isDraggingCanvas = true;
    dragStart = { x: e.clientX, y: e.clientY };
  }
}

function handleGraphMouseMove(e) {
  if (draggedNode) {
    const coords = getMouseCoords(e);
    draggedNode.x = coords.worldX;
    draggedNode.y = coords.worldY;
    draggedNode.vx = 0;
    draggedNode.vy = 0;
    alpha = Math.max(alpha, 0.45); 
  } else if (isDraggingCanvas) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    graphPan.x += dx;
    graphPan.y += dy;
    dragStart = { x: e.clientX, y: e.clientY };
  }
}

function handleGraphMouseUp(e) {
  if (draggedNode && e.target === canvas) {
    window.location.hash = `#/note/${encodeURIComponent(draggedNode.id)}`;
    document.getElementById('graph-overlay').classList.add('hidden');
    stopGraphSimulation();
  }
  draggedNode = null;
  isDraggingCanvas = false;
}

function handleGraphWheel(e) {
  e.preventDefault();
  const zoomFactor = 1.1;
  if (e.deltaY < 0) {
    graphZoom *= zoomFactor;
  } else {
    graphZoom /= zoomFactor;
  }
}

// --- NEW FUNCTIONALITIES FOR OBSIDIAN VIEW AND CREATION ---

function updateLayoutMode(hash) {
  const appContainer = document.querySelector('.app-container');
  if (!appContainer) return;
  
  const isReadingRoute = hash.startsWith('#/note/') || hash.startsWith('#/quiz/') || hash === '#/new-note';
  if (isReadingRoute) {
    appContainer.classList.add('reading-mode');
  } else {
    appContainer.classList.remove('reading-mode');
  }
}

function initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const appContainer = document.querySelector('.app-container');
  
  if (toggleBtn && appContainer) {
    toggleBtn.addEventListener('click', () => {
      appContainer.classList.toggle('sidebar-collapsed');
    });
  }
}

async function showNewNoteScreen() {
  activeNotePath = null;
  
  const mainContent = document.getElementById('main-content-panel');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  
  document.getElementById('home-grid-container').classList.add('hidden');
  document.getElementById('note-viewer-pane').classList.add('hidden');
  document.getElementById('note-skeleton-pane').classList.add('hidden');
  document.getElementById('quiz-viewer-pane').classList.add('hidden');
  
  const quizToggleBtn = document.getElementById('quiz-toggle-btn');
  if (quizToggleBtn) quizToggleBtn.classList.add('hidden');
  
  const breadcrumbsContainer = document.getElementById('breadcrumbs-bar-container');
  if (breadcrumbsContainer) {
    breadcrumbsContainer.classList.remove('hidden');
    document.getElementById('breadcrumbs-bar').innerHTML = '<span>TULIS CATATAN BARU</span>';
  }
  
  const editorPane = document.getElementById('note-editor-pane');
  editorPane.classList.remove('hidden');
  
  document.getElementById('editor-title-input').value = '';
  document.getElementById('editor-content-input').value = '';
  document.getElementById('editor-new-folder-input').value = '';
  
  const select = document.getElementById('editor-folder-select');
  select.innerHTML = '<option value="">(Root / Utama)</option>';
  
  try {
    const treeData = getTree();
    if (!treeData) return;
    
    const folders = [];
    function extractFolders(node) {
      if (node.isDir) {
        if (node.path) folders.push(node.path);
        if (node.children) node.children.forEach(extractFolders);
      }
    }
    extractFolders(treeData);
    
    const uniqueFolders = [...new Set(folders)].sort();
    uniqueFolders.forEach(folder => {
      const opt = document.createElement('option');
      opt.value = folder;
      opt.textContent = folder;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load folders for editor:', err);
  }
}

function initEditorEvents() {
  const saveBtn = document.getElementById('editor-save-btn');
  const cancelBtn = document.getElementById('editor-cancel-btn');
  const newNoteBtn = document.getElementById('new-note-btn');
  
  if (newNoteBtn) {
    newNoteBtn.addEventListener('click', () => {
      window.location.hash = '#/new-note';
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      window.location.hash = '#home';
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('editor-title-input').value.trim();
      const folderSelect = document.getElementById('editor-folder-select').value;
      const newFolder = document.getElementById('editor-new-folder-input').value.trim();
      const content = document.getElementById('editor-content-input').value;
      
      if (!title) {
        alert('Judul catatan tidak boleh kosong.');
        return;
      }
      
      const folder = newFolder || folderSelect;
      
      // Fitur pembuatan catatan tidak tersedia di versi hosting statis.
      alert('⚠️ Fitur ini tidak tersedia di versi web statis.\n\nGunakan aplikasi Obsidian di perangkat lokal Anda untuk membuat catatan baru.\n\nSetelah membuat catatan, jalankan perintah "npm run build" lalu push ke GitHub — catatan baru akan otomatis muncul setelah Netlify selesai melakukan deploy.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'SIMPAN CATATAN';
      // Stub: prevent dead code
      if (false) {
      }
    });
  }
}

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_DIR = path.resolve(__dirname, '../Obsidian');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// MIME Types for Static File Server
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// In-memory indexes
let notesIndex = {}; // maps relativePath -> note details
let noteNameMap = {}; // maps lowercase noteName -> relativePath
let tagMap = {}; // maps tag -> array of relativePaths
let directoryTree = {}; // hierarchical folder tree

// Excluded folders from scan
const EXCLUDED_FOLDERS = [
  '.obsidian',
  '_archive',
  '_assets',
  '_skills',
  '_src',
  '_trash',
  'copilot-custom-prompts',
  'node_modules',
  'obsidian-viewer'
];

// --- PURE JS MARKDOWN PARSER ---
function parseMarkdown(md) {
  // 1. Code blocks: ```lang ... ``` - protect these first
  const codeBlocks = [];
  let html = md.replace(/```(\w*)\r?\n([\s\S]*?)\r?\n```/g, (match, lang, code) => {
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code class="language-${lang}">${escapedCode.trim()}</code></pre>`);
    return placeholder;
  });

  // 2. Inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 3. Headings: # Header
  html = html.replace(/^#{4}\s+(.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#{3}\s+(.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#{2}\s+(.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.*?)$/gm, '<h1>$1</h1>');

  // 4. Blockquotes: > quote
  html = html.replace(/^>\s?(.*?)$/gm, '<blockquote>$1</blockquote>');

  // 5. Bullet Lists: - item or * item (Obsidian uses *   with multiple spaces too)
  html = html.replace(/^[\-\*]\s+(.*?)$/gm, '<li>$1</li>');
  
  // Group consecutive <li> items into a single <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\s*<li>[\s\S]*?<\/li>)*/g, (match) => `<ul>${match}</ul>`);

  // 6. Bold & Italic (order matters: bold first)
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // 7. Horizontal rules
  html = html.replace(/^[-*]{3,}$/gm, '<hr>');

  // 8. Paragraph blocks: group text separated by blank lines
  const blocks = html.split(/\r?\n\r?\n/);
  html = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    // Already a block-level HTML element — return as-is
    if (/^<(h[1-6]|ul|li|pre|blockquote|hr|div|table)/.test(trimmed) || /^@@CODEBLOCK/.test(trimmed)) {
      return trimmed;
    }
    // Convert single newlines within a paragraph block to <br>
    const withBreaks = trimmed.replace(/\r?\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  }).filter(Boolean).join('\n');

  // 9. Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`@@CODEBLOCK${i}@@`, block);
  });

  return html;
}

// Custom Frontmatter and WikiLink Parser
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);
  
  let metadata = {};
  let body = content;
  
  if (match) {
    const yamlBlock = match[1];
    body = content.substring(match[0].length);
    
    const lines = yamlBlock.split('\n');
    lines.forEach(line => {
      const index = line.indexOf(':');
      if (index !== -1) {
        const key = line.substring(0, index).trim();
        const value = line.substring(index + 1).trim();
        const cleanedValue = value.replace(/^["']|["']$/g, '');
        
        if (cleanedValue.startsWith('[') && cleanedValue.endsWith(']')) {
          metadata[key] = cleanedValue.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        } else if (key === 'tags') {
          metadata[key] = cleanedValue.split(/\s+/).map(t => t.trim().replace('#', '')).filter(Boolean);
        } else {
          metadata[key] = cleanedValue;
        }
      }
    });
  }
  
  return { metadata, body };
}

// Extract tags from body text (#tag)
function extractBodyTags(body) {
  const tagRegex = /(?<!\w)#([a-zA-Z0-9_\-/]+)/g;
  const tags = [];
  let match;
  while ((match = tagRegex.exec(body)) !== null) {
    const tag = match[1];
    if (isNaN(tag) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

// Extract internal wiki links from body
function extractWikiLinks(body) {
  const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links = [];
  let match;
  while ((match = linkRegex.exec(body)) !== null) {
    const target = match[1].trim();
    const hashIdx = target.indexOf('#');
    const noteName = hashIdx !== -1 ? target.substring(0, hashIdx).trim() : target;
    if (noteName && !links.includes(noteName)) {
      links.push(noteName);
    }
  }
  return links;
}

// Resolve note name to relative path
function resolveNotePath(targetName) {
  return noteNameMap[targetName.toLowerCase()];
}

// Preprocess body to convert wiki links into HTML anchors
function parseWikiLinksToHTML(body) {
  return body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
    const hashIdx = target.indexOf('#');
    const noteName = hashIdx !== -1 ? target.substring(0, hashIdx).trim() : target.trim();
    const anchor = hashIdx !== -1 ? target.substring(hashIdx).trim() : '';
    const display = alias ? alias.trim() : target.trim();
    
    const resolvedPath = resolveNotePath(noteName);
    if (resolvedPath) {
      return `<a class="internal-link" data-note-path="${resolvedPath}" href="#/note/${encodeURIComponent(resolvedPath)}${anchor}">${display}</a>`;
    } else {
      return `<span class="unresolved-link" title="Catatan tidak ditemukan">${display}</span>`;
    }
  });
}

// Recursively walk directory and build index
function walkDirectory(dir, relativeDir = '') {
  const items = fs.readdirSync(dir);
  const node = {
    name: relativeDir ? path.basename(relativeDir) : 'Obsidian',
    path: relativeDir,
    isDir: true,
    children: []
  };

  items.forEach(item => {
    if (EXCLUDED_FOLDERS.includes(item)) return;

    const fullPath = path.join(dir, item);
    const relPath = relativeDir ? `${relativeDir}/${item}` : item;
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const childNode = walkDirectory(fullPath, relPath);
      if (childNode.children.length > 0) {
        node.children.push(childNode);
      }
    } else if (item.endsWith('.md')) {
      const noteName = path.basename(item, '.md');
      node.children.push({
        name: noteName,
        path: relPath,
        isDir: false
      });

      const rawContent = fs.readFileSync(fullPath, 'utf8');
      const { metadata, body } = parseFrontmatter(rawContent);
      
      const title = metadata.title || noteName;
      const yamlTags = metadata.tags || [];
      const bodyTags = extractBodyTags(body);
      const allTags = [...new Set([...yamlTags, ...bodyTags])];
      const links = extractWikiLinks(body);

      notesIndex[relPath] = {
        title,
        name: noteName,
        path: relPath,
        raw: rawContent,
        body,
        metadata,
        tags: allTags,
        links,
        backlinks: []
      };

      noteNameMap[noteName.toLowerCase()] = relPath;
    }
  });

  node.children.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  return node;
}

// Build final index and update backlinks + tags
function rebuildIndex() {
  console.log('Building Obsidian notes index...');
  notesIndex = {};
  noteNameMap = {};
  tagMap = {};
  
  try {
    directoryTree = walkDirectory(VAULT_DIR);
  } catch (err) {
    console.error('Error walking directory:', err);
    return;
  }

  Object.keys(notesIndex).forEach(sourcePath => {
    const note = notesIndex[sourcePath];
    note.links.forEach(targetName => {
      const targetPath = resolveNotePath(targetName);
      if (targetPath && targetPath !== sourcePath) {
        const targetNote = notesIndex[targetPath];
        if (targetNote) {
          const alreadyLinked = targetNote.backlinks.some(bl => bl.path === sourcePath);
          if (!alreadyLinked) {
            targetNote.backlinks.push({
              name: note.name,
              title: note.title,
              path: sourcePath
            });
          }
        }
      }
    });

    note.tags.forEach(tag => {
      const lowerTag = tag.toLowerCase();
      if (!tagMap[lowerTag]) {
        tagMap[lowerTag] = [];
      }
      if (!tagMap[lowerTag].includes(sourcePath)) {
        tagMap[lowerTag].push(sourcePath);
      }
    });
  });

  console.log(`Index built successfully: ${Object.keys(notesIndex).length} notes, ${Object.keys(tagMap).length} tags.`);
}

// Watch directory for changes
let watchTimeout;
fs.watch(VAULT_DIR, { recursive: true }, (eventType, filename) => {
  if (filename) {
    const parts = filename.split(path.sep);
    if (parts.some(p => EXCLUDED_FOLDERS.includes(p))) return;
    
    clearTimeout(watchTimeout);
    watchTimeout = setTimeout(() => {
      console.log(`File change detected: ${filename}. Rebuilding index...`);
      rebuildIndex();
    }, 1000);
  }
});

// --- DYNAMIC QUIZ GENERATOR ---
function extractConcepts(body) {
  const concepts = [];
  // Matches **Concept** followed by colon, en-dash, em-dash, or hyphen, then a definition
  const regex = /\*\*([^*:\n]{2,40})\*\*(?:\s*:\s*|\s*—\s*|\s*–\s*|\s*-\s*)([^\r\n]{10,250})/g;
  let match;
  
  while ((match = regex.exec(body)) !== null) {
    const term = match[1].trim();
    let definition = match[2].trim();
    
    // Truncate at first dot if it's reasonably long
    const dotIndex = definition.indexOf('.');
    if (dotIndex !== -1 && dotIndex > 25) {
      definition = definition.substring(0, dotIndex + 1);
    }
    
    if (term && definition && !concepts.some(c => c.term.toLowerCase() === term.toLowerCase())) {
      concepts.push({ term, definition });
    }
  }
  return concepts;
}

function generateQuizFromMarkdown(body, noteTitle) {
  const concepts = extractConcepts(body);
  const quiz = [];
  
  if (concepts.length >= 3) {
    concepts.forEach((concept) => {
      const questionText = `Berdasarkan catatan "${noteTitle}", manakah definisi yang paling tepat untuk konsep "**${concept.term}**"?`;
      const correctAnswer = concept.definition;
      
      const otherConcepts = concepts.filter(c => c.term !== concept.term);
      const shuffledOthers = otherConcepts.sort(() => 0.5 - Math.random());
      const distractors = shuffledOthers.slice(0, 3).map(c => c.definition);
      
      while (distractors.length < 3) {
        distractors.push(`Sebuah karakteristik pendukung yang berkaitan dengan struktur utama dari ${noteTitle}.`);
        distractors.push(`Aspek teoritis tambahan yang dibahas secara sekilas di dalam dokumen.`);
      }
      
      const options = [correctAnswer, ...distractors].sort(() => 0.5 - Math.random());
      const correctIndex = options.indexOf(correctAnswer);
      
      quiz.push({
        type: 'multiple-choice',
        question: questionText,
        options: options,
        answer: correctIndex,
        explanation: `Dalam materi, **${concept.term}** dijelaskan sebagai: "${concept.definition}"`
      });
    });
  }
  
  // Try to generate subheading questions if we need more
  if (quiz.length < 5) {
    const headingRegex = /^##\s+(.*?)$/gm;
    let match;
    const headings = [];
    while ((match = headingRegex.exec(body)) !== null) {
      const h = match[1].replace(/\[\[|\]\]/g, '').trim(); // clean wikilinks in headings
      if (h && !headings.includes(h)) headings.push(h);
    }
    
    if (headings.length >= 2) {
      headings.forEach(heading => {
        const questionText = `Sub-materi atau bahasan manakah di bawah ini yang dibahas secara eksplisit di dalam catatan "${noteTitle}"?`;
        const correctAnswer = heading;
        
        const distractors = [
          "Analisis metodologis kuantitatif berbasis statistik deskriptif modern.",
          "Daftar pustaka eksternal yang diarsipkan secara independen oleh kontributor.",
          "Implementasi arsitektur database terdistribusi untuk pengolahan data.",
          "Sejarah perkembangan teknologi telekomunikasi seluler generasi pertama."
        ].filter(d => d !== heading).sort(() => 0.5 - Math.random()).slice(0, 3);
        
        const options = [correctAnswer, ...distractors].sort(() => 0.5 - Math.random());
        const correctIndex = options.indexOf(correctAnswer);
        
        quiz.push({
          type: 'multiple-choice',
          question: questionText,
          options: options,
          answer: correctIndex,
          explanation: `Dalam catatan "${noteTitle}", sub-bagian "${heading}" dibahas secara detail.`
        });
      });
    }
  }

  // Fallback if no specific questions could be generated
  if (quiz.length === 0) {
    quiz.push({
      type: 'multiple-choice',
      question: `Apakah topik utama yang dibahas di dalam materi "${noteTitle}"?`,
      options: [
        `Kajian komprehensif mengenai konsep ${noteTitle} dan implikasinya secara teoritis.`,
        `Kritik sejarah terhadap metodologi penelitian ${noteTitle}.`,
        `Perbandingan matematika murni terhadap struktur ${noteTitle}.`,
        `Daftar pustaka eksternal untuk melengkapi data ${noteTitle}.`
      ],
      answer: 0,
      explanation: `Catatan ini berfokus pada pembahasan utama mengenai ${noteTitle}.`
    });
    
    quiz.push({
      type: 'multiple-choice',
      question: `Manakah dari pernyataan berikut yang BENAR mengenai isi catatan "${noteTitle}"?`,
      options: [
        `Dokumen ini dirancang sebagai panduan materi terstruktur untuk dipelajari.`,
        `Dokumen ini ditulis sepenuhnya dalam bahasa pemrograman kuno.`,
        `Dokumen ini hanya berisi gambar tanpa penjelasan tekstual.`,
        `Dokumen ini menolak semua bentuk argumentasi rasional.`
      ],
      answer: 0,
      explanation: `Materi "${noteTitle}" menyajikan informasi akademis dan ringkasan catatan untuk dipelajari secara mendalam.`
    });
  }
  
  return quiz.sort(() => 0.5 - Math.random()).slice(0, 5);
}

// Initial build
rebuildIndex();

// --- HTTP SERVER HANDLER ---
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. API Endpoint Router
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // POST /api/notes/create
    if (req.method === 'POST' && pathname === '/api/notes/create') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const { title, folder, content } = payload;
          
          if (!title || typeof title !== 'string' || !title.trim()) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Judul catatan tidak boleh kosong.' }));
          }

          const cleanTitle = title.trim();
          if (/[\\/:*?"<>|]/.test(cleanTitle)) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Judul tidak boleh mengandung karakter khusus seperti \\ / : * ? " < > |' }));
          }

          let cleanFolder = '';
          if (folder && typeof folder === 'string') {
            cleanFolder = folder.trim().replace(/\\/g, '/');
            // Prevent directory traversal
            if (cleanFolder.includes('..') || cleanFolder.startsWith('/') || cleanFolder.startsWith('.')) {
              res.writeHead(400);
              return res.end(JSON.stringify({ error: 'Folder tidak valid.' }));
            }
          }

          const targetDir = cleanFolder ? path.join(VAULT_DIR, cleanFolder) : VAULT_DIR;
          const targetPath = path.join(targetDir, `${cleanTitle}.md`);

          // Security check
          if (!targetPath.startsWith(VAULT_DIR)) {
            res.writeHead(403);
            return res.end(JSON.stringify({ error: 'Akses ditolak.' }));
          }

          if (fs.existsSync(targetPath)) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Catatan dengan judul tersebut sudah ada.' }));
          }

          fs.mkdirSync(targetDir, { recursive: true });
          fs.writeFileSync(targetPath, content || '', 'utf8');

          console.log(`Created new note: ${targetPath}`);
          rebuildIndex();

          const relPath = path.relative(VAULT_DIR, targetPath).replace(/\\/g, '/');
          res.writeHead(200);
          return res.end(JSON.stringify({ success: true, path: relPath }));
        } catch (err) {
          console.error('Error creating note:', err);
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'Gagal membuat catatan: ' + err.message }));
        }
      });
      return;
    }

    // GET /api/notes
    if (pathname === '/api/notes') {
      res.writeHead(200);
      return res.end(JSON.stringify(directoryTree));
    }

    // GET /api/notes/all
    if (pathname === '/api/notes/all') {
      const list = Object.keys(notesIndex).map(relPath => {
        const note = notesIndex[relPath];
        let snippet = note.body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (snippet.length > 140) snippet = snippet.substring(0, 137) + '...';
        return {
          title: note.title,
          name: note.name,
          path: relPath,
          tags: note.tags,
          snippet: snippet
        };
      });
      res.writeHead(200);
      return res.end(JSON.stringify(list));
    }

    // GET /api/notes/content?path=path
    if (pathname === '/api/notes/content') {
      const relPath = parsedUrl.searchParams.get('path');
      if (!relPath) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Path parameter is required' }));
      }

      const note = notesIndex[relPath];
      if (!note) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Note not found' }));
      }

      const processedBody = parseWikiLinksToHTML(note.body);
      const htmlContent = parseMarkdown(processedBody);

      res.writeHead(200);
      return res.end(JSON.stringify({
        title: note.title,
        name: note.name,
        path: note.path,
        metadata: note.metadata,
        tags: note.tags,
        backlinks: note.backlinks,
        html: htmlContent,
        raw: note.raw
      }));
    }

    // GET /api/search?q=query
    if (pathname === '/api/search') {
      const query = parsedUrl.searchParams.get('q');
      if (!query) {
        res.writeHead(200);
        return res.end(JSON.stringify([]));
      }

      const lowerQuery = query.toLowerCase();
      const results = [];

      Object.keys(notesIndex).forEach(relPath => {
        const note = notesIndex[relPath];
        const inTitle = note.title.toLowerCase().includes(lowerQuery);
        const inBody = note.body.toLowerCase().includes(lowerQuery);

        if (inTitle || inBody) {
          let snippet = '';
          if (inBody) {
            const index = note.body.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, index - 40);
            const end = Math.min(note.body.length, index + lowerQuery.length + 60);
            snippet = note.body.substring(start, end).replace(/\r?\n/g, ' ');
            if (start > 0) snippet = '...' + snippet;
            if (end < note.body.length) snippet = snippet + '...';
          } else {
            snippet = note.body.substring(0, 100).replace(/\r?\n/g, ' ') + '...';
          }

          results.push({
            title: note.title,
            name: note.name,
            path: relPath,
            snippet,
            score: inTitle ? 10 : 1
          });
        }
      });

      results.sort((a, b) => b.score - a.score);
      res.writeHead(200);
      return res.end(JSON.stringify(results));
    }

    // GET /api/tags
    if (pathname === '/api/tags') {
      const tags = {};
      Object.keys(tagMap).forEach(tag => {
        tags[tag] = tagMap[tag].map(relPath => ({
          title: notesIndex[relPath].title,
          path: relPath
        }));
      });
      res.writeHead(200);
      return res.end(JSON.stringify(tags));
    }

    // GET /api/graph
    if (pathname === '/api/graph') {
      const nodes = [];
      const links = [];

      Object.keys(notesIndex).forEach(relPath => {
        const note = notesIndex[relPath];
        nodes.push({
          id: relPath,
          name: note.name,
          title: note.title,
          val: 1 + note.backlinks.length
        });

        note.links.forEach(targetName => {
          const targetPath = resolveNotePath(targetName);
          if (targetPath && targetPath !== relPath) {
            links.push({
              source: relPath,
              target: targetPath
            });
          }
        });
      });

      res.writeHead(200);
      return res.end(JSON.stringify({ nodes, links }));
    }

    // GET /api/notes/quiz?path=path
    if (pathname === '/api/notes/quiz') {
      const relPath = parsedUrl.searchParams.get('path');
      if (!relPath) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Path parameter is required' }));
      }

      const note = notesIndex[relPath];
      if (!note) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Note not found' }));
      }

      const quiz = generateQuizFromMarkdown(note.body, note.title);
      res.writeHead(200);
      return res.end(JSON.stringify(quiz));
    }

    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }

  // 2. Static File serving
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security: check if file is inside public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Obsidian Web Viewer (Zero-Dependency) running on http://localhost:${PORT}`);
});

/**
 * build.js — Obsidian Viewer Static Site Build Script
 * 
 * Berjalan secara lokal atau di CI/CD Netlify.
 * Memindai folder catatan Obsidian, membangun indeks lengkap, dan menghasilkan
 * berkas `public/data.json` yang dikonsumsi oleh frontend secara statis.
 * 
 * Strategi pencarian vault:
 *   1. ../Obsidian   (struktur repo lokal: vault dan obsidian-viewer bersanding)
 *   2. ./Obsidian    (struktur repo GitHub: vault diunggah sebagai subfolder)
 *   3. ./vault       (alias alternatif)
 * 
 * Jika vault tidak ditemukan tetapi public/data.json sudah ada (dari build lokal),
 * script selesai secara anggun — deployment Netlify tetap berhasil.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- KONFIGURASI ---
const PUBLIC_DIR = path.join(__dirname, 'public');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'data.js');  // Script tag — works on file:// too

// Cari vault: lokal-first, lalu bundled ke repo
const VAULT_CANDIDATES = [
  path.resolve(__dirname, '../Obsidian'),
  path.resolve(__dirname, './Obsidian'),
  path.resolve(__dirname, './vault'),
];

const EXCLUDED_FOLDERS = [
  '.obsidian',
  '_archive',
  '_assets',
  '_skills',
  '_src',
  '_trash',
  'copilot-custom-prompts',
  'node_modules',
  'obsidian-viewer',
];

// --- IN-MEMORY INDEXES ---
let notesIndex = {};   // relativePath → note details
let noteNameMap = {};  // lowercase name → relativePath
let tagMap = {};       // tag → [relativePath]

// ========================================================================
// MARKDOWN & FRONTMATTER PARSERS (direplikasi dari server.js)
// ========================================================================

function parseMarkdown(md) {
  // 1. Lindungi code blocks terlebih dahulu
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

  // 2. Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 3. Headings
  html = html.replace(/^#{4}\s+(.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#{3}\s+(.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#{2}\s+(.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.*?)$/gm, '<h1>$1</h1>');

  // 4. Blockquotes
  html = html.replace(/^>\s?(.*?)$/gm, '<blockquote>$1</blockquote>');

  // 5. Bullet lists
  html = html.replace(/^[\-\*]\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\s*<li>[\s\S]*?<\/li>)*/g, (match) => `<ul>${match}</ul>`);

  // 6. Bold & Italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // 7. Horizontal rules
  html = html.replace(/^[-*]{3,}$/gm, '<hr>');

  // 8. Paragraphs
  const blocks = html.split(/\r?\n\r?\n/);
  html = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|li|pre|blockquote|hr|div|table)/.test(trimmed) || /^@@CODEBLOCK/.test(trimmed)) {
      return trimmed;
    }
    const withBreaks = trimmed.replace(/\r?\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  }).filter(Boolean).join('\n');

  // 9. Kembalikan code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`@@CODEBLOCK${i}@@`, block);
  });

  return html;
}

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

function resolveNotePath(targetName) {
  return noteNameMap[targetName.toLowerCase()];
}

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

// ========================================================================
// QUIZ GENERATOR (direplikasi dari server.js)
// ========================================================================

function extractConcepts(body) {
  const concepts = [];
  const regex = /\*\*([^*:\n]{2,40})\*\*(?:\s*:\s*|\s*—\s*|\s*–\s*|\s*-\s*)([^\r\n]{10,250})/g;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const term = match[1].trim();
    let definition = match[2].trim();

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

  if (quiz.length < 5) {
    const headingRegex = /^##\s+(.*?)$/gm;
    let match;
    const headings = [];
    while ((match = headingRegex.exec(body)) !== null) {
      const h = match[1].replace(/\[\[|\]\]/g, '').trim();
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

// ========================================================================
// DIRECTORY WALKER
// ========================================================================

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

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      return; // skip inaccessible files
    }

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

// ========================================================================
// INDEX BUILDER
// ========================================================================

function buildIndex(vaultDir) {
  console.log(`📂 Memindai vault: ${vaultDir}`);
  notesIndex = {};
  noteNameMap = {};
  tagMap = {};

  const tree = walkDirectory(vaultDir);

  // Bangun backlinks dan tagMap
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
      if (!tagMap[lowerTag]) tagMap[lowerTag] = [];
      if (!tagMap[lowerTag].includes(sourcePath)) {
        tagMap[lowerTag].push(sourcePath);
      }
    });
  });

  return tree;
}

// ========================================================================
// DATA SERIALIZER — menyiapkan seluruh data untuk public/data.json
// ========================================================================

function buildOutput(tree) {
  // notes: map relativePath → note object (tanpa field 'body' mentah; simpan sebagai 'raw' untuk raw view)
  // Tambahkan: html, snippet, quiz
  const notes = {};

  Object.keys(notesIndex).forEach(relPath => {
    const note = notesIndex[relPath];
    const processedBody = parseWikiLinksToHTML(note.body);
    const htmlContent = parseMarkdown(processedBody);

    let snippet = note.body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (snippet.length > 140) snippet = snippet.substring(0, 137) + '...';

    const quiz = generateQuizFromMarkdown(note.body, note.title);

    notes[relPath] = {
      title: note.title,
      name: note.name,
      path: note.path,
      metadata: note.metadata,
      tags: note.tags,
      backlinks: note.backlinks,
      links: note.links,
      snippet,
      html: htmlContent,
      raw: note.raw,
      quiz,
    };
  });

  // tags: map tag → [{ title, path }]
  const tags = {};
  Object.keys(tagMap).forEach(tag => {
    tags[tag] = tagMap[tag].map(relPath => ({
      title: notesIndex[relPath].title,
      path: relPath
    }));
  });

  // graph: { nodes, links }
  const graphNodes = [];
  const graphLinks = [];
  Object.keys(notesIndex).forEach(relPath => {
    const note = notesIndex[relPath];
    graphNodes.push({
      id: relPath,
      name: note.name,
      title: note.title,
      val: 1 + note.backlinks.length
    });

    note.links.forEach(targetName => {
      const targetPath = resolveNotePath(targetName);
      if (targetPath && targetPath !== relPath) {
        graphLinks.push({ source: relPath, target: targetPath });
      }
    });
  });

  return {
    buildTime: new Date().toISOString(),
    tree,
    notes,
    tags,
    graph: { nodes: graphNodes, links: graphLinks }
  };
}

// ========================================================================
// MAIN
// ========================================================================

function main() {
  console.log('🔨 Obsidian Viewer — Build Script');

  // Cari vault
  let vaultDir = null;
  for (const candidate of VAULT_CANDIDATES) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      vaultDir = candidate;
      break;
    }
  }

  if (!vaultDir) {
    // Tidak ada vault, tapi kalau data.json sudah ada dari build lokal, lanjutkan saja
    if (fs.existsSync(OUTPUT_FILE)) {
      console.log('⚠️  Folder vault tidak ditemukan, tetapi public/data.json sudah ada.');
      console.log('✅ Deployment dapat dilanjutkan menggunakan data.json yang sudah tersedia.');
      process.exit(0);
    } else {
      console.error('❌ Folder vault tidak ditemukan dan public/data.json belum ada.');
      console.error('   Lokasi yang dicari:');
      VAULT_CANDIDATES.forEach(c => console.error(`   - ${c}`));
      console.error('\n   Solusi:');
      console.error('   1. Jalankan npm run build secara lokal, lalu commit public/data.json ke GitHub.');
      console.error('   2. ATAU salin folder Obsidian Anda ke dalam repo di salah satu lokasi di atas.');
      process.exit(1);
    }
  }

  // Bangun indeks
  const tree = buildIndex(vaultDir);

  // Serialisasi ke JSON
  const output = buildOutput(tree);

  const noteCount = Object.keys(output.notes).length;
  const tagCount = Object.keys(output.tags).length;
  const graphNodeCount = output.graph.nodes.length;
  const graphLinkCount = output.graph.links.length;

  // Pastikan folder public ada
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // Tulis sebagai file JavaScript (bukan JSON)
  // Keuntungan: bekerja via <script src="data.js"> tanpa fetch,
  // sehingga kompatibel dengan file:// protocol dan Netlify hosting
  const jsContent = `window.vaultData = ${JSON.stringify(output)};\n`;
  fs.writeFileSync(OUTPUT_FILE, jsContent, 'utf8');

  const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

  console.log('');
  console.log('✅ Build berhasil!');
  console.log(`   📝 Catatan  : ${noteCount}`);
  console.log(`   🏷️  Tag      : ${tagCount}`);
  console.log(`   🔗 Graf     : ${graphNodeCount} node, ${graphLinkCount} link`);
  console.log(`   📦 Output   : public/data.js (${sizeKB} KB)`);
  console.log('');
}

main();

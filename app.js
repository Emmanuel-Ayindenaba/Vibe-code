pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// Current user context (id, name, isGuest, isAdmin) comes from userContext.js's
// getCurrentUserContext(), shared with side.js and the profile/invoices pages.

// ---------- State ----------
let sourceCanvas = null;     // offscreen canvas holding the original invoice at full resolution
let stamps = [];             // { id, x, y, start, interval, pad, prefix, suffix, fontSize, color, circle }
let selectedId = null;
let dragging = false;
let generated = [];          // { blob, filename, url, previewDataUrl }
let nextStampNum = 1;
let sourceFileName = null;   // original invoice file name, used for history labels

const PALETTE = ['#a32f2f', '#2f5aa3', '#3f8f5f', '#a3752f', '#7a3fa3', '#2f9ba3'];

// ---------- DOM ----------
const baseCanvas = document.getElementById('baseCanvas');
const ctx = baseCanvas.getContext('2d');
const stage = document.getElementById('stage');
const emptyState = document.getElementById('emptyState');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const fileMeta = document.getElementById('fileMeta');
const stampsSection = document.getElementById('stampsSection');
const outputSection = document.getElementById('outputSection');
const stampList = document.getElementById('stampList');
const addStampBtn = document.getElementById('addStampBtn');
const strip = document.getElementById('strip');
const thumbs = document.getElementById('thumbs');

const countNumEl = document.getElementById('countNum');
const formatSelect = document.getElementById('formatSelect');

// ---------- File loading ----------
dropzone.addEventListener('click', () => fileInput.click());
['dragover', 'dragenter'].forEach(evt => {
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag'); });
});
['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
});
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f);
});

function loadFile(file) {
  fileMeta.textContent = 'Loading ' + file.name + '…';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    file.arrayBuffer()
      .then(buf => pdfjsLib.getDocument({ data: buf }).promise)
      .then(pdf => pdf.getPage(1))
      .then(page => {
        const viewport = page.getViewport({ scale: 2.5 });
        const off = document.createElement('canvas');
        off.width = viewport.width;
        off.height = viewport.height;
        const offCtx = off.getContext('2d');
        return page.render({ canvasContext: offCtx, viewport }).promise.then(() => off);
      })
      .then(off => onSourceReady(off, file.name))
      .catch(err => { fileMeta.textContent = 'Could not open that PDF: ' + err.message; });
  } else {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      off.getContext('2d').drawImage(img, 0, 0);
      onSourceReady(off, file.name);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => { fileMeta.textContent = 'Could not open that image.'; };
    img.src = URL.createObjectURL(file);
  }
}

function onSourceReady(canvas, name) {
  sourceCanvas = canvas;
  sourceFileName = name;
  baseCanvas.width = canvas.width;
  baseCanvas.height = canvas.height;
  fileMeta.textContent = name + ' — ' + canvas.width + '×' + canvas.height;

  emptyState.style.display = 'none';
  stage.hidden = false;
  stampsSection.hidden = false;
  outputSection.hidden = false;
  strip.classList.remove('visible');
  generated = [];

  stamps = [];
  nextStampNum = 1;
  addStamp(canvas.width * 0.78, canvas.height * 0.85);
}

// ---------- Stamp model ----------
function addStamp(x, y) {
  const id = 's' + (nextStampNum++);
  const color = PALETTE[(stamps.length) % PALETTE.length];
  const s = {
    id,
    x: x ?? (sourceCanvas.width * 0.5),
    y: y ?? (sourceCanvas.height * 0.5),
    start: 1,
    interval: 1,
    pad: 4,
    prefix: 'INV-',
    suffix: '',
    fontSize: Math.round(sourceCanvas.height * 0.035) || 40,
    color,
    circle: true
  };
  stamps.push(s);
  selectedId = id;
  renderStampList();
  redraw();
}

function getStamp(id) { return stamps.find(s => s.id === id); }

function formatNumber(n, s) {
  return s.prefix + String(n).padStart(s.pad, '0') + s.suffix;
}

addStampBtn.addEventListener('click', () => {
  if (!sourceCanvas) return;
  const offsetIndex = stamps.length;
  addStamp(
    Math.min(sourceCanvas.width * 0.78 + offsetIndex * 30, sourceCanvas.width - 40),
    Math.min(sourceCanvas.height * 0.85, sourceCanvas.height - 40)
  );
});

// ---------- Stamp list UI ----------
function renderStampList() {
  stampList.innerHTML = '';
  stamps.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'stampcard' + (s.id === selectedId ? ' selected' : '');

    const head = document.createElement('div');
    head.className = 'stampcard-head';
    head.addEventListener('click', () => { selectedId = s.id; renderStampList(); redraw(); });

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = s.color;

    const title = document.createElement('div');
    title.className = 'stampcard-title';
    title.textContent = 'Stamp ' + (idx + 1);

    const del = document.createElement('button');
    del.className = 'stampcard-delete';
    del.textContent = '✕';
    del.title = 'Remove this stamp';
    del.addEventListener('click', e => {
      e.stopPropagation();
      stamps = stamps.filter(x => x.id !== s.id);
      if (selectedId === s.id) selectedId = stamps.length ? stamps[0].id : null;
      renderStampList();
      redraw();
    });

    head.appendChild(swatch);
    head.appendChild(title);
    head.appendChild(del);

    const preview = document.createElement('div');
    preview.className = 'stampcard-preview';
    preview.textContent = 'e.g. ' + formatNumber(s.start, s) + ', ' + formatNumber(s.start + s.interval, s) + ', ' + formatNumber(s.start + s.interval * 2, s) + ' …';

    card.appendChild(head);
    card.appendChild(preview);

    if (s.id === selectedId) {
      card.appendChild(buildStampBody(s));
    }

    stampList.appendChild(card);
  });
}

function buildStampBody(s) {
  const body = document.createElement('div');
  body.className = 'stampcard-body';

  function fieldNumber(label, key, min, extra) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = s[key];
    if (min !== undefined) inp.min = min;
    inp.addEventListener('input', () => {
      s[key] = parseInt(inp.value, 10) || 0;
      renderStampList();
      redraw();
    });
    wrap.appendChild(lab);
    wrap.appendChild(inp);
    return wrap;
  }

  function fieldText(label, key) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = s[key];
    inp.addEventListener('input', () => {
      s[key] = inp.value;
      renderStampList();
      redraw();
    });
    wrap.appendChild(lab);
    wrap.appendChild(inp);
    return wrap;
  }

  const row1 = document.createElement('div');
  row1.className = 'row3';
  row1.appendChild(fieldNumber('Start at', 'start', 0));
  row1.appendChild(fieldNumber('Interval', 'interval', 1));
  row1.appendChild(fieldNumber('Digits', 'pad', 1));
  body.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'row2';
  row2.appendChild(fieldText('Prefix', 'prefix'));
  row2.appendChild(fieldText('Suffix', 'suffix'));
  body.appendChild(row2);

  const row3 = document.createElement('div');
  row3.className = 'row2';

  const sizeWrap = document.createElement('div');
  sizeWrap.className = 'field';
  const sizeLab = document.createElement('label');
  sizeLab.textContent = 'Stamp size';
  const sizeInp = document.createElement('input');
  sizeInp.type = 'range';
  sizeInp.min = 10; sizeInp.max = 200; sizeInp.value = s.fontSize;
  sizeInp.addEventListener('input', () => { s.fontSize = parseInt(sizeInp.value, 10); redraw(); });
  sizeWrap.appendChild(sizeLab);
  sizeWrap.appendChild(sizeInp);

  const colorWrap = document.createElement('div');
  colorWrap.className = 'field';
  const colorLab = document.createElement('label');
  colorLab.textContent = 'Color';
  const colorInp = document.createElement('input');
  colorInp.type = 'color';
  colorInp.value = s.color;
  colorInp.addEventListener('input', () => { s.color = colorInp.value; renderStampList(); redraw(); });
  colorWrap.appendChild(colorLab);
  colorWrap.appendChild(colorInp);

  row3.appendChild(sizeWrap);
  row3.appendChild(colorWrap);
  body.appendChild(row3);

  const toggleRow = document.createElement('div');
  toggleRow.className = 'togglerow';
  const toggleLab = document.createElement('span');
  toggleLab.textContent = 'Circle around number';
  const sw = document.createElement('div');
  sw.className = 'switch' + (s.circle ? ' on' : '');
  sw.addEventListener('click', () => { s.circle = !s.circle; sw.classList.toggle('on', s.circle); redraw(); });
  toggleRow.appendChild(toggleLab);
  toggleRow.appendChild(sw);
  body.appendChild(toggleRow);

  return body;
}

// ---------- Canvas drawing ----------
function drawStamp(targetCtx, x, y, text, s, highlight) {
  targetCtx.save();
  targetCtx.font = s.fontSize + 'px "Space Mono", monospace';
  targetCtx.textAlign = 'center';
  targetCtx.textBaseline = 'middle';
  const metrics = targetCtx.measureText(text);
  const textW = metrics.width;
  const r = Math.max(textW, s.fontSize) * 0.72;

  if (s.circle) {
    targetCtx.beginPath();
    targetCtx.arc(x, y, r, 0, Math.PI * 2);
    targetCtx.lineWidth = Math.max(2, s.fontSize * 0.06);
    targetCtx.strokeStyle = s.color;
    targetCtx.globalAlpha = 0.9;
    targetCtx.stroke();
    targetCtx.globalAlpha = 1;
  }

  targetCtx.fillStyle = s.color;
  targetCtx.fillText(text, x, y);

  if (highlight) {
    targetCtx.beginPath();
    targetCtx.arc(x, y, r + 10, 0, Math.PI * 2);
    targetCtx.setLineDash([6, 6]);
    targetCtx.lineWidth = 2;
    targetCtx.strokeStyle = '#ffffff';
    targetCtx.globalAlpha = 0.8;
    targetCtx.stroke();
    targetCtx.setLineDash([]);
    targetCtx.globalAlpha = 1;
  }

  targetCtx.restore();
  return r;
}

function redraw() {
  if (!sourceCanvas) return;
  ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  stamps.forEach(s => {
    drawStamp(ctx, s.x, s.y, formatNumber(s.start, s), s, s.id === selectedId);
  });
}

// ---------- Marker interaction ----------
function canvasPointFromEvent(e) {
  const rect = baseCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const scaleX = baseCanvas.width / rect.width;
  const scaleY = baseCanvas.height / rect.height;
  return {
    x: Math.min(Math.max((clientX - rect.left) * scaleX, 0), baseCanvas.width),
    y: Math.min(Math.max((clientY - rect.top) * scaleY, 0), baseCanvas.height)
  };
}

function stampAtPoint(pt) {
  // topmost (last-drawn) stamp within its hit radius wins
  for (let i = stamps.length - 1; i >= 0; i--) {
    const s = stamps[i];
    const hitR = Math.max(s.fontSize, 30);
    const dx = pt.x - s.x, dy = pt.y - s.y;
    if (Math.sqrt(dx * dx + dy * dy) <= hitR) return s;
  }
  return null;
}

function startDrag(e) {
  if (!sourceCanvas) return;
  const pt = canvasPointFromEvent(e);
  const hit = stampAtPoint(pt);
  if (hit) {
    selectedId = hit.id;
    hit.x = pt.x; hit.y = pt.y;
    dragging = true;
    renderStampList();
    redraw();
  } else if (selectedId) {
    const s = getStamp(selectedId);
    if (s) { s.x = pt.x; s.y = pt.y; dragging = true; redraw(); }
  }
}
function moveDrag(e) {
  if (!dragging || !selectedId) return;
  const pt = canvasPointFromEvent(e);
  const s = getStamp(selectedId);
  if (s) { s.x = pt.x; s.y = pt.y; redraw(); }
}
function endDrag() { dragging = false; }

baseCanvas.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', endDrag);
baseCanvas.addEventListener('touchstart', startDrag, { passive: true });
window.addEventListener('touchmove', moveDrag, { passive: true });
window.addEventListener('touchend', endDrag);

// ---------- Reset ----------
document.getElementById('resetBtn').addEventListener('click', () => {
  sourceCanvas = null;
  stamps = [];
  selectedId = null;
  fileInput.value = '';
  fileMeta.textContent = '';
  emptyState.style.display = 'block';
  stage.hidden = true;
  stampsSection.hidden = true;
  outputSection.hidden = true;
  strip.classList.remove('visible');
  generated.forEach(g => URL.revokeObjectURL(g.url));
  generated = [];
});

// ---------- Generate ----------
document.getElementById('generateBtn').addEventListener('click', generateAll);

async function generateAll() {
  if (!sourceCanvas || !stamps.length) return;
  const count = parseInt(countNumEl.value, 10) || 1;
  const format = formatSelect.value;
  const genBtn = document.getElementById('generateBtn');
  genBtn.disabled = true;
  genBtn.textContent = 'Generating…';

  generated.forEach(g => URL.revokeObjectURL(g.url));
  generated = [];
  thumbs.innerHTML = '';

  const w = sourceCanvas.width, h = sourceCanvas.height;

  for (let i = 0; i < count; i++) {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(sourceCanvas, 0, 0);

    stamps.forEach(s => {
      const num = s.start + i * s.interval;
      const text = formatNumber(num, s);
      drawStamp(offCtx, s.x, s.y, text, s, false);
    });

    // filename uses the first stamp's number as the primary reference
    const primary = formatNumber(stamps[0].start + i * stamps[0].interval, stamps[0]);

    let blob, filename;
    if (format === 'pdf') {
      const dataUrl = off.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: w >= h ? 'l' : 'p', unit: 'px', format: [w, h] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
      blob = pdf.output('blob');
      filename = primary + '.pdf';
    } else {
      blob = await new Promise(res => off.toBlob(res, 'image/png'));
      filename = primary + '.png';
    }

    const url = URL.createObjectURL(blob);
    generated.push({ blob, filename, url, previewDataUrl: off.toDataURL('image/png') });
  }

  renderThumbs();
  strip.classList.add('visible');
  document.getElementById('stripTitle').textContent = generated.length + ' invoices generated';
  genBtn.disabled = false;
  genBtn.textContent = 'Generate numbered invoices';
  showToast(generated.length + ' invoices ready. Save them to history or download below.');
}

// ---------- Save batch to history ----------
function makeThumbnail(dataUrl, maxW) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function saveBatchToHistory() {
  if (!generated.length) {
    showToast('Generate a batch before saving it to history.');
    return;
  }

  const btn = document.getElementById('saveHistoryBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const user = await getCurrentUserContext();

  if (!user || user.isGuest) {
    btn.disabled = false;
    btn.textContent = 'Save to history';
    showToast('Create an account to save invoices to your history.');
    return;
  }

  const thumb = await makeThumbnail(generated[0].previewDataUrl, 160);

  const { error } = await sb.from('invoices').insert({
    user_id: user.id,
    name: sourceFileName || 'Invoice batch',
    count: generated.length,
    format: formatSelect.value,
    thumb
  });

  btn.disabled = false;
  btn.textContent = 'Save to history';

  if (error) {
    showToast("Couldn't save to history: " + error.message);
    return;
  }

  showToast('Saved — find it under Saved Invoices in the account menu.');
}

document.getElementById('saveHistoryBtn').addEventListener('click', saveBatchToHistory);

function renderThumbs() {
  thumbs.innerHTML = '';
  generated.forEach(g => {
    const div = document.createElement('div');
    div.className = 'thumb';
    const img = document.createElement('img');
    img.src = g.previewDataUrl;
    const label = document.createElement('div');
    label.className = 'tlabel';
    label.textContent = g.filename;
    const btn = document.createElement('button');
    btn.textContent = 'Download';
    btn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = g.url; a.download = g.filename; a.click();
    });
    div.appendChild(img);
    div.appendChild(label);
    div.appendChild(btn);
    thumbs.appendChild(div);
  });
}

document.getElementById('downloadAllBtn').addEventListener('click', async () => {
  if (!generated.length) return;
  const btn = document.getElementById('downloadAllBtn');
  btn.disabled = true;
  btn.textContent = 'Zipping…';
  const zip = new JSZip();
  generated.forEach(g => zip.file(g.filename, g.blob));
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url; a.download = 'numbered-invoices.zip'; a.click();
  URL.revokeObjectURL(url);
  btn.disabled = false;
  btn.textContent = 'Download all (.zip)';
});

// ---------- Merge all generated invoices into one multi-page PDF ----------
document.getElementById('mergePdfBtn').addEventListener('click', async () => {
  if (!generated.length || !sourceCanvas) return;
  const btn = document.getElementById('mergePdfBtn');
  btn.disabled = true;
  btn.textContent = 'Merging…';

  const w = sourceCanvas.width, h = sourceCanvas.height;
  const orientation = w >= h ? 'l' : 'p';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation, unit: 'px', format: [w, h] });

  generated.forEach((g, i) => {
    if (i > 0) pdf.addPage([w, h], orientation);
    pdf.addImage(g.previewDataUrl, 'PNG', 0, 0, w, h);
  });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'numbered-invoices-merged.pdf'; a.click();
  URL.revokeObjectURL(url);

  btn.disabled = false;
  btn.textContent = 'Download as one PDF';
});

// ---------- Print directly from the app ----------
document.getElementById('printBtn').addEventListener('click', () => {
  if (!generated.length) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow pop-ups to print.'); return; }

  const doc = printWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print numbered invoices</title>
      <style>
        @page { margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #fff; }
        .page {
          width: 100%;
          page-break-after: always;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .page:last-child { page-break-after: auto; }
        .page img { width: 100%; height: auto; display: block; }
      </style>
    </head>
    <body>
      ${generated.map(g => `<div class="page"><img src="${g.previewDataUrl}"></div>`).join('')}
    </body>
    </html>
  `);
  doc.close();

  const imgs = Array.from(doc.images);
  const waitForImages = Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })));
  waitForImages.then(() => {
    printWindow.focus();
    printWindow.print();
  });
});

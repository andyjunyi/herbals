// ===== 資料管理 =====
const DB_KEY = 'tcm_database_v2';

function loadDB() {
  const stored = localStorage.getItem(DB_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migration: ensure all required arrays exist
      if (!parsed.teas) {
        parsed.teas = JSON.parse(JSON.stringify(INITIAL_DATA.teas));
      }
      if (!parsed.formulas) {
        parsed.formulas = JSON.parse(JSON.stringify(INITIAL_DATA.formulas));
      }
      if (!parsed.herbs) {
        parsed.herbs = JSON.parse(JSON.stringify(INITIAL_DATA.herbs));
      }
      // Migrate teas missing symptoms/seasons fields
      parsed.teas.forEach(t => {
        if (!t.symptoms) t.symptoms = [];
        if (!t.seasons) t.seasons = [];
      });
      parsed.formulas.forEach(f => {
        if (!f.symptoms) f.symptoms = [];
        // Migrate formulas missing instructions: copy from INITIAL_DATA if available
        if (!f.instructions) {
          const src = INITIAL_DATA.formulas.find(x => x.id === f.id);
          if (src && src.instructions) f.instructions = src.instructions;
          else f.instructions = [];
        }
      });
      parsed.herbs.forEach(h => {
        if (!h.symptoms) h.symptoms = [];
      });
      localStorage.setItem(DB_KEY, JSON.stringify(parsed));
      return parsed;
    } catch (e) {
      console.warn('Failed to parse stored DB, resetting:', e);
    }
  }
  const db = JSON.parse(JSON.stringify(INITIAL_DATA));
  saveDB(db);
  return db;
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

let db = loadDB();

// ===== 工具函數 =====
function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== 季節偵測 =====
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

// ===== 季節 Banner 渲染 =====
function renderSeasonBanner() {
  const season = getCurrentSeason();
  const data = SEASON_DATA[season];
  const banner = document.getElementById('season-banner');
  if (!banner || !data) return;

  // Build recommended item cards
  const recCards = data.recommended.map(id => {
    let item = null;
    let type = null;
    item = db.formulas.find(f => f.id === id);
    if (item) type = 'formula';
    if (!item) { item = db.herbs.find(h => h.id === id); if (item) type = 'herb'; }
    if (!item) { item = db.teas.find(t => t.id === id); if (item) type = 'tea'; }
    if (!item) return '';

    const icons = { formula: '📜', herb: '🌿', tea: '🍵' };
    const labels = { formula: '方劑', herb: '藥材', tea: '茶飲' };
    const clickFn = type === 'formula'
      ? `showFormulaDetail('${escapeHtml(id)}')`
      : type === 'herb'
        ? `showHerbDetail('${escapeHtml(id)}')`
        : `showTeaDetail('${escapeHtml(id)}')`;

    return `
      <div class="season-rec-card" onclick="${clickFn}">
        <span class="season-rec-icon">${icons[type]}</span>
        <span class="season-rec-name">${escapeHtml(item.name)}</span>
        <span class="season-rec-type">${labels[type]}</span>
      </div>`;
  }).join('');

  banner.innerHTML = `
    <div class="season-banner season-${season}">
      <div class="season-banner-inner">
        <div class="season-banner-left">
          <div class="season-badge-row">
            <span class="season-badge">換季提醒</span>
          </div>
          <div class="season-title-row">
            <span class="season-icon-large">${data.icon}</span>
            <div>
              <div class="season-name">${escapeHtml(data.name)}養生</div>
              <div class="season-theme">${escapeHtml(data.theme)}</div>
            </div>
          </div>
          <p class="season-tip">${escapeHtml(data.tip)}</p>
        </div>
        <div class="season-banner-right">
          <div class="season-rec-label">本季推薦</div>
          <div class="season-rec-cards">${recCards}</div>
        </div>
      </div>
    </div>`;
}

// ===== 症狀 Panel 渲染 =====
function renderSymptomPanel() {
  const container = document.getElementById('symptom-chips');
  if (!container) return;
  container.innerHTML = SYMPTOM_CHIPS.map(chip => `
    <button class="symptom-chip${currentSymptom === chip.key ? ' active' : ''}"
      onclick="filterBySymptom('${escapeHtml(chip.key)}')"
      title="${escapeHtml(chip.key)}">
      <span class="chip-icon">${chip.icon}</span>
      <span class="chip-label">${escapeHtml(chip.key)}</span>
    </button>
  `).join('');

  const clearBtn = document.getElementById('symptom-clear-btn');
  if (clearBtn) clearBtn.style.display = currentSymptom ? '' : 'none';
}

// ===== 症狀篩選 =====
function filterBySymptom(sym) {
  if (currentSymptom === sym) {
    clearSymptom();
    return;
  }
  currentSymptom = sym;
  document.getElementById('search-input').value = '';
  renderSymptomPanel();
  doSearch();
}

function clearSymptom() {
  currentSymptom = null;
  renderSymptomPanel();
  doSearch();
}

// ===== 目前分頁及症狀狀態 =====
let currentView = 'all'; // 'all' | 'formula' | 'herb' | 'tea'
let currentSymptom = null;

// ===== 搜尋功能 =====
function searchAll(query) {
  query = (query || '').trim().toLowerCase();

  let formulas = (currentView === 'herb' || currentView === 'tea') ? [] : db.formulas;
  let herbs    = (currentView === 'formula' || currentView === 'tea') ? [] : db.herbs;
  let teas     = (currentView === 'formula' || currentView === 'herb') ? [] : db.teas;

  // Symptom filter
  if (currentSymptom) {
    formulas = formulas.filter(f => (f.symptoms || []).includes(currentSymptom));
    herbs    = herbs.filter(h => (h.symptoms || []).includes(currentSymptom));
    teas     = teas.filter(t => (t.symptoms || []).includes(currentSymptom));
  }

  // Text filter
  if (query) {
    formulas = formulas.filter(f =>
      f.name.toLowerCase().includes(query) ||
      f.herbs.some(h => h.toLowerCase().includes(query)) ||
      f.effects.some(e => e.toLowerCase().includes(query)) ||
      f.indications.toLowerCase().includes(query) ||
      f.category.toLowerCase().includes(query) ||
      (f.tags || []).some(t => t.toLowerCase().includes(query)) ||
      (f.symptoms || []).some(s => s.toLowerCase().includes(query))
    );

    herbs = herbs.filter(h =>
      h.name.toLowerCase().includes(query) ||
      h.effects.some(e => e.toLowerCase().includes(query)) ||
      h.category.toLowerCase().includes(query) ||
      h.indications.toLowerCase().includes(query) ||
      h.meridians.some(m => m.toLowerCase().includes(query)) ||
      (h.symptoms || []).some(s => s.toLowerCase().includes(query))
    );

    teas = teas.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query) ||
      t.effects.some(e => e.toLowerCase().includes(query)) ||
      t.indications.toLowerCase().includes(query) ||
      t.ingredients.some(i => i.item.toLowerCase().includes(query)) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(query)) ||
      (t.suitableFor || []).some(s => s.toLowerCase().includes(query)) ||
      (t.symptoms || []).some(s => s.toLowerCase().includes(query))
    );
  }

  return { formulas, herbs, teas };
}

// ===== 茶飲渲染 =====
const DIFFICULTY_MAP = { '簡易': '🟢', '中等': '🟡', '進階': '🔴' };
const CATEGORY_TEA_ICON = {
  '消食茶': '🍊', '補養茶': '🌺', '消脂茶': '🍃', '明目茶': '👁️',
  '疏肝茶': '🌹', '補氣茶': '🌿', '暖身茶': '🔥', '安神茶': '🌙',
  '清熱茶': '❄️', '護嗓茶': '🎵'
};

function renderTeaCard(t) {
  const icon = CATEGORY_TEA_ICON[t.category] || '🍵';
  const diffIcon = DIFFICULTY_MAP[t.difficulty] || '';
  const sympTags = (t.symptoms || []).slice(0, 2).map(s =>
    `<span class="symptom-mini-tag">${escapeHtml(s)}</span>`
  ).join('');
  return `
    <div class="card tea-card" onclick="showTeaDetail('${escapeHtml(t.id)}')">
      <div class="card-header">
        <span class="card-name">${escapeHtml(t.name)}</span>
        <span class="badge badge-tea">${icon} ${escapeHtml(t.category)}</span>
      </div>
      <div class="tea-ingredients-preview">
        ${t.ingredients.slice(0, 4).map(i => `<span class="ingredient-tag">${escapeHtml(i.item)}</span>`).join('')}
        ${t.ingredients.length > 4 ? `<span class="ingredient-tag more">+${t.ingredients.length - 4}</span>` : ''}
      </div>
      <div class="card-effects">
        ${t.effects.slice(0, 3).map(e => `<span class="effect-tag">${escapeHtml(e)}</span>`).join('')}
        ${t.effects.length > 3 ? `<span class="effect-tag more">+${t.effects.length - 3}</span>` : ''}
      </div>
      <div class="card-bottom-row">
        <div class="tea-meta">
          <span class="tea-diff">${diffIcon} ${escapeHtml(t.difficulty)}</span>
          <span class="tea-time">🕐 ${escapeHtml((t.bestTime || '').split('，')[0])}</span>
        </div>
        ${sympTags ? `<div class="card-symptoms">${sympTags}</div>` : ''}
      </div>
    </div>`;
}

// ===== 方劑卡片 =====
function renderFormulaCard(f) {
  const sympTags = (f.symptoms || []).slice(0, 2).map(s =>
    `<span class="symptom-mini-tag">${escapeHtml(s)}</span>`
  ).join('');
  return `
    <div class="card formula-card" onclick="showFormulaDetail('${escapeHtml(f.id)}')">
      <div class="card-header">
        <span class="card-name">${escapeHtml(f.name)}</span>
        <span class="badge badge-formula">${escapeHtml(f.category)}</span>
      </div>
      <div class="card-herbs">
        ${f.herbs.map(h => `<span class="herb-tag">${escapeHtml(h)}</span>`).join('')}
      </div>
      <div class="card-effects">
        ${f.effects.map(e => `<span class="effect-tag">${escapeHtml(e)}</span>`).join('')}
      </div>
      <div class="card-bottom-row">
        <div class="card-source">${escapeHtml(f.source || '')}</div>
        ${sympTags ? `<div class="card-symptoms">${sympTags}</div>` : ''}
      </div>
    </div>`;
}

// ===== 藥材卡片 =====
function renderHerbCard(h) {
  const sympTags = (h.symptoms || []).slice(0, 2).map(s =>
    `<span class="symptom-mini-tag">${escapeHtml(s)}</span>`
  ).join('');
  return `
    <div class="card herb-card" onclick="showHerbDetail('${escapeHtml(h.id)}')">
      <div class="card-header">
        <span class="card-name">${escapeHtml(h.name)}</span>
        <span class="badge badge-herb">${escapeHtml(h.category)}</span>
      </div>
      <div class="card-meta">
        <span>性：${escapeHtml(h.nature)}</span>
        <span>味：${escapeHtml(h.flavor)}</span>
        <span>歸經：${h.meridians.map(m => escapeHtml(m)).join('、')}</span>
      </div>
      <div class="card-effects">
        ${h.effects.slice(0, 3).map(e => `<span class="effect-tag">${escapeHtml(e)}</span>`).join('')}
        ${h.effects.length > 3 ? `<span class="effect-tag more">+${h.effects.length - 3}</span>` : ''}
      </div>
      ${sympTags ? `<div class="card-symptoms">${sympTags}</div>` : ''}
    </div>`;
}

// ===== 渲染結果 =====
function renderResults(results) {
  const container = document.getElementById('results');
  const { formulas, herbs, teas } = results;
  const total = formulas.length + herbs.length + teas.length;

  let summaryExtra = '';
  if (currentSymptom) {
    summaryExtra = ` &nbsp;·&nbsp; <span class="symptom-active-badge">${escapeHtml(currentSymptom)}</span>`;
  }

  if (total === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>未找到相關資料</p>
      <p style="margin-top:8px;font-size:0.9em">
        <a href="#" onclick="openAddModal('formula')">新增方劑</a> ·
        <a href="#" onclick="openAddModal('herb')">新增藥材</a> ·
        <a href="#" onclick="openAddModal('tea')">新增茶飲</a>
      </p>
    </div>`;
    return;
  }

  let html = `<div class="results-summary">找到 <strong>${total}</strong> 筆結果（方劑 ${formulas.length}、藥材 ${herbs.length}、養生茶飲 ${teas.length}）${summaryExtra}</div>`;

  if (teas.length > 0) {
    html += `<div class="section-title"><span class="section-icon">🍵</span> 日常養生茶飲</div>`;
    html += `<div class="cards-grid">${teas.map(renderTeaCard).join('')}</div>`;
  }

  if (formulas.length > 0) {
    html += `<div class="section-title"><span class="section-icon">📜</span> 方劑</div>`;
    html += `<div class="cards-grid">${formulas.map(renderFormulaCard).join('')}</div>`;
  }

  if (herbs.length > 0) {
    html += `<div class="section-title"><span class="section-icon">🌿</span> 單味藥材</div>`;
    html += `<div class="cards-grid">${herbs.map(renderHerbCard).join('')}</div>`;
  }

  container.innerHTML = html;
}

// ===== 詳細資料 Modal =====
function showFormulaDetail(id) {
  const f = db.formulas.find(x => x.id === id);
  if (!f) return;

  const sympHtml = (f.symptoms || []).length
    ? `<div class="detail-section">
        <div class="detail-label">適用症狀</div>
        <div>${(f.symptoms || []).map(s => `<span class="symptom-mini-tag clickable" onclick="filterBySymptomFromModal('${escapeHtml(s)}')">${escapeHtml(s)}</span>`).join('')}</div>
      </div>` : '';

  document.getElementById('modal-title').textContent = f.name;
  document.getElementById('modal-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-row">
        <span class="detail-label">分類</span>
        <span class="badge badge-formula">${escapeHtml(f.category)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">出處</span>
        <span>${escapeHtml(f.source || '未知')}</span>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">組成藥材</div>
      ${(() => {
        // Parse dosage string into {name, amount} pairs
        const parsedHerbs = f.herbs.map(h => {
          let amount = '';
          if (f.dosage) {
            // Split dosage by Chinese comma or enumeration comma
            const tokens = f.dosage.split(/[、，,]/);
            const token = tokens.find(t => t.startsWith(h));
            if (token) amount = token.slice(h.length).trim();
          }
          return { name: h, amount };
        });
        return `<table class="ingredient-table">
          <thead><tr><th>藥材</th><th>份量</th></tr></thead>
          <tbody>
            ${parsedHerbs.map(h => `<tr><td><span class="herb-tag clickable" onclick="searchHerb('${escapeHtml(h.name)}')">${escapeHtml(h.name)}</span></td><td>${escapeHtml(h.amount)}</td></tr>`).join('')}
          </tbody>
        </table>`;
      })()}
    </div>
    <div class="detail-section">
      <div class="detail-label">功效</div>
      <div class="effects-list">
        ${f.effects.map(e => `<span class="effect-tag">${escapeHtml(e)}</span>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">主治</div>
      <p class="detail-text">${escapeHtml(f.indications)}</p>
    </div>
    <div class="detail-section warning-section">
      <div class="detail-label">禁忌</div>
      <p class="detail-text warning-text">${escapeHtml(f.contraindications)}</p>
    </div>
    ${f.instructions && f.instructions.length ? `
    <div class="detail-section">
      <div class="detail-label">調製步驟</div>
      <ol class="instructions-list">
        ${f.instructions.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>
    </div>` : ''}
    ${sympHtml}
    ${f.tags && f.tags.length ? `
    <div class="detail-section">
      <div class="detail-label">標籤</div>
      <div>${f.tags.map(t => `<span class="tag-chip" onclick="searchTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-danger" onclick="deleteItem('formula','${escapeHtml(id)}')">刪除此方劑</button>
    </div>
  `;
  openModal();
}

function showHerbDetail(id) {
  const h = db.herbs.find(x => x.id === id);
  if (!h) return;

  const sympHtml = (h.symptoms || []).length
    ? `<div class="detail-section">
        <div class="detail-label">適用症狀</div>
        <div>${(h.symptoms || []).map(s => `<span class="symptom-mini-tag clickable" onclick="filterBySymptomFromModal('${escapeHtml(s)}')">${escapeHtml(s)}</span>`).join('')}</div>
      </div>` : '';

  document.getElementById('modal-title').textContent = h.name;
  document.getElementById('modal-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-row">
        <span class="detail-label">分類</span>
        <span class="badge badge-herb">${escapeHtml(h.category)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">性味</span>
        <span>性${escapeHtml(h.nature)}，味${escapeHtml(h.flavor)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">歸經</span>
        <span>${h.meridians.map(m => `<span class="meridian-tag">${escapeHtml(m)}經</span>`).join('')}</span>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">功效</div>
      <div class="effects-list">
        ${h.effects.map(e => `<span class="effect-tag">${escapeHtml(e)}</span>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">主治</div>
      <p class="detail-text">${escapeHtml(h.indications)}</p>
    </div>
    <div class="detail-section warning-section">
      <div class="detail-label">禁忌</div>
      <p class="detail-text warning-text">${escapeHtml(h.contraindications)}</p>
    </div>
    ${sympHtml}
    ${h.commonPairings && h.commonPairings.length ? `
    <div class="detail-section">
      <div class="detail-label">常見配伍</div>
      <div>${h.commonPairings.map(p => `<span class="herb-tag clickable" onclick="searchHerb('${escapeHtml(p)}')">${escapeHtml(p)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-danger" onclick="deleteItem('herb','${escapeHtml(id)}')">刪除此藥材</button>
    </div>
  `;
  openModal();
}

function showTeaDetail(id) {
  const t = db.teas.find(x => x.id === id);
  if (!t) return;
  const icon = CATEGORY_TEA_ICON[t.category] || '🍵';
  const diffIcon = DIFFICULTY_MAP[t.difficulty] || '';

  const sympHtml = (t.symptoms || []).length
    ? `<div class="detail-section">
        <div class="detail-label">適用症狀</div>
        <div>${(t.symptoms || []).map(s => `<span class="symptom-mini-tag clickable" onclick="filterBySymptomFromModal('${escapeHtml(s)}')">${escapeHtml(s)}</span>`).join('')}</div>
      </div>` : '';

  const seasonsHtml = (t.seasons || []).length
    ? `<div class="detail-section">
        <div class="detail-label">適合季節</div>
        <div>${(t.seasons || []).map(s => `<span class="season-mini-tag">${escapeHtml(s)}</span>`).join('')}</div>
      </div>` : '';

  document.getElementById('modal-title').textContent = `${icon} ${t.name}`;
  document.getElementById('modal-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-row">
        <span class="detail-label">分類</span>
        <span class="badge badge-tea">${icon} ${escapeHtml(t.category)}</span>
        <span class="badge badge-diff">${diffIcon} ${escapeHtml(t.difficulty)}</span>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">食材與份量</div>
      <table class="ingredient-table">
        <thead><tr><th>食材</th><th>份量</th></tr></thead>
        <tbody>
          ${t.ingredients.map(i => `<tr><td>${escapeHtml(i.item)}</td><td>${escapeHtml(i.amount)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="detail-section">
      <div class="detail-label">製作步驟</div>
      <ol class="steps-list">
        ${t.instructions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ol>
    </div>

    <div class="detail-section">
      <div class="detail-label">功效</div>
      <div class="effects-list">
        ${t.effects.map(e => `<span class="effect-tag">${escapeHtml(e)}</span>`).join('')}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">適用情況</div>
      <p class="detail-text">${escapeHtml(t.indications)}</p>
      ${t.suitableFor && t.suitableFor.length ? `
      <div class="suitable-tags">
        ${t.suitableFor.map(s => `<span class="suitable-tag">${escapeHtml(s)}</span>`).join('')}
      </div>` : ''}
    </div>

    <div class="detail-section tea-time-section">
      <div class="detail-label">🕐 最佳飲用時機</div>
      <p class="detail-text tea-time-text">${escapeHtml(t.bestTime)}</p>
    </div>

    <div class="detail-section warning-section">
      <div class="detail-label">⚠️ 禁忌與注意事項</div>
      <p class="detail-text warning-text">${escapeHtml(t.contraindications)}</p>
    </div>

    ${sympHtml}
    ${seasonsHtml}

    ${t.pairings && t.pairings.length ? `
    <div class="detail-section">
      <div class="detail-label">🔀 加減變化搭配</div>
      <div class="pairings-list">
        ${t.pairings.map(p => `
          <div class="pairing-item">
            <span class="pairing-add">加入 ${escapeHtml(p.add)}</span>
            <span class="pairing-reason">→ ${escapeHtml(p.reason)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${t.tags && t.tags.length ? `
    <div class="detail-section">
      <div class="detail-label">標籤</div>
      <div>${t.tags.map(tag => `<span class="tag-chip" onclick="searchTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`).join('')}</div>
    </div>` : ''}

    <div class="detail-actions">
      <button class="btn btn-danger" onclick="deleteItem('tea','${escapeHtml(id)}')">刪除此茶飲</button>
    </div>
  `;
  openModal();
}

function filterBySymptomFromModal(sym) {
  closeModal();
  filterBySymptom(sym);
}

function searchHerb(name) {
  closeModal();
  currentSymptom = null;
  renderSymptomPanel();
  document.getElementById('search-input').value = name;
  doSearch();
}

function searchTag(tag) {
  closeModal();
  currentSymptom = null;
  renderSymptomPanel();
  document.getElementById('search-input').value = tag;
  doSearch();
}

// ===== Modal 控制 =====
function openModal() {
  document.getElementById('detail-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('active');
  document.body.style.overflow = '';
}

// ===== 新增資料 Modal =====
function openAddModal(type) {
  const modal = document.getElementById('add-modal');
  const title = document.getElementById('add-modal-title');
  const body = document.getElementById('add-modal-body');

  const symptomOptions = SYMPTOM_CHIPS.map(c => c.key).join(', ');

  if (type === 'tea') {
    title.textContent = '新增養生茶飲';
    body.innerHTML = `
      <form id="add-form" onsubmit="submitAdd(event,'tea')">
        <div class="form-group">
          <label>茶飲名稱 <span class="required">*</span></label>
          <input type="text" name="name" placeholder="例：玫瑰陳皮舒壓茶" required>
        </div>
        <div class="form-group form-row">
          <div>
            <label>分類 <span class="required">*</span></label>
            <input type="text" name="category" placeholder="例：疏肝茶" list="tea-categories" required>
            <datalist id="tea-categories">
              ${[...new Set(db.teas.map(t => t.category))].map(c => `<option value="${escapeHtml(c)}">`).join('')}
            </datalist>
          </div>
          <div>
            <label>難易度</label>
            <select name="difficulty">
              <option value="簡易">🟢 簡易</option>
              <option value="中等">🟡 中等</option>
              <option value="進階">🔴 進階</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>食材（每行一項，格式：食材名稱|份量）<span class="required">*</span></label>
          <textarea name="ingredients" rows="4" placeholder="乾山楂片|10克&#10;生薑|3-5片&#10;清水|500毫升" required></textarea>
        </div>
        <div class="form-group">
          <label>製作步驟（每行一步）<span class="required">*</span></label>
          <textarea name="instructions" rows="4" placeholder="材料洗淨備用&#10;加水煮沸後小火煮10分鐘&#10;濾渣飲用" required></textarea>
        </div>
        <div class="form-group">
          <label>功效（以逗號分隔）<span class="required">*</span></label>
          <input type="text" name="effects" placeholder="例：促進消化,驅寒暖身" required>
        </div>
        <div class="form-group">
          <label>適用情況 <span class="required">*</span></label>
          <textarea name="indications" rows="2" placeholder="描述適合哪些人或情況飲用..." required></textarea>
        </div>
        <div class="form-group">
          <label>適合族群（以逗號分隔）</label>
          <input type="text" name="suitableFor" placeholder="例：消化不良,手腳冰冷">
        </div>
        <div class="form-group">
          <label>最佳飲用時機</label>
          <input type="text" name="bestTime" placeholder="例：飯後1小時，每週3-4次">
        </div>
        <div class="form-group">
          <label>禁忌與注意事項</label>
          <textarea name="contraindications" rows="2" placeholder="哪些人不適合飲用..."></textarea>
        </div>
        <div class="form-group">
          <label>症狀標籤（以逗號分隔）</label>
          <input type="text" name="symptoms" placeholder="例：${escapeHtml(symptomOptions.slice(0, 30))}..." list="symptom-opts-tea">
          <datalist id="symptom-opts-tea">
            ${SYMPTOM_CHIPS.map(c => `<option value="${escapeHtml(c.key)}">`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label>適合季節（以逗號分隔）</label>
          <input type="text" name="seasons" placeholder="例：春,夏 或 四季">
        </div>
        <div class="form-group">
          <label>標籤（以逗號分隔）</label>
          <input type="text" name="tags" placeholder="例：山楂,生薑,消食,暖身">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeAddModal()">取消</button>
          <button type="submit" class="btn btn-primary">新增茶飲</button>
        </div>
      </form>`;
  } else if (type === 'formula') {
    title.textContent = '新增方劑';
    body.innerHTML = `
      <form id="add-form" onsubmit="submitAdd(event,'formula')">
        <div class="form-group">
          <label>方劑名稱 <span class="required">*</span></label>
          <input type="text" name="name" placeholder="例：四君子湯" required>
        </div>
        <div class="form-group">
          <label>分類 <span class="required">*</span></label>
          <input type="text" name="category" placeholder="例：補氣劑" list="formula-categories" required>
          <datalist id="formula-categories">
            ${[...new Set(db.formulas.map(f => f.category))].map(c => `<option value="${escapeHtml(c)}">`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label>組成藥材 <span class="required">*</span>（以逗號分隔）</label>
          <input type="text" name="herbs" placeholder="例：人參,白朮,茯苓,甘草" required>
        </div>
        <div class="form-group">
          <label>劑量說明</label>
          <input type="text" name="dosage" placeholder="例：人參9g、白朮9g...">
        </div>
        <div class="form-group">
          <label>功效 <span class="required">*</span>（以逗號分隔）</label>
          <input type="text" name="effects" placeholder="例：益氣健脾,補中" required>
        </div>
        <div class="form-group">
          <label>主治 <span class="required">*</span></label>
          <textarea name="indications" rows="3" placeholder="描述主治症狀..." required></textarea>
        </div>
        <div class="form-group">
          <label>禁忌</label>
          <textarea name="contraindications" rows="2" placeholder="禁忌與注意事項..."></textarea>
        </div>
        <div class="form-group">
          <label>出處</label>
          <input type="text" name="source" placeholder="例：《傷寒論》">
        </div>
        <div class="form-group">
          <label>症狀標籤（以逗號分隔）</label>
          <input type="text" name="symptoms" placeholder="例：氣虛疲勞,消化不良" list="symptom-opts-formula">
          <datalist id="symptom-opts-formula">
            ${SYMPTOM_CHIPS.map(c => `<option value="${escapeHtml(c.key)}">`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label>標籤（以逗號分隔）</label>
          <input type="text" name="tags" placeholder="例：補氣,健脾,脾虛">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeAddModal()">取消</button>
          <button type="submit" class="btn btn-primary">新增方劑</button>
        </div>
      </form>`;
  } else {
    title.textContent = '新增藥材';
    body.innerHTML = `
      <form id="add-form" onsubmit="submitAdd(event,'herb')">
        <div class="form-group">
          <label>藥材名稱 <span class="required">*</span></label>
          <input type="text" name="name" placeholder="例：黃耆" required>
        </div>
        <div class="form-group">
          <label>分類 <span class="required">*</span></label>
          <input type="text" name="category" placeholder="例：補氣藥" list="herb-categories" required>
          <datalist id="herb-categories">
            ${[...new Set(db.herbs.map(h => h.category))].map(c => `<option value="${escapeHtml(c)}">`).join('')}
          </datalist>
        </div>
        <div class="form-group form-row">
          <div>
            <label>藥性 <span class="required">*</span></label>
            <input type="text" name="nature" placeholder="例：溫、寒、平" required>
          </div>
          <div>
            <label>藥味 <span class="required">*</span></label>
            <input type="text" name="flavor" placeholder="例：甘、苦、辛" required>
          </div>
        </div>
        <div class="form-group">
          <label>歸經（以逗號分隔）</label>
          <input type="text" name="meridians" placeholder="例：肺,脾,腎">
        </div>
        <div class="form-group">
          <label>功效 <span class="required">*</span>（以逗號分隔）</label>
          <input type="text" name="effects" placeholder="例：補氣升陽,固表止汗" required>
        </div>
        <div class="form-group">
          <label>主治 <span class="required">*</span></label>
          <textarea name="indications" rows="3" placeholder="描述主治症狀..." required></textarea>
        </div>
        <div class="form-group">
          <label>禁忌</label>
          <textarea name="contraindications" rows="2" placeholder="禁忌與注意事項..."></textarea>
        </div>
        <div class="form-group">
          <label>常見配伍（以逗號分隔）</label>
          <input type="text" name="commonPairings" placeholder="例：白朮,人參,茯苓">
        </div>
        <div class="form-group">
          <label>症狀標籤（以逗號分隔）</label>
          <input type="text" name="symptoms" placeholder="例：氣虛疲勞,失眠多夢" list="symptom-opts-herb">
          <datalist id="symptom-opts-herb">
            ${SYMPTOM_CHIPS.map(c => `<option value="${escapeHtml(c.key)}">`).join('')}
          </datalist>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeAddModal()">取消</button>
          <button type="submit" class="btn btn-primary">新增藥材</button>
        </div>
      </form>`;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('active');
  document.body.style.overflow = '';
}

function submitAdd(event, type) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  const splitTrim = str => str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (type === 'tea') {
    const parseIngredients = str => str.split('\n').map(line => {
      const parts = line.split('|');
      return { item: (parts[0] || '').trim(), amount: (parts[1] || '').trim() };
    }).filter(i => i.item);

    const tea = {
      id: genId('t'),
      name: data.name.trim(),
      category: data.category.trim(),
      difficulty: data.difficulty || '簡易',
      ingredients: parseIngredients(data.ingredients),
      instructions: data.instructions.split('\n').map(s => s.trim()).filter(Boolean),
      effects: splitTrim(data.effects),
      indications: data.indications.trim(),
      suitableFor: splitTrim(data.suitableFor),
      bestTime: data.bestTime ? data.bestTime.trim() : '',
      contraindications: data.contraindications ? data.contraindications.trim() : '',
      pairings: [],
      symptoms: splitTrim(data.symptoms),
      seasons: splitTrim(data.seasons),
      tags: splitTrim(data.tags)
    };
    db.teas.unshift(tea);
    saveDB(db);
    closeAddModal();
    showToast('茶飲新增成功！');
  } else if (type === 'formula') {
    const formula = {
      id: genId('f'),
      name: data.name.trim(),
      category: data.category.trim(),
      herbs: splitTrim(data.herbs),
      dosage: data.dosage ? data.dosage.trim() : '',
      effects: splitTrim(data.effects),
      indications: data.indications.trim(),
      contraindications: data.contraindications ? data.contraindications.trim() : '',
      source: data.source ? data.source.trim() : '',
      symptoms: splitTrim(data.symptoms),
      tags: splitTrim(data.tags)
    };
    db.formulas.unshift(formula);
    saveDB(db);
    closeAddModal();
    showToast('方劑新增成功！');
  } else {
    const herb = {
      id: genId('h'),
      name: data.name.trim(),
      category: data.category.trim(),
      nature: data.nature.trim(),
      flavor: data.flavor.trim(),
      meridians: splitTrim(data.meridians),
      effects: splitTrim(data.effects),
      indications: data.indications.trim(),
      contraindications: data.contraindications ? data.contraindications.trim() : '',
      commonPairings: splitTrim(data.commonPairings),
      symptoms: splitTrim(data.symptoms)
    };
    db.herbs.unshift(herb);
    saveDB(db);
    closeAddModal();
    showToast('藥材新增成功！');
  }

  renderStats();
  doSearch();
}

// ===== 刪除功能 =====
function deleteItem(type, id) {
  const name = type === 'formula'
    ? db.formulas.find(f => f.id === id)?.name
    : type === 'herb'
      ? db.herbs.find(h => h.id === id)?.name
      : db.teas.find(t => t.id === id)?.name;

  if (!confirm(`確定要刪除「${name}」嗎？此操作無法復原。`)) return;

  if (type === 'formula') {
    db.formulas = db.formulas.filter(f => f.id !== id);
  } else if (type === 'herb') {
    db.herbs = db.herbs.filter(h => h.id !== id);
  } else {
    db.teas = db.teas.filter(t => t.id !== id);
  }
  saveDB(db);
  closeModal();
  showToast(`已刪除「${name}」`);
  renderStats();
  doSearch();
}

// ===== Toast 通知 =====
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== 分類篩選 =====
function renderCategories() {
  const view = currentView;
  const container = document.getElementById('category-filters');

  if (view === 'tea') {
    const teaCategories = [...new Set(db.teas.map(t => t.category))];
    container.innerHTML = `
      <button class="filter-btn active" onclick="filterTeaAll(this)">全部茶飲</button>
      ${teaCategories.map(c => `<button class="filter-btn" onclick="filterTeaCategory(this,'${escapeHtml(c)}')">${escapeHtml(CATEGORY_TEA_ICON[c] || '')} ${escapeHtml(c)}</button>`).join('')}
    `;
  } else if (view === 'formula') {
    const cats = [...new Set(db.formulas.map(f => f.category))];
    container.innerHTML = `
      <button class="filter-btn active" onclick="filterAll(this)">全部方劑</button>
      ${cats.map(c => `<button class="filter-btn" onclick="filterCategory(this,'formula','${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
    `;
  } else if (view === 'herb') {
    const cats = [...new Set(db.herbs.map(h => h.category))];
    container.innerHTML = `
      <button class="filter-btn active" onclick="filterAll(this)">全部藥材</button>
      ${cats.map(c => `<button class="filter-btn" onclick="filterCategory(this,'herb','${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
    `;
  } else {
    const formulaCategories = [...new Set(db.formulas.map(f => f.category))];
    const herbCategories = [...new Set(db.herbs.map(h => h.category))];
    const teaCategories = [...new Set(db.teas.map(t => t.category))];
    container.innerHTML = `
      <button class="filter-btn active" onclick="filterAll(this)">全部</button>
      <span class="filter-sep">方劑：</span>
      ${formulaCategories.map(c => `<button class="filter-btn" onclick="filterCategory(this,'formula','${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
      <span class="filter-sep">藥材：</span>
      ${herbCategories.map(c => `<button class="filter-btn" onclick="filterCategory(this,'herb','${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
      <span class="filter-sep">茶飲：</span>
      ${teaCategories.map(c => `<button class="filter-btn" onclick="filterTeaCategory(this,'${escapeHtml(c)}')">${escapeHtml(CATEGORY_TEA_ICON[c] || '')} ${escapeHtml(c)}</button>`).join('')}
    `;
  }
}

function filterAll(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('search-input').value = '';
  currentSymptom = null;
  renderSymptomPanel();
  const teas = currentView === 'formula' || currentView === 'herb' ? [] : db.teas;
  const formulas = currentView === 'herb' || currentView === 'tea' ? [] : db.formulas;
  const herbs = currentView === 'formula' || currentView === 'tea' ? [] : db.herbs;
  renderResults({ formulas, herbs, teas });
}

function filterTeaAll(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('search-input').value = '';
  currentSymptom = null;
  renderSymptomPanel();
  renderResults({ formulas: [], herbs: [], teas: db.teas });
}

function filterTeaCategory(btn, category) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('search-input').value = '';
  currentSymptom = null;
  renderSymptomPanel();
  renderResults({ formulas: [], herbs: [], teas: db.teas.filter(t => t.category === category) });
}

function filterCategory(btn, type, category) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('search-input').value = '';
  currentSymptom = null;
  renderSymptomPanel();

  if (type === 'formula') {
    renderResults({ formulas: db.formulas.filter(f => f.category === category), herbs: [], teas: [] });
  } else {
    renderResults({ formulas: [], herbs: db.herbs.filter(h => h.category === category), teas: [] });
  }
}

// ===== 分頁切換 =====
function switchView(view) {
  currentView = view;
  currentSymptom = null;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.view-tab[data-view="${view}"]`);
  if (tab) tab.classList.add('active');
  document.getElementById('search-input').value = '';
  renderSymptomPanel();
  renderCategories();
  doSearch();
  updateAddButtons();
}

function updateAddButtons() {
  const formulaBtn = document.getElementById('add-formula-btn');
  const herbBtn = document.getElementById('add-herb-btn');
  const teaBtn = document.getElementById('add-tea-btn');
  if (currentView === 'tea') {
    formulaBtn.style.display = 'none';
    herbBtn.style.display = 'none';
    teaBtn.style.display = '';
  } else if (currentView === 'formula') {
    formulaBtn.style.display = '';
    herbBtn.style.display = 'none';
    teaBtn.style.display = 'none';
  } else if (currentView === 'herb') {
    formulaBtn.style.display = 'none';
    herbBtn.style.display = '';
    teaBtn.style.display = 'none';
  } else {
    formulaBtn.style.display = '';
    herbBtn.style.display = '';
    teaBtn.style.display = '';
  }
}

// ===== 搜尋控制 =====
function doSearch() {
  const query = document.getElementById('search-input').value;
  if (!query.trim() && !currentSymptom) {
    const firstBtn = document.querySelector('.filter-btn');
    if (firstBtn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      firstBtn.classList.add('active');
    }
  }
  renderResults(searchAll(query));
}

// ===== 重置資料 =====
function resetData() {
  if (!confirm('確定要重置所有資料至初始狀態嗎？所有自行新增的資料將會消失。')) return;
  db = JSON.parse(JSON.stringify(INITIAL_DATA));
  saveDB(db);
  currentView = 'all';
  currentSymptom = null;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.view-tab[data-view="all"]')?.classList.add('active');
  updateAddButtons();
  renderCategories();
  renderSymptomPanel();
  renderSeasonBanner();
  renderStats();
  renderResults({ formulas: db.formulas, herbs: db.herbs, teas: db.teas });
  showToast('資料已重置');
}

// ===== 統計 =====
function renderStats() {
  document.getElementById('stat-formulas').textContent = db.formulas.length;
  document.getElementById('stat-herbs').textContent = db.herbs.length;
  document.getElementById('stat-teas').textContent = db.teas.length;
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  // 搜尋框事件
  const input = document.getElementById('search-input');
  input.addEventListener('input', () => {
    clearTimeout(input._timer);
    input._timer = setTimeout(doSearch, 300);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  // Modal 關閉事件
  document.getElementById('detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('add-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddModal();
  });

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeAddModal(); }
  });

  // 初始渲染
  renderSeasonBanner();
  renderSymptomPanel();
  updateAddButtons();
  renderCategories();
  renderStats();
  renderResults({ formulas: db.formulas, herbs: db.herbs, teas: db.teas });
});

#!/usr/bin/env node
// ════════════════════════════════════════════════════════
//  本草藥典  自動更新腳本  v1.1
// ════════════════════════════════════════════════════════
//
//  使用方式：
//    node update.js              掃描新 .md 並同步至 GitHub（需 API）
//    node update.js --add        手動新增資料（不需 API）
//    node update.js --push-only  直接推送目前變更
//    node update.js --preview    預覽將新增的資料（不寫入）
//    node update.js --no-push    更新本地，不推送
//
//  前置需求（--add 模式不需要）：
//    設定環境變數：DEEPSEEK_API_KEY=sk-你的金鑰
//    Windows：setx DEEPSEEK_API_KEY "sk-你的金鑰"（設定後重新開啟終端機）
//
// ════════════════════════════════════════════════════════

'use strict';

const fs           = require('fs');
const path         = require('path');
const readline     = require('readline');
const { execSync } = require('child_process');

const DIR      = __dirname;
const MANIFEST = path.join(DIR, '.update_manifest.json');
const DATA_JS  = path.join(DIR, 'data.js');
const MODEL    = 'deepseek-chat';

const VALID_SYMPTOMS = [
  '消化不良','便秘腹脹','失眠多夢','眼睛疲勞','月經不調',
  '氣虛疲勞','咽喉護嗓','手腳冰冷','壓力鬱悶','上火口乾',
  '降脂減重','腰膝酸軟',
];

// ── 引數解析 ─────────────────────────────────────────────
const args      = process.argv.slice(2);
const PREVIEW   = args.includes('--preview');
const NO_PUSH   = args.includes('--no-push');
const PUSH_ONLY = args.includes('--push-only');
const ADD_MODE  = args.includes('--add');

if (args.includes('--help') || args.includes('-h')) {
  console.log([
    '',
    '本草藥典  自動更新腳本',
    '',
    '  node update.js              掃描新 .md 並同步至 GitHub（需 API）',
    '  node update.js --add        手動新增資料（不需 API）',
    '  node update.js --push-only  直接推送目前變更',
    '  node update.js --preview    預覽將新增資料（不寫入）',
    '  node update.js --no-push    更新本地，不推送',
    '',
  ].join('\n'));
  process.exit(0);
}

// ══════════════════════════════════════════════════════
// 互動式手動新增（--add 模式，不需 API）
// ══════════════════════════════════════════════════════
function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function parseList(str) {
  return str.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

async function manualAdd() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const p  = q => ask(rl, q);

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   手動新增資料模式（不需 API）        ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('提示：多個項目請用「、」或「,」分隔\n');

  // 選擇類型
  console.log('請選擇資料類型：');
  console.log('  1. 藥材（herb）');
  console.log('  2. 養生茶飲（tea）');
  console.log('  3. 方劑（formula）');
  const typeChoice = (await p('\n輸入 1 / 2 / 3：')).trim();
  const typeMap    = { '1': 'herb', '2': 'tea', '3': 'formula' };
  const itype      = typeMap[typeChoice];
  if (!itype) { console.log('✗ 無效選擇'); rl.close(); return null; }

  let data = {};

  if (itype === 'herb') {
    data.id              = 'TEMP';
    data.name            = (await p('藥材名稱：')).trim();
    data.category        = (await p('分類（如：補氣藥、清熱藥）：')).trim();
    data.nature          = (await p('藥性（溫/平/涼/寒）：')).trim();
    data.flavor          = (await p('味道（如：甘、苦）：')).trim();
    data.meridians       = parseList(await p('歸經（如：脾、肺）：'));
    data.effects         = parseList(await p('功效（如：補氣健脾、止咳）：'));
    data.indications     = (await p('主治：')).trim();
    data.contraindications = (await p('禁忌：')).trim();
    data.commonPairings  = parseList(await p('常見搭配（可留空）：'));
    data.symptoms        = await pickSymptoms(p);
  }

  if (itype === 'tea') {
    data.id              = 'TEMP';
    data.name            = (await p('茶飲名稱：')).trim();
    data.category        = (await p('分類（如：補氣養血、清熱降火）：')).trim();
    data.difficulty      = (await p('難易度（簡易/中等/稍複雜）：')).trim() || '簡易';
    data.effects         = parseList(await p('功效：'));
    data.indications     = (await p('適用情況：')).trim();
    data.bestTime        = (await p('最佳飲用時間（如：飯後、睡前）：')).trim();
    data.contraindications = (await p('禁忌：')).trim();
    data.suitableFor     = parseList(await p('適合族群（可留空）：'));
    data.seasons         = await pickSeasons(p);
    data.symptoms        = await pickSymptoms(p);
    data.tags            = parseList(await p('標籤（可留空）：'));

    // 食材
    data.ingredients = [];
    console.log('\n── 食材清單（輸入空白結束）──');
    while (true) {
      const item   = (await p('  食材名稱（空白結束）：')).trim();
      if (!item) break;
      const amount = (await p(`  ${item} 份量：`)).trim();
      data.ingredients.push({ item, amount });
    }

    // 步驟
    data.instructions = [];
    console.log('\n── 調製步驟（輸入空白結束）──');
    let step = 1;
    while (true) {
      const s = (await p(`  步驟 ${step}（空白結束）：`)).trim();
      if (!s) break;
      data.instructions.push(s);
      step++;
    }

    data.pairings = [];
  }

  if (itype === 'formula') {
    data.id              = 'TEMP';
    data.name            = (await p('方劑名稱：')).trim();
    data.category        = (await p('分類（如：補氣劑、清熱劑）：')).trim();
    data.herbs           = parseList(await p('組成藥材（如：人參、白朮、茯苓）：'));
    data.dosage          = (await p('劑量（如：人參9g、白朮9g）：')).trim();
    data.effects         = parseList(await p('功效：'));
    data.indications     = (await p('主治：')).trim();
    data.contraindications = (await p('禁忌：')).trim();
    data.source          = (await p('出處（如：《傷寒論》）：')).trim();
    data.tags            = parseList(await p('標籤（可留空）：'));
    data.symptoms        = await pickSymptoms(p);

    // 調製步驟
    data.instructions = [];
    console.log('\n── 調製步驟（輸入空白結束）──');
    let step = 1;
    while (true) {
      const s = (await p(`  步驟 ${step}（空白結束）：`)).trim();
      if (!s) break;
      data.instructions.push(s);
      step++;
    }
  }

  rl.close();

  if (!data.name) { console.log('✗ 名稱不可為空'); return null; }
  return [{ type: itype, data }];
}

async function pickSymptoms(p) {
  console.log('\n── 適用症狀（輸入編號，多個用逗號分隔，可留空）──');
  VALID_SYMPTOMS.forEach((s, i) => process.stdout.write(`  ${i+1}.${s}  `));
  process.stdout.write('\n');
  const input = (await p('  輸入編號：')).trim();
  if (!input) return [];
  return input.split(/[,，、\s]+/)
    .map(n => VALID_SYMPTOMS[parseInt(n, 10) - 1])
    .filter(Boolean);
}

async function pickSeasons(p) {
  const map = { '1':'spring','2':'summer','3':'autumn','4':'winter' };
  const input = (await p('適用季節（1春 2夏 3秋 4冬，多個用逗號，空白=全年）：')).trim();
  if (!input) return ['spring','summer','autumn','winter'];
  return input.split(/[,，、\s]+/).map(n => map[n]).filter(Boolean);
}

// ══════════════════════════════════════════════════════
// Git 工具
// ══════════════════════════════════════════════════════
function git(cmd) {
  try {
    return {
      out:  execSync(`git ${cmd}`, { cwd: DIR, encoding: 'utf8' }).trim(),
      code: 0,
    };
  } catch (e) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status || 1 };
  }
}

function gitHasChanges() {
  return git('status --short').out.trim().length > 0;
}

function gitCommitPush(message, push = true) {
  git('add -A');
  const { out, code } = git(`commit -m "${message}"`);
  if (out.includes('nothing to commit') || (code !== 0 && out.includes('nothing'))) {
    console.log('  ℹ 無需提交（無變更）');
    return false;
  }
  if (code !== 0) {
    console.log(`  ✗ Commit 失敗：${out}`);
    return false;
  }
  console.log(`  ✓ 已提交：${message}`);
  if (push) {
    const { code: pc } = git('push');
    if (pc === 0) {
      console.log('  ✓ 已推送至 GitHub');
    } else {
      console.log('  ✗ 推送失敗，請手動執行 git push');
    }
  }
  return true;
}

// ══════════════════════════════════════════════════════
// Manifest
// ══════════════════════════════════════════════════════
function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════
// Claude API 解析
// ══════════════════════════════════════════════════════
const PARSE_PROMPT = `\
你是中醫資料整理專家。請將以下 Markdown 研究資料整理成 JSON 陣列，以便匯入中醫網站資料庫。

檔案：{filename}
---
{content}
---

根據內容新增以下一或多種類型（id 填 "TEMP"，程式會自動編號）：

herb（單味藥材）：
{"type":"herb","data":{"id":"TEMP","name":"藥材名","category":"分類","nature":"溫/平/涼/寒","flavor":"味道","meridians":["歸經"],"effects":["功效"],"indications":"主治","contraindications":"禁忌","commonPairings":["搭配"],"symptoms":["症狀"]}}

tea（養生茶飲）：
{"type":"tea","data":{"id":"TEMP","name":"茶飲名","category":"分類","difficulty":"簡易/中等/稍複雜","ingredients":[{"item":"食材","amount":"份量"}],"instructions":["步驟"],"effects":["功效"],"indications":"適用","bestTime":"飲用時機","contraindications":"禁忌","suitableFor":["族群"],"pairings":[{"add":"搭配","reason":"原因"}],"seasons":["spring/summer/autumn/winter"],"symptoms":["症狀"],"tags":["標籤"]}}

formula（方劑）：
{"type":"formula","data":{"id":"TEMP","name":"方劑名","category":"分類","herbs":["藥材"],"dosage":"劑量","instructions":["步驟"],"effects":["功效"],"indications":"主治","contraindications":"禁忌","source":"出處","tags":["標籤"],"symptoms":["症狀"]}}

symptoms 只能從以下選擇：{symptoms}
seasons 從 spring/summer/autumn/winter 選。
只回傳 JSON 陣列，不含任何說明文字。資料不足則回傳 []。`;

function callDeepSeek(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:    MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    });
    const req = require('https').request({
      hostname: 'api.deepseek.com',
      path:     '/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
          resolve(json.choices[0].message.content.trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function parseWithClaude(mdPath) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.log('  [!] 未設定環境變數 DEEPSEEK_API_KEY');
    console.log('      Windows 設定方式（在命令提示字元執行）：');
    console.log('      setx DEEPSEEK_API_KEY "sk-你的金鑰"');
    console.log('      （設定後需重新開啟終端機）');
    return null;
  }

  const content = fs.readFileSync(mdPath, 'utf8');
  const prompt  = PARSE_PROMPT
    .replace('{filename}', path.basename(mdPath))
    .replace('{content}',  content)
    .replace('{symptoms}', VALID_SYMPTOMS.join('、'));

  console.log('  ⏳ DeepSeek 解析中...');

  try {
    const text = await callDeepSeek(apiKey, prompt);
    const m    = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    return JSON.parse(m[0]);
  } catch (e) {
    console.log(`  ✗ API 錯誤：${e.message}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════
// data.js 操作
// ══════════════════════════════════════════════════════
function toJsObject(d, indent = 4) {
  /** 將物件轉成 data.js 相容格式（識別符 key 不加引號） */
  const raw      = JSON.stringify(d, null, 2);
  const unquoted = raw.replace(/"([A-Za-z_$][A-Za-z0-9_$]*)"(\s*:)/g, '$1$2');
  const pad      = ' '.repeat(indent);
  return unquoted.split('\n').map(l => pad + l).join('\n');
}

function nextId(content, prefix) {
  const re   = new RegExp(`id:\\s*"${prefix}(\\d+)"`, 'g');
  const nums = [];
  let m;
  while ((m = re.exec(content)) !== null) nums.push(parseInt(m[1], 10));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function nameExists(content, name) {
  return content.includes(`name: "${name}"`);
}

function insertEntry(content, section, entryJs) {
  const markers = {
    formula: '\n  ],\n  herbs:',
    herb:    '\n  ],\n  teas:',
    tea:     '\n  ]\n};',
  };
  const marker = markers[section];
  if (!marker) return content;
  const idx = content.indexOf(marker);
  if (idx === -1) {
    console.log(`  ✗ 找不到 ${section} 插入點，請確認 data.js 結構`);
    return content;
  }
  return content.slice(0, idx) + ',\n' + entryJs + content.slice(idx);
}

function applyItems(items, preview = false) {
  let content = fs.readFileSync(DATA_JS, 'utf8');
  const added = [];
  const labels  = { formula: '方劑', herb: '藥材', tea: '茶飲' };
  const prefixes = { formula: 'f', herb: 'h', tea: 't' };

  for (const item of items) {
    const itype = item.type || '';
    const data  = item.data || {};
    const name  = (data.name || '').trim();

    if (!name)              { console.log('  ✗ 缺少 name，略過'); continue; }
    if (!labels[itype])     { console.log(`  ✗ 未知類型 "${itype}"，略過`); continue; }
    if (nameExists(content, name)) {
      console.log(`  ↩  ${name}（已存在，略過）`);
      continue;
    }

    data.id = nextId(content, prefixes[itype]);
    const entry = toJsObject(data);

    // 無論 preview 與否都更新 content，讓 nextId 能正確遞增
    content = insertEntry(content, itype, entry);

    if (preview) {
      console.log(`  📋 ${labels[itype]}：${name}（${data.id}）`);
    } else {
      added.push(name);
      console.log(`  ✓ 新增${labels[itype]}：${name}（${data.id}）`);
    }
  }

  if (added.length > 0) {
    fs.writeFileSync(DATA_JS, content, 'utf8');
  }
  return added;
}

// ══════════════════════════════════════════════════════
// 主流程
// ══════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   本草藥典  自動更新腳本  v1.1        ║');
  console.log('╚══════════════════════════════════════╝\n');

  const manifest = loadManifest();
  let   allAdded = [];

  // ── 手動新增模式（不需 API）────────────────────────
  if (ADD_MODE) {
    const items = await manualAdd();
    if (items) {
      const added = applyItems(items, PREVIEW);
      allAdded = allAdded.concat(added);
    }
    if (PREVIEW) { console.log('\n（預覽模式：未寫入任何資料）'); return; }
    if (allAdded.length === 0) return;
    // 直接進入 git 推送
    console.log('\n📦 同步至 GitHub...');
    const now = new Date().toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).replace(/\//g, '-');
    gitCommitPush(`新增資料：${allAdded.join('、')}（${now}）`, !NO_PUSH);
    console.log('\n🎉 完成！');
    return;
  }

  // ── 步驟 1：掃描並解析新 .md 檔案 ──────────────────
  if (!PUSH_ONLY) {
    const mdFiles = fs.readdirSync(DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => path.join(DIR, f));

    const newMds = mdFiles.filter(f => {
      const name  = path.basename(f);
      const mtime = fs.statSync(f).mtimeMs;
      return (manifest[name] || 0) < mtime;
    });

    if (newMds.length > 0) {
      console.log(`📄 發現 ${newMds.length} 個新增 / 修改的 .md 檔案：`);
      newMds.forEach(f => console.log(`   • ${path.basename(f)}`));

      for (const mdPath of newMds) {
        const name = path.basename(mdPath);
        console.log(`\n🔍 解析：${name}`);
        const items = await parseWithClaude(mdPath);

        if (items === null) {
          console.log('   （解析失敗，略過，下次仍會重試）');
        } else if (items.length === 0) {
          console.log('  ℹ 無法從此檔案提取結構化資料');
          if (!PREVIEW) manifest[name] = fs.statSync(mdPath).mtimeMs;
        } else {
          const added = applyItems(items, PREVIEW);
          allAdded = allAdded.concat(added);
          if (!PREVIEW) manifest[name] = fs.statSync(mdPath).mtimeMs;
        }
      }

      if (!PREVIEW) saveManifest(manifest);

    } else {
      console.log('✅ 無新增或修改的 .md 檔案\n');
    }
  }

  if (PREVIEW) {
    console.log('\n（預覽模式：未寫入任何資料）');
    return;
  }

  // ── 步驟 2：Git 提交並推送 ────────────────────────
  console.log('\n📦 同步至 GitHub...');

  if (!gitHasChanges() && allAdded.length === 0) {
    console.log('  ℹ 所有檔案均已是最新狀態');
    console.log('\n✅ 完成！');
    return;
  }

  const now = new Date().toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(/\//g, '-');

  let msg;
  if (allAdded.length > 0) {
    const names = allAdded.slice(0, 3).join('、');
    const suffix = allAdded.length > 3 ? ` 等共 ${allAdded.length} 筆` : '';
    msg = `新增資料：${names}${suffix}（${now}）`;
  } else {
    msg = `更新網站內容（${now}）`;
  }

  gitCommitPush(msg, !NO_PUSH);
  console.log('\n🎉 完成！');
}

main().catch(e => {
  console.error('\n✗ 發生錯誤：', e.message);
  process.exit(1);
});

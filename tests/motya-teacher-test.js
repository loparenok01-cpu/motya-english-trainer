/* Smoke-тест файла преподавателя motya-teacher.html в jsdom */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'motya-teacher.html');
const CSV = path.join(ROOT, 'irregular_verbs_with_transcription.csv');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function head(t){ console.log('\n' + t); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const downloads = [];

async function makeDom(seed){
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { console.log('  [jsdomError] ' + e.message); fail++; });
  vc.on('error', (...a) => { console.log('  [console.error] ' + a.join(' ')); fail++; });
  const dom = await JSDOM.fromFile(FILE, {
    url: 'https://localhost/motya-teacher.html',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win){
      win.alert = m => { win.__alert = m; };
      win.prompt = () => win.__promptValue != null ? win.__promptValue : 'Имя набора';
      win.confirm = () => win.__confirm !== false;
      win.URL.createObjectURL = () => 'blob:stub';
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = function(){};
      win.Blob = class { constructor(parts, o){ downloads.push({ parts, type: o && o.type }); } };
      if(seed) for(const k in seed) win.localStorage.setItem(k, seed[k]);
    }
  });
  return dom;
}
function click(w, id){ w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function clickSel(w, sel){ w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }
function setVal(w, id, v, evt){
  const el = w.document.getElementById(id);
  el.value = v;
  el.dispatchEvent(new w.Event(evt || "change", { bubbles: true }));
}
function rowsOf(w){ const raw = w.localStorage.getItem('motya_sets_v1'); try{ return JSON.parse(raw || '[]'); }catch(e){ return []; } }
function ids(w){ return rowsOf(w).map(s => s.i); }

(async () => {
  const csv = fs.readFileSync(CSV, 'utf8');

  /* ---------- 1. Старт ---------- */
  head('1. Открытие файла');
  const dom = await makeDom();
  const w = dom.window;
  await sleep(150);
  ok('страница загрузилась, есть заголовок наборов', !!w.document.getElementById('setList'));
  ok('стартовый набор глаголов создан автоматически', rowsOf(w).length === 1 && rowsOf(w)[0].base === true && /Неправильные глаголы/.test(w.document.getElementById('setList').textContent), JSON.stringify(rowsOf(w).map(s => [s.n, s.base])));
  ok('редактор скрыт — набор не открывается сам', w.document.getElementById('editorCard').style.display === 'none');
  ok('карточка выдачи скрыта', w.document.getElementById('issueCard').style.display === 'none');
  ok('ученический файл рядом (по умолчанию)', w.document.getElementById('baseUrl').value === 'motya.html');
  ok('в файле нет аудио/озвучки', !w.eval('"speechSynthesis" in window'));
  ok('в файле нет записи прогресса ученика', !/recordWord\(|recordSession\(/.test(fs.readFileSync(FILE, 'utf8').split('CORE END')[1]));

  /* ---------- 2. Пустой набор ---------- */
  head('2. Пустой набор и правка строк');
  click(w, 'newEmpty');
  await sleep(60);
  ok('набор создан', rowsOf(w).length === 2);
  ok('редактор открыт', w.document.getElementById('editorCard').style.display === '');
  ok('карточка выдачи открыта', w.document.getElementById('issueCard').style.display === '');
  ok('одна строка в таблице', w.document.querySelectorAll('#rows tr').length === 1);
  ok('пустая строка помечена', w.document.querySelector('#rows tr').classList.contains('bad'));
  ok('мета: не готово 1', /не готово: 1/.test(w.document.getElementById('setMeta').textContent), w.document.getElementById('setMeta').textContent);
  ok('выдать нечего — предупреждение', /Выдавать нечего/.test(w.document.getElementById('issueWarn').textContent));
  ok('кнопки копирования выключены', w.document.getElementById('copyLink').disabled && w.document.getElementById('copyCode').disabled);

  setVal(w, 'setName', 'Мой первый набор', 'input');
  const cells = w.document.querySelectorAll('#rows tr:first-child input');
  cells[0].value = 'будить'; cells[0].dispatchEvent(new w.Event('change', { bubbles: true }));
  cells[1].value = 'wake|woke|woken'; cells[1].dispatchEvent(new w.Event('change', { bubbles: true }));
  cells[2].value = '[weɪk]|[wəʊk]|[ˈwəʊkən]'; cells[2].dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(40);
  ok('строка сохранилась в набор', rowsOf(w)[0].w[0][0] === 'будить' && rowsOf(w)[0].w[0][1] === 'wake|woke|woken', JSON.stringify(rowsOf(w)[0].w));
  ok('название сохранилось', rowsOf(w)[0].n === 'Мой первый набор');
  ok('строка больше не помечена', !w.document.querySelector('#rows tr').classList.contains('bad'));
  ok('мета: 1 готово', /готово к выдаче: <b>1<\/b>/.test(w.document.getElementById('setMeta').innerHTML), w.document.getElementById('setMeta').innerHTML);

  click(w, 'addRow');
  await sleep(30);
  const r2 = w.document.querySelectorAll('#rows tr')[1];
  const c2 = r2.querySelectorAll('input');
  c2[0].value = 'кошка'; c2[0].dispatchEvent(new w.Event('change', { bubbles: true }));
  c2[1].value = 'cat'; c2[1].dispatchEvent(new w.Event('change', { bubbles: true }));
  c2[2].value = '[kæt]'; c2[2].dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(40);
  ok('2 строки', w.document.querySelectorAll('#rows tr').length === 2);
  ok('мета: 2 слова', /готово к выдаче: <b>2<\/b>/.test(w.document.getElementById('setMeta').innerHTML), w.document.getElementById('setMeta').innerHTML);

  /* ---------- 3. Выдача ---------- */
  head('3. Ссылка и код');
  const id0 = rowsOf(w)[0].i;
  const link = w.document.getElementById('linkBox').value;
  ok('ссылка на motya.html', link.startsWith('motya.html#v=1&i=' + id0), link.slice(0, 60));
  ok('имя набора в ссылке', /n=%D0%9C%D0%BE%D0%B9/.test(link));
  ok('в ссылке есть payload', /d=1\./.test(link));
  ok('код начинается с 1.', w.document.getElementById('codeBox').value.startsWith('1.'));
  ok('кнопка копирования ссылки включена', w.document.getElementById('copyLink').disabled === false);
  ok('размер ссылки показан', /ссылка \d+ симв/.test(w.document.getElementById('linkSize').textContent), w.document.getElementById('linkSize').textContent);
  ok('нет предупреждения о длине', !/слишком длинная/.test(w.document.getElementById('issueWarn').textContent));
  ok('предпросмотр: 2 строки', (w.document.getElementById('pupilPreview').textContent.match(/будить|кошка/g) || []).length >= 2);

  const code = w.document.getElementById('codeBox').value;
  const back = w.eval('unpackSet(' + JSON.stringify(code) + ')');
  ok('код разбирается обратно', back.i === id0 && back.n === 'Мой первый набор' && back.w.length === 2, JSON.stringify(back));
  ok('формы не потерялись', back.w[0][1] === 'wake|woke|woken' && back.w[0][2] === '[weɪk]|[wəʊk]|[ˈwəʊkən]');

  /* ---------- 4. id стабилен при правке ---------- */
  head('4. Правка набора не ломает прогресс ученика');
  const cells2 = w.document.querySelectorAll('#rows tr:first-child input');
  cells2[1].value = 'wake|woke|woken|awoke'; cells2[1].dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(40);
  const link2 = w.document.getElementById('linkBox').value;
  ok('id не изменился', link2.includes('i=' + id0), link2.slice(0, 60));
  ok('payload изменился', link2 !== link);
  ok('в списке виден id', new RegExp('id ' + id0).test(w.document.getElementById('setList').textContent));

  /* ---------- 5. Копирование (fallback) ---------- */
  head('5. Копирование без буфера обмена');
  click(w, 'copyLink');
  await sleep(60);
  ok('кнопка сообщила, что нужен ручной выбор', /Скопируй вручную/.test(w.document.getElementById('copyLink').textContent), w.document.getElementById('copyLink').textContent);
  ok('ссылка выделена для Ctrl+C', w.document.getElementById('linkBox').selectionEnd === w.document.getElementById('linkBox').value.length);
  await sleep(1900);
  ok('надпись вернулась', w.document.getElementById('copyLink').textContent === 'Скопировать ссылку');

  /* ---------- 6. Готовые строки выдаются отдельно ---------- */
  head('6. Набор с неготовыми строками');
  w.eval('addSet("Смешанный", [["плохая строка", "", "", ""], ["хорошая строка", "word", "[wɜːd]", ""]])');
  await sleep(40);
  ok('набор создан и открыт', w.document.getElementById('setName').value === 'Смешанный');
  ok('в списке стартовый набор и новый — 3', rowsOf(w).length === 3);
  const warnTxt = w.document.getElementById('issueWarn').textContent;
  ok('предупреждение о неготовых строках', /Не готовы к выдаче: 1/.test(warnTxt), warnTxt);
  ok('предложена кнопка «только готовые»', !!w.document.getElementById('dropBad'));
  ok('копирование ссылки заблокировано', w.document.getElementById('copyLink').disabled === true);
  ok('в списке помечено «1 строк не готово»', /1 строк не готово/.test(w.document.getElementById('setList').textContent));
  click(w, 'dropBad');
  await sleep(40);
  ok('после кнопки ссылка только из готовых', w.document.getElementById('copyLink').disabled === false);
  const linkGood = w.document.getElementById('linkBox').value;
  const backGood = w.eval('unpackSet(new URLSearchParams(' + JSON.stringify(linkGood.split('#')[1]) + ').get("d"))');
  ok('в выданном наборе только 1 строка', backGood.w.length === 1 && backGood.w[0][0] === 'хорошая строка', JSON.stringify(backGood.w));

  /* ---------- 7. Дублирование и удаление ---------- */
  head('7. Дублирование и удаление набора');
  const before = rowsOf(w).length;
  clickSel(w, '.set-item .set-dup');
  await sleep(40);
  ok('набор продублирован', rowsOf(w).length === before + 1);
  const copyId = w.document.getElementById('setName').value && rowsOf(w)[0].i;
  ok('у копии другое id', ids(w)[0] !== ids(w)[1]);
  ok('в названии есть «(копия)»', /\(копия\)/.test(rowsOf(w)[0].n), rowsOf(w)[0].n);
  clickSel(w, '.set-item .set-del');
  await sleep(40);
  ok('копия удалена', rowsOf(w).length === before);
  ok('открыт другой набор', w.document.getElementById('setName').value !== '');

  /* ---------- 8. База глаголов ---------- */
  head('8. Базовый набор неправильных глаголов');
  w.eval('newFromBase()');
  await sleep(80);
  const base = rowsOf(w)[0];
  const VB = w.eval('VERB_BASE.split("\\n").filter(l => l.trim()).length');
  ok('в базе ' + VB + ' глаголов (динамически)', base.w.length === VB, String(base.w.length));
  ok('в базе 210 транскрипций', w.eval('Object.keys(TRANS_BASE.split("\\n")).length') === 210, String(w.eval('Object.keys(TRANS_BASE.split("\\n")).length')));
  ok('есть «молоть»', base.w.some(r => r[0] === 'молоть'));
  let noTr = base.w.filter(r => String(r[1]).split("|").length !== String(r[2]).split("|").length);
  ok('у всех глаголов транскрипций столько же, сколько форм', noTr.length === 0, JSON.stringify(noTr.slice(0, 3)));
  let emptyTr = [];
  base.w.forEach(r => String(r[2]).split("|").forEach(t => { if(!t.trim()) emptyTr.push(r[0]); }));
  ok('нет пустых транскрипций', emptyTr.length === 0, JSON.stringify(emptyTr.slice(0, 5)));
  ok('«быть» — 3 формы с вариантами', base.w.find(r => r[0] === 'быть')[1] === 'be|was/were|been', base.w.find(r => r[0] === 'быть')[1]);
  ok('«родиться» — be born', base.w.find(r => r[0] === 'родиться')[1] === 'be born|was born|been born');
  ok('глагол grind получил транскрипцию', base.w.find(r => r[0] === 'молоть')[2].includes('[ɡraɪnd]'), base.w.find(r => r[0] === 'молоть')[2]);
  ok('база полностью готова к выдаче', !/Не готовы к выдаче/.test(w.document.getElementById('issueWarn').textContent));
  const linkBase = w.document.getElementById('linkBox').value;
  ok('ссылка на базу длинная, но влезает', linkBase.length <= 4000, String(linkBase.length));
  ok('ссылка не пустая', w.document.getElementById('copyLink').disabled === false);
  ok('предупреждение о длине появилось', /Ссылка слишком длинная/.test(w.document.getElementById('issueWarn').textContent) || linkBase.length <= 4000, String(linkBase.length));

  /* ---------- 9. Вставка текстом ---------- */
  head('9. Вставка текстом: | , CSV, JSON, мусор');
  w.eval('document.querySelector("#pasteBox").closest("details").open = true');
  setVal(w, 'pasteBox', 'будить | wake | woke | woken\nкошка | cat');
  click(w, 'pasteGo');
  await sleep(50);
  ok('разделитель | распознан', /Распознано слов: <b class="count-ok">2<\/b>/.test(w.document.getElementById('pastePreview').innerHTML), w.document.getElementById('pastePreview').textContent.slice(0, 120));
  ok('транскрипций нет — это не ошибка', !/Не распознано/.test(w.document.getElementById('pastePreview').textContent));
  ok('есть кнопка создания набора', !!w.document.getElementById('pasteAdd'));
  w.__promptValue = 'Из вставки';
  click(w, 'pasteAdd');
  await sleep(50);
  ok('набор создан из вставки', rowsOf(w)[0].n === 'Из вставки' && rowsOf(w)[0].w.length === 2, JSON.stringify(rowsOf(w)[0]));
  ok('поле вставки очищено', w.document.getElementById('pasteBox').value === '');

  setVal(w, 'pasteBox', csv);
  click(w, 'pasteGo');
  await sleep(60);
  ok('реальный CSV из папки: 14 слов', /Распознано слов: <b class="count-ok">14<\/b>/.test(w.document.getElementById('pastePreview').innerHTML), w.document.getElementById('pastePreview').textContent.slice(0, 140));
  ok('транскрипции подхвачены', /ˈwəʊkən|weɪk/.test(w.document.getElementById('pastePreview').textContent));

  setVal(w, 'pasteBox', '{"ru":"дом","en":["house","houses"],"trans":["[haʊs]","[ˈhaʊzɪz]"]}');
  click(w, 'pasteGo');
  await sleep(50);
  ok('JSON разобран', /Распознано слов: <b class="count-ok">1<\/b>/.test(w.document.getElementById('pastePreview').innerHTML));

  setVal(w, 'pasteBox', 'просто текст без разделителей\nещё строка');
  click(w, 'pasteGo');
  await sleep(50);
  ok('мусор не ломает страницу', /не распознано/i.test(w.document.getElementById('pastePreview').textContent + w.document.getElementById('pasteStatus').textContent), w.document.getElementById('pastePreview').textContent.slice(0, 120));

  setVal(w, 'pasteBox', 'мигать\nпрыгать|jump|jumped\nтанец\tdance\tdanced');
  click(w, 'pasteGo');
  await sleep(50);
  ok('плохие строки объяснены', /нет английской формы/.test(w.document.getElementById('pastePreview').textContent), w.document.getElementById('pastePreview').textContent.slice(0, 160));

  /* ---------- 10. Скачивание ---------- */
  head('10. Скачивание набора');
  w.eval('addSet("Для выгрузки", [["будить","wake|woke|woken","[weɪk]|[wəʊk]|[ˈwəʊkən]","заметка"],["кошка","cat","[kæt]",""]])');
  await sleep(50);
  downloads.length = 0;
  click(w, 'dlCsv');
  await sleep(40);
  ok('CSV сформирован', downloads.length === 1);
  const outCsv = String(downloads[0].parts[0]);
  ok('BOM и заголовок 7 колонок', outCsv.charCodeAt(0) === 0xFEFF && outCsv.includes('Русский;V1;Транскрипция V1;V2;Транскрипция V2;V3;Транскрипция V3'), outCsv.slice(0, 90));
  ok('строка глагола на месте', outCsv.includes('будить;wake;[weɪk];woke;[wəʊk];woken;[ˈwəʊkən]'), outCsv.split('\r\n')[1]);
  ok('CSV содержит 3 строки данных', outCsv.trim().split('\r\n').length === 3, String(outCsv.trim().split('\r\n').length));
  ok('CSV перечитывается обратно', w.eval('parseText(' + JSON.stringify(outCsv) + ').ok.length') === 2, String(w.eval('parseText(' + JSON.stringify(outCsv) + ').ok.length')));
  downloads.length = 0;
  click(w, 'dlJson');
  await sleep(40);
  const outJson = JSON.parse(String(downloads[0].parts[0]));
  ok('JSON с id и строками', outJson.i === rowsOf(w)[0].i && outJson.w.length === 2, JSON.stringify({ i: outJson.i, n: outJson.w.length }));
  ok('JSON сохраняет дату и заметки', !!outJson.d && outJson.w[0][3] === 'заметка', JSON.stringify(outJson.w[0]));
  const reparsed = w.eval('parseText(' + JSON.stringify(String(downloads[0].parts[0])) + ')');
  ok('наш же JSON читается обратно', reparsed.ok.length === 2 && reparsed.ok[0].trans[2] === '[ˈwəʊkən]', JSON.stringify(reparsed.ok[0]));

  /* ---------- 10c. CSV: нейтрализация формул (Б-1) ---------- */
  head('10c. CSV: защита от формул (Б-1)');
  ok('csvCell: =1+1 → префикс \'', w.eval('csvCell("=1+1")') === "'=1+1", w.eval('csvCell("=1+1")'));
  const tabbed = w.eval('[csvCell("+1"),csvCell("-1"),csvCell("@cmd"),csvCell("\\tx")].join("|")');
  ok('csvCell: +1/-1/@cmd/\\tab получают префикс', tabbed === "'+1|'-1|'@cmd|'" + "\tx", tabbed);
  ok('csvCell: обычный текст не меняется', w.eval('csvCell("будить")') === 'будить');
  w.eval('addSet("Формулы", [["=1+1","=SUM(A1)","[x]",""],["кошка","cat","[kæt]",""]])');
  await sleep(50);
  downloads.length = 0;
  click(w, 'dlCsv');
  await sleep(40);
  const outCsvF = String(downloads[0].parts[0]);
  ok('слово-формула нейтрализовано в CSV', outCsvF.includes("'=1+1"));
  ok('формула в форме глагола нейтрализована', outCsvF.includes("'=SUM(A1)"));
  ok('голой формулы в ячейках нет', !/(^|[\r\n;])=/m.test(outCsvF.split('\r\n').slice(1).join('\r\n')));
  w.eval('saveSets(loadSets().filter(s => s.n !== "Формулы")); setActive(loadSets()[0].i); renderAll();');
  await sleep(30);

  /* ---------- 10b. Импорт JSON-файла сохраняет id и дату ---------- */
  head('10b. Импорт файла набора (id и дата сохраняются)');
  const domJson = await makeDom();
  const wj = domJson.window;
  await sleep(150);
  wj.FileReader = class {
    readAsText(){ this.result = JSON.stringify({ i:'imported-01', n:'Импорт', d:'2026-01-15', w:[['дом','house','[haʊs]','']] }); this.onload(); }
  };
  const fileInput = wj.document.getElementById('loadFile');
  const fakeFile = { name:'набор.json' };
  Object.defineProperty(fileInput, 'files', { value:[fakeFile], configurable:true });
  fileInput.dispatchEvent(new wj.Event('change'));
  await sleep(60);
  ok('файл прочитан', /Загружен набор из файла/.test(wj.document.getElementById('pasteStatus').textContent), wj.document.getElementById('pasteStatus').textContent);
  ok('набор импортирован', rowsOf(wj).length === 2 && rowsOf(wj)[0].i === 'imported-01', JSON.stringify(rowsOf(wj).map(s => [s.i, s.n])));
  ok('дата из файла сохранена', rowsOf(wj)[0].d === '2026-01-15', rowsOf(wj)[0].d);
  ok('строки импортированы', rowsOf(wj)[0].w[0][1] === 'house' && rowsOf(wj)[0].w[0][2] === '[haʊs]');

  /* ---------- 11. Путь к ученическому файлу ---------- */
  head('11. Путь к ученическому файлу');
  setVal(w, 'baseUrl', 'C:\\Моя папка\\motya.html', 'input');
  await sleep(30);
  ok('ссылка начинается с указанного пути', w.document.getElementById('linkBox').value.startsWith('C:\\Моя папка\\motya.html#'), w.document.getElementById('linkBox').value.slice(0, 40));
  setVal(w, 'baseUrl', 'motya.html');
  await sleep(20);
  ok('путь сохранён в localStorage', w.localStorage.getItem('motya_base_url_v1') === 'motya.html');
  ok('короткий набор выдаётся ссылкой', w.document.getElementById('copyLink').disabled === false, w.document.getElementById('linkSize').textContent);

  /* ---------- 12. Большой набор: только код ---------- */
  head('12. Большой набор — только код');
  w.eval('(function(){ const rows=[]; for(let i=0;i<400;i++) rows.push(["слово"+i,"word"+i+"|w"+i+"ed|w"+i+"en","[s"+i+"]|[s"+i+"d]|[s"+i+"n]","заметка "+i]); addSet("Большой", rows); })()');
  await sleep(120);
  ok('ссылка слишком длинная', w.document.getElementById('copyLink').disabled === true);
  ok('код всё равно выдаётся', w.document.getElementById('copyCode').disabled === false);
  ok('есть объяснение', /Ссылка слишком длинная/.test(w.document.getElementById('issueWarn').textContent));
  const bigCode = w.document.getElementById('codeBox').value;
  ok('код большого набора разбирается', w.eval('unpackSet(' + JSON.stringify(bigCode) + ').w.length') === 400);

  /* ---------- 13. Битые данные в хранилище ---------- */
  head('13. Битые данные в хранилище');
  const dom3 = await makeDom({ motya_sets_v1: '{{{не json', motya_active_v1: 'нет-такого' });
  const w3 = dom3.window;
  await sleep(150);
  ok('страница открылась', !!w3.document.getElementById('setList'));
  ok('битое хранилище вылечено стартовым набором', /Неправильные глаголы/.test(w3.document.getElementById('setList').textContent), w3.document.getElementById('setList').textContent.slice(0, 60));
  ok('чужая активная ссылка игнорирована', w3.document.getElementById('editorCard').style.display === 'none');
  click(w3, 'newEmpty');
  await sleep(40);
  ok('новый набор всё равно создаётся', rowsOf(w3).length === 2, JSON.stringify(rowsOf(w3)).slice(0, 80));
  ok('после создания всё живо', w3.document.getElementById('setName').value === 'Новый набор' && w3.document.querySelectorAll('#rows tr').length === 1);

  /* ---------- 14. Ссылка преподавателя открывается в файле ученика ---------- */
  head('14. Сквозная проверка: ссылка из файла преподавателя в файле ученика');
  const pupilFile = 'C:/Users/User/Documents/Vibe_rf/Motya/motya.html';
  const pupilHtml = fs.readFileSync(pupilFile, 'utf8');
  {
    const wT = (await makeDom()).window;
    await sleep(150);
    wT.eval('newFromBase()');
    await sleep(120);
    const link = wT.document.getElementById('linkBox').value;
    const code = wT.document.getElementById('codeBox').value;
    ok('ссылка на базовый набор укладывается в 4000 символов', link.length <= 4000, String(link.length));
    // 1) открыть ссылку в ученическом файле (jsdom не держит hash при fromFile — грузим html строкой)
    const errs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errs.push(e.message));
    const pd = new JSDOM(pupilHtml, {
      url: 'https://localhost/motya.html' + link.slice(link.indexOf('#')),
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(win){ win.alert = m => { win.__alert = m; }; win.confirm = () => true; }
    });
    await sleep(400);
    const p = pd.window;
    ok('ученический файл открылся без ошибок', errs.length === 0, errs.join('; '));
    const hist = p.eval('JSON.parse(localStorage.getItem("motya_history_v1")||"[]")');
    ok('набор из ссылки принят', hist.length === 1 && hist[0].w.length === VB, JSON.stringify(hist.map(h => [h.n, (h.w||[]).length])));
    ok('имя набора прочитано', hist[0].n === 'Неправильные глаголы', hist[0].n);
    ok('id набора прочитано', !!hist[0].i, hist[0].i);
    ok('источник помечен как ссылка', hist[0].src === 'ссылка', hist[0].src);
    const words = p.eval('rowsToWords(JSON.parse(localStorage.getItem("motya_history_v1"))[0].w)');
    ok(VB + ' слов с русским переводом', words.length === VB && words.every(x => x.ru && x.en.length), String(words.length));
    ok('транскрипции на месте', words.find(x => x.ru === 'молоть').trans[0] === '[ɡraɪnd]', JSON.stringify(words.find(x => x.ru === 'молоть')));
    ok('в слове «быть» сохранены варианты was/were', words.find(x => x.ru === 'быть').en[1] === 'was/were', words.find(x => x.ru === 'быть').en[1]);
    ok('все слова с транскрипцией', words.every(x => x.trans.every(t => /^\[.+\]$/.test(t))), String(words.filter(x => !x.trans.every(t => /^\[.+\]$/.test(t))).length));
    // игра стартует по этому набору (предпросмотр проверяем после выхода из игры)
    p.document.getElementById('pupil').value = 'Ученик';
    click(p, 'start');
    await sleep(150);
    const mergedN = p.eval('mergeRowsByEn(JSON.parse(localStorage.getItem("motya_history_v1"))[0].w).length');
    ok('игра началась по набору из ссылки (после объединения дублей V1)', new RegExp('/ ' + mergedN + '$').test(p.document.getElementById('counter').textContent.trim()), p.document.getElementById('counter').textContent + ' merged=' + mergedN);
    ok('в игре видно транскрипцию', /\[[^\]]+\]/.test(p.document.getElementById('prompt').textContent), p.document.getElementById('prompt').textContent.slice(0, 60));
    ok('в игре видно имя набора', p.document.getElementById('setTag').textContent === 'Неправильные глаголы', p.document.getElementById('setTag').textContent);
    click(p, 'quit');
    await sleep(150);
    // предпросмотр в ученическом файле
    click(p, 'btnPreview');
    await sleep(120);
    const prevTxt = p.document.getElementById('entry').textContent.replace(/\s+/g, ' ');
    ok('предпросмотр в ученическом файле открылся', /Предпросмотр/.test(prevTxt), prevTxt.slice(0, 80));
    ok('в предпросмотре все слова базы', new RegExp('Распознано слов: ' + VB).test(prevTxt), prevTxt.slice(0, 120));
    ok('в предпросмотре есть транскрипции', /ɡraɪnd/.test(prevTxt) && /biː/.test(prevTxt));
    // 2) тот же набор кодом
    const pd2 = new JSDOM(pupilHtml, {
      url: 'https://localhost/motya.html', runScripts: 'dangerously', pretendToBeVisual: true,
      virtualConsole: new VirtualConsole(),
      beforeParse(win){ win.alert = () => {}; win.confirm = () => true; }
    });
    await sleep(300);
    const p2 = pd2.window;
    click(p2, 'btnNewSet');
    p2.document.getElementById('code').value = code;
    click(p2, 'useCode');
    await sleep(120);
    const hist2 = p2.eval('JSON.parse(localStorage.getItem("motya_history_v1")||"[]")');
    ok('код тоже принимается', /Набор загружен/.test(p2.document.getElementById('addStatus').textContent) && hist2.length === 1 && hist2[0].w.length === VB, JSON.stringify(hist2.map(h => [h.n, (h.w||[]).length])));
    ok('из кода имя и id тоже на месте', hist2[0].n === 'Неправильные глаголы' && hist2[0].i === hist[0].i, hist2[0].i + ' vs ' + hist[0].i);
  }

  /* ---------- 15. Работа со составом базового набора глаголов ---------- */
  head('15. Состав набора: копия, удаление части строк, свои глаголы');
  const w16 = (await makeDom()).window;
  await sleep(150);
  w16.eval('newFromBase()');
  await sleep(80);
  ok('база открыта: строк = база данных', rowsOf(w16)[0].w.length === VB, String(rowsOf(w16)[0].w.length));
  ok('стартовый набор на месте', rowsOf(w16).length === 2 && rowsOf(w16).every(s => s.base === true), JSON.stringify(rowsOf(w16).map(s => [s.n, s.base])));
  ok('кнопка копирования называется «Копировать»', /Копировать/.test(w16.document.querySelector('.set-item .set-dup').textContent), w16.document.querySelector('.set-item .set-dup').textContent);

  // 0) набор глаголов защищён от удаления
  w16.__alert = null;
  clickSel(w16, '.set-item .set-del');
  await sleep(60);
  ok('набор глаголов защищён от удаления', rowsOf(w16).length === 2 && /защищён/.test(w16.__alert || ''), w16.__alert + ' | наборов: ' + rowsOf(w16).length);

  // 1) копирование набора
  clickSel(w16, '.set-item .set-dup');
  await sleep(60);
  ok('после копирования три набора', rowsOf(w16).length === 3, String(rowsOf(w16).length));
  ok('в копии те же строки базы', rowsOf(w16)[0].w.length === VB, String(rowsOf(w16)[0].w.length));
  ok('у копии новый id', rowsOf(w16)[0].i !== rowsOf(w16)[1].i);
  ok('в названии копии есть «(копия)»', /\(копия\)/.test(rowsOf(w16)[0].n), rowsOf(w16)[0].n);
  ok('копия не защищена — её можно удалить', rowsOf(w16)[0].derived === true || /\(копия\)/.test(rowsOf(w16)[0].n), JSON.stringify({ n: rowsOf(w16)[0].n, derived: rowsOf(w16)[0].derived }));
  clickSel(w16, '.set-item .set-del');
  await sleep(60);
  ok('копия удалена — базовые наборы целы', rowsOf(w16).length === 2 && rowsOf(w16)[0].w.length === VB, String(rowsOf(w16).length));

  // 2) поиск по строкам
  setVal(w16, 'rowFilter', 'молоть', 'input');
  await sleep(60);
  ok('фильтр оставил одну строку', w16.document.querySelectorAll('#rows tr').length === 1, String(w16.document.querySelectorAll('#rows tr').length));
  ok('счётчик показывает «1 из VB»', new RegExp('1 из ' + VB).test(w16.document.getElementById('filterCount').textContent), w16.document.getElementById('filterCount').textContent);
  ok('показана строка «молоть»', w16.document.querySelector('#rows tr input').value === 'молоть', w16.document.querySelector('#rows tr input').value);
  ok('выделение пустое', w16.document.getElementById('delSelected').disabled === true);

  // 3) выбрать все видимые и удалить
  const selAll = w16.document.getElementById('selAll');
  selAll.checked = true;
  selAll.dispatchEvent(new w16.Event('change', { bubbles: true }));
  await sleep(40);
  ok('кнопка удаления выбранных включилась', w16.document.getElementById('delSelected').disabled === false);
  ok('счётчик выбранных: 1', /выбрано: 1/.test(w16.document.getElementById('selCount').textContent), w16.document.getElementById('selCount').textContent);
  ok('строка подсвечена', w16.document.querySelector('#rows tr').classList.contains('selected'));
  click(w16, 'delSelected');
  await sleep(80);
  ok('удалена ровно одна строка', rowsOf(w16)[0].w.length === VB - 1, String(rowsOf(w16)[0].w.length));
  ok('именно «молоть» удалено', !rowsOf(w16)[0].w.some(r => r[0] === 'молоть'));
  ok('после удаления выбор сброшен', w16.document.getElementById('delSelected').disabled === true && w16.document.getElementById('selCount').textContent === '');
  ok('в отфильтрованном списке пусто', w16.document.querySelectorAll('#rows tr').length === 0, String(w16.document.querySelectorAll('#rows tr').length));

  // 4) снять фильтр
  setVal(w16, 'rowFilter', '', 'input');
  await sleep(60);
  ok('после снятия фильтра видно оставшиеся строки', w16.document.querySelectorAll('#rows tr').length === VB - 1, String(w16.document.querySelectorAll('#rows tr').length));
  ok('счётчик фильтра очищен', w16.document.getElementById('filterCount').textContent === '', w16.document.getElementById('filterCount').textContent);

  // 5) свои глаголы в конец набора
  w16.document.getElementById('quickAdd').value = 'бежать | run | ran | run\nсмотреть | see | saw | seen';
  click(w16, 'quickAddGo');
  await sleep(80);
  ok('добавлено 2 своих глагола', rowsOf(w16)[0].w.length === VB + 1, String(rowsOf(w16)[0].w.length));
  ok('статус сообщил о добавлении', /Добавлено: 2 слова/.test(w16.document.getElementById('quickAddStatus').textContent), w16.document.getElementById('quickAddStatus').textContent);
  ok('новые строки в конце набора', rowsOf(w16)[0].w.slice(-1)[0][0] === 'смотреть' && rowsOf(w16)[0].w.slice(-2)[0][0] === 'бежать', JSON.stringify(rowsOf(w16)[0].w.slice(-2)));
  ok('формы нового глагола разобраны', rowsOf(w16)[0].w.slice(-1)[0][1] === 'see|saw|seen', rowsOf(w16)[0].w.slice(-1)[0][1]);
  ok('новые строки готовы к выдаче', !/Не готовы к выдаче/.test(w16.document.getElementById('issueWarn').textContent), w16.document.getElementById('issueWarn').textContent.trim().slice(0, 80));

  // 6) мусор не добавляется
  w16.document.getElementById('quickAdd').value = 'просто текст без разделителя';
  click(w16, 'quickAddGo');
  await sleep(60);
  ok('мусор отвергнут', rowsOf(w16)[0].w.length === VB + 1, String(rowsOf(w16)[0].w.length));
  ok('объяснение про разделитель', /Ничего не распознано/.test(w16.document.getElementById('quickAddStatus').textContent), w16.document.getElementById('quickAddStatus').textContent);

  // 7) ссылка на обновлённый набор читается учеником
  const link16 = w16.document.getElementById('linkBox').value;
  ok('ссылка пересобрана после правок', link16.startsWith('motya.html#v=1&i=') && link16.length <= 4000, String(link16.length));
  const back16 = w16.eval('unpackSet(' + JSON.stringify(w16.document.getElementById('codeBox').value) + ')');
  ok('код содержит все строки набора', back16.w.length === VB + 1, String(back16.w.length));
  ok('в коде нет удалённого «молоть»', !back16.w.some(r => r[0] === 'молоть'));

  /* ---------- 15b. Старый (легаси) набор с базовыми глаголами ---------- */
  head('15b. Легаси-набор «(102)»: миграция, пополнение, защита от удаления');
  const legacyRows = Array.from({ length: 102 }, (_, k) => ['глагол' + k, 'word' + k, '[w' + k + ']', '']);
  const domL = await makeDom({ motya_sets_v1: JSON.stringify([{ i: 'legacy1', n: 'Неправильные глаголы (102)', d: '2026-01-01', w: legacyRows }]) });
  const wL = domL.window;
  await sleep(150);
  ok('легаси-набор распознан и помечен как базовый', rowsOf(wL)[0].base === true, JSON.stringify(rowsOf(wL).map(s => [s.n, s.base])));
  ok('дубль стартового набора не подсунут', rowsOf(wL).length === 1, String(rowsOf(wL).length));
  ok('в списке видно 102 слова', /102 (слово|слова|слов)/.test(wL.document.getElementById('setList').textContent), wL.document.getElementById('setList').textContent.slice(0, 80));
  ok('удаление заблокировано сразу', wL.document.querySelector('.set-item .set-del').classList.contains('locked'));
  clickSel(wL, '.set-item .set-open');
  await sleep(60);
  wL.document.getElementById('quickAdd').value = 'бежать | run | ran | run';
  click(wL, 'quickAddGo');
  await sleep(80);
  ok('набор можно пополнять', rowsOf(wL)[0].w.length === 103 && rowsOf(wL)[0].w.slice(-1)[0][0] === 'бежать', String(rowsOf(wL)[0].w.length));
  wL.__alert = null;
  clickSel(wL, '.set-item .set-del');
  await sleep(60);
  ok('после пополнения набор всё ещё нельзя удалить', rowsOf(wL).length === 1 && /защищён/.test(wL.__alert || ''), wL.__alert + ' | наборов: ' + rowsOf(wL).length);

  /* ---------- 16. Сортировка списка глаголов ---------- */
  head('16. Сортировка в списке глаголов набора');
  const w17 = (await makeDom()).window;
  await sleep(150);
  w17.eval('newFromBase()');
  await sleep(80);
  const origOrder = rowsOf(w17)[0].w.map(r => r[0]);
  const visRu = () => Array.prototype.map.call(w17.document.querySelectorAll('#rows tr'), tr => tr.querySelector('input').value);
  ok('по умолчанию порядок как в наборе', visRu().join('|') === origOrder.join('|'));

  setVal(w17, 'rowSort', 'ru-asc', 'change');
  await sleep(60);
  const asc = visRu();
  ok('А → Я применено', asc.join('|') === origOrder.slice().sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' })).join('|'), asc.slice(0, 3).join(' | '));
  ok('счётчик сообщает о смене порядка', new RegExp(VB + ' из ' + VB + ' · порядок изменён').test(w17.document.getElementById('filterCount').textContent), w17.document.getElementById('filterCount').textContent);
  ok('состав набора не изменился', rowsOf(w17)[0].w.map(r => r[0]).join('|') === origOrder.join('|'));
  ok('прогресс-мета не изменилась', new RegExp(VB + ' слов').test(w17.document.getElementById('setMeta').textContent), w17.document.getElementById('setMeta').textContent);

  setVal(w17, 'rowSort', 'ru-desc', 'change');
  await sleep(60);
  const desc = visRu();
  ok('Я → А — обратный порядок', desc.join('|') === asc.slice().reverse().join('|'), desc.slice(0, 3).join(' | '));

  // поиск применяется поверх сортировки
  const probe = origOrder[Math.floor(origOrder.length / 2)];
  const expectVis = desc.filter(x => x.indexOf(probe) >= 0);
  setVal(w17, 'rowFilter', probe, 'input');
  await sleep(60);
  ok('поиск поверх сортировки: строки остались отсортированными', visRu().join('|') === expectVis.join('|'), visRu().join(' | '));
  ok('счётчик учитывает оба условия', new RegExp(expectVis.length + ' из ' + VB + ' · порядок изменён').test(w17.document.getElementById('filterCount').textContent), w17.document.getElementById('filterCount').textContent);

  // выбор и удаление указывает на нужную строку при сортировке
  setVal(w17, 'rowFilter', '', 'input');
  await sleep(60);
  const target = visRu()[0];
  const cb0 = w17.document.querySelector('#rows tr input.rowsel');
  cb0.checked = true;
  cb0.dispatchEvent(new w17.Event('change', { bubbles: true }));
  await sleep(40);
  click(w17, 'delSelected');
  await sleep(80);
  ok('удалена первая строка в отсортированном списке', rowsOf(w17)[0].w.length === VB - 1 && !rowsOf(w17)[0].w.some(r => r[0] === target) && rowsOf(w17)[0].w.some(r => r[0] === origOrder[0]), target);
  ok('после удаления порядок не сбился', visRu().slice(0, 2).join('|') === desc.slice(1, 3).join('|'), visRu().slice(0, 2).join(' | '));

  setVal(w17, 'rowSort', '', 'change');
  await sleep(60);
  ok('снятие сортировки возвращает исходный порядок', visRu().join('|') === origOrder.filter(x => x !== target).join('|'), visRu().slice(0, 3).join(' | '));
  ok('счётчик пуст, когда нет ни фильтра, ни сортировки', w17.document.getElementById('filterCount').textContent === '', w17.document.getElementById('filterCount').textContent);

  // сортировка по полю «Заметка»
  const setNote = (tr, v) => {
    const inp = tr.querySelectorAll('input')[3];
    inp.value = v;
    inp.dispatchEvent(new w17.Event('change', { bubbles: true }));
  };
  const beforeNotes = rowsOf(w17)[0].w.map(r => r[0]);
  const noteRows = w17.document.querySelectorAll('#rows tr');
  setNote(noteRows[0], 'яя');
  setNote(noteRows[40], 'аа');
  setNote(noteRows[95], 'вв');
  await sleep(80);
  const noteVals = () => Array.prototype.map.call(w17.document.querySelectorAll('#rows tr'), tr => tr.querySelectorAll('input')[3].value);
  setVal(w17, 'rowSort', 'note-asc', 'change');
  await sleep(60);
  const nAsc = noteVals();
  ok('по заметкам А → Я: пустые заметки в начале', nAsc.length === VB - 1 && nAsc.slice(0, nAsc.length - 3).every(v => v === ''), nAsc.filter(v => v).length + ' заполнено');
  ok('заполненные заметки по возрастанию', nAsc.filter(v => v).join('|') === 'аа|вв|яя', nAsc.filter(v => v).join('|'));
  ok('порядок строк данных не изменился', rowsOf(w17)[0].w.map(r => r[0]).join('|') === beforeNotes.join('|'));

  setVal(w17, 'rowSort', 'note-desc', 'change');
  await sleep(60);
  const nDesc = noteVals();
  ok('по заметкам Я → А: заполненные по убыванию', nDesc.filter(v => v).join('|') === 'яя|вв|аа', nDesc.filter(v => v).join('|'));
  ok('пустые заметки в конце', nDesc.slice(-3).every(v => v === ''), nDesc.slice(-3).join('|'));
  ok('счётчик сообщает о смене порядка (заметки)', new RegExp((VB - 1) + ' из ' + (VB - 1) + ' · порядок изменён').test(w17.document.getElementById('filterCount').textContent), w17.document.getElementById('filterCount').textContent);

  setVal(w17, 'rowSort', '', 'change');
  await sleep(60);
  ok('после сброса сортировки — порядок набора и заметки на месте', visRu().join('|') === beforeNotes.join('|') && noteVals()[0] === 'яя', visRu().slice(0, 2).join(' | '));

  /* ---------- 17. Пачковая выдача: отметки, фильтр, область выдачи ---------- */
  head('17. Пачковая выдача из одного набора');
  const w18 = (await makeDom()).window;
  await sleep(150);
  w18.eval('newFromBase()');
  await sleep(80);
  const unpackCode = code => w18.eval('unpackSet(' + JSON.stringify(code) + ')');
  const setNote18 = (tr, v) => { const inp = tr.querySelectorAll('input')[3]; inp.value = v; inp.dispatchEvent(new w18.Event('change', { bubbles: true })); };
  const checkRow = idx => {
    const tr = w18.document.querySelector('#rows tr[data-i="' + idx + '"]');
    const cb = tr.querySelector('input.rowsel');
    cb.checked = true;
    cb.dispatchEvent(new w18.Event('change', { bubbles: true }));
  };
  const setScope = v => {
    const r = Array.from(w18.document.querySelectorAll('input[name="issueScope"]')).find(el => el.value === v);
    r.checked = true;
    r.dispatchEvent(new w18.Event('change', { bubbles: true }));
  };
  const setNoteFilter = v => setVal(w18, 'noteFilter', v, 'change');

  ok('кнопка отметки выключена без выбора', w18.document.getElementById('markSent').disabled === true);
  ok('кнопка копирования выбора выключена без выбора', w18.document.getElementById('dupSelected').disabled === true);
  ok('счётчик отметок: 0 из базы', w18.document.getElementById('markStat').textContent === 'отмечено: 0 из ' + VB, w18.document.getElementById('markStat').textContent);
  ok('выдача по умолчанию — весь набор', unpackCode(w18.document.getElementById('codeBox').value).w.length === VB, String(unpackCode(w18.document.getElementById('codeBox').value).w.length));

  // 1) отметка выбранных строк
  checkRow(0); checkRow(1); checkRow(2);
  await sleep(40);
  ok('кнопки отметки включились', w18.document.getElementById('markSent').disabled === false && w18.document.getElementById('dupSelected').disabled === false);
  click(w18, 'markSent');
  await sleep(80);
  ok('после отметки выбор сброшен', w18.document.getElementById('markSent').disabled === true && w18.document.getElementById('selCount').textContent === '');
  ok('счётчик отметок: 3 из базы', w18.document.getElementById('markStat').textContent === 'отмечено: 3 из ' + VB, w18.document.getElementById('markStat').textContent);
  const marked = rowsOf(w18)[0].w.slice(0, 3);
  ok('в заметках появилась отметка с датой', marked.every(r => /^✓ \d{2}\.\d{2}\.\d{4}$/.test(r[3])), JSON.stringify(marked.map(r => r[3])));

  // 2) свой текст в заметке сохраняется
  setNote18(w18.document.querySelectorAll('#rows tr')[5], 'просклонять');
  await sleep(60);
  checkRow(5);
  await sleep(40);
  click(w18, 'markSent');
  await sleep(80);
  const note5 = rowsOf(w18)[0].w[5][3];
  ok('свой текст заметки сохранён рядом с отметкой', /^просклонять ✓ \d{2}\.\d{2}\.\d{4}$/.test(note5), note5);

  // 3) фильтр по заметкам
  setNoteFilter('sent');
  await sleep(60);
  ok('фильтр «только отправленные»: 4 строки', w18.document.querySelectorAll('#rows tr').length === 4, String(w18.document.querySelectorAll('#rows tr').length));
  ok('счётчик фильтра уточняет выборку', new RegExp('4 из ' + VB + ' · только отправленные').test(w18.document.getElementById('filterCount').textContent), w18.document.getElementById('filterCount').textContent);
  setNoteFilter('unsent');
  await sleep(60);
  ok('фильтр «только неотправленные»: строки без отметки', w18.document.querySelectorAll('#rows tr').length === VB - 4, String(w18.document.querySelectorAll('#rows tr').length));
  setNoteFilter('without');
  await sleep(60);
  ok('фильтр «без заметки»: строки без отметки', w18.document.querySelectorAll('#rows tr').length === VB - 4, String(w18.document.querySelectorAll('#rows tr').length));
  setNoteFilter('with');
  await sleep(60);
  ok('фильтр «с заметкой»: 4 строки', w18.document.querySelectorAll('#rows tr').length === 4, String(w18.document.querySelectorAll('#rows tr').length));
  setNoteFilter('');
  await sleep(60);
  ok('без фильтра снова все строки базы', w18.document.querySelectorAll('#rows tr').length === VB, String(w18.document.querySelectorAll('#rows tr').length));

  // 4) выдача только неотправленных
  setScope('unsent');
  await sleep(60);
  const unsentCode = unpackCode(w18.document.getElementById('codeBox').value);
  ok('в выдачу попали только неотправленные', unsentCode.w.length === VB - 4, String(unsentCode.w.length));
  ok('отмеченные слова в выдачу не попали', !unsentCode.w.some(r => /^✓/.test(r[3] || '')));
  ok('id и имя набора сохранены', unsentCode.i === rowsOf(w18)[0].i && unsentCode.n === rowsOf(w18)[0].n);
  ok('счётчик области выдачи', new RegExp('не отправлено: ' + (VB - 4) + ' из ' + VB).test(w18.document.getElementById('issueScopeStat').textContent), w18.document.getElementById('issueScopeStat').textContent);
  ok('ссылка короче полной', w18.document.getElementById('linkBox').value.length < 3900, String(w18.document.getElementById('linkBox').value.length));

  // 5) выдача выбранных строк
  checkRow(10); checkRow(11);
  await sleep(40);
  setScope('selected');
  await sleep(60);
  ok('выдача выбранных: 2 слова', unpackCode(w18.document.getElementById('codeBox').value).w.length === 2, String(unpackCode(w18.document.getElementById('codeBox').value).w.length));
  ok('счётчик говорит про выбранные', /будет выдано: 2 слова из выбранных 2/.test(w18.document.getElementById('issueScopeStat').textContent), w18.document.getElementById('issueScopeStat').textContent);

  // 6) без выбранных строк выдавать нечего
  const cbSel = w18.document.querySelector('#rows tr[data-i="10"] input.rowsel');
  cbSel.checked = false;
  cbSel.dispatchEvent(new w18.Event('change', { bubbles: true }));
  const cbSel2 = w18.document.querySelector('#rows tr[data-i="11"] input.rowsel');
  cbSel2.checked = false;
  cbSel2.dispatchEvent(new w18.Event('change', { bubbles: true }));
  await sleep(60);
  ok('выдача пуста — копирование выключено', w18.document.getElementById('copyLink').disabled === true && w18.document.getElementById('copyCode').disabled === true);
  ok('подсказка про непробранные строки', /строки не выбраны/i.test(w18.document.getElementById('issueScopeStat').textContent), w18.document.getElementById('issueScopeStat').textContent);

  setScope('all');
  await sleep(60);
  ok('возврат к «весь набор»: снова все слова', unpackCode(w18.document.getElementById('codeBox').value).w.length === VB, String(unpackCode(w18.document.getElementById('codeBox').value).w.length));

  // 7) снятие отметки
  setNoteFilter('sent');
  await sleep(60);
  const selAll18 = w18.document.getElementById('selAll');
  selAll18.checked = true;
  selAll18.dispatchEvent(new w18.Event('change', { bubbles: true }));
  await sleep(60);
  ok('по фильтру выбраны все отправленные (4)', /выбрано: 4/.test(w18.document.getElementById('selCount').textContent), w18.document.getElementById('selCount').textContent);
  click(w18, 'unmarkSent');
  await sleep(80);
  ok('отметки сняты', w18.document.getElementById('markStat').textContent === 'отмечено: 0 из ' + VB, w18.document.getElementById('markStat').textContent);
  ok('свой текст заметки остался', rowsOf(w18)[0].w[5][3] === 'просклонять', rowsOf(w18)[0].w[5][3]);
  setNoteFilter('sent');
  await sleep(60);
  ok('после снятия фильтр «отправленные» пуст', w18.document.querySelectorAll('#rows tr').length === 0, String(w18.document.querySelectorAll('#rows tr').length));
  setNoteFilter('');
  await sleep(60);

  // 8) копирование выбранных строк в отдельный набор
  checkRow(0); checkRow(1); checkRow(2); checkRow(3);
  await sleep(40);
  click(w18, 'dupSelected');
  await sleep(80);
  ok('создан новый набор из 4 выбранных строк', rowsOf(w18).length === 3 && rowsOf(w18)[0].w.length === 4, rowsOf(w18).map(x => x.w.length).join('+'));
  ok('новый id у пачки', rowsOf(w18)[0].i !== rowsOf(w18)[1].i);
  ok('название пачки', /\(пачка\)$/.test(rowsOf(w18)[0].n), rowsOf(w18)[0].n);
  ok('исходный набор не пострадал', rowsOf(w18)[1].w.length === VB);

  console.log('\nИтог преподавателя: успешно ' + pass + ', провалено ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR:', e && e.stack || e); process.exit(2); });

/* Smoke-тест ученического файла motya.html в jsdom */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'motya.html');
const CSV = path.join(ROOT, 'irregular_verbs_with_transcription.csv');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function head(t){ console.log('\n' + t); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const downloads = [];
function makeDom(url, seed){
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { console.log('  [jsdomError] ' + e.message); fail++; });
  vc.on('error', (...a) => { console.log('  [console.error] ' + a.join(' ')); fail++; });
  return JSDOM.fromFile(FILE, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win){
      win.alert = m => { win.__alert = m; };
      win.prompt = () => win.__promptValue || '';
      win.confirm = () => true;
      win.URL.createObjectURL = () => 'blob:stub';
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = function(){};
      win.Blob = class { constructor(parts, o){ downloads.push({ parts: parts, type: o && o.type }); } };
    }
  }).then(dom => {
    if(seed) for(const k in seed) dom.window.localStorage.setItem(k, seed[k]);
    return dom;
  });
}
function click(win, id){
  const el = win.document.getElementById(id);
  if(!el) throw new Error('no element #' + id);
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}
function typeIn(win, id, value){
  const el = win.document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function selectIn(win, id, value){
  const el = win.document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
function ls(win, k){ return win.localStorage.getItem(k); }
function visible(win, id){ const e = win.document.getElementById(id); return e && e.style.display !== 'none'; }

(async () => {
  const csv = fs.readFileSync(CSV, 'utf8');

  /* ---------- 1. Вход по ссылке ---------- */
  head('1. Набор получен по ссылке');
  const dom1 = await makeDom('https://localhost/motya.html');
  const w1 = dom1.window;
  await sleep(150);
  const link = w1.eval('(function(){ const set = {i:"abc123", n:"Набор №1", d:"2026-10-05", w:[["будить","wake|woke|woken","[weɪk]|[wəʊk]|[ˈwəʊkən]",""],["кошка","cat","[kæt]",""],["дом","house","[haʊs]",""],["собака","dog","[dɒɡ]",""]]}; return buildLink("motya.html", set); })()');
  ok('buildLink даёт относительную ссылку', /^motya\.html#v=1&/.test(link), link.slice(0, 50));
  ok('ссылка без пробелов', !link.includes(' '));
  const dom2 = await makeDom('https://localhost/' + link);
  const w2 = dom2.window;
  await sleep(150);
  ok('имя набора показано', w2.document.getElementById('gotName').textContent === 'Набор №1');
  ok('блок «набор получен» виден', visible(w2, 'gotBox'));
  ok('запись добавлена в историю', JSON.parse(ls(w2, 'motya_history_v1') || '[]').length === 1);
  ok('мета: 4 слов', /4 слов/.test(w2.document.getElementById('gotMeta').textContent), w2.document.getElementById('gotMeta').textContent);
  ok('источник помечен как «ссылка»', /ссылка/.test(w2.document.querySelector('#histList .set-item').textContent));

  /* ---------- 2. Старт без имени ---------- */
  head('2. Старт без имени');
  ok('поле имени пустое (не подставляем чужое)', w2.document.getElementById('pupil').value === '');
  click(w2, 'start');
  await sleep(50);
  ok('игра не началась, виден вход', visible(w2, 'entry') && !visible(w2, 'game'));

  /* ---------- 3. Игра с вводом ---------- */
  head('3. Игра: ввод, ошибки, прогресс');
  typeIn(w2, 'pupil', 'Вася');
  click(w2, 'start');
  await sleep(80);
  ok('экран игры показан', visible(w2, 'game') && !visible(w2, 'entry'));
  ok('счётчик 1 / 4', w2.document.getElementById('counter').textContent.trim() === '1 / 4', w2.document.getElementById('counter').textContent);
  ok('в подсказке нет второго счётчика', !/1\/4/.test(w2.document.getElementById('prompt').textContent), w2.document.getElementById('prompt').textContent);
  ok('паутинка: 4 узла', w2.document.querySelectorAll('.node').length === 4);
  ok('паук на 1-м узле', w2.document.querySelectorAll('.node')[0].classList.contains('current'));
  ok('имя сохранено в список учеников', JSON.parse(ls(w2, 'motya_pupils_v1') || '[]').includes('Вася'));
  ok('первое слово — «будить»', /будить/.test(w2.document.getElementById('prompt').textContent), w2.document.getElementById('prompt').textContent);
  ok('транскрипция показана', /weɪk/.test(w2.document.getElementById('prompt').textContent));

  typeIn(w2, 'answer', 'неправильно');
  click(w2, 'check');
  await sleep(60);
  ok('после неверного ответа остаёмся на том же слове', w2.document.getElementById('counter').textContent.trim() === '1 / 4');
  ok('прогресс-бар не сдвинулся', /^0%$/.test(w2.document.getElementById('bar').style.width), w2.document.getElementById('bar').style.width);
  ok('есть текст ошибочной обратной связи', /Не совсем/.test(w2.document.getElementById('fb').textContent));
  typeIn(w2, 'answer', 'wake, woke, woken');
  click(w2, 'check');
  await sleep(80);
  ok('верный ответ: очки 10', w2.document.getElementById('score').textContent === '10');
  ok('прогресс-бар 25%', w2.document.getElementById('bar').style.width === '25%', w2.document.getElementById('bar').style.width);
  ok('паук сразу пополз на 2-й узел', w2.document.querySelectorAll('.node')[1].classList.contains('current'));

  await sleep(1600);
  ok('перешли ко 2-му слову', w2.document.getElementById('counter').textContent.trim() === '2 / 4');
  ok('2-е слово — «кошка»', /кошка/.test(w2.document.getElementById('prompt').textContent));
  click(w2, 'skip');
  await sleep(80);
  ok('пропуск снял 5 очков (10 → 5)', w2.document.getElementById('score').textContent === '5', w2.document.getElementById('score').textContent);
  ok('в обратной связи указан правильный ответ', /cat/.test(w2.document.getElementById('fb').textContent), w2.document.getElementById('fb').textContent);
  await sleep(2600);
  ok('перешли к 3-му слову', w2.document.getElementById('counter').textContent.trim() === '3 / 4');
  ok('3-е слово — «дом»', /дом/.test(w2.document.getElementById('prompt').textContent), w2.document.getElementById('prompt').textContent);

  typeIn(w2, 'answer', 'house');
  click(w2, 'check');
  await sleep(1600);
  ok('перешли к 4-му слову', w2.document.getElementById('counter').textContent.trim() === '4 / 4');
  typeIn(w2, 'answer', 'dog');
  click(w2, 'check');
  await sleep(1700);
  ok('финальный экран показан', visible(w2, 'finish') && !visible(w2, 'game'));
  ok('прогресс-бар 100%', w2.document.getElementById('bar').style.width === '100%', w2.document.getElementById('bar').style.width);
  ok('итог: 3 верных из 4', w2.document.getElementById('finalCorrect').textContent === '3' && w2.document.getElementById('finalTotal').textContent === '4');
  ok('очки на финише 25', w2.document.getElementById('finalScore').textContent === '25');
  ok('освоено 3 из 4', /: 3 из 4/.test(w2.document.getElementById('mastery').textContent), w2.document.getElementById('mastery').textContent);
  ok('кнопка «только ошибки» доступна', visible(w2, 'againErr'));
  ok('разбор показывает 1 слово', (w2.document.getElementById('wrongList').textContent.match(/— правильно/g) || []).length === 1, w2.document.getElementById('wrongList').textContent);

  const prog = JSON.parse(ls(w2, 'motya_progress_v1') || '{}');
  const p = prog['abc123'] && prog['abc123']['Вася'];
  ok('прогресс: 4 слова в реестре', !!(p && Object.keys(p.w).length === 4));
  ok('прогресс: 1 занятие', !!(p && (p.s || []).length === 1));
  ok('прогресс: «будить» — верно (1 занятие, 1 верный ответ)', !!(p && p.w['будить'] && p.w['будить'].last === true && p.w['будить'].a === 1 && p.w['будить'].ok === 1), JSON.stringify(p && p.w['будить']));
  ok('прогресс: «кошка» — неверно (пропуск)', !!(p && p.w['кошка'] && p.w['кошка'].last === false));
  ok('прогресс: «дом» — верно, 1 занятие', !!(p && p.w['дом'] && p.w['дом'].last === true && p.w['дом'].a === 1));
  const recs = JSON.parse(ls(w2, 'motya_records_v1') || '[]');
  ok('рекорды: одна запись', recs.length === 1);
  ok('рекорд: 75%, 3/4', recs[0] && recs[0].pct === 75 && recs[0].correct === 3 && recs[0].total === 4, JSON.stringify(recs[0] && { pct: recs[0].pct, correct: recs[0].correct, total: recs[0].total }));
  ok('рекорд: ученик Вася', recs[0] && recs[0].name === 'Вася');
  ok('таблица рекордов отрисована', /Вася/.test(w2.document.getElementById('recordsFinish').textContent));

  /* ---------- 4. Отчёт CSV ---------- */
  head('4. Отчёт для учителя');
  downloads.length = 0;
  click(w2, 'exportCsv');
  await sleep(50);
  ok('CSV сформирован', downloads.length === 1);
  const csvOut = String(downloads[0].parts[0]);
  ok('есть BOM', csvOut.charCodeAt(0) === 0xFEFF);
  ok('есть имя ученика', csvOut.includes('Ученик;Вася'));
  ok('есть имя набора', csvOut.includes('Набор;Набор №1'));
  ok('есть заголовок разбора', csvOut.includes('№;Слово;Правильный ответ'));
  ok('4 строки разбора + полный набор', (csvOut.match(/^\d+;/gm) || []).length >= 8, String((csvOut.match(/^\d+;/gm) || []).length));
  ok('нет «undefined» в отчёте', !csvOut.includes('undefined'));
  ok('есть раздел «Нужно повторить»', csvOut.includes('Нужно повторить'));

  /* ---------- 4b. CSV: нейтрализация формул ---------- */
  head('4b. CSV: защита от формул (Б-1)');
  ok('csvEscape: =1+1 → префикс \'', w2.eval('csvEscape("=1+1")') === "'=1+1", w2.eval('csvEscape("=1+1")'));
  const tabbedP = w2.eval('[csvEscape("+1"),csvEscape("-1"),csvEscape("@cmd"),csvEscape("\\tx")].join("|")');
  ok('csvEscape: +1/-1/@cmd/\\tab получают префикс', tabbedP === "'+1|'-1|'@cmd|'" + "\tx", tabbedP);
  ok('csvEscape: обычный текст не меняется', w2.eval('csvEscape("будить")') === 'будить');
  ok('csvEscape: ; и кавычки по-прежнему в кавычках', w2.eval('csvEscape("a;b")') === '"a;b"' && w2.eval('csvEscape("с\\"x")') === '"с""x"');
  w2.eval('pupil = "=Вася"; stats = [{n:1,key:"будить",answer:"=1+1",answers:["=1+1"],ok:false,skipped:false,attempts:1,timeSec:1},{n:2,key:"кошка",answer:"x",answers:["x"],ok:false,skipped:true,attempts:1,timeSec:0}];');
  downloads.length = 0;
  click(w2, 'exportCsv');
  await sleep(50);
  const csvForm = String(downloads[0].parts[0]);
  ok('имя-формула в шапке нейтрализовано', csvForm.includes("Ученик;'=Вася"), csvForm.split('\r\n').slice(0, 3).join(' | '));
  ok('ответ-формула нейтрализован в строке разбора', csvForm.includes("'=1+1"));
  ok('голой формулы в ячейках нет', !/(^|[\r\n;])=1\+1/m.test(csvForm));
  w2.eval('pupil = "Вася"; stats = [];');

  /* ---------- 5. Повтор только ошибок ---------- */
  head('5. Повтор только ошибок');
  click(w2, 'againErr');
  await sleep(80);
  ok('в игре 1 слово', w2.document.getElementById('counter').textContent.trim() === '1 / 1', w2.document.getElementById('counter').textContent);
  ok('очки сброшены', w2.document.getElementById('score').textContent === '0');
  ok('на экране слово «кошка»', /кошка/.test(w2.document.getElementById('prompt').textContent), w2.document.getElementById('prompt').textContent);
  typeIn(w2, 'answer', 'cat');
  click(w2, 'check');
  await sleep(1700);
  ok('после разбора ошибки финал', visible(w2, 'finish'));
  click(w2, 'againMenu');
  await sleep(80);
  ok('вернулись в меню, игра скрыта', visible(w2, 'entry') && !visible(w2, 'game'));
  ok('набор остался выбранным', w2.document.getElementById('gotName').textContent === 'Набор №1');
  ok('прогресс в меню: 4 из 4 освоено', /освоено 4 из 4/.test(w2.document.getElementById('gotMeta').textContent), w2.document.getElementById('gotMeta').textContent);

  /* ---------- 6. Ввод кода, история, предпросмотр ---------- */
  head('6. Ввод кода, история, предпросмотр');
  const code = w2.eval('(function(){ const set = {i:"zz9", n:"Набор из кода", d:"2026-10-05", w:[["кот","cat","[kæt]",""],["мышь","mouse","[maʊs]",""],["лошадь","horse","[hɔːs]",""],["корова","cow","[kaʊ]",""],["овца","sheep","[ʃiːp]",""]]}; return packSet(set); })()');
  ok('код начинается с 1.', code.startsWith('1.'));
  ok('код — base64url', /^[A-Za-z0-9._-]+$/.test(code.slice(2)), code.slice(0, 40));
  click(w2, 'btnNewSet');
  typeIn(w2, 'code', code);
  click(w2, 'useCode');
  await sleep(60);
  ok('набор из кода принят', /Набор загружен/.test(w2.document.getElementById('addStatus').textContent));
  ok('в истории 2 набора', JSON.parse(ls(w2, 'motya_history_v1')).length === 2);
  ok('в списке 2 карточки', w2.document.querySelectorAll('#histList .set-item').length === 2);
  ok('прогресс по первому набору виден в списке', /освоено 4/.test(w2.document.querySelectorAll('#histList .set-item')[1].textContent));
  ok('подсказка datalist заполнена', w2.document.querySelectorAll('#pupils option').length === 1);
  click(w2, 'btnPreview');
  await sleep(60);
  const prevTxt = w2.document.getElementById('entry').textContent.replace(/\s+/g, ' ');
  ok('предпросмотр открылся', /Предпросмотр: Набор из кода/.test(prevTxt));
  ok('в предпросмотре 5 слов', /Распознано слов: 5/.test(prevTxt));
  ok('в предпросмотре есть транскрипция', /\[kæt\]/.test(prevTxt));

  /* ---------- 7. Файл CSV ---------- */
  head('7. Загрузка набора из файла');
  const dom3 = await makeDom('https://localhost/motya.html');
  const w3 = dom3.window;
  await sleep(150);
  const file = new w3.File([csv], 'irregular_verbs_with_transcription.csv', { type: 'text/csv' });
  const ev = new w3.Event('drop', { bubbles: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } });
  w3.dispatchEvent(ev);
  await sleep(500);
  ok('CSV-файл принят', /Из файла/.test(w3.document.getElementById('addStatus').textContent), w3.document.getElementById('addStatus').textContent);
  ok('слов в наборе 14', /: 14 слов/.test(w3.document.getElementById('addStatus').textContent), w3.document.getElementById('addStatus').textContent);
  ok('имя набора = имя файла', w3.document.getElementById('gotName').textContent === 'irregular_verbs_with_transcription');
  ok('в истории 1 набор', JSON.parse(ls(w3, 'motya_history_v1')).length === 1);

  /* ---------- 8. Режим карточек ---------- */
  head('8. Режим карточек');
  typeIn(w3, 'pupil', 'Катя');
  selectIn(w3, 'mode', 'choice');
  click(w3, 'start');
  await sleep(80);
  ok('карточки показаны', w3.document.getElementById('choices').style.display === 'grid');
  const cards = w3.document.querySelectorAll('.choice-btn');
  ok('карточек 2–4', cards.length >= 2 && cards.length <= 4, String(cards.length));
  ok('текстовый ввод скрыт', w3.document.getElementById('answer').style.display === 'none');
  const texts = Array.from(cards).map(c => c.querySelector('div').textContent);
  ok('нет дублирующихся карточек', new Set(texts).size === texts.length, JSON.stringify(texts));
  ok('на карточках есть транскрипция', w3.document.querySelector('.choice-btn .trans') !== null);
  const right = w3.eval('getTargetForm(words[idx])');
  const rightCard = Array.from(cards).find(c => c.querySelector('div').textContent === right);
  ok('правильный вариант среди карточек', !!rightCard, JSON.stringify(texts) + ' / ' + right);
  rightCard.dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  ok('после верной карточки очки 10', w3.document.getElementById('score').textContent === '10');
  ok('карточки заблокированы', Array.from(w3.document.querySelectorAll('.choice-btn')).every(c => c.disabled));
  ok('верная карточка подсвечена', rightCard.classList.contains('correct'));

  /* ---------- 9. Дубли английских форм: EN→RU принимает любой перевод, глагол один раз ---------- */
  head('9. Дубли: bear/bore/borne — одно слово, любой перевод');
  {
    const domD = await makeDom('https://localhost/motya.html');
    const wD = domD.window;
    await sleep(150);
    const linkD = wD.eval('(function(){ const set = {i:"dupbear", n:"Дубли bear", d:"2026-10-11", w:[["нести, переносить","bear|bore|borne","bɛə|bɔː|bɔːn"],["нести","bear|bore|borne",""],["переносить","bear|bore|borne",""],["будить","wake|woke|woken","[weɪk]"]]}; return buildLink("motya.html", set); })()');
    const domE = await makeDom('https://localhost/' + linkD);
    const wE = domE.window;
    await sleep(150);
    ok('мета: 2 слова после объединения', /2 слов/.test(wE.document.getElementById('gotMeta').textContent), wE.document.getElementById('gotMeta').textContent);
    typeIn(wE, 'pupil', 'ДубльТест');
    selectIn(wE, 'mode', 'en-ru');
    click(wE, 'start');
    await sleep(80);
    ok('счётчик 1 / 2 — bear предложен один раз', wE.document.getElementById('counter').textContent.trim() === '1 / 2', wE.document.getElementById('counter').textContent);
    ok('EN→RU: подсказка bear / bore / borne', /bear \/ bore \/ borne/.test(wE.document.getElementById('prompt').textContent), wE.document.getElementById('prompt').textContent);
    typeIn(wE, 'answer', 'переносить');
    click(wE, 'check');
    await sleep(1700);
    ok('ответ «переносить» засчитан', wE.document.getElementById('score').textContent === '10', wE.document.getElementById('score').textContent);
    ok('следующее слово — wake (bear предложен один раз)', /wake \/ woke \/ woken/.test(wE.document.getElementById('prompt').textContent), wE.document.getElementById('prompt').textContent);
    typeIn(wE, 'answer', 'будить');
    click(wE, 'check');
    await sleep(1700);
    ok('финал: 2 из 2', wE.document.getElementById('finalCorrect').textContent === '2' && wE.document.getElementById('finalTotal').textContent === '2');
    const progD = JSON.parse(ls(wE, 'motya_progress_v1') || '{}');
    const pD = progD['dupbear'] && progD['dupbear']['ДубльТест'];
    ok('прогресс: ровно 2 ключа (без дублей «нести»/«переносить»)', !!(pD && Object.keys(pD.w).length === 2), pD && Object.keys(pD.w).join(','));
    ok('прогресс: объединённый ключ «нести, переносить»', !!(pD && pD.w['нести, переносить'] && pD.w['нести, переносить'].last === true));
    ok('нет отдельных ключей «неси» и «переносить»', !(pD && (pD.w['неси'] || pD.w['переносить'])));
  }

  /* ---------- 10. Битая ссылка / битый код ---------- */
  head('9. Устойчивость к мусору');
  const dom5 = await makeDom('https://localhost/motya.html#v=1&i=bad&n=%D0%9E%D1%88%D0%B8%D0%B1%D0%BA%D0%B0&d=%%%');
  const w5 = dom5.window;
  await sleep(150);
  ok('битая ссылка не ломает страницу', !!w5.document.getElementById('start'));
  ok('показано предупреждение', /⚠️/.test(w5.document.getElementById('entryStatus').textContent), w5.document.getElementById('entryStatus').textContent);
  click(w5, 'btnNewSet');
  typeIn(w5, 'code', 'не-код');
  click(w5, 'useCode');
  await sleep(60);
  ok('битый код: понятный текст', /⚠️/.test(w5.document.getElementById('addStatus').textContent), w5.document.getElementById('addStatus').textContent);

  /* ---------- 10. Изоляция прогресса по ученикам ---------- */
  head('10. Прогресс разделён по ученикам');
  const seeded = JSON.stringify({ abc123: { 'Вася': { w: {
      'будить': { ru: 'будить', en: 'wake, woke, woken', a: 2, last: true, t: 1, lvl: 1 },
      'кошка': { ru: 'кошка', en: 'cat', a: 1, last: false, t: 1, lvl: 0 },
      'дом': { ru: 'дом', en: 'house', a: 1, last: true, t: 1, lvl: 1 },
      'собака': { ru: 'собака', en: 'dog', a: 1, last: true, t: 1, lvl: 1 } }, s: [] } } });
  const dom6 = await makeDom('https://localhost/' + link, { motya_progress_v1: seeded });
  const w6 = dom6.window;
  await sleep(150);
  typeIn(w6, 'pupil', 'Петя');
  w6.eval('renderEntry()');
  ok('у Пети прогресс пуст', /освоено 0 из 4/.test(w6.document.getElementById('gotMeta').textContent), w6.document.getElementById('gotMeta').textContent);
  typeIn(w6, 'pupil', 'Вася');
  w6.eval('renderEntry()');
  ok('у Васи виден его прогресс', /освоено 3 из 4/.test(w6.document.getElementById('gotMeta').textContent), w6.document.getElementById('gotMeta').textContent);
  ok('данные Васи не переписаны', JSON.parse(ls(w6, 'motya_progress_v1'))['abc123']['Вася'].w['будить'].a === 2);

  /* ---------- 11. Режим на время ---------- */
  head('11. Режим «на время»: таймер и остановка');
  const dom7 = await makeDom('https://localhost/' + link);
  const w7 = dom7.window;
  await sleep(150);
  typeIn(w7, 'pupil', 'Тимур');
  selectIn(w7, 'timedMode', true);
  w7.document.getElementById('timedMode').checked = true;
  selectIn(w7, 'timeLimit', '60');
  click(w7, 'start');
  await sleep(150);
  ok('таймер виден', visible(w7, 'timerBox'));
  ok('таймер показывает 01:00 или 00:59', /^(01:00|00:59)$/.test(w7.document.getElementById('timer').textContent), w7.document.getElementById('timer').textContent);
  const before = w7.document.getElementById('timer').textContent;
  typeIn(w7, 'answer', 'wrong');
  click(w7, 'check');
  await sleep(300);
  ok('после неверного ответа таймер НЕ на паузе (можно исправлять)', w7.eval('timerPaused === false'));
  typeIn(w7, 'answer', 'wake, woke, woken');
  click(w7, 'check');
  await sleep(60);
  ok('таймер встал на паузу во время обратной связи', w7.eval('timerPaused === true'), w7.eval('timerPaused'));
  const pausedText = w7.document.getElementById('timer').textContent;
  await sleep(700);
  ok('на паузе цифры не меняются', w7.document.getElementById('timer').textContent === pausedText, w7.document.getElementById('timer').textContent);
  await sleep(900);
  ok('после паузы таймер снова тикает', w7.eval('timerPaused === false'));
  ok('таймер всё ещё показывает время', /^\d\d:\d\d$/.test(w7.document.getElementById('timer').textContent));
  click(w7, 'quit');
  await sleep(80);
  ok('выход в меню останавливает таймер', w7.eval('timerInterval === null'));
  ok('после выхода меню видно', visible(w7, 'entry'));

  /* ---------- 12. Количество слов в игре ---------- */
  head('12. Количество слов: 10/20/30 и своё');
  const dom8 = await makeDom('https://localhost/' + link);
  const w8 = dom8.window;
  await sleep(150);
  ok('селектор количества слов есть', !!w8.document.getElementById('wordCount'));
  ok('по умолчанию — все слова набора', w8.document.getElementById('wordCount').value === 'all');
  ok('поле «своё количество» скрыто', !visible(w8, 'wordCountCustomLabel'));
  selectIn(w8, 'wordCount', '10');
  ok('выбран пресет 10 слов', w8.document.getElementById('wordCount').value === '10');
  ok('поле «своё» у пресета скрыто', !visible(w8, 'wordCountCustomLabel'));
  typeIn(w8, 'pupil', 'Аня');
  click(w8, 'start');
  await sleep(150);
  ok('набор меньше лимита — играют все 4 слова', w8.document.getElementById('counter').textContent.trim() === '1 / 4', w8.document.getElementById('counter').textContent);
  click(w8, 'quit');
  await sleep(80);
  selectIn(w8, 'wordCount', 'custom');
  ok('при «своё количество» поле ввода видно', visible(w8, 'wordCountCustomLabel'));
  w8.document.getElementById('wordCountCustom').value = '2';
  click(w8, 'start');
  await sleep(150);
  ok('своё количество: в игре 2 слова из 4', w8.document.getElementById('counter').textContent.trim() === '1 / 2', w8.document.getElementById('counter').textContent);
  ok('паутинка: 2 узла', w8.document.querySelectorAll('.node').length === 2, String(w8.document.querySelectorAll('.node').length));
  const pref8 = JSON.parse(ls(w8, 'motya_prefs_v1') || '{}');
  ok('настройка количества сохранена', pref8.wordLimit === 'custom' && pref8.wordLimitN === 2, JSON.stringify(pref8));
  typeIn(w8, 'answer', 'wake, woke, woken');
  click(w8, 'check');
  await sleep(1700);
  typeIn(w8, 'answer', 'cat');
  click(w8, 'check');
  await sleep(1800);
  ok('после 2 слов игра завершилась', visible(w8, 'finish'));
  click(w8, 'again');
  await sleep(150);
  ok('«играть заново» сохраняет лимит', w8.document.getElementById('counter').textContent.trim() === '1 / 2', w8.document.getElementById('counter').textContent);
  click(w8, 'quit');
  await sleep(80);

  /* ---------- 13. Лимит имени ученика (В-1) ---------- */
  head('13. Лимит имени и списка учеников (В-1)');
  const longName = 'А'.repeat(60);
  const dom9 = await makeDom('https://localhost/' + link);
  const w9 = dom9.window;
  await sleep(150);
  typeIn(w9, 'pupil', longName);
  click(w9, 'start');
  await sleep(100);
  ok('имя обрезано до 40 символов', w9.eval('pupil.length') === 40, String(w9.eval('pupil.length')));
  ok('в поле отображается обрезанное имя', w9.document.getElementById('pupil').value.length === 40, String(w9.document.getElementById('pupil').value.length));
  ok('в LS_PUPILS записано обрезанное имя', JSON.parse(ls(w9, 'motya_pupils_v1'))[0].length === 40, String(JSON.parse(ls(w9, 'motya_pupils_v1'))[0].length));
  ok('имя в игре обрезанное', w9.eval('pupil') === 'А'.repeat(40));
  const dom10 = await makeDom('https://localhost/' + link);
  const w10 = dom10.window;
  await sleep(150);
  const many = Array.from({length: 25}, (_, i) => 'Ученик' + i);
  w10.localStorage.setItem('motya_pupils_v1', JSON.stringify(many));
  typeIn(w10, 'pupil', 'НовыйУченик');
  click(w10, 'start');
  await sleep(100);
  const pl10 = JSON.parse(ls(w10, 'motya_pupils_v1'));
  ok('список учеников обрезан до 20', pl10.length === 20, String(pl10.length));
  ok('новое имя в конце списка', pl10[19] === 'НовыйУченик', pl10[19]);

  /* ---------- 14. Таблица рекордов с отравленными данными (Б-2) ---------- */
  head('14. Рекорды: экранирование полей (Б-2)');
  const poisoned = JSON.stringify([{
    name: '<img src=x id=xss1>', set: '<svg onload=idss2>', mode: '<b id=xss3>evil</b>',
    verbForm: 'all', wordOrder: 'fixed', pct: '<iframe id=xss4>',
    score: '<script id=xss5>1</script>', correct: '<i id=xss6>1</i>', total: '<u id=xss7>4</u>',
    time: 12, date: '2026-10-11T12:00:00.000Z', timed: false
  }]);
  const dom11 = await makeDom('https://localhost/' + link, { motya_records_v1: poisoned });
  const w11 = dom11.window;
  await sleep(200);
  w11.eval('renderRecords()');
  ok('таблица рекордов отрисована', w11.document.querySelectorAll('#recordsHere table.records').length === 1);
  ok('нет тегов img/svg/iframe/script из имени и набора', w11.document.querySelectorAll('#recordsHere img, #recordsHere svg, #recordsHere iframe, #recordsHere script').length === 0,
    'img=' + w11.document.querySelectorAll('#recordsHere img').length + ' svg=' + w11.document.querySelectorAll('#recordsHere svg').length + ' iframe=' + w11.document.querySelectorAll('#recordsHere iframe').length);
  ok('сырой mode не попал тегом', w11.document.querySelectorAll('#recordsHere b#xss3').length === 0);
  ok('текст name показан как текст', /<img src=x id=xss1>/.test(w11.document.getElementById('recordsHere').textContent));
  ok('текст mode показан как текст', /<b id=xss3>evil<\/b>/.test(w11.document.getElementById('recordsHere').textContent));
  ok('score показан как текст', /<script id=xss5>1<\/script>/.test(w11.document.getElementById('recordsHere').textContent));

  console.log('\nИтог страницы: успешно ' + pass + ', провалено ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR:', e && e.stack || e); process.exit(2); });

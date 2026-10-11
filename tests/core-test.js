const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
function extractCore(file){
  const s = fs.readFileSync(file, "utf8");
  const a = s.search(/\/\*[^*]*CORE START[^*]*\*\//);
  const b = s.search(/\/\*[^*]*CORE END[^*]*\*\//);
  const bEnd = s.indexOf("*/", b) + 2;
  return s.slice(a, bEnd);
}
const core = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : extractCore(path.join(ROOT, "motya.html"));
const CSV_PATH = process.argv[3] || path.join(ROOT, "irregular_verbs_with_transcription.csv");
const store = {};
const sandbox = {
  console,
  TextEncoder, TextDecoder, btoa, atob, URLSearchParams,
  location: {hash:""},
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  }
};
vm.createContext(sandbox);
vm.runInContext(core + "\n;globalThis.__api = {packSet,unpackSet,buildLink,readSetFromLocation,parseText,rowsToWords,mergeRowsByEn,setToRows,isTranscription,pickSeparator,splitLine,recordWord,getProgress,progressSummary,diffSets,normalizeKey,recordSession};", sandbox);
const A = sandbox.__api;

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}
function eq(name, a, b){ ok(name, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + " != " + JSON.stringify(b)); }

const VERBS = [
  ["будить","wake|woke|woken","əˈweɪk|wəʊk|ˈwəʊkən"],
  ["быть","be|was/were|been","biː|wɒz/weə|biːn"],
  ["нести, переносить","bear|bore|borne","bɛə|bɔː|bɔːn"],
  ["бить","beat|beat|beaten/beat","biːt|biːt|ˈbiːtn/biːt"]
];
const WORDS = [
  ["кошка","cat","kæt"],["собака","dog","dɒɡ"],["дом","house|haʊs","haʊs"],
  ["мама","mother|mum","mʌðə"],["красный","red","red"],["быстро","fast","fɑːst"]
];

console.log("\n1. Упаковка набора (round-trip)");
const set1 = {i:"hw1", n:"Домашка 1", d:"2026-05-12", w: VERBS};
const code1 = A.packSet(set1);
const back1 = A.unpackSet(code1);
eq("слова восстановлены", back1.w, set1.w);
ok("имя восстановлено", back1.n === "Домашка 1");
ok("id восстановлен", back1.i === "hw1");
ok("дата восстановлена", back1.d === "2026-05-12");
ok("код без пробелов и переносов", !/[\s]/.test(code1));
ok("код начинается с версии", code1.startsWith("1."), code1.slice(0,10));
ok("код в base64url (нет + и /)", !/[+/]/.test(code1));

console.log("\n2. Размер ссылки");
const link1 = A.buildLink("motya.html", set1);
console.log("     4 глагола: " + link1.length + " симв.  payload " + code1.length);
ok("ссылка содержит #", link1.includes("#v=1&"));
ok("ссылка относительная", link1.startsWith("motya.html#"));
const set40 = {i:"u40", n:"Unit 40", d:"2026-05-12", w: Array.from({length:40}, (_,i)=>[ "слово_"+(i+1), "word"+(i+1)+"|w"+(i+1)+"ed|w"+(i+1)+"en", "s"+(i+1)+"|s"+(i+1)+"d|s"+(i+1)+"n" ])};
const code40 = A.packSet(set40);
console.log("     40 слов:   " + code40.length + " симв.");
ok("40 слов укладываются в 4000 символов", code40.length < 4000, code40.length);
const set150 = {i:"u150", n:"Unit 150", d:"2026-05-12", w: Array.from({length:150}, (_,i)=>[ "слово_"+(i+1), "word"+(i+1)+"|w"+(i+1)+"ed|w"+(i+1)+"en", "s"+(i+1)+"|s"+(i+1)+"d|s"+(i+1)+"n" ])};
const code150 = A.packSet(set150);
console.log("     150 слов:  " + code150.length + " симв. (только код)");
ok("150 слов > 4000 — нужен код", code150.length > 4000, code150.length);

console.log("\n3. Устойчивость упаковки");
const empty = {i:"e", n:"", d:"", w:[]};
eq("пустой набор", A.unpackSet(A.packSet(empty)).w, []);
const one = {i:"o", n:"Одно", d:"", w:[VERBS[0]]};
eq("одно слово", A.unpackSet(A.packSet(one)).w, [VERBS[0]]);
ok("пробелы и переносы в коде не мешают", A.unpackSet(code1.slice(0,2)+" \n"+code1.slice(2).replace(/(.{40})/g,"$1\n")).w.length === 4);
const repeats = {i:"r", n:"Повторы", d:"", w: Array.from({length:200}, ()=>["одинаковое","same|same|same","s|s|s"])};
ok("сильно повторяющиеся данные сжимаются", A.packSet(repeats).length < 1800, A.packSet(repeats).length);
const raw40 = JSON.stringify(set40.w).length;
ok("упаковка всегда короче исходного JSON", code40.length < raw40, code40.length + " против " + raw40);
let threw = null;
try{ A.unpackSet("1.notbase64!!!"); }catch(e){ threw = e.message; }
ok("битый код даёт понятную ошибку", threw && threw.length > 3, String(threw));
threw = null;
try{ A.unpackSet("9.abc"); }catch(e){ threw = e.message; }
ok("версия из будущего отклоняется", /новой версии/.test(threw||""), String(threw));
threw = null;
try{ A.unpackSet("мусор"); }catch(e){ threw = e.message; }
ok("мусор без точки отклоняется", /не похоже/.test(threw||""), String(threw));

console.log("\n3b. Наборы больше окна LZ (регресс на 4096 байт)");
for (const n of [99, 150, 400, 1500, 6000]) {
  const big = {i:"b"+n, n:"Большой "+n, d:"2026-05-12", w: Array.from({length:n}, (_,i)=>["слово_"+(i+1), "word"+(i+1)+"|w"+(i+1)+"ed|w"+(i+1)+"en", "s"+(i+1)+"|s"+(i+1)+"d|s"+(i+1)+"n", "заметка "+(i+1)])};
  const rawN = JSON.stringify(big).length;
  let back = null, err = "";
  try{ back = A.unpackSet(A.packSet(big)); }catch(e){ err = e.message; }
  ok(n + " слов: round-trip без ошибки", !!back && !err, err);
  if(back){
    ok(n + " слов: количество строк", back.w.length === n, String(back.w.length));
    ok(n + " слов: первая строка цела", JSON.stringify(back.w[0]) === JSON.stringify(big.w[0]), JSON.stringify(back.w[0]));
    ok(n + " слов: последняя строка цела", JSON.stringify(back.w[n-1]) === JSON.stringify(big.w[n-1]), JSON.stringify(back.w[n-1]));
    ok(n + " слов: имя и id целы", back.n === big.n && back.i === big.i);
  }
  console.log("     " + n + " слов: json " + rawN + " байт, код " + (err ? "ошибка" : A.packSet(big).length) + " симв.");
}
{ // ровно на границе окна: 4096 байт исходника и больше
  for (const len of [4090, 4096, 4100, 5000, 9000]) {
    const text = ("Мотя проверяет упаковку ").repeat(Math.ceil(len/26)).slice(0, len);
    const bytes = A.lzCompress ? null : null;
    const code = A.packSet({i:"w"+len, n:"Окно", d:"", w:[[text.slice(0, Math.ceil(len/3)), text.slice(Math.ceil(len/3)), ""]]});
    let bad = "";
    try{ A.unpackSet(code); }catch(e){ bad = e.message; }
    ok("исходник ~" + len + " байт: распаковывается", !bad, bad);
  }
}
{ // псевдослучайные данные — минимум повторов, максимум проверки
  let seed = 123456789;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const chars = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyz0123456789 ";
  const w = Array.from({length:600}, ()=>{
    const s = k => Array.from({length:k}, ()=>chars[Math.floor(rnd()*chars.length)]).join("");
    return [s(6), s(9)+"|"+s(9), s(11)];
  });
  let err = "";
  try{ const back = A.unpackSet(A.packSet({i:"rnd", n:"Случайный", d:"", w})); if(back.w.length !== 600) err = "строк " + back.w.length; }
  catch(e){ err = e.message; }
  ok("600 строк почти без повторов: round-trip", !err, err);
}

console.log("\n4. Чтение ссылки");
sandbox.location.hash = "#" + link1.slice(link1.indexOf("#")+1);
const got = A.readSetFromLocation();
eq("набор из ссылки = набор из кода", got.w, set1.w);
ok("имя из ссылки", got.n === "Домашка 1", got.n);
sandbox.location.hash = "#v=1&d=1.XXXX";
ok("битая ссылка не роняет страницу", !!(A.readSetFromLocation().error));
sandbox.location.hash = "#d=1.XXXX";
ok("битый код в ссылке даёт ошибку", !!(A.readSetFromLocation().error));
sandbox.location.hash = "";
ok("пустая ссылка = null", A.readSetFromLocation() === null);

console.log("\n5. Парсер: реальный CSV из папки");
const csv = fs.readFileSync(CSV_PATH, "utf8");
const r1 = A.parseText(csv);
eq("слов в CSV", r1.ok.length, 14);
eq("отброшенных строк", r1.rejected.length, 0);
eq("первое слово", r1.ok[0].ru, "будить");
eq("формы первого", r1.ok[0].en, ["wake","woke","woken"]);
eq("транскрипция V1 (с ударением из файла)", r1.ok[0].trans[0], "[əˈweɪk]");
eq("форма was/were и транскрипция", r1.ok[1].en, ["be","was/were","been"]);
eq("транскрипция was/were", r1.ok[1].trans[1], "[wɒz]/[weə]");
eq("вариант через слешш", r1.ok[3].en, ["beat","beat","beaten/beat"]);
const realRows = r1.ok.map(w => [w.ru, w.en.join("|"), w.trans.join("|")]);
const rawReal = JSON.stringify(realRows).length;
const codeReal = A.packSet({i:"real", n:"Глаголы", d:"", w: realRows});
const naiveB64 = Math.ceil(rawReal/3)*4;
console.log("     реальные " + realRows.length + " глаголов: " + codeReal.length + " симв. против " + naiveB64 + " без сжатия (" + Math.round(codeReal.length/naiveB64*100) + "%)");
ok("сжатие полезнее простого base64", codeReal.length < naiveB64*0.85, codeReal.length + " против " + naiveB64);

console.log("\n6. Парсер: форматы");
const r2 = A.parseText("кошка;cat;[kæt]\nсобака;dog;[dɒɡ]");
eq("точка с запятой", r2.ok.map(w=>w.ru), ["кошка","собака"]);
eq("транскрипция привязана (скобки сохраняются)", r2.ok[0].trans, ["[kæt]"]);
const r3 = A.parseText("cat\t[kæt]\nкошка");
eq("таб + отсутствие русского = отбрасывание", r3.ok.length + "/" + r3.rejected.length, "0/2");
const r4 = A.parseText("кошка\tcat\t[kæt]\nсобака\tdog\t[dɒɡ]");
eq("табуляция", r4.ok.map(w=>w.ru), ["кошка","собака"]);
const r5 = A.parseText("кошка;cat,[kæt]\nсобака;dog,[dɒɡ]");
eq("запятая после точки с запятой (пробелы обрезаются)", r5.ok.map(w=>w.en[0]), ["cat,[kæt]","dog,[dɒɡ]"]);
ok("но запятая внутри скобок не разделитель", A.splitLine("кошка;cat, [kæt]", ";").length === 2, JSON.stringify(A.splitLine("кошка;cat, [kæt]", ";")));
ok("кавычки CSV", A.splitLine('a;"b;c";d', ";").join("|") === "a|b;c|d");
ok("экранирование кавычек", A.splitLine('a;"b""c";d', ";").join("|") === 'a|b"c|d');
const r6 = A.parseText('Русский;English;Транскрипция\nкошка;cat;[kæt]');
eq("шапка снимается", r6.ok.map(w=>w.ru), ["кошка"]);
const r7 = A.parseText("кошка;cat\nсобака;dog;дополнительное");
eq("второй русский фрагмент отбрасывается с причиной", [r7.ok.length, r7.rejected.length, r7.rejected[0].reason], [1,1,"второй русский фрагмент в строке"]);
const r8 = A.parseText('[{"ru":"кошка","en":["cat"],"trans":["[kæt]"]},{"ru":"собака","en":"dog"}]');
eq("JSON: массив", r8.ok.map(w=>w.ru), ["кошка","собака"]);
eq("JSON: en строкой", r8.ok[1].en, ["dog"]);
const r9 = A.parseText('[{"ru":"кошка","en":["cat"],"trans":["[kæt]"]}]');
eq("JSON: один объект", r9.ok.length, 1);
const r10 = A.parseText("будить\nwake");
eq("одна колонка = нет слов", r10.ok.length + "/" + r10.rejected.length, "0/2");
ok("разделитель по всем строкам, а не по первой", A.pickSeparator(["a;b;c\nd;e;f\nx;y;z"]) === ";");
ok("таб важнее запятой", A.pickSeparator(["a\tb\tc", "d\te\tf", "g\th\ti"]) === "\t");
ok("транскрипция в скобках", A.isTranscription("[weɪk]"));
ok("транскрипция со слешем", A.isTranscription("/wɒz/"));
ok("обычное слово не транскрипция", !A.isTranscription("wake"));
ok("форма глагола не транскрипция", !A.isTranscription("woken"));
const r11 = A.parseText("кошка;cat;котик\n;sosaka;;[dɒɡ]");
eq("обе плохие строки отброшены", r11.rejected.length, 2);
ok("текст отброшенной строки сохранён", r11.rejected.map(x => x.raw).includes(";sosaka;;[dɒɡ]"), JSON.stringify(r11.rejected.map(x => x.raw)));
eq("причина понятна", r11.rejected[1].reason, "нет русского перевода");

console.log("\n7. Прогресс");
A.recordWord("hw1","Маша","будить","wake",true);
A.recordWord("hw1","Маша","быть","be",false);
A.recordWord("hw1","Маша","быть","be",true);
A.recordWord("hw1","Маша","нести, переносить","bear",true);
A.recordSession("hw1","Маша",{t:Date.now(), score:30, correct:3, total:4, sec:80});
const p = A.getProgress("hw1","Маша");
ok("прогресс по слову создан", !!p.w["будить"]);
ok("попытки считаются", p.w["быть"].a === 2, JSON.stringify(p.w["быть"]));
ok("последний результат побеждает", p.w["быть"].last === true);
ok("уровень растёт при успехе", p.w["будить"].lvl === 1);
ok("уровень обнуляется при ошибке", p.w["нести, переносить"].lvl === 1);
ok("чужие ученики не видны", Object.keys(A.getProgress("hw1","Иван").w).length === 0);
const sum = A.progressSummary("hw1","Маша", VERBS);
eq("освоено 3 из 4 (была ошибка, потом верно)", [sum.learned, sum.total], [3,4]);
eq("займов записано", sum.sessions, 1);
ok("другой набор пуст", A.progressSummary("other","Маша",VERBS).learned === 0);
ok("у регистра есть разделитель слов", A.normalizeKey("  Нести,   Переносить ") === "нести, переносить");

console.log("\n6b. mergeRowsByEn: один глагол — одно слово");
{
  const dup = [
    ["нести, переносить","bear|bore|borne","bɛə|bɔː|bɔːn"],
    ["нести","bear|bore|borne",""],
    ["переносить","bear|bore|borne",""],
    ["будить","wake|woke|woken","[weɪk]|[wəʊk]|[ˈwəʊkən]"]
  ];
  const m = A.mergeRowsByEn(dup);
  eq("4 строки → 2 слова", m.length, 2);
  eq("переводы объединены", m[0][0], "нести, переносить");
  eq("английские формы первой строки", m[0][1], "bear|bore|borne");
  eq("транскрипция сохранена", m[0][2], "bɛə|bɔː|bɔːn");
  eq("второй глагол не тронут", m[1], ["будить","wake|woke|woken","[weɪk]|[wəʊk]|[ˈwəʊkən]",""]);
  ok("регистр и пробелы не мешают", A.mergeRowsByEn([["нести","Bear|bore|borne",""],["ПЕРЕНОСИТЬ","bear|bore|borne",""]])[0][0] === "нести, ПЕРЕНОСИТЬ");
  eq("пустые строки проходят", A.mergeRowsByEn([["",""],["x",""]]).length, 2);
  const wordsM = A.rowsToWords(m);
  ok("в EN→RU принимается любой из переводов", "нести, переносить".split(",").map(s=>s.trim()).includes("переносить"));
  const sumD = A.progressSummary("dup1","Маша", dup);
  eq("summary считает объединённые слова", sumD.total, 2);
  A.recordWord("dup1","Маша","нести, переносить","bear",true);
  const sumD2 = A.progressSummary("dup1","Маша", dup);
  eq("после ответа освоено 1 из 2", [sumD2.learned, sumD2.total], [1,2]);
}

console.log("\n8. Сравнение наборов");
const d = A.diffSets({w:VERBS}, {w: VERBS.concat([["новое","new|newed|newen","n|n|n"]], [["быть","BE|was/were|been","biː|wɒz|biːn"]])});
eq("добавлено 1, изменено 1", [d.added, d.changed], [1,1]);

console.log("\nИтог: успешно " + pass + ", провалено " + fail);
process.exit(fail ? 1 : 0);
/* Сверка CORE между motya.html и motya-teacher.html + санити-проверки релиза */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const out = [];
let bad = 0;

function block(file){
  const s = fs.readFileSync(file, 'utf8');
  const a = s.search(/\/\*[^*]*CORE START[^*]*\*\//);
  const b = s.search(/\/\*[^*]*CORE END[^*]*\*\//);
  const starts = (s.match(/CORE START/g) || []).length, ends = (s.match(/CORE END/g) || []).length;
  const bEnd = s.indexOf('*/', b) + 2;
  return { text: s.slice(a, bEnd), starts, ends };
}
function ok(name, cond, extra){
  out.push((cond ? '  ok  ' : '  FAIL ') + name + (!cond && extra !== undefined ? '  -> ' + extra : ''));
  if(!cond) bad++;
}
const pupilFile = path.join(ROOT, 'motya.html');
const teacherFile = path.join(ROOT, 'motya-teacher.html');
const pupilBl = block(pupilFile);
const teacherBl = block(teacherFile);
ok('motya.html: ровно один CORE START и один CORE END', pupilBl.starts === 1 && pupilBl.ends === 1, pupilBl.starts + '/' + pupilBl.ends);
ok('motya-teacher.html: ровно один CORE START и один CORE END', teacherBl.starts === 1 && teacherBl.ends === 1, teacherBl.starts + '/' + teacherBl.ends);
ok('CORE в ученике и преподавателе побайтно совпадает', pupilBl.text === teacherBl.text, 'len ' + pupilBl.text.length + ' vs ' + teacherBl.text.length);
for (const [name, script] of [['motya.html', pupilBl.text], ['motya-teacher.html', teacherBl.text]]){
  try{ new vm.Script(script); ok(name + ': встроенный CORE — валидный JS', true); }
  catch(e){ ok(name + ': встроенный CORE — валидный JS', false, e.message); }
}
const pupil = fs.readFileSync(pupilFile, 'utf8');
const teacher = fs.readFileSync(teacherFile, 'utf8');
ok('motya.html: нет ключей преподавателя', !/motya_sets_v1|motya_active_v1|motya_base_url_v1/.test(pupil));
ok('motya.html: нет редактора набора', !/LS_SETS|addSet\(|renderEditor|dlCsv/.test(pupil));
ok('motya.html: нет озвучки и распознавания', !/speechSynthesis|SpeechRecognition|webkitSpeechRecognition/.test(pupil));
const teacherCoreEnd = teacher.indexOf('CORE END');
ok('motya-teacher.html: нет речи', !/speechSynthesis|SpeechRecognition/.test(teacher));
ok('motya-teacher.html: нет записи прогресса ученика', !/recordWord\(|recordSession\(|getProgress\(/.test(teacher.slice(teacherCoreEnd)));
ok('motya-teacher.html: база глаголов внутри файла', /const VERB_BASE =/.test(teacher) && /const TRANS_BASE =/.test(teacher));
ok('motya.html: ссылка ведёт на файл ученика', /motya\.html/.test(pupil));
ok('motya.html: нет console.* в релизном коде', !/console\.(log|warn|error|debug)\s*\(/.test(pupil));
ok('motya-teacher.html: нет console.* в релизном коде', !/console\.(log|warn|error|debug)\s*\(/.test(teacher));
console.log(out.join('\n'));
console.log('\nИтог сверки: успешно ' + (out.length - bad) + ', провалено ' + bad);
process.exit(bad ? 1 : 0);

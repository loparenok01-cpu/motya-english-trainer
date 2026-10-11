/* Запуск всех тестов: node tests/run-all.js (или npm test в папке tests) */
const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  ['core-test.js', 'Ядро (упаковка, ссылки, парсер, прогресс)'],
  ['sync-check.js', 'Сверка CORE и санити-проверки'],
  ['motya-page-test.js', 'Ученик (jsdom)'],
  ['motya-teacher-test.js', 'Преподаватель (jsdom)']
];

let failed = 0;
for (const [file, title] of suites){
  console.log('\n===== ' + title + ' =====');
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', cwd: __dirname });
  if(r.status !== 0) failed++;
}
console.log(failed ? '\nПРОВАЛЕНО НАБОРОВ: ' + failed : '\nВСЕ НАБОРЫ ЗЕЛЁНЫЕ');
process.exit(failed ? 1 : 0);

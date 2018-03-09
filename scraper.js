require('dotenv').config();
require('isomorphic-fetch');
const cheerio = require('cheerio');
const redis = require('redis');
const util = require('util');


const redisOptions = {
  url: 'redis://127.0.0.1:6379/0',
};

const client = redis.createClient(redisOptions);

const asyncGet = util.promisify(client.get).bind(client);
const asyncSet = util.promisify(client.mset).bind(client);
const asyncFlush = util.promisify(client.flushall).bind(client);

/* todo require og stilla dót */

/**
 * Listi af sviðum með „slug“ fyrir vefþjónustu og viðbættum upplýsingum til
 * að geta sótt gögn.
 */
const departments = [
  {
    name: 'Félagsvísindasvið',
    slug: 'felagsvisindasvid',
  },
  {
    name: 'Heilbrigðisvísindasvið',
    slug: 'heilbrigdisvisindasvid',
  },
  {
    name: 'Hugvísindasvið',
    slug: 'hugvisindasvid',
  },
  {
    name: 'Menntavísindasvið',
    slug: 'menntavisindasvid',
  },
  {
    name: 'Verkfræði- og náttúruvísindasvið',
    slug: 'verkfraedi-og-natturuvisindasvid',
  },
];
async function getJson(index) {
  const slod = `https://ugla.hi.is/Proftafla/View/ajax.php?sid=2027&a=getProfSvids&proftaflaID=37&svidID=${index}&notaVinnuToflu=0`;
  const key = `tests${index}`;
  const cached = await asyncGet(key);
  if (cached) {
    return JSON.parse(cached);
  }
  const gogn = await fetch(slod);
  const texti = await gogn.json();
  const { html } = texti;
  const $ = cheerio.load(html);
  const h3 = $('h3');
  const tests = [];
  h3.each((i, el) => {
    tests.push({ heding: $(el).text().trim(), tests: [] });
    const tbody = $(el).next('table').find('tbody');
    tbody.each((c, em) => {
      const tr = $(em).find('tr');
      const arr = [];
      tr.each((l, elm) => {
        const td = $(elm).find('td');
        td.each((e, element) => {
          arr.push($(element).text());
        });
      });
      tests[i].tests.push({
        course: arr[0], name: arr[1], type: arr[2], students: arr[3], date: arr[4],
      });
    });
  });
  await asyncSet(key, JSON.stringify(tests));
  return tests;
}
/**
 * Sækir svið eftir `slug`. Fáum gögn annaðhvort beint frá vef eða úr cache.
 *
 * @param {string} slug - Slug fyrir svið sem skal sækja
 * @returns {Promise} Promise sem mun innihalda gögn fyrir svið eða null ef það finnst ekki
 */
async function getTests(slug) {
  /* todo */
  const index = departments.map(i => i.slug).indexOf(slug) + 1;
  if (index === 0) return null;
  const tests = getJson(index);
  return tests;
}

/**
 * Hreinsar cache.
 *
 * @returns {Promise} Promise sem mun innihalda boolean um hvort cache hafi verið hreinsað eða ekki.
 */
async function clearCache() {
  return asyncFlush();
}

/**
 * Sækir tölfræði fyrir öll próf allra deilda allra sviða.
 *
 * @returns {Promise} Promise sem mun innihalda object með tölfræði um próf
 */
async function getStats() {
  const tests = await getJson(0);
  let ma = 0;
  let mi = Infinity;
  let num = 0;
  for (let i = 0; i < tests.length; i += 1) {
    let { students } = tests[i].tests[0];
    students = parseInt(students, 10);
    num += students;
    if (students < mi) {
      mi = students;
    }
    if (students > ma) {
      ma = students;
    }
  }
  const avg = num / tests.length;
  const stats = {
    min: mi, max: ma, numTests: num, averageStudents: avg,
  };
  return stats;
}

module.exports = {
  departments,
  getTests,
  clearCache,
  getStats,
};

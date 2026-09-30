import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AIRPORTS_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
const AIRLINES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../data/flight-codes.json');

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value); value = '';
    } else if (char === '\n' && !quoted) {
      row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'HarborFlow flight-code updater' } });
  if (!response.ok) throw new Error(url + ' returned HTTP ' + response.status);
  return response.text();
}

const [airportText, airlineText] = await Promise.all([download(AIRPORTS_URL), download(AIRLINES_URL)]);
const airportRows = parseCsv(airportText);
const header = airportRows.shift();
const column = name => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error('Missing OurAirports column: ' + name);
  return index;
};

const airports = airportRows
  .filter(row => /^[A-Z]{3}$/.test(row[column('iata_code')]) && row[column('type')] !== 'closed')
  .map(row => [
    row[column('iata_code')],
    row[column('name')].toUpperCase(),
    row[column('municipality')].toUpperCase(),
    row[column('iso_country')].toUpperCase()
  ])
  .filter((row, index, all) => all.findIndex(other => other.join('~') === row.join('~')) === index)
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

const airlines = parseCsv(airlineText)
  .filter(row => /^[A-Z0-9]{2}$/.test(row[3]) && row[7] === 'Y')
  .map(row => [
    row[3],
    row[1].toUpperCase(),
    row[2] && row[2] !== '\\N' ? row[2].toUpperCase() : '',
    row[6].toUpperCase()
  ])
  .filter((row, index, all) => all.findIndex(other => other.join('~') === row.join('~')) === index)
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

const generatedAt = new Date().toISOString();
const data = {
  generatedAt,
  notice: 'Open-data suggestions, not the official live IATA directory. Verify codes before operational use.',
  sources: [
    { name: 'OurAirports', url: 'https://ourairports.com/data/', license: 'Public Domain' },
    { name: 'OpenFlights', url: 'https://openflights.org/data.php', license: 'ODbL-1.0 / DbCL-1.0' }
  ],
  airports,
  airlines
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(data));
process.stdout.write(JSON.stringify({ generatedAt, airports: airports.length, airlines: airlines.length, outputPath }) + '\n');


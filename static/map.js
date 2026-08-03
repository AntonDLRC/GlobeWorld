let hovered = null;
let selected = null;

const nameMap     = new Map(); // ccn3 → common name
const ccn3ToISO2  = new Map(); // ccn3 → iso2
const cca2Map     = new Map(); // iso2 → full country object
const validISO2   = new Set(); // iso2 codes in our database
let   allCountries = [];       // full country list, used for search
let   countryFeatures = [];    // topojson features currently drawn

let popupOpen = false;

/* SVG */

const svg = d3.select('#map-container')
  .append('svg')
  .attr('width', '100%')
  .attr('height', '100%');

const g = svg.append('g'); // pan/zoom group

const projection = d3.geoNaturalEarth1();
const path = d3.geoPath(projection);

function sizeToWindow() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.attr('viewBox', `0 0 ${w} ${h}`);
  projection.fitSize([w, h], { type: 'Sphere' });
  g.selectAll('path.country').attr('d', path);
  g.select('path.sphere').attr('d', path({ type: 'Sphere' }));
}

window.addEventListener('resize', sizeToWindow);

/* Sphere / ocean background */
g.append('path')
  .attr('class', 'sphere')
  .attr('fill', 'rgba(10,25,55,0.55)')
  .attr('stroke', 'rgba(80,140,200,0.25)')
  .attr('stroke-width', 1);

/* Zoom / pan */
const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });

svg.call(zoom);

/* Coloring, same as capColor/capAlt in home.js */

function isValidCountry(d) {
  if (!d) return false;
  const id   = String(d.id).padStart(3, '0');
  const iso2 = ccn3ToISO2.get(id);
  return iso2 ? validISO2.has(iso2) : false;
}

function fillColor(d) {
  if (!isValidCountry(d)) return 'rgba(60,60,60,0.35)';
  if (d === selected)     return 'rgba(56,189,248,0.95)';
  if (d === hovered)      return 'rgba(45,212,191,0.90)';
  return 'rgba(99,155,230,0.55)';
}

function refreshColors() {
  g.selectAll('path.country').attr('fill', fillColor);
}

/* Tooltip, label on hover so when ur cursor on the country shape it will show the country name */

const tooltip = d3.select('#map-container')
  .append('div')
  .attr('class', 'globe-label')
  .style('position', 'fixed')
  .style('pointer-events', 'none')
  .style('opacity', 0)
  .style('z-index', 15);

function showTooltip(event, d) {
  const id   = String(d.id).padStart(3, '0');
  const name = nameMap.get(id) || '';
  if (!name) return;
  tooltip
    .html(name)
    .style('left', (event.clientX + 12) + 'px')
    .style('top',  (event.clientY + 12) + 'px')
    .style('opacity', 1);
}

function moveTooltip(event) {
  tooltip
    .style('left', (event.clientX + 12) + 'px')
    .style('top',  (event.clientY + 12) + 'px');
}

function hideTooltip() {
  tooltip.style('opacity', 0);
}

/* This load everything just like how home.js load its data */

Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json()),
  fetch('/api/all-countries').then(r => r.json()),
  fetch('/api/countries').then(r => r.json())
]).then(([world, countryList, dbData]) => {

  allCountries = countryList;

  countryList.forEach(c => {
    if (c.ccn3) {
      nameMap.set(c.ccn3, c.name.common);
      ccn3ToISO2.set(c.ccn3, c.cca2);
    }
    if (c.cca2) cca2Map.set(c.cca2, c);
  });

  dbData.iso2_list.forEach(code => validISO2.add(code));

  const countries = topojson.feature(world, world.objects.countries);
  countryFeatures = countries.features;

  g.selectAll('path.country')
    .data(countryFeatures)
    .enter()
    .append('path')
    .attr('class', 'country')
    .attr('fill', fillColor)
    .attr('stroke', 'rgba(80,140,200,0.35)')
    .attr('stroke-width', 0.5)
    .style('cursor', d => (isValidCountry(d) ? 'pointer' : 'default'))
    .on('mousemove', (event, d) => {
      if (!isValidCountry(d)) { hideTooltip(); return; }
      if (hovered !== d) {
        hovered = d;
        refreshColors();
      }
      showTooltip(event, d);
    })
    .on('mouseleave', () => {
      hovered = null;
      refreshColors();
      hideTooltip();
    })
    .on('click', (event, d) => {
      event.stopPropagation();
      if (!isValidCountry(d)) return;
      onCountryClick(d);
    });

  sizeToWindow();

}).catch(err => console.error('Failed to load map data:', err));

/* Country click handler, same as from the home.js */

async function onCountryClick(d) {
  if (!d) return;

  selected = d;
  refreshColors();
  showLoading();

  try {
    popupOpen = true;

    const id   = String(d.id).padStart(3, '0');
    const iso2 = ccn3ToISO2.get(id);
    const c    = iso2 ? cca2Map.get(iso2) : null;
    if (!c) throw new Error('Country not found');

    flyToFeature(d);

    let description = 'No historical description available.';
    let places = '';
    let timezone = 'N/A';
    let population = 'N/A';
    try {
      const dbRes = await fetch(`/api/country/${iso2}`);
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        description = dbData.description || description;
        places      = dbData.places      || '';
        timezone    = dbData.timezone    || 'N/A';
        population  = dbData.population  || 'N/A';
      }
    } catch (_) {}

    renderPopup({
      name:       c.name.common,
      official:   c.name.official,
      flag:       `https://flagcdn.com/w320/${iso2.toLowerCase()}.png`,
      flagAlt:    c.flags?.alt || `Flag of ${c.name.common}`,
      capital:    c.capital?.[0]           ?? 'N/A',
      population,
      region:     c.subregion  ?? c.region ?? 'N/A',
      area:       c.area ? c.area.toLocaleString() + ' km²' : 'N/A',
      currency:   getCurrency(c.currencies),
      languages:  getLanguages(c.languages),
      calling:    getCallingCode(c.idd),
      timezone,
      un:         c.unMember ? '✓ Member' : 'Non-member',
      description,
      places,
    });

  } catch (err) {
    showError(err.message);
  }
}

/* Zoom/pan the map so the clicked/searched country is centered */
function flyToFeature(feature) {
  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const scale = Math.max(1, Math.min(8, 0.7 / Math.max(dx / w, dy / h)));
  const translate = [w / 2 - scale * cx, h / 2 - scale * cy];

  svg.transition().duration(1000).call(
    zoom.transform,
    d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
  );
}

function showLoading() {
  popupOpen = true;
  document.getElementById('popup').classList.add('visible');
}

function showError(msg) {
  popupOpen = false;
  document.getElementById('popup').classList.remove('visible');
  selected = null;
  refreshColors();
}

function renderPopup(info) {
  document.getElementById('popup-flag').src             = info.flag;
  document.getElementById('popup-flag').alt             = info.flagAlt;
  document.getElementById('popup-name').textContent     = info.name;
  document.getElementById('popup-official').textContent = info.official !== info.name ? info.official : '';
  document.getElementById('popup-region-badge').textContent = info.region;
  document.getElementById('popup-capital').textContent    = info.capital;
  document.getElementById('popup-population').textContent = info.population;
  document.getElementById('popup-area').textContent       = info.area;
  document.getElementById('popup-currency').textContent   = info.currency;
  document.getElementById('popup-languages').textContent  = info.languages;
  document.getElementById('popup-calling').textContent    = info.calling;
  document.getElementById('popup-timezone').textContent   = info.timezone;
  document.getElementById('popup-un').textContent         = info.un;
  document.getElementById('popup-desc-text').textContent  = info.description;
  document.getElementById('popup-places').textContent     = info.places || 'No places listed yet.';

  document.getElementById('popup').classList.add('visible');
}

document.getElementById('popup-close').addEventListener('click', () => {
  popupOpen = false;
  document.getElementById('popup').classList.remove('visible');
  selected = null;
  refreshColors();
});

/* Search bar, same as home.js */

const searchInput    = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-dropdown');
let   searchTimer    = null;

const regionFilter = document.getElementById('region-filter');
let   selectedRegion = 'all';

regionFilter.addEventListener('change', () => {
  selectedRegion = regionFilter.value;
  runSearch();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

function runSearch() {
  const query = searchInput.value.trim();
  const q = query.toLowerCase();

  let results = allCountries.filter(c => validISO2.has(c.cca2));

  if (selectedRegion !== 'all') {
    results = results.filter(c => c.region === selectedRegion);
  }

  if (query.length >= 2) {
    results = results.filter(c => c.name.common.toLowerCase().includes(q));
  } else if (selectedRegion === 'all') {
    searchDropdown.innerHTML = '';
    return;
  }

  buildDropdown(results, query);
}

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const first = searchDropdown.querySelector('li');
    if (first) first.click();
  }
  if (e.key === 'Escape') {
    searchDropdown.innerHTML = '';
    searchInput.blur();
  }
});

document.getElementById('search-btn').addEventListener('click', () => {
  const first = searchDropdown.querySelector('li');
  if (first) first.click();
});

searchInput.addEventListener('blur', () => {
  setTimeout(() => { searchDropdown.innerHTML = ''; }, 200);
});

function buildDropdown(results, query) {
  searchDropdown.innerHTML = '';
  if (!results || !results.length) return;

  results
    .sort((a, b) => {
      const aStarts = a.name.common.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
      const bStarts = b.name.common.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
      return aStarts - bStarts;
    })
    .forEach(c => {
      const item = document.createElement('li');
      const name  = c.name.common;
      const i     = name.toLowerCase().indexOf(query.toLowerCase());
      if (i >= 0) {
        item.innerHTML =
          name.slice(0, i) +
          `<strong>${name.slice(i, i + query.length)}</strong>` +
          name.slice(i + query.length);
      } else {
        item.textContent = name;
      }

      item.addEventListener('mousedown', e => {
        e.preventDefault();
        searchInput.value        = name;
        searchDropdown.innerHTML = '';
        flyToCountry(c);
      });

      searchDropdown.appendChild(item);
    });
}

function flyToCountry(c) {
  const country = cca2Map.get(c.cca2);
  if (!country) return;

  // find the matching topojson feature so we can zoom to its actual bounds
  const feature = countryFeatures.find(f => f.id == country.ccn3)
               || countryFeatures.find(f => String(f.id) === String(parseInt(country.ccn3)));

  if (feature) {
    selected = feature;
    refreshColors();
    flyToFeature(feature);
  }

  popupOpen = true;

  (async () => {
    let description = 'No historical description available.';
    let places = '';
    let timezone = 'N/A';
    let population = 'N/A';
    try {
      const dbRes = await fetch(`/api/country/${country.cca2}`);
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        description = dbData.description || description;
        places      = dbData.places      || '';
        timezone    = dbData.timezone    || 'N/A';
        population  = dbData.population  || 'N/A';
      }
    } catch (_) {}

    renderPopup({
      name:       country.name.common,
      official:   country.name.official,
      flag:       `https://flagcdn.com/w320/${country.cca2.toLowerCase()}.png`,
      flagAlt:    country.flags?.alt || `Flag of ${country.name.common}`,
      capital:    country.capital?.[0]               ?? 'N/A',
      population,
      region:     country.subregion  ?? country.region ?? 'N/A',
      area:       country.area ? country.area.toLocaleString() + ' km²' : 'N/A',
      currency:   getCurrency(country.currencies),
      languages:  getLanguages(country.languages),
      calling:    getCallingCode(country.idd),
      timezone,
      un:         country.unMember ? '✓ Member' : 'Non-member',
      description,
      places,
    });
  })();
}

/* ---------- helper functions (same as home.js) ---------- */

function getCurrency(currencies) {
  if (!currencies) return 'N/A';
  const first = Object.values(currencies)[0];
  return first ? `${first.name}${first.symbol ? ' (' + first.symbol + ')' : ''}` : 'N/A';
}

function getLanguages(languages) {
  if (!languages) return 'N/A';
  const list = Object.values(languages);
  return list.length > 3 ? list.slice(0, 3).join(', ') + '…' : list.join(', ');
}

function getCallingCode(idd) {
  if (!idd || !idd.root) return 'N/A';
  return idd.root + (idd.suffixes?.[0] || '');
}






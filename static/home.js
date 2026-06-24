/* globe container */

let hovered = null;
let selected = null;

// These get filled once all data finishes loading (see Promise.all below)
const nameMap     = new Map(); // ccn3 → common name
const ccn3ToISO2  = new Map(); // ccn3 → iso2
const cca2Map     = new Map(); // iso2 → full country object
const validISO2   = new Set(); // iso2 codes that are in our database
let   allCountries = [];       // full country list, used for search

function isValidCountry(d) {
  if (!d) return false;
  const id   = String(d.id).padStart(3, '0');
  const iso2 = ccn3ToISO2.get(id);
  return iso2 ? validISO2.has(iso2) : false;
}

function capColor(d) {
  if (!isValidCountry(d)) return 'rgba(60,60,60,0.25)';   // not in DB → dim grey
  if (d === selected)     return 'rgba(56,189,248,0.95)';
  if (d === hovered)      return 'rgba(45,212,191,0.90)';
  return 'rgba(99,155,230,0.55)';
}

function capAlt(d) {
  if (!isValidCountry(d)) return 0.002;
  if (d === selected)     return 0.02;
  if (d === hovered)      return 0.014;
  return 0.006;
}

// Build the globe
const globe = Globe()(document.getElementById('globe-container'))
  .width(window.innerWidth)
  .height(window.innerHeight)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
  .atmosphereColor('#1a6fa8')
  .atmosphereAltitude(0.22)
  .polygonsData([])
  .polygonCapColor(capColor)
  .polygonSideColor(() => 'rgba(8,22,48,0.5)')
  .polygonStrokeColor(() => 'rgba(80,140,200,0.35)')
  .polygonAltitude(capAlt)
  .polygonLabel(d => {
    const id   = String(d.id).padStart(3, '0');
    const name = nameMap.get(id) || '';
    return name ? `<div class="globe-label">${name}</div>` : '';
  })
  .onPolygonHover(d => {
    if (d && !isValidCountry(d)) {
      document.body.style.cursor = 'default';
      return;
    }
    hovered = d || null;
    document.body.style.cursor = d ? 'pointer' : 'default';
    globe.polygonCapColor(capColor).polygonAltitude(capAlt);
  })
  .onPolygonClick((d, e) => {
    e.stopPropagation();
    if (!isValidCountry(d)) return;
    onCountryClick(d);
  });

window.addEventListener('resize', () =>
  globe.width(window.innerWidth).height(window.innerHeight)
);

// Load EVERYTHING first, then draw the globe — this avoids any race conditions
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
  globe.polygonsData(countries.features);

}).catch(err => console.error('Failed to load globe data:', err));


/* Globe Auto Spinning */

const controls = globe.controls();
controls.autoRotate      = true;
controls.autoRotateSpeed = 0.38;
controls.enableDamping   = true;
controls.dampingFactor   = 0.07;

let spinTimer     = null;
let popupOpen     = false;
const globeCanvas = globe.renderer().domElement;

function pauseAutoRotate() {
  clearTimeout(spinTimer);
  controls.autoRotate = false;
}

function resumeAutoRotate(delay = 3000) {
  clearTimeout(spinTimer);
  spinTimer = setTimeout(() => { controls.autoRotate = true; }, delay);
}

globeCanvas.addEventListener('mousedown',  () => { pauseAutoRotate(); });
globeCanvas.addEventListener('touchstart', () => { pauseAutoRotate(); }, { passive: true });
globeCanvas.addEventListener('mouseup',    () => { if (!popupOpen) resumeAutoRotate(3000); });
globeCanvas.addEventListener('touchend',   () => { if (!popupOpen) resumeAutoRotate(3000); }, { passive: true });


/* Country Click Handler — now reads from the local countries.json instead of restcountries.com */
async function onCountryClick(d) {
  if (!d) return;

  selected = d;
  globe.polygonCapColor(capColor).polygonAltitude(capAlt);
  showLoading();

  try {
    pauseAutoRotate();
    popupOpen = true;

    const id   = String(d.id).padStart(3, '0');
    const iso2 = ccn3ToISO2.get(id);
    const c    = iso2 ? cca2Map.get(iso2) : null;
    console.log(c);
    if (!c) throw new Error('Country not found');

    const latlng = c.latlng || [0, 0];
    globe.pointOfView({ lat: latlng[0], lng: latlng[1], altitude: 2.0 }, 1200);

    let description = 'No historical description available.';
    let places = '';
    let timezone = 'N/A';
    let population = 'N/A'; 
    try {
     const dbRes = await fetch(`/api/country/${iso2}`);
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        description  = dbData.description || description;
        places       = dbData.places      || '';
        timezone     = dbData.timezone    || 'N/A';  // ← now reads from DB
        population  = dbData.population || 'N/A';
      }
    } catch (_) {}

    renderPopup({
      name:       c.name.common,
      official:   c.name.official,
      flag: `https://flagcdn.com/w320/${iso2.toLowerCase()}.png`,
      flagAlt:    c.flags?.alt || `Flag of ${c.name.common}`,
      capital:    c.capital?.[0]               ?? 'N/A',
      population,
      region:     c.subregion  ?? c.region     ?? 'N/A',
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

function showLoading() {
  popupOpen = true;
  pauseAutoRotate();
  document.getElementById('popup').classList.add('visible');
}

function showError(msg) {
  popupOpen = false;
  resumeAutoRotate(3000);
  document.getElementById('popup').classList.remove('visible');
  selected = null;
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
  globe.polygonCapColor(capColor).polygonAltitude(capAlt);
  resumeAutoRotate(3000);
});


/* Search Bar — now searches the local list instead of restcountries.com */
const searchInput    = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-dropdown');
let   searchTimer    = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();

  if (query.length < 2) {
    searchDropdown.innerHTML = '';
    return;
  }

  searchTimer = setTimeout(() => {
    const q = query.toLowerCase();
    const results = allCountries.filter(c =>
      c.name.common.toLowerCase().includes(q)
    );
    buildDropdown(results, query);
  }, 250);
});

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
    .filter(c => validISO2.has(c.cca2))
    .sort((a, b) => {
      const aStarts = a.name.common.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
      const bStarts = b.name.common.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 8)
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

// Fly the globe to a searched country — looks up locally, no fetch needed
function flyToCountry(c) {
  const country = cca2Map.get(c.cca2);
  if (!country) return;

  const latlng = country.latlng || [0, 0];
  globe.pointOfView({ lat: latlng[0], lng: latlng[1], altitude: 2.0 }, 1200);
  pauseAutoRotate();
  popupOpen = true;

  const match = globe.polygonsData().find(p => p.id == country.ccn3)
             || globe.polygonsData().find(p => String(p.id) === String(parseInt(country.ccn3)));
  if (match) {
    selected = match;
    globe.polygonCapColor(capColor).polygonAltitude(capAlt);
  }

  (async () => {
    let description = 'No historical description available.';
    let places = '';
    let timezone = 'N/A';
    let population = 'N/A'; 
    try {
      const dbRes = await fetch(`/api/country/${country.cca2}`);
      if (dbRes.ok) {
       const dbData = await dbRes.json();
        description  = dbData.description || description;
        places       = dbData.places      || '';
       timezone     = dbData.timezone    || 'N/A';
       population  = dbData.population || 'N/A';
      }
    } catch (_) {}

    renderPopup({
      name:       country.name.common,
      official:   country.name.official,
      flag: `https://flagcdn.com/w320/${country.cca2.toLowerCase()}.png`,
      flagAlt:    country.flags?.alt || `Flag of ${country.name.common}`,
      capital:    country.capital?.[0]                 ?? 'N/A',
      population,
      region:     country.subregion  ?? country.region  ?? 'N/A',
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


/* helper functions to format country data */
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
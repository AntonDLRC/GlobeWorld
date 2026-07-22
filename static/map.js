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


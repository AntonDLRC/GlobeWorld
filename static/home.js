/* globe container */

let hovered = null;
let selected = null;

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
    hovered = d || null;
    document.body.style.cursor = d ? 'pointer' : 'default';
    globe.polygonCapColor(capColor).polygonAltitude(capAlt);
  })
  .onPolygonClick((d, e) => {
    e.stopPropagation();
    onCountryClick(d);
  });

window.addEventListener('resize', () =>
  globe.width(window.innerWidth).height(window.innerHeight)
);

// Load the country border shapes from CDN
fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
  .then(r => r.json())
  .then(world => {
    const countries = topojson.feature(world, world.objects.countries);
    globe.polygonsData(countries.features);
  });


// color function for the globe
function capColor(d) {
    if (d === selected) return 'rgba(56,189,248,0.95)';  // clicked → bright blue
    if (d === hovered)  return 'rgba(45,212,191,0.90)';  // hovered → bright teal
    return 'rgba(99,155,230,0.55)';                       // default → lighter blue
}

// when cursor on the country it will lift them slightly
function capAlt(d) {
  if (d === selected) return 0.02;
  if (d === hovered)  return 0.014;
  return 0.006;
}

// Used to show the country name when hovering
const nameMap = new Map();
fetch('https://restcountries.com/v3.1/all?fields=name,ccn3')
  .then(r => r.json())
  .then(list => {
    list.forEach(c => {
      if (c.ccn3) nameMap.set(c.ccn3, c.name.common);
    });
  });

/* Globe Auto Spinning */

const controls = globe.controls();
controls.autoRotate      = true;
controls.autoRotateSpeed = 0.38;
controls.enableDamping   = true;
controls.dampingFactor   = 0.07;

// Pause auto-rotation on mouse hover, resume on mouse out
let spinTimer     = null;
const globeCanvas = globe.renderer().domElement;

// Stop spinning when user grabs the globe
globeCanvas.addEventListener('mousedown',  () => { clearTimeout(spinTimer); controls.autoRotate = false; });
globeCanvas.addEventListener('touchstart', () => { clearTimeout(spinTimer); controls.autoRotate = false; }, { passive: true });

// Resume spinning 3 seconds after user lets go
globeCanvas.addEventListener('mouseup',    () => { spinTimer = setTimeout(() => { controls.autoRotate = true; }, 3000); });
globeCanvas.addEventListener('touchend',   () => { spinTimer = setTimeout(() => { controls.autoRotate = true; }, 3000); }, { passive: true });
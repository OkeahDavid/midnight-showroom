import { CARS } from './cars.js';

const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

document.getElementById('about-cars').innerHTML = CARS.map((car) => {
  const m = car.model3d.credit;
  return `
    <article class="about-car">
      <h3><a href="./#${car.id}">${car.brand} ${car.model}</a></h3>
      <p class="about-car-meta">${car.generation} · ${car.years}</p>
      <p>3D model: ${link(m.url, `“${m.title}”`)} by ${m.author}, ${link(m.licenseUrl, m.license)}</p>
      <p>Sources: ${car.sources.map(([t, u]) => link(u, t)).join(' · ')}</p>
    </article>`;
}).join('');

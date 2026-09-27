// Every car in the showroom. Specs come from manufacturer press material where
// available (see `sources`); paint swatch hex values are on-screen approximations.

export const CARS = [
  {
    id: 'porsche-911',
    brand: 'Porsche',
    model: '911 Carrera 4S',
    short: '911',
    generation: 'Type 991.1',
    years: '2012 – 2015',
    lede: 'The all-wheel-drive 911 of the 991 generation, with a 3.8-litre flat-six and the wider body shared with the Carrera 4.',
    lengthM: 4.49,
    model3d: {
      url: new URL('./assets/porsche-911.glb', import.meta.url),
      paint: ['paint'],
      lights: { front: ['lights'] },
      wheels: ['Cylinder.000', 'Cylinder.001'],
      ground: 'Material',
      credit: { title: '(FREE) Porsche 911 Carrera 4S', author: 'Lionsharp Studios', url: 'https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    },
    specs: [
      ['Engine', '3.8 L flat-six, naturally aspirated'],
      ['Power', '400 PS (294 kW) at 7,400 rpm'],
      ['Torque', '440 Nm at 5,600 rpm'],
      ['0–100 km/h', '4.5 s manual · 4.1 s PDK with Sport Chrono'],
      ['Top speed', '299 km/h'],
      ['Drive', 'All-wheel drive'],
      ['Kerb weight', '1,445 kg (manual)'],
    ],
    story: [
      'Porsche added the Carrera 4 and 4S to the 991 range at the Paris Motor Show in September 2012, a year after the rear-drive cars debuted in Frankfurt.',
      'The 991 grew its wheelbase by 100 mm to 2,450 mm over the 997, and its body mixes high-strength steel, aluminium and composites to keep weight down.',
    ],
    details: [
      'The 4S carries the wider rear body of the all-wheel-drive cars.',
      'Seven-speed manual or seven-speed PDK dual-clutch gearbox.',
      'The engine still hangs behind the rear axle, as in every 911 since 1963.',
    ],
    paints: [
      { name: 'Guards Red', code: '80K', hex: '#b8121b', finish: 'solid' },
      { name: 'Racing Yellow', code: '1S1', hex: '#f2c200', finish: 'solid' },
      { name: 'GT Silver Metallic', code: 'M7Z', hex: '#a2a5a8', finish: 'metallic' },
      { name: 'Agate Grey Metallic', code: 'M7S', hex: '#6c6d70', finish: 'metallic' },
      { name: 'Sapphire Blue Metallic', code: 'M5J', hex: '#1c2b4c', finish: 'metallic' },
      { name: 'Aqua Blue Metallic', code: 'M5R', hex: '#2b6f93', finish: 'metallic' },
      { name: 'Basalt Black Metallic', code: 'C9Z', hex: '#1b1c20', finish: 'metallic' },
      { name: 'Black', code: '041', hex: '#0b0b0c', finish: 'solid' },
    ],
    sources: [
      ['Wikipedia: Porsche 911 (991)', 'https://en.wikipedia.org/wiki/Porsche_911_(991)'],
      ['Porsche paint codes, 2013 911', 'https://www.automotivetouchup.com/touch-up-paint/porsche/2013/911/'],
    ],
  },
];

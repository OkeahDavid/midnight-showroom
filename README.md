# Midnight Showroom

A night-time car showroom in the browser: four cars in a dark studio, inspired by the 3D hero on [animejs.com](https://animejs.com). Built with [three.js](https://threejs.org), [anime.js](https://animejs.com) v4 and Parcel.

- **Assembly intro:** the first car you open flies together part by part as a wireframe. A scan sheet then paints it solid from front to back, the lights switch on and a neon ring draws itself on the floor.
- **Scroll tour:** scrolling orbits the camera through side, rear and top views, alongside the car's specs, history and details.
- **Drive-in transitions:** when you switch cars, the current one drives off with its wheels rolling and the next drives in and stops on its mark.
- **Paint:** each car has a picker with real colours for that model. Swatches are on-screen approximations, and matte finishes render matte.
- **Deep links:** each car has its own URL hash, e.g. `#bmw-m4-csl`.

## The cars

| Car | Generation | 3D model | Licence |
|---|---|---|---|
| Porsche 911 Carrera 4S | 991.1, 2012 – 2015 | [(FREE) Porsche 911 Carrera 4S](https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf) by Lionsharp Studios | CC BY-SA 4.0 |
| Mercedes-AMG SL 63 | R232, 2022 – today | [Mersedes-Benz SL63 AMG [Free]](https://sketchfab.com/3d-models/mersedes-benz-sl63-amg-free-f7a625e6f5de425e89e84ae2e92cad65) by Black Snow | CC BY 4.0 |
| BMW M4 CSL | G82, 2022 – 2023 | [BMW m4 CSL 2023](https://sketchfab.com/3d-models/bmw-m4-csl-2023-26d05968e63b4fc28205cbb9abb0ea41) by Black Snow | CC BY 4.0 |
| Lamborghini Centenario | LP 770-4, 2016 | [Lamborghini Centenario LP-770 Interior SDC](https://sketchfab.com/3d-models/lamborghini-centenario-lp-770-interior-sdc-d679af35b5694301a185c7454a700c73) by SDC PERFORMANCE | CC BY 4.0 |

Specs, history and colours come from manufacturer press material where available: [BMW Group PressClub](https://www.press.bmwgroup.com/global/article/detail/T0386533EN/the-all-new-bmw-m4-csl-the-re-edition-of-a-legend?language=en) for the M4 CSL and [lamborghini.com](https://www.lamborghini.com/en-en/history/few-off/centenario) for the Centenario. The rest come from Wikipedia and colour listings. Each car's sources are linked in the page footer and listed in [`src/cars.js`](src/cars.js).

This is an independent fan project. It is not affiliated with or endorsed by Porsche AG, Mercedes-Benz Group AG, BMW AG or Automobili Lamborghini S.p.A.

## Run it

```bash
npm install
npm start          # dev server at http://localhost:1234
npm run build      # static site in dist/
```

## Adding a car

Every car is a single entry in [`src/cars.js`](src/cars.js). The entry holds the text (specs, story, details), the paint list and a `model3d` block that tells the engine which materials are paint, accents and lights, and which nodes are wheels. Put the optimized `.glb` in `src/assets/`.

The source models were compressed from 19–43 MB to 2–3 MB each with [glTF Transform](https://gltf-transform.dev). The flags keep every part as a separate mesh so the explode intro and rolling wheels still work:

```bash
npx @gltf-transform/cli optimize raw/<car>.glb src/assets/<car>.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --simplify-ratio 0.5 --simplify-error 0.001 \
  --join false --flatten false --instance false --palette false
```

## Licence

The code is MIT licensed (see [LICENSE](LICENSE)). The 3D models in `src/assets/` are **not** covered by the MIT licence: each keeps the licence of its original listed above, and the optimized Porsche model remains CC BY-SA 4.0.

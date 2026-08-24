/**
 * atlas-catalogue.mjs — the border mountains, as build-time source data.
 *
 * Every entry in "Mountains Divided by International Boundaries" that the
 * program can honestly turn into a bivariate maximisation problem: a named
 * mountain cut by an international boundary whose summit lies strictly inside
 * one country. The boundary is the constraint; the summit is out of reach; the
 * highest point you *can* reach is on the line. That is the whole of
 * constrained maximisation, drawn by a frontier somebody negotiated.
 *
 * Why the boundaries here are exact rather than fitted
 * ----------------------------------------------------
 * Saint Elias took its frontier from a 1:10 000 000 coastline dataset, which
 * carries a kilometre or so of positional error — tolerable on a 40 km window,
 * fatal for a peak half a kilometre from the line. Almost every mountain in
 * this catalogue is spared that problem, because its boundary is not a surveyed
 * squiggle but a *definition*:
 *
 *   parallel   the 49th parallel N — the Canada/US line west of the Lake of the
 *              Woods. In local coordinates it is exactly y = constant.
 *   meridian   the 141st meridian W (Alaska/Yukon), the 25th meridian E
 *              (Libya/Sudan). Exactly x = constant.
 *   line       a treaty straight line between two points whose coordinates the
 *              treaty itself states — the 1848 Guadalupe Hidalgo line from the
 *              Pacific initial point to the Gila–Colorado junction, the 1853
 *              Gadsden line west of 111° W. A straight segment is reproduced
 *              exactly by its endpoints, so there is no interpolation error to
 *              inherit.
 *
 * So the constraint a student maximises under is the real legal line, to the
 * accuracy of the geodesy, and the only approximation left is the elevation
 * model and the smoothing applied to it.
 *
 * Coordinates are approximate summit positions used to *seed* the search; the
 * build tool locates the true summit in the elevation model near them and
 * refuses to proceed if the peak it finds is not the height the atlas says it
 * should be. Distances are therefore computed, never copied.
 */

/** Metres per degree, near enough for a window tens of km across. */
export const KY = 110.574;
export const kxAt = (lat) => 111.320 * Math.cos((lat * Math.PI) / 180);

/**
 * Treaty lines, by their defining endpoints.
 *
 * GUADALUPE: the 1848 boundary west of the Colorado — one straight line from
 * the Pacific initial point (one marine league south of the southernmost point
 * of San Diego Bay) to the junction of the Gila and Colorado rivers. Otay
 * Mountain and Tecate Peak both sit against this single segment.
 *
 * GADSDEN_W: the 1853 boundary west of 111° W — a straight line from
 * (31°20′ N, 111° W) to a point on the Colorado twenty English miles below the
 * Gila junction. The Pajarito Mountains stand on it.
 *
 * JORDAN_SAUDI and LIBYA_CHAD are the straight treaty sectors crossing those
 * two desert mountains; the endpoints are the sector's defining corners.
 */
export const LINES = {
  GUADALUPE: { a: [32.5342, -117.1245], b: [32.7188, -114.7191] },
  GADSDEN_W: { a: [31.3333, -111.0000], b: [32.4894, -114.8156] },
  JORDAN_SAUDI: { a: [29.1869, 34.9600], b: [29.1050, 36.0700] },
  LIBYA_CHAD: { a: [21.5704, 19.7804], b: [22.1800, 18.5456] },
};

/**
 * One entry per mountain.
 *
 *   id            preset key and function name: border id (x, y)
 *   lat, lon      approximate summit, to seed the elevation search
 *   metres        the atlas's elevation, used as an acceptance test
 *   seekKm        how far from the seed the true summit may be
 *   halfKm        half-width of the window baked into the bundle
 *   boundary      { parallel: lat } | { meridian: lon } | { line: LINES.X }
 *   inside        which side of the boundary the summit is on: 'n','s','e','w'
 *                 for parallels and meridians; 'left'/'right' along a→b for
 *                 treaty lines. The FEASIBLE set is always the other side —
 *                 the country that does not own the summit — because that is
 *                 what forces the constrained maximum onto the frontier.
 *   countries     [country holding the summit, country that does not]
 *   biome         'alpine' | 'desert' | 'temperate'
 *   grade         the atlas's confidence grade
 *   photo         PDF image object number (see build-atlas-photos.mjs)
 *   credit        photograph attribution, as stated by the atlas
 *   ofItself      false when the atlas admits the photograph shows the region
 *                 rather than this mountain — carried through to the caption,
 *                 because a picture labelled as something it is not is worse
 *                 than no picture
 */
export const CATALOGUE = [
  {
    id: 'borderpeak', atlasKm: 0.5, name: 'American Border Peak', es: 'Pico Fronterizo Americano',
    lat: 48.99521, lon: -121.66423, metres: 2448, seekKm: 1.2, halfKm: 7,
    boundary: { parallel: 49 }, inside: 's',
    countries: ['United States (Washington)', 'Canada (British Columbia)'],
    countriesEs: ['Estados Unidos (Washington)', 'Canadá (Columbia Británica)'],
    biome: 'peak', grade: 'A+', photo: 90,
    credit: 'Mount Larrabee and Border Peaks panorama, Wikimedia Commons',
    ofItself: true,
    blurb: 'The canonical case. The monumented 49th parallel crosses the ridge joining American Border Peak to Canadian Border Peak, and the American summit stands just south of it — the mountain is cut, the top is not.',
    blurbEs: 'El caso canónico. El paralelo 49 amojonado cruza la arista que une el Pico Fronterizo Americano con el Canadiense, y la cima americana queda justo al sur: la montaña está cortada, la cumbre no.',
  },
  {
    id: 'natazhat', atlasKm: 5.45, name: 'Mount Natazhat', es: 'Monte Natazhat',
    lat: 61.52168, lon: -141.09183, metres: 4095, seekKm: 1.2, halfKm: 12,
    boundary: { meridian: -141 }, inside: 'w',
    countries: ['United States (Alaska)', 'Canada (Yukon)'],
    countriesEs: ['Estados Unidos (Alaska)', 'Canadá (Yukón)'],
    biome: 'alpine', grade: 'A', photo: 98,
    credit: 'Tok Air Service aerial photograph',
    ofItself: true,
    blurb: 'The Alaska–Yukon frontier is the 141st meridian, surveyed across glacier and snow. Natazhat’s 4 095 m summit lies several kilometres west of it, deep in Alaska, while the mountain’s eastern flank is Canadian.',
    blurbEs: 'La frontera Alaska–Yukón es el meridiano 141, levantado sobre glaciar y nieve. La cima de 4 095 m del Natazhat queda varios kilómetros al oeste, en pleno Alaska, mientras su ladera oriental es canadiense.',
  },
  {
    id: 'richards', atlasKm: 1.14, name: 'Mount Richards', es: 'Monte Richards',
    lat: 49.0103, lon: -113.94281, metres: 2377, seekKm: 1.2, halfKm: 7,
    boundary: { parallel: 49 }, inside: 'n',
    countries: ['Canada (Alberta)', 'United States (Montana)'],
    countriesEs: ['Canadá (Alberta)', 'Estados Unidos (Montana)'],
    biome: 'peak', grade: 'A', photo: 115,
    credit: 'Mount Richards with the Prince of Wales Hotel, Wikimedia Commons',
    ofItself: true,
    blurb: 'Waterton Lakes on the north side, Glacier National Park on the south. The summit is just inside Alberta while the mountain’s southern footing reaches Boundary Creek in Montana.',
    blurbEs: 'Waterton Lakes al norte, el Parque Nacional Glacier al sur. La cima queda apenas dentro de Alberta mientras el pie sur de la montaña llega al Boundary Creek, en Montana.',
  },
  {
    id: 'tecate', treaty: 'the 1848 Guadalupe Hidalgo line', treatyEs: 'la línea de Guadalupe Hidalgo de 1848', atlasKm: 0.8, name: 'Tecate Peak (Kuuchamaa)', es: 'Cerro Tecate (Kuuchamaa)',
    lat: 32.57926, lon: -116.68887, metres: 1184, seekKm: 1.2, halfKm: 7,
    boundary: { line: 'GUADALUPE' }, inside: 'left',
    countries: ['United States (California)', 'Mexico (Baja California)'],
    countriesEs: ['Estados Unidos (California)', 'México (Baja California)'],
    biome: 'chaparral', grade: 'A', photo: 122,
    credit: 'Tecate / Kuuchamaa photograph, Wikimedia Commons (CC0)',
    ofItself: true,
    blurb: 'A sacred Kumeyaay mountain above the city of Tecate. The 1848 treaty line runs straight across its southern slopes; the summit stands about half a mile north of it, in California.',
    blurbEs: 'Montaña sagrada kumiai sobre la ciudad de Tecate. La línea del tratado de 1848 cruza recta sus laderas del sur; la cima queda cerca de un kilómetro al norte, en California.',
  },
  {
    id: 'otay', treaty: 'the 1848 Guadalupe Hidalgo line', treatyEs: 'la línea de Guadalupe Hidalgo de 1848', atlasKm: 3.5, name: 'Otay Mountain', es: 'Cerro Otay',
    lat: 32.59444, lon: -116.8446, metres: 1067, seekKm: 1.2, halfKm: 8,
    boundary: { line: 'GUADALUPE' }, inside: 'left',
    countries: ['United States (California)', 'Mexico (Baja California)'],
    countriesEs: ['Estados Unidos (California)', 'México (Baja California)'],
    biome: 'chaparral', grade: 'A-', photo: 143,
    credit: 'Wasquewhat, Otay Mountain Ecological Reserve, Wikimedia Commons (CC BY-SA 4.0)',
    ofItself: true,
    blurb: 'The treaty line runs along the south face, east of San Diego. The 1 067 m summit is in California and the official USGS sheet makes the flank-cut unusually easy to read.',
    blurbEs: 'La línea del tratado recorre la cara sur, al este de San Diego. La cima de 1 067 m está en California, y la hoja oficial del USGS hace el corte de la ladera especialmente fácil de leer.',
  },
  {
    id: 'larrabee', atlasKm: 2.25, name: 'Mount Larrabee', es: 'Monte Larrabee',
    lat: 48.97913, lon: -121.64844, metres: 2397, seekKm: 1.2, halfKm: 8,
    boundary: { parallel: 49 }, inside: 's',
    countries: ['United States (Washington)', 'Canada (British Columbia)'],
    countriesEs: ['Estados Unidos (Washington)', 'Canadá (Columbia Británica)'],
    biome: 'peak', grade: 'A-', photo: 151,
    credit: 'Mount Larrabee and Border Peaks panorama, Wikimedia Commons',
    ofItself: true,
    blurb: 'The best-photographed of the North Cascades border peaks, rising just south-east of American Border Peak. Its north-western mountain body is inseparable from the border ridge system.',
    blurbEs: 'El más fotografiado de los picos fronterizos de las Cascadas del Norte, justo al sureste del Pico Fronterizo Americano. Su cuerpo noroccidental es inseparable del sistema de aristas de la frontera.',
  },
  {
    id: 'ummaddami', treaty: 'a straight Jordan–Saudi treaty sector', treatyEs: 'un sector recto del tratado jordano-saudí', atlasKm: 3.0, name: 'Jabal Umm ad Dami', es: 'Yábal Umm ad Dami',
    lat: 29.17694, lon: 35.455, metres: 1854, seekKm: 1.2, halfKm: 10,
    boundary: { line: 'JORDAN_SAUDI' }, inside: 'left',
    countries: ['Jordan', 'Saudi Arabia'],
    countriesEs: ['Jordania', 'Arabia Saudí'],
    biome: 'desert', grade: 'B', photo: 159,
    credit: 'Jabal Umm ad Dami photograph, travel/geographic source',
    ofItself: true,
    blurb: 'Jordan’s highest mountain, in the sandstone desert south of Wadi Rum. The straight treaty sector passes a few kilometres away; the sandstone belt continues across it into Saudi Arabia.',
    blurbEs: 'La montaña más alta de Jordania, en el desierto de arenisca al sur de Wadi Rum. El sector recto del tratado pasa a pocos kilómetros; el cinturón de arenisca lo cruza hacia Arabia Saudí.',
  },
  {
    id: 'sentinel', atlasKm: 2.1, name: 'Sentinel Mountain', es: 'Monte Sentinel',
    lat: 48.97912, lon: -113.7462, metres: 2513, seekKm: 1.2, halfKm: 7,
    boundary: { parallel: 49 }, inside: 's',
    countries: ['United States (Montana)', 'Canada (Alberta)'],
    countriesEs: ['Estados Unidos (Montana)', 'Canadá (Alberta)'],
    biome: 'peak', grade: 'B', photo: 182,
    credit: 'Sentinel Mountain photograph, Wikimedia Commons',
    ofItself: true,
    blurb: 'The Belly River sector of Glacier National Park. Its northern slopes feed straight into the boundary corridor about two kilometres away.',
    blurbEs: 'El sector del río Belly, en el Parque Nacional Glacier. Sus laderas del norte desembocan directamente en el corredor fronterizo, a unos dos kilómetros.',
  },
  {
    id: 'tomyhoi', atlasKm: 1.6, name: 'Tomyhoi Peak', es: 'Pico Tomyhoi',
    lat: 48.97491, lon: -121.70947, metres: 2267, seekKm: 1.2, halfKm: 8,
    boundary: { parallel: 49 }, inside: 's',
    countries: ['United States (Washington)', 'Canada (British Columbia)'],
    countriesEs: ['Estados Unidos (Washington)', 'Canadá (Columbia Británica)'],
    biome: 'peak', grade: 'B', photo: 190,
    credit: 'North Cascades border-peaks panorama, Wikimedia Commons',
    ofItself: false,
    blurb: 'A long north-running ridge west of the Border Peaks. The 49th parallel cuts the border-peak complex at the ridge’s head; Tomyhoi’s own summit is entirely in Washington.',
    blurbEs: 'Una larga arista orientada al norte al oeste de los Picos Fronterizos. El paralelo 49 corta el complejo fronterizo en la cabecera de la arista; la cima del Tomyhoi está enteramente en Washington.',
  },
  {
    id: 'castlepeak', atlasKm: 1.6, name: 'Castle Peak', es: 'Pico Castle',
    lat: 48.98234, lon: -120.8624, metres: 2543, seekKm: 1.2, halfKm: 8,
    boundary: { parallel: 49 }, inside: 's',
    countries: ['United States (Washington)', 'Canada (British Columbia)'],
    countriesEs: ['Estados Unidos (Washington)', 'Canadá (Columbia Británica)'],
    biome: 'peak', grade: 'B', photo: 198,
    credit: 'North Cascades border-peaks panorama, Wikimedia Commons',
    ofItself: false,
    blurb: 'A prominent Hozameen Range summit about a mile south of Canada. The parallel crosses the northern ridge system while the summit stays in Washington.',
    blurbEs: 'Cumbre prominente de la cordillera Hozameen, a una milla al sur de Canadá. El paralelo cruza el sistema de aristas del norte mientras la cima permanece en Washington.',
  },
  {
    id: 'bikkubitti', treaty: 'a straight Libya–Chad treaty sector', treatyEs: 'un sector recto del tratado libio-chadiano', atlasKm: 9.1, name: 'Bikku Bitti', es: 'Bikku Bitti',
    lat: 21.98347, lon: 19.14499, metres: 2267, seekKm: 1.2, halfKm: 18,
    boundary: { line: 'LIBYA_CHAD' }, inside: 'right',
    countries: ['Libya', 'Chad'],
    countriesEs: ['Libia', 'Chad'],
    biome: 'desert', grade: 'C', photo: 213,
    credit: 'Uweinat / Sahara regional desert-border context image',
    ofItself: false,
    blurb: 'Libya’s highest peak, in the remote Tibesti. The straight treaty segment runs close by; whether it cuts this individual mountain or only the wider Tibesti massif is a question of where you draw the mountain.',
    blurbEs: 'El pico más alto de Libia, en el remoto Tibesti. El segmento recto del tratado pasa cerca; si corta esta montaña concreta o solo el macizo del Tibesti depende de dónde se dibuje la montaña.',
  },
  {
    id: 'kinnerly', atlasKm: 4.8, name: 'Kinnerly Peak', es: 'Pico Kinnerly',
    lat: 48.9566, lon: -114.16604, metres: 3032, seekKm: 1.2, halfKm: 9,
    boundary: { parallel: 49 }, inside: 's',
    countries: ['United States (Montana)', 'Canada (British Columbia)'],
    countriesEs: ['Estados Unidos (Montana)', 'Canadá (Columbia Británica)'],
    biome: 'peak', grade: 'C', photo: 220,
    credit: 'Regional Glacier National Park photograph (Gardner Point)',
    ofItself: false,
    blurb: 'A dramatic Livingston Range horn nearly five kilometres from Canada — the largest summit-to-border distance in the northern Rockies group, at the cost of the mountain merging into its range before the line.',
    blurbEs: 'Un cuerno espectacular de la cordillera Livingston a casi cinco kilómetros de Canadá: la mayor distancia cumbre–frontera del grupo de las Rocosas del norte, a costa de que la montaña se funde con su cordillera antes de la línea.',
  },
];

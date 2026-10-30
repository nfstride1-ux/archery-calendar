TEMPORARY hidden demo: 3D globe popup for the Event details Map link. Not linked, noindex, not in the sitemap or the service worker list.

How it works: tapping Map on the faux Event details card opens an in-page overlay. Only then does the page load lib/globe.gl.min.js
(globe.gl 2.46.2, MIT, bundles three.js) and the textures in img/. Nothing is downloaded before the tap.
Imagery: NASA Blue Marble / Visible Earth day map with clouds baked in, bump and water (specular) maps (img/, from the three-globe examples, public domain) plus Esri World Imagery satellite tiles from server.arcgisonline.com loaded
while zooming. The Esri tiles are a DEMO-ONLY choice: a real site needs a licensed or paid provider (Esri/ArcGIS, Mapbox, MapTiler,
Google Map Tiles API or Cesium ion).
demo-data.json is a snapshot (28 Oct 2026) of real events and their map points from the site's own data files; venue points for the
six card events were looked up on OpenStreetMap (Nominatim) and are noted in the page.
Sizes: lib/globe.gl.min.js 1.9 MB, img/earth-day-clouds-4096.jpg 1.3 MB, img/earth-bump-2048.jpg 72 KB, img/earth-water-1600.jpg 112 KB,
img/stars-2048.jpg 0.1 MB, lib/leaflet.js + .css 0.16 MB, demo-data.json 22 KB.
Flight distance and estimated flight time (great-circle km / 850 km/h + 30 min, direct, no stopovers) show in the bar
during the flight and on arrival (restored 30 Oct 2026 from 129d8e0, with the estimate from the 29 Oct flat-map demo 9b39146).
30 Oct fixes: the arrival close-up is now a flat Leaflet 1.9.4 map (lib/leaflet.js, lib/leaflet.css, loaded lazily during the zoom) with
the same Esri World Imagery tiles, because the globe's high-zoom tiles stayed blurry on iPhone Safari. The globe tile engine stops at
level 14 and the pixel ratio is capped at 2. The event popup sits in the bottom panel, the plane parks on the venue pin and the camera
stays on the venue through the zoom, and the markers now sit exactly on their map points.
30 Oct, later: more realistic globe (4K day map with subtle clouds, bump relief, sea glint, atmosphere, starfield); gold circle markers
(44px tap target); the imagery credit is behind a small 'i' button; the overlay is sized to the visible viewport (visualViewport, dvh,
safe-area insets, viewport-fit=cover) so iPhone Safari's toolbar no longer hides the buttons, and the bottom panel scrolls if too tall.
The plane is now a small archery arrow that points along the flight path and stays stuck point-first in the venue point after landing,
on the globe and on the satellite close-up.
To remove the demo: delete the map-test folder.

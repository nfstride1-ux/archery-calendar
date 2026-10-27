TEMPORARY hidden demo: 3D globe popup for the Event details Map link. Not linked, noindex, not in the sitemap or the service worker list.

How it works: tapping Map on the faux Event details card opens an in-page overlay. Only then does the page load lib/globe.gl.min.js
(globe.gl 2.46.2, MIT, bundles three.js) and the two textures in img/. Nothing is downloaded before the tap.
Imagery: NASA Blue Marble base (img/, public domain) plus Esri World Imagery satellite tiles from server.arcgisonline.com loaded
while zooming. The Esri tiles are a DEMO-ONLY choice: a real site needs a licensed or paid provider (Esri/ArcGIS, Mapbox, MapTiler,
Google Map Tiles API or Cesium ion).
demo-data.json is a snapshot (28 Oct 2026) of real events and their map points from the site's own data files; venue points for the
six card events were looked up on OpenStreetMap (Nominatim) and are noted in the page.
Sizes: lib/globe.gl.min.js 1.9 MB, img/earth-blue-marble-2048.jpg 0.3 MB, img/stars-2048.jpg 0.1 MB, demo-data.json 22 KB.
To remove the demo: delete the map-test folder.

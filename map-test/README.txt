TEMPORARY hidden demo: world map of archery events with a flight from Perth to the chosen event, showing the distance and an estimated flight time (great-circle distance / 850 km/h + 30 min, direct, estimate). Not linked, noindex, not in the sitemap or the service worker list.
Source: /workspace/map-mockup on the build box. Map: Leaflet (lib/, BSD-2) with OpenStreetMap tiles (demo use only) and data/land.geojson. Events load from the site's own data files (/data/*.json).
The earlier 3D globe version is in git history (commit 129d8e0).
To remove the demo: delete the map-test folder.

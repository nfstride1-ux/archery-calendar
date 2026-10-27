TEMPORARY world map mockup for archerycalendars.com. Not deployed, not pushed anywhere.
Open: cd /workspace/map-mockup && python3 -m http.server 8765  then http://localhost:8765/index.html  (#map opens the map page)
data/ holds fallback copies of events.json, intl.json, club_coords.json (the page tries the live site first).
tests/ has the Playwright scripts used for the screenshots in screens/.

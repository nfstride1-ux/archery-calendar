#!/usr/bin/env python3
"""Build data/club_coords.json: coordinates for clubs and event venues, ONLY from real addresses / place names already in
data/clubs.json, data/events.json and data/intl.json. Geocoded with OpenStreetMap Nominatim (1 request per second, identifying
User-Agent), cached in data/.nominatim_cache.json so re-runs only ask for new strings. Anything without a reliable place is
written as null (never guessed). Usage: python3 scripts/build_club_coords.py"""
import json, re, time, sys, os, urllib.request, urllib.parse, collections, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda f: os.path.join(ROOT, 'data', f)
UA = 'ArcheryCalendar-geocoder/1.0 (https://archerycalendars.com; contact nfshold@gmail.com)'
CACHE_F = D('.nominatim_cache.json')
cache = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
last = [0.0]
STATE_NAME = {'WA': 'Western Australia', 'SA': 'South Australia', 'VIC': 'Victoria', 'NSW': 'New South Wales', 'ACT': 'Australian Capital Territory',
              'QLD': 'Queensland', 'TAS': 'Tasmania', 'NT': 'Northern Territory'}
STREET = re.compile(r'\b(\d+[a-z]?\s+\w+|(road|rd|street|st|avenue|ave|drive|dr|lane|ln|way|highway|hwy|parade|pde|court|ct|place|pl|crescent|cres|boulevard|blvd|track|trail|park|oval|reserve|school|college|hall|showground|showgrounds|complex|centre|center|club|range|ground|grounds|field|fields|gym|stadium|arena|lot \d+))\b', re.I)
BAD = re.compile(r'\b(tba|tbc|online|virtual|your own club|own club|various|to be announced|multiple|postal|home range)\b', re.I)

def nominatim(q, cc):
    key = cc + '|' + q
    if key in cache: return cache[key]
    wait = 1.1 - (time.time() - last[0])
    if wait > 0: time.sleep(wait)
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'jsonv2', 'limit': 1, 'addressdetails': 1, 'countrycodes': cc.lower()})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
    for attempt in range(3):
        try:
            last[0] = time.time()
            r = json.load(urllib.request.urlopen(req, timeout=30)); break
        except Exception as e:
            print('  retry', e, file=sys.stderr); time.sleep(5 * (attempt + 1)); r = None
    if r is None: return None   # network failure: do not cache
    res = r[0] if r else None
    out = None
    if res:
        a = res.get('address', {})
        out = {'lat': round(float(res['lat']), 5), 'lng': round(float(res['lon']), 5), 'cls': res.get('category'), 'type': res.get('type'), 'state': a.get('state'), 'cc': (a.get('country_code') or '').upper(), 'name': res.get('display_name', '')[:140]}
    cache[key] = out
    json.dump(cache, open(CACHE_F, 'w'))
    return out

# Venues checked by hand where the geocoder misses or lands on the town or the wrong stretch of road (TAC venues, Oct 2026):
# Circle E Guest Ranch = OSM way 1068182925; Red Lodge Mountain base area = OSM (TAC lists Red Lodge Mountain, 305 Ski Run Rd);
# Sporting Club at the Farm sits on River Rd by the Ohio River (the club's own map listing); Crystal Mountain = US Census match for the street address.
MANUAL = {'Huanglong Sports Centre, Hangzhou, China': {'lat': 30.26836, 'lng': 120.12791, 'p': 'v', 'q': 'Huanglong Sports Center stadium, Hangzhou (OSM)'},
          'Circle E Guest Ranch, 1 Circle E Lane, Belvidere TN 37306': {'lat': 35.09339, 'lng': -86.09888, 'p': 'v', 'q': 'Circle E Guest Ranch, Tennessee'},
          'Red Lodge Mountain, 305 Ski Run Rd, Red Lodge MT 59068': {'lat': 45.19075, 'lng': -109.33687, 'p': 'v', 'q': 'Red Lodge Mountain, 305 Ski Run Rd, Red Lodge MT'},
          'Sporting Club at the Farm, 4939 River Rd, New Albany IN': {'lat': 38.21642, 'lng': -85.86791, 'p': 'v', 'q': 'Sporting Club at the Farm, River Rd, New Albany IN'},
          'Crystal Mountain Resort, 12500 Crystal Mountain Dr, Thompsonville MI': {'lat': 44.51903, 'lng': -85.99044, 'p': 'v', 'q': '12500 Crystal Mountain Dr, Thompsonville MI'},
          # a live (submitted) event, so not in events.json: always written; US Census match for the street address
          '11209 Shaw Rd E, Puyallup WA 98374': {'lat': 47.15441, 'lng': -122.25587, 'p': 'v', 'q': '11209 Shaw Rd E, Puyallup WA'}}

# Venues checked by hand against the venue's own page or the event's official listing, applied to every place string that names them
# (the geocoder put these at a suburb or town centre, or at the wrong town). None = no pin at all.
MANUAL_MATCH = [
    (r'Jules Steiner|International Shooting Complex|Archery Park,? ?WA|Archery Park Whiteman|WA Archery Centre',
     {'lat': -31.80537, 'lng': 115.92349, 'p': 'v', 'q': 'WA Archery Centre, Jules Steiner Memorial Dr, Whiteman WA'}),   # OSM sports_centre, Archery WA address
    (r'Hobart Archers', {'lat': -42.89419, 'lng': 147.49488, 'p': 'v', 'q': '195 Roches Beach Rd, Lauderdale TAS'}),          # hobartarchers.org/location
    (r'Capital Sports (Center|Complex)', {'lat': 38.66153, 'lng': -121.39171, 'p': 'v', 'q': '5209 Luce Ave, McClellan CA'}),  # usarchery.org event 51091
    (r'^Armadale Bowls Club', {'lat': -32.15783, 'lng': 116.00427, 'p': 'v', 'q': 'Armadale Bowling Club, Millman Way, Armadale WA'}),
    (r'^\s*Shot at your own club', None),
    (r'Easton Archery Center of Excellence|Chula Vista (Olympic|Elite Athlete) Training Center',
     {'lat': 32.63035, 'lng': -116.93723, 'p': 'v', 'q': 'Chula Vista Elite Athlete Training Center, 2800 Olympic Pkwy'}),   # OSM, 2800 Olympic Parkway
    (r'Easton Salt Lake Archery Center|Salt Lake Easton Archery Center',
     {'lat': 40.78071, 'lng': -112.03723, 'p': 'v', 'q': 'Easton Salt Lake Archery Center, 575 John Glenn Rd'}),
    (r'Lancaster Archery (Academy|Supply)', {'lat': 40.04121, 'lng': -76.22694, 'p': 'v', 'q': 'Lancaster Archery Supply, 2195 Old Philadelphia Pike'}),
    (r'Ben Avery Shooting Facility', {'lat': 33.81459, 'lng': -112.16097, 'p': 'v', 'q': 'Ben Avery Shooting Facility, Phoenix AZ'}),
    # Oct 30 2026: every remaining event without a point, checked by hand (Vegas Shoot first). Sources: the venue's or club's own page,
    # OSM, the US Census geocoder, or the venue's place listing; 't' = only the road or town is reliable.
    (r'\bHorseshoe\b.*\b(Las Vegas|Planet Hollywood)\b|Las Vegas.*\bHorseshoe\b', {'lat': 36.11348, 'lng': -115.16906, 'p': 'v', 'q': 'Horseshoe Las Vegas, 3645 Las Vegas Blvd S'}),   # The Vegas Shoot FAQ (main venue, Horseshoe)
    (r'11209 Shaw Rd E, Puyallup', {'lat': 47.15441, 'lng': -122.25587, 'p': 'v', 'q': '11209 Shaw Rd E, Puyallup WA'}),   # US Census address match
    (r'47491 Road 210', {'lat': 37.06124, 'lng': -119.68235, 'p': 'v', 'q': '47491 Road 210, Friant CA'}),   # US Census address match
    (r'9317 Swasey Dr', {'lat': 40.56016, 'lng': -122.47399, 'p': 'v', 'q': '9317 Swasey Dr, Redding CA'}),   # US Census address match
    (r'NFAA Easton Yankton', {'lat': 42.87638, 'lng': -97.36668, 'p': 'v', 'q': 'NFAA Easton Yankton Archery Center, 800 Archery Ln'}),   # OSM
    (r'Evolution Archery Range', {'lat': 35.21895, 'lng': -85.21538, 'p': 'v', 'q': '8408 Gulf View Dr, Soddy-Daisy TN'}),   # US Census
    (r'Red Dawn Armory', {'lat': 38.32304, 'lng': -87.56711, 'p': 'v', 'q': '2178 N Old Hwy 41 S, Princeton IN'}),   # US Census
    (r'Anderson Archery, 1324 Alton Station', {'lat': 38.07736, 'lng': -84.9515, 'p': 'v', 'q': '1324 Alton Station Rd, Lawrenceburg KY'}),   # US Census
    (r'Next Step Archery', {'lat': 47.79627, 'lng': -122.32708, 'p': 'v', 'q': '22313 70th Ave W, Mountlake Terrace WA'}),   # US Census
    (r'Sandhills Archery Club, 3001', {'lat': 46.88177, 'lng': -96.95497, 'p': 'v', 'q': '3001 Charyl Ave NW, West Fargo ND'}),   # US Census
    (r'Archery HQ, 5277', {'lat': 29.61831, 'lng': -98.12436, 'p': 'v', 'q': '5277 FM 1044, New Braunfels TX'}),   # US Census
    (r'Trident Archery', {'lat': 33.83931, 'lng': -118.25598, 'p': 'v', 'q': '1050 E Dominguez St, Carson CA'}),   # US Census
    (r'HotShots Archery Academy', {'lat': 39.69177, 'lng': -84.03777, 'p': 'v', 'q': '2750 Indian Ripple Rd, Dayton OH'}),   # US Census
    (r'Hit or Miss Archery', {'lat': 35.11278, 'lng': -106.62929, 'p': 'v', 'q': '2801 Broadbent Pkwy NE, Albuquerque NM'}),   # US Census
    (r'95 Gibson Flats', {'lat': 47.47245, 'lng': -111.24265, 'p': 'v', 'q': '95 Gibson Flats Rd, Great Falls MT'}),   # US Census
    (r'Texas Archery, 10265', {'lat': 30.65219, 'lng': -96.26909, 'p': 'v', 'q': '10265 State Hwy 30, College Station TX'}),   # US Census
    (r'Spooky Nook', {'lat': 40.106, 'lng': -76.41893, 'p': 'v', 'q': 'Spooky Nook Sports, 75 Champ Blvd, Manheim PA'}),   # OSM
    (r'Crossville Shooting Sports Park', {'lat': 35.96485, 'lng': -84.96383, 'p': 'v', 'q': 'Crossville Shooting Sports Park, TN'}),   # OSM
    (r'Otter Creek Outdoor Recreation', {'lat': 37.94546, 'lng': -86.04676, 'p': 'v', 'q': 'Otter Creek Outdoor Recreation Area, KY'}),   # OSM
    (r'Chieftain Center', {'lat': 39.51465, 'lng': -82.37351, 'p': 'v', 'q': 'The Chieftain Center, Logan OH'}),   # OSM
    (r'Two Mile Run County Park', {'lat': 41.48217, 'lng': -79.76826, 'p': 'v', 'q': 'Two Mile Run County Park, PA'}),   # OSM
    (r'Canaan Valley Resort', {'lat': 39.02438, 'lng': -79.4649, 'p': 'v', 'q': 'Canaan Valley Resort, WV'}),   # OSM
    (r'Carson (Field|Stadium)', {'lat': 33.86424, 'lng': -118.26108, 'p': 'v', 'q': 'Dignity Health Sports Park, Carson CA'}),   # OSM
    (r'Clarke Community Middle and High School', {'lat': 41.04399, 'lng': -93.77189, 'p': 'v', 'q': 'Clarke Community Schools, Osceola IA'}),   # OSM
    (r'Graham Creek Interpretive', {'lat': 30.34789, 'lng': -87.63267, 'p': 'v', 'q': 'Graham Creek Nature Preserve, Foley AL'}),   # OSM
    (r'Camp Minden', {'lat': 32.57897, 'lng': -93.39853, 'p': 'v', 'q': 'Camp Minden, LA'}),   # OSM
    (r'GSU Shooting Sports', {'lat': 32.41547, 'lng': -81.79658, 'p': 'v', 'q': 'GSU Shooting Sports Education Center, Statesboro GA'}),   # OSM
    (r'^Cortland, New York', {'lat': 42.60118, 'lng': -76.18048, 'p': 't', 'q': 'Cortland, New York'}),   # town only, no venue in the listing
    (r'Uchee Creek Campground', {'lat': 32.30509, 'lng': -84.95821, 'p': 'v', 'q': 'Uchee Creek Campground, 7 Uchee Creek Rd, Fort Mitchell AL'}),   # Fort Benning MWR address, place listing
    (r'Capital Region Archery Club', {'lat': 53.51285, 'lng': -113.42301, 'p': 'v', 'q': 'Capital Region Archery Club, 5618 76 Ave NW, Edmonton AB'}),   # crarchery.ca contact page, place listing
    (r'Adair Shooting Park', {'lat': 32.75014, 'lng': -114.43852, 'p': 't', 'q': 'Adair Park Rd, Yuma County AZ'}),   # access road only
    (r'SAT Football Stadium, Bangkok', {'lat': 13.75543, 'lng': 100.62216, 'p': 'v', 'q': 'SAT Stadium, Hua Mak, Bangkok'}),   # OSM
    (r'Dubai Club for People of Determination', {'lat': 25.27772, 'lng': 55.36294, 'p': 'v', 'q': 'Dubai Club for People of Determination'}),   # OSM
    (r'Khorfakkan Club', {'lat': 25.3221, 'lng': 56.3294, 'p': 'v', 'q': 'Khorfakkan Club, Sharjah'}),   # OSM
    (r'Tottori Prefectural Gymnasium', {'lat': 35.5002, 'lng': 134.17717, 'p': 'v', 'q': 'Tottori Prefectural Gymnasium'}),   # OSM
    (r'Samsun İlkadım', {'lat': 41.32012, 'lng': 36.33339, 'p': 'v', 'q': 'Samsun archery range'}),   # OSM
    (r'Yucatán Siglo XXI', {'lat': 21.03383, 'lng': -89.62959, 'p': 'v', 'q': 'Centro de Convenciones Siglo XXI, Mérida'}),   # OSM
    (r'Le Parnasse.*N[iî]mes', {'lat': 43.81672, 'lng': 4.36368, 'p': 'v', 'q': 'Le Parnasse, Nîmes'}),   # OSM
    (r'Rannahof', {'lat': 48.51526, 'lng': 14.56921, 'p': 'v', 'q': 'Rannahof, Etzelsdorf 7'}),   # OSM
    (r'^Preims 10', {'lat': 46.89871, 'lng': 14.76292, 'p': 'v', 'q': 'Preims 10, 9412'}),   # OSM
    (r'Bellinge Idrætscenter', {'lat': 55.34156, 'lng': 10.31954, 'p': 'v', 'q': 'Bellinge Idrætscenter, Odense'}),   # OSM
    (r'Dunedin Archery Club', {'lat': -45.84446, 'lng': 170.53605, 'p': 'v', 'q': '10 Afton Terrace, Dunedin'}),   # OSM
    (r'Graham Park.*Tauranga|Tauranga Archers - Graham Park', {'lat': -37.69588, 'lng': 176.15755, 'p': 'v', 'q': 'Graham Park, 79 Edgecumbe Rd, Tauranga'}),   # OSM
    (r'Massey Archery Club|Annett Road Kumeu', {'lat': -36.79883, 'lng': 174.50709, 'p': 't', 'q': 'Annett Rd, Kumeu (club at no. 167)'}),   # road only; masseyarchery.org.nz contact page
    (r'^Evesham Archery Club', {'lat': 52.08867, 'lng': -1.88855, 'p': 'v', 'q': 'Evesham Archery Club'}),   # OSM
    (r'^Meriden Archery Club', {'lat': 52.43991, 'lng': -1.65622, 'p': 'v', 'q': 'Meriden Archery Club'}),   # OSM
    (r'^York Archery Society', {'lat': 53.98639, 'lng': -1.03385, 'p': 'v', 'q': 'Hopgrove Playing Fields, 440 Malton Rd, York'}),   # yorkarchers.co.uk session-times page
    (r'Thurbon R(oa)?d|^Canberra Archery Club', {'lat': -35.24572, 'lng': 149.12895, 'p': 'v', 'q': 'Canberra Archery Club, 41 Thurbon Rd, Lyneham ACT'}),   # club address, place listing
    (r'^Tuggeranong', {'lat': -35.42274, 'lng': 149.06057, 'p': 'v', 'q': 'Tuggeranong Archery Club, 299 Soward Way, Greenway ACT'}),   # club address
    (r'^Weston Valley Archery Club', {'lat': -35.33077, 'lng': 149.05257, 'p': 'v', 'q': 'Weston Valley Archery Club, Weston Creek ACT'}),   # OSM
    (r'^Paringa', {'lat': -41.43918, 'lng': 147.09562, 'p': 'v', 'q': 'Paringa Archers, 201 Reatta Rd, Trevallyn TAS'}),   # paringaarchers.org.au newsletters: outdoor and indoor ranges both at Trevallyn Reserve
    (r'Arrows Plus', {'lat': -37.874, 'lng': 144.73897, 'p': 'v', 'q': 'Arrows Plus, 17 Wallace Ave, Point Cook VIC'}),   # arrowsplus.net contact page
    (r'^Werribee Archers', {'lat': -37.85173, 'lng': 144.76344, 'p': 'v', 'q': 'Werribee Archery, Lawrie Emmins Reserve, Laverton North VIC'}),   # place listing
    (r'^Westlakes Archers', {'lat': -32.98316, 'lng': 151.58125, 'p': 'v', 'q': 'Fassifern Oval, Fassifern NSW'}),   # OSM pitch, club directory
    (r'^Shirewood Forest Archers', {'lat': -34.0329, 'lng': 150.99496, 'p': 'v', 'q': 'The Ridge, 40 Recreation Dr, Barden Ridge NSW'}),   # place listing
    (r'^Loxley Archers', {'lat': -41.08322, 'lng': 145.91221, 'p': 'v', 'q': 'Havenview Primary School, Marriott St, Burnie TAS'}),   # place listing
    (r'^Van Diemen Archers', {'lat': -42.94371, 'lng': 147.31326, 'p': 'v', 'q': 'The Lea Scout Centre, Gilwell Dr, Kingston TAS'}),   # OSM building
    (r'^Central Coast Indoor Archery Club', {'lat': -33.41384, 'lng': 151.34125, 'p': 'v', 'q': 'Gosford Showground, NSW'}),   # OSM
    (r'^Dracut, Massachusetts, Kestrel Archery', {'lat': 42.66451, 'lng': -71.32384, 'p': 'v', 'q': 'Kestrel Archery, 80 Pleasant St, Dracut MA'}),   # kestrelarchery.org address, place listing
    (r'^Pioneer Sportsmen Inc', {'lat': 43.15387, 'lng': -71.62238, 'p': 'v', 'q': 'Pioneer Sportsmen, 1046 Clinton St, Dunbarton NH'}),   # club driving-directions page GPS (Farrington Rd parking lot)
    (r'^Mt Tiger Archers$', {'lat': -35.66183, 'lng': 174.42822, 'p': 'v', 'q': 'Mt Tiger Archers outdoor range, 248 Ngunguru Ford Rd, Whangarei'}),   # club outdoor page, place listing
    (r'^Franklin County Archers$', {'lat': -37.16907, 'lng': 174.991, 'p': 'v', 'q': 'Franklin County Archers outdoor range, Stone Rd, Bombay'}),   # club ranges page (field courses at Bombay), place listing
    (r'^Whitford Forest Archers$', {'lat': -36.91419, 'lng': 175.00629, 'p': 'v', 'q': 'Whitford Forrest Archers, 593 Whitford-Maraetai Rd, Whitford'}),   # club safety rules page address, playsport listing coords
    (r'^Vordingborg Bueskyttelaug', {'lat': 55.04807, 'lng': 11.91415, 'p': 'v', 'q': 'Vordingborg Bueskyttelaug, Mosegaardsvej 20, Vordingborg'}),   # club page address, OSM house number
    (r'^ASK. BSV Zurndorf', {'lat': 47.96937, 'lng': 17.01259, 'p': 'v', 'q': 'Bogensportplatz Zurndorf, Untere Hauptstrasse'}),   # place listing, next to Untere Hauptstrasse (OSM)
    (r'^Carraig Woods, Banbridge', {'lat': 54.36774, 'lng': -6.18865, 'p': 't', 'q': 'Carraig Woods, Kilmacrew Rd, Banbridge BT32 3TB'}),   # HL Tournament Diary address; postcode centroid
    (r'^Ballands Bowmen$', {'lat': 51.08413, 'lng': -2.3435, 'p': 't', 'q': 'Ballands Bowmen, Pear Ash Farm, Pen Selwood BA9 8LX'}),   # club location page; postcode centroid
    (r'^Georgia Southern University MC Anderson Park', {'lat': 32.4174, 'lng': -81.79225, 'p': 't', 'q': 'M.C. Anderson Park, 2687 Bunny Akins Blvd, Statesboro GA'}),   # GSU parks page address (Recreation Activity Center, park beside it)
    (r'^Andeok-myeon Stadium', {'lat': 33.25739, 'lng': 126.33114, 'p': 't', 'q': 'Andeok-myeon Stadium, 59 Hwasunseoseo-ro, Andeok-myeon, Seogwipo'}),   # facility register address; place listing beside the stadium
    (r'^Sulaymaniyah Sport club', {'lat': 35.5498, 'lng': 45.4289, 'p': 't', 'q': 'Sulaymaniyah Stadium (Sulaymaniyah SC home ground)'}),   # Wikipedia coords of the club's stadium; archery field not published
    (r'Easton Newberry Archery Center', {'lat': 29.64635, 'lng': -82.6065, 'p': 't', 'q': 'Newberry, Florida'}),   # street address not in OSM; town only, never Gainesville
    # Oct 31 2026 event scan (batch A): venue checked by hand for every new event; source after the point in q. 't' = the official listing gives only the town.
    ('Parc des Sports de Treichville', {'lat': 5.29807, 'lng': -4.00545, 'p': 'v', 'q': 'Palais des Sports de Treichville, Abidjan (OSM)'}),
    ('Polideportivo Ciudad Merliot', {'lat': 13.69004, 'lng': -89.27005, 'p': 'v', 'q': 'Polideportivo de Ciudad Merliot (OSM)'}),
    ('Antalya Archery Centre', {'lat': 36.88901, 'lng': 30.67057, 'p': 'v', 'q': 'Antalya 100. Yıl Okçuluk Tesisleri, Sakıp Sabancı Blv (Wikipedia/OSM)'}),
    ('^Nové Město nad Metují$', {'lat': 50.34421, 'lng': 16.1513, 'p': 't', 'q': 'Nové Město nad Metují (town, WA gives only the town)'}),
    ('^Dubai$', {'lat': 25.26472, 'lng': 55.29242, 'p': 't', 'q': 'Dubai (city, WA gives only the city)'}),
    ('^Ahmedabad$', {'lat': 23.02154, 'lng': 72.58006, 'p': 't', 'q': 'Ahmedabad (city, WA gives only the city)'}),
    ('^Lima$', {'lat': -12.04598, 'lng': -77.03059, 'p': 't', 'q': 'Lima (city, WA gives only the city)'}),
    ('LSC Sports Complex \\"Druskininkai\\"', {'lat': 54.00112, 'lng': 23.99987, 'p': 'v', 'q': 'M.K. Čiurlionio g. 115A, Druskininkai (OSM building)'}),
    ('NAEC Stoneleigh', {'lat': 52.34209, 'lng': -1.52883, 'p': 'v', 'q': 'Stoneleigh Park, Warwickshire (OSM)'}),
    ('Sport Wales National Centre, Sophia Close', {'lat': 51.48604, 'lng': -3.19044, 'p': 'v', 'q': 'Sport Wales National Centre, Sophia Close (OSM)'}),
    ('^Bogfimisetrið, Dugguvogur 42', {'lat': 64.13201, 'lng': -21.84924, 'p': 'v', 'q': 'Bogfimisetrið, Dugguvogur 42 (OSM)'}),
    ('^Shillong, Meghalaya$', {'lat': 25.57599, 'lng': 91.88279, 'p': 't', 'q': 'Shillong (city, WA gives only the city)'}),
    ('^Maulana Azad Stadium, Jammu$', {'lat': 32.72295, 'lng': 74.85383, 'p': 'v', 'q': 'Maulana Azad Stadium, Jammu (OSM)'}),
    ('Maaspoort, Marathonloop 1', {'lat': 51.72225, 'lng': 5.3157, 'p': 'v', 'q': 'Maaspoort, Marathonloop 1 (OSM; KHSN event page)'}),
    ('^Leiraveien 2, 2000 Lillestrøm$', {'lat': 59.969, 'lng': 11.07485, 'p': 'v', 'q': 'Leiraveien 2, Lillestrøm (OSM; NBF event 2027024)'}),
    ('^SBB Arena, Snoddasgatan 12, Bollnäs$', {'lat': 61.3541, 'lng': 16.39495, 'p': 'v', 'q': 'SBB Arena sports hall, Bollnäs (OSM)'}),
    ('^Sion$', {'lat': 46.23118, 'lng': 7.35888, 'p': 't', 'q': 'Sion (town, WA gives only the town)'}),
    ('^Macolin \\(Magglingen\\)$', {'lat': 47.14025, 'lng': 7.21588, 'p': 't', 'q': 'Magglingen/Macolin (village, WA gives only the place)'}),
    ('^Holstebro$', {'lat': 56.35903, 'lng': 8.61592, 'p': 't', 'q': 'Holstebro (town, WA gives only the town)'}),
    ('Hall Marcel Balthasar', {'lat': 49.62219, 'lng': 6.08447, 'p': 'v', 'q': 'Hall Marcel Balthasar, 299 Rue de Reckenthal, Strassen (strassen.lu; OSM)'}),
    ('Two Rivers Archery Club', {'lat': 38.93471, 'lng': -78.13325, 'p': 'v', 'q': 'Two Rivers Archery Club, 83 Dismal Hollow Rd, Front Royal VA (place listing)'}),
    ('Owen County High School', {'lat': 38.52964, 'lng': -84.80868, 'p': 'v', 'q': 'Owen County High School, 2340 Hwy 22 E, Owenton KY (NCES)'}),
    ('H&H Shooting Sports', {'lat': 35.46185, 'lng': -97.59694, 'p': 'v', 'q': 'H&H Shooting Sports, 400 S Vermont Ave, Oklahoma City (OSM)'}),
    ('Arizona Archery Club, 1115 W Deer Valley', {'lat': 33.68329, 'lng': -112.08741, 'p': 'v', 'q': 'Arizona Archery Club, 1115 W Deer Valley Rd, Phoenix (OSM)'}),
]
MANUAL_CLUBS = {'hobart-archers': {'lat': -42.89419, 'lng': 147.49488, 'p': 'v', 'q': '195 Roches Beach Rd, Lauderdale TAS'},
                'whiteman-park-archers': {'lat': -31.80537, 'lng': 115.92349, 'p': 'v', 'q': 'WA Archery Centre, Jules Steiner Memorial Dr, Whiteman WA'},
                # Oct 30 2026: clubs whose events name only the club; range addresses from the club's own page or its place listing
                'canberra-archery-club': {'lat': -35.24572, 'lng': 149.12895, 'p': 'v', 'q': '41 Thurbon Rd, Lyneham ACT'},
                'tuggeranong-archery-club': {'lat': -35.42274, 'lng': 149.06057, 'p': 'v', 'q': '299 Soward Way, Greenway ACT'},
                'capital-field-archers': {'lat': -35.56747, 'lng': 149.07937, 'p': 'v', 'q': 'Capital Field Archers, Tharwa ACT'},
                'gold-coast-archery-club': {'lat': -28.14059, 'lng': 153.40171, 'p': 'v', 'q': 'Gold Coast Archery Club'},
                'pacific-bowmen': {'lat': -28.09665, 'lng': 153.39357, 'p': 'v', 'q': 'Pacific Bowmen'},
                'moorabbin-archery-club': {'lat': -37.95027, 'lng': 145.05646, 'p': 'v', 'q': 'Moorabbin Archery Club'},
                'sherbrooke-archers': {'lat': -37.9053, 'lng': 145.30783, 'p': 'v', 'q': 'Sherbrooke Archers'},
                'lilydale-bowmen': {'lat': -37.84623, 'lng': 145.3297, 'p': 'v', 'q': 'Lilydale Bowmen'},
                'paringa-archers': {'lat': -41.43918, 'lng': 147.09562, 'p': 'v', 'q': '201 Reatta Rd, Trevallyn TAS'},
                'twin-city-archers-gippsland': {'lat': -38.22576, 'lng': 146.38481, 'p': 'v', 'q': 'Twin City Archers Gippsland'},
                'victor-harbor-archery-club': {'lat': -35.52953, 'lng': 138.55654, 'p': 'v', 'q': 'Victor Harbor Archery Club'},
                'mackay-district-bowmen': {'lat': -20.90393, 'lng': 148.96365, 'p': 'v', 'q': 'Mackay & District Bowmen'},
                'townsville-district-bowhunters': {'lat': -19.33439, 'lng': 146.70495, 'p': 'v', 'q': 'Townsville District Bowhunters'},
                'freds-pass-field-archers': {'lat': -12.53901, 'lng': 131.04724, 'p': 'v', 'q': '20 Bees Creek Rd, Freds Pass NT'},
                'dead-centre-bowhunters': {'lat': -23.77008, 'lng': 133.79303, 'p': 'v', 'q': 'Alice Springs shooting complex, Ilparpa Rd NT'},
                'werribee-archery': {'lat': -37.85173, 'lng': 144.76344, 'p': 'v', 'q': 'Lawrie Emmins Reserve, Laverton North VIC'},
                'phoenix-field-archers-of-sale': {'lat': -38.18089, 'lng': 147.06606, 'p': 'v', 'q': 'Phoenix Field Archers, Longford VIC'},
                'west-gippsland-field-archers': {'lat': -38.16793, 'lng': 145.93798, 'p': 'v', 'q': 'Galloway St, Warragul VIC'},
                'wide-bay-archers': {'lat': -25.40577, 'lng': 152.75785, 'p': 'v', 'q': 'Hervey Bay Rd, Susan River QLD'},
                'macalister-trophy-bowhunters': {'lat': -37.88914, 'lng': 146.88838, 'p': 'v', 'q': '107 Commonyard Rd, Newry VIC'},
                'bairnsdale-field-archers': {'lat': -37.77151, 'lng': 147.68898, 'p': 'v', 'q': '685 Great Alpine Rd, Sarsfield VIC'},
                'geelong-archers': {'lat': -38.07287, 'lng': 144.32201, 'p': 'v', 'q': '100 Asher Rd, Lovely Banks VIC'},
                'sunshine-coast-archery-club': {'lat': -26.70307, 'lng': 153.06604, 'p': 'v', 'q': '176 Ballinger Rd, Buderim QLD'},
                'hervey-bay-archers': {'lat': -25.35322, 'lng': 152.80679, 'p': 'v', 'q': 'Old Rifle Range Rd, Sunshine Acres QLD'},
                'ddfa': {'lat': -27.50105, 'lng': 151.92426, 'p': 'v', 'q': '69 Willims Rd, Cranley QLD'},
                'moranbah-bowhunters-and-field-archers': {'lat': -21.99714, 'lng': 148.02124, 'p': 'v', 'q': 'Sarchedon Dr, Moranbah QLD'},
                'boola-valley-field-archers': {'lat': -38.22513, 'lng': 146.38564, 'p': 'v', 'q': 'Toners Lane Archery Park, Morwell VIC'},
                'full-draw-field-archers': {'lat': -23.29439, 'lng': 150.54195, 'p': 'v', 'q': '399 Yeppoon Rd, Limestone Creek QLD'},
                'wa-field-and-bowhunters-club': {'lat': -31.80498, 'lng': 115.92605, 'p': 'v', 'q': 'Whiteman Park International Shooting Complex WA'},
                'mallee-sunset-field-archers': {'lat': -34.33591, 'lng': 142.13713, 'p': 'v', 'q': 'Red Cliffs-Meringur Rd, Red Cliffs VIC'},
                'bendigo-field-archers': {'lat': -36.74714, 'lng': 144.35264, 'p': 'v', 'q': 'Tresize Track, Wellsford VIC'},
                'grange-bowmen': {'lat': -27.35196, 'lng': 152.98478, 'p': 'v', 'q': '534 Albany Creek Rd, Bridgeman Downs QLD'},
                'bacchus-marsh-bowmen': {'lat': -37.52441, 'lng': 144.56125, 'p': 'v', 'q': '28 Bullard Rd, Gisborne VIC'},
                'van-diemen-archers': {'lat': -42.94371, 'lng': 147.31326, 'p': 'v', 'q': 'The Lea Scout Centre, Gilwell Dr, Kingston TAS'},
                'towers-bowhunters': {'lat': -20.03414, 'lng': 146.28938, 'p': 'v', 'q': '52 Archer Rd, Dunmovin QLD'},
                'saxon-archery-club': {'lat': -24.78987, 'lng': 152.19877, 'p': 'v', 'q': '260 Quinns Rd, Moorland QLD'},
                'orange-district-archers': {'lat': -33.21761, 'lng': 149.20304, 'p': 'v', 'q': '773 Lower Lewis Ponds Rd, Clifton Grove NSW'},
                'snowy-bowmen-field-archers': {'lat': -36.07407, 'lng': 148.86673, 'p': 'v', 'q': 'Snowy Mountains Hwy, Cooma NSW'},
                'colac-otway-archers': {'lat': -38.4089, 'lng': 143.69701, 'p': 'v', 'q': 'Colac Otway archery range, Yeodene VIC'},
                'warwick-and-district-archers': {'lat': -28.26047, 'lng': 151.95272, 'p': 'v', 'q': '212 Ford Rd, Rosenthal Heights QLD'},
                'greenough-field-archery': {'lat': -28.96461, 'lng': 114.73474, 'p': 'v', 'q': 'Hampton Ranges, Company Rd, Greenough WA'},
                'hinchinbrook': {'lat': -18.67191, 'lng': 146.14351, 'p': 'v', 'q': 'Market St, Ingham QLD'},
                'lakeside-bowmen': {'lat': -27.23839, 'lng': 152.94495, 'p': 'v', 'q': '188 Scout Rd, Kurwongbah QLD'},
                'wagga-wagga-field-archers': {'lat': -35.15476, 'lng': 147.56626, 'p': 'v', 'q': '327 Wokolena Rd, Alfredtown NSW'},
                'silver-city-archers': {'lat': -31.91963, 'lng': 141.4714, 'p': 't', 'q': 'Willyama Common, Broken Hill NSW'},
                'full-boar-archers': {'lat': -19.35409, 'lng': 146.49683, 'p': 'v', 'q': '8 Rifle Range Rd, Hervey Range QLD'},
                'western-plains-archers': {'lat': -32.0902, 'lng': 116.08689, 'p': 'v', 'q': 'Heath Rd (north end), Roleystone WA'},
                'collinsville-barebow-hunters': {'lat': -20.49036, 'lng': 147.84702, 'p': 'v', 'q': 'State Route 77, Collinsville QLD'},
                'yorke-peninsula-field-archers': {'lat': -33.96809, 'lng': 137.7049, 'p': 'v', 'q': 'South Tce, Kadina SA'},
                'murray-mallee-field-archers': {'lat': -34.87158, 'lng': 139.27943, 'p': 'v', 'q': 'Long Gully Rd, Mannum SA'},
                'swan-hill-archers': {'lat': -35.1709, 'lng': 143.35875, 'p': 'v', 'q': 'Nyah West Golf Club, 202 Yarraby Rd, Nyah VIC'},
                'baldivis-archery-club': {'lat': -32.27323, 'lng': 115.75924, 'p': 't', 'q': '1521 Ennis Ave, East Rockingham WA (road)'},
                'granite-belt-bowmen': {'lat': -28.68053, 'lng': 151.94251, 'p': 't', 'q': 'Speranza Ln, Stanthorpe QLD (road)'},
                'southern-yorke-archers': {'lat': -34.72095, 'lng': 137.58578, 'p': 't', 'q': 'Southern Yorke Archers, Minlaton SA'},
                'gloucester-district-archers': {'lat': -31.8975, 'lng': 151.87915, 'p': 't', 'q': 'Rookhurst NSW (locality)'},
                'central-coast-moonterra-archers': {'lat': -33.19739, 'lng': 151.42566, 'p': 't', 'q': 'Woods Rd, Jilliby NSW (road)'},
                # 30 Oct 2026, second pass: ABA host clubs whose events name only the club (range directions from club / directory pages)
                'lithgow-valley-archers': {'lat': -33.49625, 'lng': 150.17956, 'p': 't', 'q': 'Doctors Gap, Hartley Valley Rd, Hartley NSW (place listing)'},
                'manning-district-bowhunters': {'lat': -32.03788, 'lng': 152.42569, 'p': 't', 'q': "Joe's Cutting Rd, Possum Brush NSW (playsport listing)"},
                'hunter-bowmen': {'lat': -32.59386, 'lng': 151.37663, 'p': 't', 'q': '465 Cranky Corner Rd South, Elderslie NSW (road)'},
                'border-bowmen': {'lat': -36.28179, 'lng': 140.78448, 'p': 't', 'q': 'off Winter Rd, Bordertown SA (road)'},
                'macleay-valley-archers': {'lat': -30.93113, 'lng': 152.84192, 'p': 't', 'q': 'Brentons Rd, Tamban State Forest, Collombatti NSW (road)'},
                'south-west-slopes-sporting-field-archers': {'lat': -35.29587, 'lng': 148.22327, 'p': 't', 'q': 'Kurrajong Reserve, Wee Jasper Rd, Tumut NSW (road)'},
                'geelong-trophy-bowhunters': {'lat': -38.32955, 'lng': 144.03765, 'p': 't', 'q': '440 Wensleydale Station Rd, Wensleydale VIC (road)'},
                'emerald-archery-club': {'lat': -23.6602, 'lng': 148.07507, 'p': 't', 'q': 'Fairbairn Dam Rd, Gindie QLD (road)'},
                'roma-and-district-bowmen': {'lat': -26.41757, 'lng': 148.84887, 'p': 't', 'q': 'Carnarvon Hwy, Euthulla QLD (locality)'},
                'campbelltown-district-field-archers': {'lat': -34.14204, 'lng': 150.6633, 'p': 't', 'q': 'Mount Hercules Rd, Razorback NSW (road)'},
                'mt-clay-archers': {'lat': -38.17169, 'lng': 141.69755, 'p': 't', 'q': 'Mount Clay Rd, Heywood VIC (road)'},
}
def apply_manual(places, clubs):
    for loc in list(places):
        for rx, v in MANUAL_MATCH:
            if re.search(rx, loc, re.I): places[loc] = dict(v) if v else None; break
    for k, v in MANUAL_CLUBS.items():
        if k in clubs: clubs[k] = dict(v)

VENUE_TYPES = {'amenity', 'leisure', 'building', 'highway', 'shop', 'tourism', 'office', 'sport', 'club', 'man_made', 'landuse', 'railway'}
def precision(r, lvl=0):
    """'v' = a specific venue / street, 't' = only a suburb, town or city."""
    if lvl >= 1.5: return 't'
    if r['cls'] in ('place', 'boundary') and r['type'] not in ('house', 'building', 'farm', 'isolated_dwelling'):
        return 't'
    return 'v'

def clean_parts(loc, names, state):
    s = re.sub(r'\([^)]*\)', ' ', loc)
    parts = [p.strip() for p in re.split(r',| – | - ', s) if p.strip()]
    keep = []; named = False
    for p in parts:
        pl = p.lower()
        if any(n and (pl == n or pl.startswith(n) or n in pl) for n in names): named = True; continue   # the club's own name is not an address
        keep.append(p)
    clean_parts.named = named
    return keep

def strip_state(p, state):
    p = re.sub(r'\b(%s)\b' % '|'.join(list(STATE_NAME) + ['Australia']), '', p).strip(' ,')
    return p
def only_generic(p, state):
    q = strip_state(p, state)
    q = re.sub(r'\b\d{4}\b', '', q).strip(' ,')
    return not q or q.lower() in {n.lower() for n in STATE_NAME.values()} or q.lower() in ('north queensland', 'south australia', 'tasmania')

BIG_CITIES = {'melbourne', 'sydney', 'brisbane'}

def au_candidates(locs, names, state, trusted=()):
    """Query ladder from most to least specific; each is (query, level). Lone state/club-name-only strings give no candidates."""
    cands = []
    for loc in locs:
        if BAD.search(loc): continue
        rest = clean_parts(loc, names, state)
        rest = [r for r in rest if not only_generic(r, state)]
        if not rest: continue
        full = ', '.join(rest)
        has_street = bool(re.search(r'\d', full)) or bool(re.search(r'\b(road|rd|street|st|avenue|ave|drive|dr|lane|way|highway|parade|court|place|crescent|track)\b', full, re.I))
        # a bare town in an event's location (e.g. just "Brisbane") says where that event was, not where the club is: only trusted for the club's own address / suburb fields
        if names and not clean_parts.named and not has_street and loc not in trusted: continue
        lvl = 0 if has_street else (1 if STREET.search(full) else 2)
        cands.append((full + ', ' + STATE_NAME.get(state, '') + ', Australia', lvl))
        # town-only fallback: last part with the state stripped
        t = re.sub(r'\b\d{4}\b', '', strip_state(rest[-1], state)).strip(' ,')
        if t and not re.search(r'\d', t): cands.append((t + ', ' + STATE_NAME.get(state, '') + ', Australia', 1.5 if has_street else 2))
    # a huge metro's centre is no use for placing one club (the real suburb could be 30 km away), unless the string was trusted
    cands = [c for c in cands if not (c[1] >= 1.5 and c[0].split(',')[0].strip().lower() in BIG_CITIES and not any(t.lower().startswith(c[0].split(',')[0].strip().lower()) for t in trusted))]
    cands.sort(key=lambda c: c[1])
    seen = set(); out = []
    for c in cands:
        if c[0] not in seen: seen.add(c[0]); out.append(c)
    return out

def geocode_au(locs, names, state, trusted=()):
    for q, lvl in au_candidates(locs, names, state, trusted):
        r = nominatim(q, 'AU')
        if not r or r['cc'] != 'AU': continue
        if state and r['state'] != STATE_NAME.get(state): continue
        return {'lat': r['lat'], 'lng': r['lng'], 'p': precision(r, lvl), 'q': q.replace(', Australia', '')}
    return None

def geocode_intl(loc, iso2, us_state):
    if not loc or BAD.search(loc) or len(loc) < 4: return None
    s = re.sub(r'\([^)]*\)', ' ', loc)
    parts = [p.strip() for p in s.split(',') if p.strip()]
    qs = [', '.join(parts + ([us_state] if us_state and us_state not in parts else []))]
    if len(parts) > 1: qs.append(', '.join(parts[-2:] + ([us_state] if us_state and us_state not in parts[-2:] else [])))
    seen = set()
    for q in qs:
        if q in seen: continue
        seen.add(q)
        r = nominatim(q, iso2)
        if r and r['cc'] == iso2.upper():
            return {'lat': r['lat'], 'lng': r['lng'], 'p': precision(r, 2 if (len(qs) > 1 and q == qs[-1]) else 0), 'q': q}
    return None

def main():
    clubs = json.load(open(D('clubs.json')))['clubs']
    ev = json.load(open(D('events.json')))['events']
    iev = json.load(open(D('intl.json')))['events']
    by = collections.defaultdict(list)
    for x in ev:
        if x.get('club_id') and x.get('location'): by[x['club_id']].append(x['location'])
    out = {'clubs': {}, 'places': {}}
    # clubs: the club's own address first, then venues its events were held at
    for i, c in enumerate(clubs):
        names = [n.lower() for n in [c['name']] + (c.get('aliases') or []) if n]
        locs = ([c['address']] if c.get('address') else []) + list(dict.fromkeys(by[c['id']]))
        trusted = []
        if c.get('address'): trusted.append(c['address'])
        if c.get('suburb') and c.get('state'): locs.append(c['suburb'] + ' ' + c['state']); trusted.append(c['suburb'] + ' ' + c['state'])
        if c.get('country'):   # overseas clubs in clubs.json: only individual clubs, from their own suburb field
            iso = {'MAS': 'MY'}.get(c['country'])
            out['clubs'][c['id']] = (geocode_intl(c['suburb'], iso, None) if iso and c.get('suburb') and re.search(r'club', c.get('kind', ''), re.I) else None)
            print('club', i, c['name'], '->', out['clubs'][c['id']]); continue
        out['clubs'][c['id']] = geocode_au(locs, names, c.get('state'), trusted)
        print('club', i, c['name'], '->', out['clubs'][c['id']] and (out['clubs'][c['id']]['p'], out['clubs'][c['id']]['q'])); sys.stdout.flush()
    # event venues (Australian): only locations that are more than a club name or a state
    clubname = {c['id']: [n.lower() for n in [c['name']] + (c.get('aliases') or []) if n] for c in clubs}
    seen = set()
    for x in ev:
        loc = (x.get('location') or '').strip()
        if not loc or loc in seen: continue
        seen.add(loc)
        names = clubname.get(x.get('club_id'), []) + [(x.get('host') or '').lower()]
        r = geocode_au([loc], [n for n in names if n], x.get('state_code'), [loc])
        out['places'][loc] = r
        print('place', loc[:60], '->', r and (r['p'], r['q'][:60])); sys.stdout.flush()
    for x in iev:
        loc = (x.get('location') or '').strip()
        if not loc or loc in out['places']: continue
        r = geocode_intl(loc, x.get('iso2') or '', x.get('us_state'))
        out['places'][loc] = r
        print('intl', loc[:60], '->', r and (r['p'], r['q'][:60])); sys.stdout.flush()
    for loc, v in MANUAL.items():   # venues Nominatim misses from the full address, checked by hand against OpenStreetMap
        out['places'][loc] = v
    apply_manual(out['places'], out['clubs'])
    n_c = sum(1 for v in out['clubs'].values() if v)
    res = {'generated': datetime.date.today().isoformat(),
           'note': 'Coordinates for clubs and event venues, geocoded only from addresses and place names already in the calendar data (OpenStreetMap Nominatim, (c) OpenStreetMap contributors, ODbL). p: v = a venue or street, t = only a suburb, town or city. null = no reliable location, never guessed.',
           'clubs': {k: ({'lat': v['lat'], 'lng': v['lng'], 'p': v['p'], 'q': v['q']} if v else None) for k, v in out['clubs'].items()},
           'places': {k: ({'lat': v['lat'], 'lng': v['lng'], 'p': v['p']} if v else None) for k, v in out['places'].items()}}
    json.dump(res, open(D('club_coords.json'), 'w'), indent=0, ensure_ascii=False, separators=(',', ':'))
    print('clubs with coordinates', n_c, 'of', len(out['clubs']), '| places', sum(1 for v in out['places'].values() if v), 'of', len(out['places']))
def patch():
    """--patch: apply the hand-checked overrides to the existing data/club_coords.json without geocoding again."""
    res = json.load(open(D('club_coords.json')))
    places = {k: (dict(v) if v else None) for k, v in res['places'].items()}
    clubs = res['clubs']
    for f in ('events.json', 'intl.json'):   # locations added since the last full run: only the hand-checked overrides can fill them here
        for x in json.load(open(D(f)))['events']:
            loc = (x.get('location') or '').strip()
            if loc and loc not in places and any(v and re.search(rx, loc, re.I) for rx, v in MANUAL_MATCH): places[loc] = None
    for loc, v in MANUAL.items():
        places[loc] = v
    apply_manual(places, clubs)
    res['places'] = {k: ({'lat': v['lat'], 'lng': v['lng'], 'p': v['p']} if v else None) for k, v in places.items()}
    res['clubs'] = {k: ({'lat': v['lat'], 'lng': v['lng'], 'p': v['p'], 'q': v['q']} if v else None) for k, v in clubs.items()}
    res['generated'] = datetime.date.today().isoformat()
    json.dump(res, open(D('club_coords.json'), 'w'), indent=0, ensure_ascii=False, separators=(',', ':'))
    print('clubs with coordinates', sum(1 for v in clubs.values() if v), 'of', len(clubs), '| places', sum(1 for v in res['places'].values() if v), 'of', len(places))
if __name__ == '__main__': patch() if '--patch' in sys.argv else main()

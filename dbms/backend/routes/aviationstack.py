import os
import time
import requests
from flask import Blueprint, jsonify, request

aviationstack_bp = Blueprint('aviationstack', __name__)

AVIATIONSTACK_BASE = 'http://api.aviationstack.com/v1/flights'

# Full list of Indian international airport IATA codes
INDIAN_INTERNATIONAL_AIRPORTS = [
    'BOM','DEL','BLR','MAA','CCU','HYD','COK','AMD','GOI','COI',
    'CCJ','TRV','IXE','NAG','PNQ','LKO','ATQ','JAI','GAU','IXC',
    'PAT','VNS','IXB','BDQ','IDR','STV','TRZ','IXZ','IXM','RPR',
]

# Simple in-memory cache: { cache_key: { 'data': ..., 'cached_at': ... } }
_cache = {}
CACHE_TTL = 300  # 5 minutes — matches frontend poll interval


def _get_cached(key):
    entry = _cache.get(key)
    if entry and time.time() - entry['cached_at'] < CACHE_TTL:
        return entry['data']
    return None


def _set_cache(key, data):
    _cache[key] = {'data': data, 'cached_at': time.time()}


def _fetch_flights(iata, direction):
    """
    direction: 'arr' or 'dep'
    Fetches international flights only.
    AviationStack free tier is HTTP only — called server-side to avoid
    browser mixed-content blocking.
    """
    api_key = os.environ.get('AVIATIONSTACK_KEY')
    if not api_key:
        return None, 'AVIATIONSTACK_KEY not configured'

    cache_key = f'{iata}_{direction}'
    cached = _get_cached(cache_key)
    if cached:
        print(f'[AviationStack] Cache hit: {cache_key}')
        return cached, None

    print(f'[AviationStack] Fetching fresh: {cache_key}')

    params = {
        'access_key':     api_key,
        'limit':          100,
    }

    if direction == 'arr':
        params['arr_iata'] = iata
    else:
        params['dep_iata'] = iata

    try:
        res = requests.get(AVIATIONSTACK_BASE, params=params, timeout=15)

        if res.status_code == 429:
            return None, 'quota_exceeded'

        if res.status_code != 200:
            return None, f'HTTP {res.status_code}'

        data = res.json()

        # Filter to international flights only:
        # A flight is international if departure country != arrival country
        # OR if one endpoint is outside India
        flights = data.get('data', [])
        international = []
        for f in flights:
            dep_country = (f.get('departure') or {}).get('country', '')
            arr_country = (f.get('arrival')   or {}).get('country', '')
            # Keep if either end is not India, or countries differ
            if dep_country != arr_country:
                international.append(f)
            elif dep_country != 'India' or arr_country != 'India':
                international.append(f)

        result = {
            'airport':    iata,
            'direction':  direction,
            'count':      len(international),
            'flights':    international,
            'fetched_at': time.time(),
        }
        _set_cache(cache_key, result)
        return result, None

    except requests.exceptions.Timeout:
        return None, 'timeout'
    except Exception as e:
        return None, str(e)


@aviationstack_bp.route('/api/flights')
def get_flights():
    iata      = (request.args.get('airport') or '').upper().strip()
    direction = (request.args.get('direction') or 'dep').lower().strip()

    if not iata:
        return jsonify({'error': True, 'message': 'Missing airport parameter'}), 400

    if iata not in INDIAN_INTERNATIONAL_AIRPORTS:
        return jsonify({
            'error':   True,
            'message': f'{iata} is not in the supported Indian international airports list'
        }), 400

    if direction not in ('arr', 'dep'):
        return jsonify({'error': True, 'message': 'direction must be arr or dep'}), 400

    data, err = _fetch_flights(iata, direction)

    if err == 'quota_exceeded':
        return jsonify({'error': True, 'message': 'quota_exceeded'}), 429

    if err:
        return jsonify({'error': True, 'message': err}), 500

    return jsonify(data)


@aviationstack_bp.route('/api/airports')
def get_airports():
    """Returns the list of supported airports for the frontend dropdown."""
    airport_list = [
        {'iata':'BOM','city':'Mumbai',           'name':'Chhatrapati Shivaji Maharaj International'},
        {'iata':'DEL','city':'New Delhi',         'name':'Indira Gandhi International'},
        {'iata':'BLR','city':'Bengaluru',         'name':'Kempegowda International'},
        {'iata':'MAA','city':'Chennai',           'name':'Chennai International'},
        {'iata':'CCU','city':'Kolkata',           'name':'Netaji Subhas Chandra Bose International'},
        {'iata':'HYD','city':'Hyderabad',         'name':'Rajiv Gandhi International'},
        {'iata':'COK','city':'Kochi',             'name':'Cochin International'},
        {'iata':'AMD','city':'Ahmedabad',         'name':'Sardar Vallabhbhai Patel International'},
        {'iata':'GOI','city':'Goa',               'name':'Goa International (Dabolim)'},
        {'iata':'COI','city':'Goa',               'name':'Manohar International (New Goa)'},
        {'iata':'CCJ','city':'Kozhikode',         'name':'Calicut International'},
        {'iata':'TRV','city':'Thiruvananthapuram','name':'Trivandrum International'},
        {'iata':'IXE','city':'Mangaluru',         'name':'Mangaluru International'},
        {'iata':'NAG','city':'Nagpur',            'name':'Dr. Babasaheb Ambedkar International'},
        {'iata':'PNQ','city':'Pune',              'name':'Pune International'},
        {'iata':'LKO','city':'Lucknow',           'name':'Chaudhary Charan Singh International'},
        {'iata':'ATQ','city':'Amritsar',          'name':'Sri Guru Ram Dass Jee International'},
        {'iata':'JAI','city':'Jaipur',            'name':'Jaipur International'},
        {'iata':'GAU','city':'Guwahati',          'name':'Lokpriya Gopinath Bordoloi International'},
        {'iata':'IXC','city':'Chandigarh',        'name':'Chandigarh International'},
        {'iata':'PAT','city':'Patna',             'name':'Lok Nayak Jayaprakash Airport'},
        {'iata':'VNS','city':'Varanasi',          'name':'Lal Bahadur Shastri International'},
        {'iata':'IXB','city':'Bagdogra',          'name':'Bagdogra Airport'},
        {'iata':'BDQ','city':'Vadodara',          'name':'Vadodara Airport'},
        {'iata':'IDR','city':'Indore',            'name':'Devi Ahilyabai Holkar International'},
        {'iata':'STV','city':'Surat',             'name':'Surat Airport'},
        {'iata':'TRZ','city':'Tiruchirappalli',   'name':'Tiruchirappalli International'},
        {'iata':'IXZ','city':'Port Blair',        'name':'Veer Savarkar International'},
        {'iata':'IXM','city':'Madurai',           'name':'Madurai Airport'},
        {'iata':'RPR','city':'Raipur',            'name':'Swami Vivekananda Airport'},
    ]
    return jsonify(airport_list)

import json
import os
import time
import threading
import requests
from flask import Blueprint, jsonify, request

opensky_bp = Blueprint('opensky', __name__)

# ── Credentials ────────────────────────────────────────────────────────────
# routes/ is at  dbms/backend/routes/
# project root is 3 levels up: ../../..
_creds_path = os.path.join(
    os.path.dirname(__file__), '..', '..', '..',
    'opensky-network credentials - livemap.json'
)

try:
    with open(os.path.abspath(_creds_path)) as f:
        _creds = json.load(f)
    print('[OpenSky] Credentials loaded OK')
except Exception as e:
    raise RuntimeError(
        '[OpenSky] Could not load opensky-network credentials - livemap.json\n'
        'Make sure the file exists at project root with keys: '
        'client_id, client_secret\n'
        f'Error: {e}'
    )

OPENSKY_TOKEN_URL = (
    'https://auth.opensky-network.org/auth/realms/opensky-network'
    '/protocol/openid-connect/token'
)
OPENSKY_STATES_URL = 'https://opensky-network.org/api/states/all'

# ── Token Cache (thread-safe) ───────────────────────────────────────────────
_token_lock = threading.Lock()
_token_cache = {
    'access_token': None,
    'expires_at': 0,
}


def _get_token():
    with _token_lock:
        now = time.time()
        # Return cached token if still valid with 60s buffer
        if _token_cache['access_token'] and now < _token_cache['expires_at']:
            return _token_cache['access_token']

        print('[OpenSky] Fetching new OAuth2 token...')
        res = requests.post(
            OPENSKY_TOKEN_URL,
            data={
                'grant_type':    'client_credentials',
                'client_id':     _creds.get('client_id') or _creds.get('clientId'),
                'client_secret': _creds.get('client_secret') or _creds.get('clientSecret'),
            },
            timeout=10,
        )
        res.raise_for_status()
        data = res.json()

        _token_cache['access_token'] = data['access_token']
        # Refresh 60 seconds before actual expiry
        _token_cache['expires_at'] = now + data['expires_in'] - 60

        print(f"[OpenSky] Token obtained. Valid for {data['expires_in']}s.")
        return _token_cache['access_token']


# ── Route ───────────────────────────────────────────────────────────────────
@opensky_bp.route('/api/opensky')
def opensky_states():
    lamin = request.args.get('lamin')
    lomin = request.args.get('lomin')
    lamax = request.args.get('lamax')
    lomax = request.args.get('lomax')

    if not all([lamin, lomin, lamax, lomax]):
        return jsonify({
            'error': True,
            'message': 'Missing bounding box params: lamin, lomin, lamax, lomax'
        }), 400

    try:
        token = _get_token()
        res = requests.get(
            OPENSKY_STATES_URL,
            params={
                'lamin': lamin, 'lomin': lomin,
                'lamax': lamax, 'lomax': lomax,
            },
            headers={'Authorization': f'Bearer {token}'},
            timeout=15,
        )

        # Token expired mid-session — clear cache and tell client to retry
        if res.status_code == 401:
            with _token_lock:
                _token_cache['access_token'] = None
                _token_cache['expires_at'] = 0
            print('[OpenSky] 401 received — token cache cleared')
            return jsonify({'error': True, 'message': 'Token expired, retry'}), 401

        # Rate limited
        if res.status_code == 429:
            print('[OpenSky] 429 — rate limited')
            return jsonify({'error': True, 'message': 'Rate limited'}), 429

        res.raise_for_status()
        return jsonify(res.json())

    except requests.exceptions.Timeout:
        return jsonify({'error': True, 'message': 'OpenSky timeout'}), 504

    except Exception as e:
        print(f'[OpenSky] Proxy error: {e}')
        return jsonify({'error': True, 'message': str(e)}), 500

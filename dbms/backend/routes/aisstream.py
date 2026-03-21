import os
from flask import Blueprint, jsonify

aisstream_bp = Blueprint('aisstream', __name__)

@aisstream_bp.route('/api/aisstream-key')
def aisstream_key():
    key = os.environ.get('AISSTREAM_KEY', '')
    if not key or key == 'your_free_key_from_aisstream.io':
        return jsonify({'error': 'AISSTREAM_KEY not configured'}), 500
    return jsonify({'key': key})

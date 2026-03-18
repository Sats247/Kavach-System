from flask import Blueprint, request
from database import get_db, rows_to_list, api_response, api_error

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/kpis', methods=['GET'])
def get_kpis():
    db = get_db()
    try:
        volume   = db.execute("SELECT COUNT(*) as c FROM entities").fetchone()['c']
        flags    = db.execute("SELECT COUNT(*) as c FROM entities WHERE is_blacklist=1 OR status='Flagged'").fetchone()['c']
        no_ngo   = db.execute("SELECT COUNT(*) as c FROM entities WHERE type IN ('Refugee','Migrant') AND (assigned_ngo IS NULL OR assigned_ngo='')").fetchone()['c']
        incidents = db.execute("SELECT COUNT(*) as c FROM incidents WHERE status='Open'").fetchone()['c']
    finally:
        db.close()

    return api_response(data={
        'volume':    volume,
        'flags':     flags,
        'pending_aid': no_ngo,
        'incidents': incidents
    })


@dashboard_bp.route('/marker-stats', methods=['GET'])
def marker_stats():
    location = request.args.get('location', '')
    if not location:
        return api_error('location parameter required')

    db = get_db()
    try:
        total = db.execute(
            "SELECT COUNT(*) as c FROM entities WHERE entry_point LIKE ?",
            (f'%{location[:20]}%',)
        ).fetchone()['c']
        flagged = db.execute(
            "SELECT COUNT(*) as c FROM entities WHERE entry_point LIKE ? AND (is_blacklist=1 OR status='Flagged')",
            (f'%{location[:20]}%',)
        ).fetchone()['c']
        aid = db.execute(
            "SELECT COUNT(*) as c FROM entities WHERE entry_point LIKE ? AND type IN ('Refugee','Migrant') AND (assigned_ngo IS NULL OR assigned_ngo='')",
            (f'%{location[:20]}%',)
        ).fetchone()['c']
    finally:
        db.close()

    return api_response(data={
        'location': location,
        'total':    total,
        'flagged':  flagged,
        'pending_aid': aid
    })


@dashboard_bp.route('/entity-types', methods=['GET'])
def entity_types():
    db = get_db()
    try:
        rows = db.execute(
            "SELECT type, COUNT(*) as count FROM entities GROUP BY type"
        ).fetchall()
    finally:
        db.close()
    return api_response(data=[dict(r) for r in rows])


@dashboard_bp.route('/top-entry-points', methods=['GET'])
def top_entry_points():
    db = get_db()
    try:
        rows = db.execute(
            "SELECT entry_point, COUNT(*) as count FROM entities WHERE entry_point IS NOT NULL GROUP BY entry_point ORDER BY count DESC LIMIT 8"
        ).fetchall()
    finally:
        db.close()
    return api_response(data=[dict(r) for r in rows])

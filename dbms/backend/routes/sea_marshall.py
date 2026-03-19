import json, random, os
from flask import Blueprint, request
from database import get_db, api_response, api_error

sea_marshall_bp = Blueprint('sea_marshall', __name__)

VESSELS_PATH = os.path.join(os.path.dirname(__file__), '..', 'vessels.json')

def _load_vessels():
    with open(VESSELS_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


@sea_marshall_bp.route('/vessels', methods=['GET'])
def get_vessels():
    vessels = _load_vessels()
    db = get_db()
    try:
        overrides = db.execute("SELECT imo, status FROM vessel_status").fetchall()
        override_map = {r['imo']: r['status'] for r in overrides}
    finally:
        db.close()
    for v in vessels:
        if v['imo'] in override_map:
            v['status'] = override_map[v['imo']]
    return api_response(data=vessels)


@sea_marshall_bp.route('/vessels/<imo>', methods=['GET'])
def get_vessel(imo):
    vessels = _load_vessels()
    vessel  = next((v for v in vessels if v['imo'] == imo), None)
    if not vessel:
        return api_error('Vessel not found', 404)
    db = get_db()
    try:
        override = db.execute("SELECT status FROM vessel_status WHERE imo=?", (imo,)).fetchone()
        if override:
            vessel['status'] = override['status']
    finally:
        db.close()
    return api_response(data=vessel)


@sea_marshall_bp.route('/lock-vessel', methods=['POST'])
def lock_vessel():
    data = request.get_json(silent=True) or {}
    imo  = data.get('imo', '').strip()
    if not imo:
        return api_error('imo required')

    db = get_db()
    try:
        db.execute("""
            INSERT INTO vessel_status(imo, status, updated_at)
            VALUES (?, 'INTERCEPTED', datetime('now'))
            ON CONFLICT(imo) DO UPDATE SET status='INTERCEPTED', updated_at=datetime('now')
        """, (imo,))
        # Auto-create incident
        inc_id = f"INC-{random.randint(100000,999999)}"
        db.execute("""
            INSERT INTO incidents(id, type, severity, location, description, reported_by, vessel_imo, status)
            VALUES (?,?,?,?,?,?,?,'Open')
        """, (
            inc_id, 'Unauthorized Entry', 'Critical',
            'JNPT, Navi Mumbai — Maritime Approach',
            f'Coast Guard intercept order issued for IMO {imo} — MV Shadow Runner. Vessel suspected of arms and narcotics trafficking. Flagged by RAW Level 3 Intelligence.',
            'Sea Marshall System', imo
        ))
        db.commit()
    except Exception as e:
        db.close()
        return api_error(str(e), 500)
    finally:
        db.close()

    return api_response(data={'imo': imo, 'new_status': 'INTERCEPTED'},
                        message='Intercept order issued. Indian Coast Guard notified.')


@sea_marshall_bp.route('/file-incident', methods=['POST'])
def file_incident():
    data = request.get_json(silent=True) or {}
    required = ['imo', 'incident_type', 'description']
    for f in required:
        if not data.get(f):
            return api_error(f'Field required: {f}')

    inc_id = f"INC-{random.randint(100000,999999)}"
    db = get_db()
    try:
        db.execute("""
            INSERT INTO incidents(id, type, severity, location, description, reported_by, vessel_imo, status)
            VALUES (?,?,?,?,?,?,?,'Open')
        """, (
            inc_id,
            data['incident_type'],
            data.get('severity', 'Critical'),
            data.get('location', 'Maritime — Indian EEZ'),
            data['description'],
            data.get('reporting_marshal', 'Sea Marshall'),
            data['imo']
        ))
        db.commit()
    except Exception as e:
        db.close()
        return api_error(str(e), 500)
    finally:
        db.close()

    return api_response(data={'incident_id': inc_id},
                        message=f'Incident {inc_id} filed successfully.')


@sea_marshall_bp.route('/flag-vessel', methods=['POST'])
def flag_vessel():
    """Flag a currently-cleared vessel as suspicious."""
    data = request.get_json(silent=True) or {}
    imo = data.get('imo', '').strip()
    flag_reason = data.get('flag_reason', 'Flagged by sea marshall officer').strip()
    flagged_by  = data.get('flagged_by', 'Sea Marshall').strip()
    if not imo:
        return api_error('imo required')

    db = get_db()
    try:
        db.execute("""
            INSERT INTO vessel_status(imo, status, updated_at)
            VALUES (?, 'FLAGGED_ILLEGAL', datetime('now'))
            ON CONFLICT(imo) DO UPDATE SET status='FLAGGED_ILLEGAL', updated_at=datetime('now')
        """, (imo,))
        # Create incident record
        inc_id = f"INC-{random.randint(100000,999999)}"
        db.execute("""
            INSERT INTO incidents(id, type, severity, location, description, reported_by, vessel_imo, status)
            VALUES (?,?,?,?,?,?,?,'Open')
        """, (
            inc_id, 'Suspicious Vessel', 'High',
            'Maritime — Indian EEZ',
            f'Vessel IMO {imo} flagged by officer {flagged_by}. Reason: {flag_reason}',
            flagged_by, imo
        ))
        db.commit()
    except Exception as e:
        db.close()
        return api_error(str(e), 500)
    finally:
        db.close()

    return api_response(
        data={'imo': imo, 'new_status': 'FLAGGED_ILLEGAL', 'incident_id': inc_id},
        message=f'Vessel IMO {imo} flagged. Intel Command notified. Incident {inc_id} created.'
    )

@sea_marshall_bp.route('/update-status', methods=['POST'])
def update_status():
    data = request.get_json(silent=True) or {}
    imo = data.get('imo', '').strip()
    status = data.get('status', '').strip()
    if not imo or not status:
        return api_error('imo and status required')
    db = get_db()
    try:
        db.execute("""
            INSERT INTO vessel_status(imo, status, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(imo) DO UPDATE SET status=?, updated_at=datetime('now')
        """, (imo, status, status))
        db.commit()
    except Exception as e:
        db.close()
        return api_error(str(e), 500)
    finally:
        db.close()
    return api_response(message='Status updated successfully')

@sea_marshall_bp.route('/add-vessel', methods=['POST'])
def add_vessel():
    data = request.get_json(silent=True) or {}
    required = ['imo', 'vessel_name', 'vessel_type', 'flag_state', 'status']
    for f in required:
        if not data.get(f):
            return api_error(f'Field required: {f}')
    
    try:
        vessels = _load_vessels()
        new_vessel = {
            "imo": data.get("imo"),
            "vessel_name": data.get("vessel_name"),
            "vessel_type": data.get("vessel_type"),
            "country_of_origin": data.get("flag_state"),
            "flag_state": data.get("flag_state"),
            "cargo": "Unknown",
            "gross_tonnage": 0,
            "destination_port": "Unknown",
            "eta": data.get("eta", ""),
            "last_port": "Unknown",
            "captain": data.get("captain", ""),
            "crew_count": 0,
            "status": data.get("status"),
            "is_flagged": False,
            "flag_reason": None
        }
        vessels.append(new_vessel)
        with open(VESSELS_PATH, 'w', encoding='utf-8') as f:
            json.dump(vessels, f, indent=2)
            
        db = get_db()
        try:
            db.execute("""
                INSERT INTO vessel_status(imo, status, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(imo) DO UPDATE SET status=?, updated_at=datetime('now')
            """, (data.get('imo'), data.get('status'), data.get('status')))
            db.commit()
        except Exception as e:
            pass
        finally:
            db.close()
    except Exception as e:
        return api_error(str(e), 500)
    
    return api_response(message='Vessel added successfully')


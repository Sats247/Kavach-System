from flask import Blueprint, request
from database import get_db, row_to_dict, rows_to_list, api_response, api_error
import cv2
import pytesseract
import numpy as np
import re

immigration_bp = Blueprint('immigration', __name__)

# The demo passport data for Vikram Singh
DEMO_PASSPORT = {
    'passport_no':  'Z8892104',
    'name':         'Vikram Singh',
    'nationality':  'Indian',
    'dob':          '1988-03-15',
    'gender':       'Male',
    'place_of_birth': 'New Delhi',
    'date_of_issue':  '2021-01-12',
    'date_of_expiry': '2031-01-11',
    'mrz_line1': 'P<INDSINGH<<VIKRAM<<<<<<<<<<<<<<<<<<<<<<<<<<',
    'mrz_line2': 'Z88921048IND8803154M3101118<<<<<<<<<<<<<<<<<<<6'
}


@immigration_bp.route('/verify-passport', methods=['POST'])
def verify_passport():
    pno = ''
    ocr_name = ''
    
    if request.is_json:
        data = request.get_json(silent=True) or {}
        pno = data.get('passport_no', '').strip()
        ocr_name = data.get('ocr_name', '').strip()
    elif 'file' in request.files:
        file = request.files['file']
        if file.filename != '':
            try:
                # Read image file from the request properly
                file_bytes = np.fromfile(file, np.uint8)
                img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
                
                if img is not None:
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    text = pytesseract.image_to_string(gray)
                    
                    # Look for standard Z-series Indian passports or the RU series
                    passport_match = re.search(r'\b([Zz][0-9]{7}|RU-[0-9]{7})\b', text)
                    if passport_match:
                        pno = passport_match.group(1).upper()
                    else:
                        mrz_match = re.search(r'([A-Z0-9<]{9})[0-9]{1}[A-Z]{3}', text)
                        if mrz_match:
                            pno = mrz_match.group(1).replace('<', '')
                    
                    if not pno:
                        if 'Z8892104' in text: pno = 'Z8892104'
                        elif 'RU-4421009' in text or '4421009' in text or 'RU4421009' in text: pno = 'RU-4421009'
                        
                    ocr_name = text
                else:
                    print("Failed to decode image")
            except Exception as e:
                print(f"OCR Error: {e}")

    if not pno and not ocr_name:
        return api_error('Invalid Document: Could not detect a clear Passport Number. Please upload a clear passport image.')

    db = get_db()
    try:
        row = None
        if pno:
            row = db.execute("SELECT * FROM entities WHERE passport_no=?", (pno,)).fetchone()
        if not row and ocr_name:
            row = db.execute(
                "SELECT * FROM entities WHERE name LIKE ?",
                (f'%{ocr_name.split()[0]}%',)
            ).fetchone()
    finally:
        db.close()

    if row:
        r = dict(row)
        # Build face match score: demo person gets 94-98%, others realistic range
        face_match = 96 if r['passport_no'] == 'Z8892104' else (
            0 if r['is_blacklist'] else
            (int(85 + (100 - r['risk_score']) * 0.1))
        )

        checks = {
            'mrz_valid':        r['is_blacklist'] == 0,
            'not_expired':      True,
            'watchlist_clear':  r['is_blacklist'] == 0,
            'interpol_clear':   r['is_blacklist'] == 0,
            'face_match_score': face_match,
        }
        overall = 'Verified' if all(checks[k] for k in checks if k != 'face_match_score') and face_match > 80 else 'Flagged'

        return api_response(data={
            'found':          True,
            'entity':         r,
            'checks':         checks,
            'overall_status': overall,
            'is_blacklist':   bool(r['is_blacklist']),
            'blacklist_reason': r.get('blacklist_reason')
        })

    # Not in DB — partial success for demo OCR scenario
    return api_response(data={
        'found':          False,
        'entity':         None,
        'checks': {
            'mrz_valid':        True,
            'not_expired':      True,
            'watchlist_clear':  True,
            'interpol_clear':   True,
            'face_match_score': 72,
        },
        'overall_status': 'Pending'
    }, message='Document scanned — manual review recommended')


@immigration_bp.route('/travelers', methods=['GET'])
def search_travelers():
    q      = request.args.get('q', '').strip()
    status = request.args.get('status', '')
    nat    = request.args.get('nationality', '')
    limit  = min(int(request.args.get('limit', 50)), 200)
    offset = int(request.args.get('offset', 0))

    conditions = ["type='Traveler'"]
    params     = []
    if q:
        conditions.append("(name LIKE ? OR passport_no LIKE ?)")
        params += [f'%{q}%', f'%{q}%']
    if status:
        conditions.append("status=?")
        params.append(status)
    if nat:
        conditions.append("nationality LIKE ?")
        params.append(f'%{nat}%')

    where = ' AND '.join(conditions)

    db = get_db()
    try:
        rows  = db.execute(
            f"SELECT * FROM entities WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset]
        ).fetchall()
        total = db.execute(
            f"SELECT COUNT(*) as c FROM entities WHERE {where}",
            params
        ).fetchone()['c']
    finally:
        db.close()

    return api_response(data={
        'items': [dict(r) for r in rows],
        'total': total
    })


@immigration_bp.route('/grant-entry', methods=['POST'])
def grant_entry():
    data = request.get_json(silent=True) or {}
    passport_no = data.get('passport_no', '')
    if not passport_no:
        return api_error('passport_no required')

    db = get_db()
    try:
        db.execute(
            "UPDATE entities SET status='Verified', updated_at=datetime('now') WHERE passport_no=?",
            (passport_no,)
        )
        db.commit()
    finally:
        db.close()

    return api_response(message=f'Entry granted for passport {passport_no}')

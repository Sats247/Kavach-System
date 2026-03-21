from dotenv import load_dotenv
load_dotenv(override=True)

from flask import Flask, send_from_directory
from flask_cors import CORS
from database import init_db
from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.border_patrol import border_patrol_bp
from routes.sea_marshall import sea_marshall_bp
from routes.immigration import immigration_bp
from routes.ngo import ngo_bp
from routes.refugee import refugee_bp
from routes.opensky import opensky_bp
from routes.aviationstack import aviationstack_bp
from routes.aisstream import aisstream_bp
import os

AVIATIONSTACK_KEY = os.environ.get('AVIATIONSTACK_KEY')
if AVIATIONSTACK_KEY is None:
    print('[AviationStack] WARNING: AVIATIONSTACK_KEY not set in .env')


def create_app():
    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend'),
        static_url_path=''
    )
    app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dbms-dev-secret-2026')  # TODO: set FLASK_SECRET_KEY in your .env file
    CORS(app, supports_credentials=True)

    with app.app_context():
        init_db()

    app.register_blueprint(auth_bp,          url_prefix='/api/auth')
    app.register_blueprint(dashboard_bp,     url_prefix='/api/dashboard')
    app.register_blueprint(border_patrol_bp, url_prefix='/api/border-patrol')
    app.register_blueprint(sea_marshall_bp,  url_prefix='/api/sea-marshall')
    app.register_blueprint(immigration_bp,   url_prefix='/api/immigration')
    app.register_blueprint(ngo_bp,           url_prefix='/api/ngo')
    app.register_blueprint(refugee_bp,       url_prefix='/api/refugee')
    app.register_blueprint(opensky_bp)  # route: /api/opensky (no prefix — defined in blueprint)
    app.register_blueprint(aviationstack_bp)
    app.register_blueprint(aisstream_bp)

    @app.route('/')
    def serve_index():
        return send_from_directory(app.static_folder, 'index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        full = os.path.join(app.static_folder, path)
        if os.path.exists(full):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, 'index.html')

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5050)

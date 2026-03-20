(function () {

  // ── CONFIG ────────────────────────────────────────────────────────────────
  var INDIA_CENTER_LAT = 20.5937;
  var INDIA_CENTER_LON = 78.9629;
  var ZOOM = 5;
  var POLL_INTERVAL_MS = 15000;
  var BACKOFF_INTERVAL_MS = 30000;

  var OPENSKY_URL = '/api/opensky?lamin=6.5&lomin=68.0&lamax=35.5&lomax=97.5';
  // Calls our authenticated Flask proxy instead of OpenSky directly

  // ── VERTICAL RATE THRESHOLDS ──────────────────────────────────────────────
  // > +1 m/s  → climbing   → departing  (amber)
  // < -1 m/s  → descending → arriving   (green)
  // otherwise → cruising   (primary blue)
  var CLIMB_THRESHOLD = 1;   // m/s
  var DESCENT_THRESHOLD = -1;   // m/s

  // Government palette (mirrored from global.css)
  var COLOR_DEPARTING = "#B45309";  // --color-warning  (amber)
  var COLOR_ARRIVING = "#1A7F4B";  // --color-success  (green)
  var COLOR_CRUISING = "#0057B8";  // --color-primary  (blue)

  // ── INDIA INTERNATIONAL AIRPORTS ─────────────────────────────────────────
  var AIRPORTS = [
    { iata: "DEL", name: "Indira Gandhi International (IGI)", lat: 28.5665, lon: 77.1031 },
    { iata: "BOM", name: "Chhatrapati Shivaji Maharaj International", lat: 19.0896, lon: 72.8656 },
    { iata: "MAA", name: "Chennai International", lat: 12.9941, lon: 80.1709 },
    { iata: "BLR", name: "Kempegowda International", lat: 13.1986, lon: 77.7066 },
    { iata: "HYD", name: "Rajiv Gandhi International", lat: 17.2403, lon: 78.4294 },
    { iata: "CCU", name: "Netaji Subhas Chandra Bose International", lat: 22.6547, lon: 88.4467 },
    { iata: "COK", name: "Cochin International", lat: 10.1520, lon: 76.3919 },
    { iata: "AMD", name: "Sardar Vallabhbhai Patel International", lat: 23.0725, lon: 72.6347 },
    { iata: "GOI", name: "Goa International (Dabolim)", lat: 15.3808, lon: 73.8314 },
    { iata: "JAI", name: "Jaipur International", lat: 26.8242, lon: 75.8122 },
    { iata: "PNQ", name: "Pune International", lat: 18.5822, lon: 73.9197 },
    { iata: "LKO", name: "Chaudhary Charan Singh International (Lucknow)", lat: 26.7606, lon: 80.8893 },
    { iata: "ATQ", name: "Sri Guru Ram Dass Jee International (Amritsar)", lat: 31.7096, lon: 74.7973 },
    { iata: "VTZ", name: "Visakhapatnam International", lat: 17.7212, lon: 83.2245 },
    { iata: "GAU", name: "Lokpriya Gopinath Bordoloi International", lat: 26.1061, lon: 91.5859 },
    { iata: "BBI", name: "Biju Patnaik International (Bhubaneswar)", lat: 20.2444, lon: 85.8178 },
    { iata: "TRV", name: "Trivandrum International", lat: 8.4821, lon: 76.9201 },
    { iata: "IXE", name: "Mangalore International", lat: 12.9613, lon: 74.8901 },
    { iata: "CJB", name: "Coimbatore International", lat: 11.0300, lon: 77.0434 },
    { iata: "NAG", name: "Dr. Babasaheb Ambedkar International (Nagpur)", lat: 21.0922, lon: 79.0472 },
    { iata: "IXZ", name: "Veer Savarkar International (Port Blair)", lat: 11.6412, lon: 92.7297 },
    { iata: "SXR", name: "Sheikh ul-Alam International (Srinagar)", lat: 33.9871, lon: 74.7742 },
    { iata: "IXL", name: "Kushok Bakula Rimpochee (Leh)", lat: 34.1359, lon: 77.5465 },
    { iata: "TRZ", name: "Tiruchirappalli International", lat: 10.7654, lon: 78.7097 },
    { iata: "IMF", name: "Imphal International", lat: 24.7600, lon: 93.8997 },
    { iata: "IXB", name: "Bagdogra International", lat: 26.6812, lon: 88.3286 },
    { iata: "PAT", name: "Jay Prakash Narayan International (Patna)", lat: 25.5913, lon: 85.0877 },
    { iata: "IXC", name: "Chandigarh International", lat: 30.6735, lon: 76.7885 },
    { iata: "IXR", name: "Birsa Munda International (Ranchi)", lat: 23.3143, lon: 85.3217 },
    { iata: "GAY", name: "Gaya International", lat: 24.7443, lon: 85.0051 },
    { iata: "IXA", name: "Agartala (MBB) International", lat: 23.8870, lon: 91.2404 },
    { iata: "DIB", name: "Dibrugarh Airport", lat: 27.4839, lon: 95.0169 },
    { iata: "SHL", name: "Shillong Airport", lat: 25.7036, lon: 91.9787 },
    { iata: "BHO", name: "Raja Bhoj International (Bhopal)", lat: 23.2875, lon: 77.3374 },
    { iata: "RPR", name: "Swami Vivekananda Airport (Raipur)", lat: 21.1804, lon: 81.7388 },
  ];

  // ── STATE ─────────────────────────────────────────────────────────────────
  var markers = {};
  var pollTimer = null;
  var isBackingOff = false;

  // ── MAP INIT ──────────────────────────────────────────────────────────────
  var map = L.map("blr-map", {
    center: [INDIA_CENTER_LAT, INDIA_CENTER_LON],
    zoom: ZOOM,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);

  // ── COLOUR HELPER ─────────────────────────────────────────────────────────
  function flightColor(vrate) {
    if (vrate == null) return COLOR_CRUISING;
    if (vrate > CLIMB_THRESHOLD) return COLOR_DEPARTING;
    if (vrate < DESCENT_THRESHOLD) return COLOR_ARRIVING;
    return COLOR_CRUISING;
  }

  function flightStatus(vrate) {
    if (vrate == null) return { label: "Cruising", cls: "status-cruise" };
    if (vrate > CLIMB_THRESHOLD) return { label: "Departing", cls: "status-depart" };
    if (vrate < DESCENT_THRESHOLD) return { label: "Arriving", cls: "status-arrive" };
    return { label: "Cruising", cls: "status-cruise" };
  }

  // ── AIRPORT PIN MARKERS ───────────────────────────────────────────────────
  function makePinSVG(label) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">' +
      '<defs>' +
      '<filter id="pin-shadow" x="-30%" y="-20%" width="160%" height="160%">' +
      '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>' +
      '</filter>' +
      '</defs>' +
      '<path d="M18 2 C9.163 2 2 9.163 2 18 C2 28 18 42 18 42 C18 42 34 28 34 18 C34 9.163 26.837 2 18 2 Z"' +
      ' fill="#002147" stroke="#001533" stroke-width="1.5" filter="url(#pin-shadow)"/>' +
      '<circle cx="18" cy="18" r="7" fill="white" opacity="0.92"/>' +
      '<text x="18" y="22" text-anchor="middle" font-size="5.5" font-family="monospace" font-weight="bold" fill="#002147">' +
      label +
      '</text>' +
      '</svg>'
    );
  }

  AIRPORTS.forEach(function (ap) {
    var pinIcon = L.divIcon({
      className: "",
      html: makePinSVG(ap.iata),
      iconSize: [36, 44],
      iconAnchor: [18, 44],
      popupAnchor: [0, -44],
    });
    L.marker([ap.lat, ap.lon], { icon: pinIcon })
      .addTo(map)
      .bindPopup(
        "<div class='blr-popup'>" +
        "<div class='blr-popup-title'>📍 " + ap.iata + "</div>" +
        "<table class='blr-popup-table'>" +
        "<tr><td>Airport</td><td><strong>" + ap.name + "</strong></td></tr>" +
        "<tr><td>Coordinates</td><td>" + ap.lat.toFixed(4) + "°N, " + ap.lon.toFixed(4) + "°E</td></tr>" +
        "<tr><td>Designation</td><td><span class='blr-badge badge-intl'>International</span></td></tr>" +
        "</table></div>",
        { maxWidth: 280 }
      );
  });

  // ── LEGEND ────────────────────────────────────────────────────────────────
  var legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    var div = L.DomUtil.create("div", "blr-legend");
    div.innerHTML =
      "<div class='blr-legend-title'>Flight Status</div>" +

      "<div class='blr-legend-row'>" +
      "<span class='blr-legend-dot' style='background:#1A7F4B'></span>" +
      "<span><strong>Arriving</strong> — descending</span>" +
      "</div>" +

      "<div class='blr-legend-row'>" +
      "<span class='blr-legend-dot' style='background:#B45309'></span>" +
      "<span><strong>Departing</strong> — climbing</span>" +
      "</div>" +

      "<div class='blr-legend-row'>" +
      "<span class='blr-legend-dot' style='background:#0057B8'></span>" +
      "<span><strong>Cruising</strong> — level flight</span>" +
      "</div>" +

      "<div class='blr-legend-row'>" +
      "<span class='blr-legend-dot' style='background:#002147'></span>" +
      "<span>International airport</span>" +
      "</div>" +

      "<div class='blr-legend-note'>" +
      "International airports of India only.<br>" +
      "Status inferred from vertical rate.<br>" +
      "Source: OpenSky Network · 15 s refresh." +
      "</div>";
    return div;
  };
  legend.addTo(map);

  // ── SVG TOP-VIEW PLANE ICON ───────────────────────────────────────────────
  function makePlaneSVG(color) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 100 100">' +
      '<g fill="' + color + '" stroke="rgba(0,0,0,0.3)" stroke-width="3">' +
      '<ellipse cx="50" cy="50" rx="7" ry="36"/>' +
      '<path d="M50 45 L10 65 L20 68 Z"/>' +
      '<path d="M50 45 L90 65 L80 68 Z"/>' +
      '<path d="M50 75 L30 90 L38 90 Z"/>' +
      '<path d="M50 75 L70 90 L62 90 Z"/>' +
      '<ellipse cx="50" cy="20" rx="4" ry="6" fill="rgba(255,255,255,0.4)" stroke="none"/>' +
      '</g>' +
      '</svg>'
    );
  }

  function makeAircraftIcon(heading, vrate) {
    var color = flightColor(vrate);
    var deg = heading != null ? heading : 0;
    return L.divIcon({
      className: "",
      html:
        '<div style="' +
        "transform:rotate(" + deg + "deg);" +
        "width:26px;height:26px;" +
        "filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));" +
        '">' +
        makePlaneSVG(color) +
        "</div>",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function toKnots(ms) { return ms != null ? Math.round(ms * 1.944) : null; }
  function toFeet(m) { return m != null ? Math.round(m * 3.281).toLocaleString() : null; }
  function timeNow() {
    return new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  function makePopup(s) {
    var callsign = s[1] ? s[1].trim() : "Unknown";
    var speed = toKnots(s[9]);
    var heading = s[10] != null ? Math.round(s[10]) : "N/A";
    var altitude = toFeet(s[7]);
    var vrate = s[11] != null ? Math.round(s[11]) : null;
    var country = s[2] || "—";
    var icao24 = s[0] ? s[0].toUpperCase() : "—";
    var status = flightStatus(vrate);
    var vrateStr = vrate != null
      ? (vrate > 0 ? "▲ +" : "▼ ") + vrate + " m/s"
      : "N/A";

    return (
      "<div class='blr-popup'>" +
      "<div class='blr-popup-title'>✈ " + callsign + "</div>" +
      "<table class='blr-popup-table'>" +
      "<tr><td>ICAO24</td><td><code>" + icao24 + "</code></td></tr>" +
      "<tr><td>Country</td><td>" + country + "</td></tr>" +
      "<tr><td>Status</td><td><span class='blr-badge " + status.cls + "'>" + status.label + "</span></td></tr>" +
      (speed != null ? "<tr><td>Speed</td><td>" + speed + " kts</td></tr>" : "") +
      (altitude != null ? "<tr><td>Altitude</td><td>" + altitude + " ft</td></tr>" : "") +
      "<tr><td>Heading</td><td>" + heading + "°</td></tr>" +
      "<tr><td>Vert. Rate</td><td>" + vrateStr + "</td></tr>" +
      "</table>" +
      "<div class='blr-popup-footer'>OpenSky Network · India Airspace · Live</div>" +
      "</div>"
    );
  }

  // ── FETCH & RENDER ────────────────────────────────────────────────────────
  function fetchAircraft() {
    var pollEl = document.getElementById("blr-poll-status");
    if (pollEl) pollEl.textContent = "⟳ Refreshing...";

    fetch(OPENSKY_URL)
      .then(function (res) {
        if (res.status === 429) { handleBackoff(); throw new Error("rate-limited"); }
        if (res.status === 401) { handleBackoff(); throw new Error("token-refreshing"); }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var states = data.states || [];
        var seen = {};

        states.forEach(function (s) {
          var icao24 = s[0];
          var lon = s[5];
          var lat = s[6];
          if (lat == null || lon == null) return;

          var heading = s[10];
          var vrate = s[11];
          seen[icao24] = true;

          if (markers[icao24]) {
            markers[icao24].setLatLng([lat, lon]);
            markers[icao24].setIcon(makeAircraftIcon(heading, vrate));
            markers[icao24].setPopupContent(makePopup(s));
          } else {
            markers[icao24] = L.marker([lat, lon], {
              icon: makeAircraftIcon(heading, vrate),
            })
              .bindPopup(makePopup(s), { maxWidth: 280 })
              .addTo(map);
          }
        });

        Object.keys(markers).forEach(function (id) {
          if (!seen[id]) { map.removeLayer(markers[id]); delete markers[id]; }
        });

        var count = Object.keys(markers).length;
        var countEl = document.getElementById("blr-aircraft-count");
        var updEl = document.getElementById("blr-last-updated");
        if (countEl) countEl.textContent = "✈ " + count + " aircraft tracked over India";
        if (updEl) updEl.textContent = "Updated " + timeNow();
        if (pollEl) pollEl.textContent = "";

        if (isBackingOff) { isBackingOff = false; resetPollInterval(POLL_INTERVAL_MS); }
      })
      .catch(function (err) {
        console.warn("[India ATC Map]", err.message);
        if (err.message !== "rate-limited") {
          var countEl = document.getElementById("blr-aircraft-count");
          if (countEl) countEl.textContent = "⚠ OpenSky unreachable — retrying...";
        }
        var pollEl = document.getElementById("blr-poll-status");
        if (pollEl) pollEl.textContent = "";
      });
  }

  function handleBackoff() {
    if (isBackingOff) return;
    isBackingOff = true;
    var countEl = document.getElementById("blr-aircraft-count");
    if (countEl) countEl.textContent = '⏳ Refreshing connection — retrying in 30s';
    resetPollInterval(BACKOFF_INTERVAL_MS);
  }

  function resetPollInterval(ms) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchAircraft, ms);
  }

  // ── TAB-AWARE STARTUP ─────────────────────────────────────────────────────
  var mapInitialized = false;

  function initMap() {
    if (mapInitialized) return;
    var el = document.getElementById("blr-map");
    if (el && el.offsetParent !== null) {
      mapInitialized = true;
      map.invalidateSize();
      fetchAircraft();
      pollTimer = setInterval(fetchAircraft, POLL_INTERVAL_MS);
    } else {
      setTimeout(initMap, 500);
    }
  }

  document.querySelectorAll(".tab-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (this.dataset && this.dataset.tab === "tab-blr-tracking") {
        setTimeout(function () {
          map.invalidateSize();
          if (!mapInitialized) {
            mapInitialized = true;
            fetchAircraft();
            pollTimer = setInterval(fetchAircraft, POLL_INTERVAL_MS);
          }
        }, 80);
      }
    });
  });

  initMap();

})();

(function () {

  // ── CONFIG ──────────────────────────────────────────
  var BOUNDING_BOX = [[6.0, 68.0], [24.0, 88.0]];

  var REGIONS = {
    region:  { latMin:6,  latMax:24, lonMin:68,  lonMax:88, label:'Indian Waters' },
    india:   { latMin:6,  latMax:24, lonMin:68,  lonMax:90,  label:'India Coast' },
    arabian: { latMin:8,  latMax:26, lonMin:55,  lonMax:78,  label:'Arabian Sea' },
    bay:     { latMin:5,  latMax:23, lonMin:78,  lonMax:100, label:'Bay of Bengal' },
    strait:  { latMin:0,  latMax:12, lonMin:95,  lonMax:106, label:'Malacca Strait' },
  };

  var VESSEL_COLORS = {
    cargo:    '#185FA5',
    tanker:   '#BA7517',
    passenger:'#3B6D11',
    fishing:  '#639922',
    military: '#A32D2D',
    other:    '#888780',
  };

  // AIS ShipType number → internal category
  function getVesselCategory(shipType) {
    if (shipType >= 70 && shipType <= 79) return 'cargo';
    if (shipType >= 80 && shipType <= 89) return 'tanker';
    if (shipType >= 60 && shipType <= 69) return 'passenger';
    if (shipType === 30 || shipType === 32 || shipType === 52) return 'fishing';
    if (shipType >= 35 && shipType <= 36) return 'military';
    return 'other';
  }

  var PORTS = [
    {name:'Mumbai',     lat:18.93, lon:72.83},
    {name:'JNPT',       lat:18.96, lon:72.95},
    {name:'Kochi',      lat:9.96,  lon:76.27},
    {name:'Chennai',    lat:13.10, lon:80.29},
    {name:'Vizag',      lat:17.69, lon:83.27},
    {name:'Kolkata',    lat:22.57, lon:88.35},
    {name:'Paradip',    lat:20.25, lon:86.63},
    {name:'Kandla',     lat:23.01, lon:70.22},
    {name:'Mangaluru',  lat:12.90, lon:74.81},
    {name:'Tuticorin',  lat:8.79,  lon:78.16},
    {name:'Karachi',    lat:24.86, lon:67.01},
    {name:'Colombo',    lat:6.93,  lon:79.86},
    {name:'Chittagong', lat:22.33, lon:91.83},
    {name:'Yangon',     lat:16.85, lon:96.17},
    {name:'Muscat',     lat:23.62, lon:58.59},
    {name:'Dubai',      lat:25.07, lon:55.14},
    {name:'Jebel Ali',  lat:24.99, lon:55.06},
    {name:'Singapore',  lat:1.26,  lon:103.82},
    {name:'Port Klang', lat:3.0,   lon:101.4},
    {name:'Malé',       lat:4.17,  lon:73.51},
  ];

  // ── STATE ────────────────────────────────────────────
  var map = null;
  var markers = {};        // mmsi → Leaflet marker
  var vessels = {};        // mmsi → vessel data object
  var wsocket = null;
  var currentRegion = REGIONS.region;
  var isInitialized = false;
  var wsRetryTimer = null;
  var wsRetryCount = 0;

  // ── INIT (called when tab is opened) ─────────────────
  window.initMarineMap = function () {
    startMvClock();
  };

  window.stopMarineMap = function () {
    if (mvClockTimer) {
      clearInterval(mvClockTimer);
      mvClockTimer = null;
    }
  };

  var mvClockTimer = null;

  function startMvClock() {
    function tick() {
      var d = new Date();
      var cl = document.getElementById('mv-clock');
      var dl = document.getElementById('mv-date');
      var up = document.getElementById('mv-upd');
      if (cl) cl.textContent = d.toLocaleTimeString('en-IN', {
        hour:'2-digit', minute:'2-digit', second:'2-digit',
        timeZone: 'Asia/Kolkata',
      });
      if (dl) dl.textContent = d.toLocaleDateString('en-IN', {
        weekday:'short', day:'numeric', month:'short',
        timeZone: 'Asia/Kolkata',
      }) + ' IST';
      if (up) up.textContent = 'Updated ' + d.toLocaleTimeString('en-IN', {
        hour:'2-digit', minute:'2-digit',
        timeZone: 'Asia/Kolkata',
      });
    }
    tick();
    mvClockTimer = setInterval(tick, 1000);
  }

  // ── BUILD HTML LAYOUT ────────────────────────────────
  function buildLayout() {
    var wrap = document.getElementById('marine-wrap');
    if (!wrap) return;
    wrap.innerHTML =

      // Header
      '<div id="mv-header" style="background:#003366;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        +'<div>'
          +'<div style="font-size:14px;font-weight:500;color:#fff">Indian Waters — Marine Traffic</div>'
          +'<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px">India · Pakistan · Sri Lanka · Bangladesh · Myanmar · Gulf · Arabian Sea · Bay of Bengal</div>'
          +'<div style="display:flex;align-items:center;gap:5px;margin-top:4px">'
            +'<div id="mv-wsdot" class="error" style="width:7px;height:7px;border-radius:50%"></div>'
            +'<div id="mv-wsstat" style="font-size:10px;color:rgba(255,255,255,0.6)">Connecting...</div>'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">'
          +'<div id="mv-clock" style="font-size:16px;font-weight:500;color:#fff;font-family:monospace">--:--:--</div>'
          +'<div id="mv-date" style="font-size:10px;color:rgba(255,255,255,0.5)">--</div>'
        +'</div>'
      +'</div>'

      // Stats bar
      +'<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border-bottom:0.5px solid #d0d9e8">'
        +statCell('mv-s-total','0','Vessels')
        +statCell('mv-s-cargo','0','Cargo','#0C447C')
        +statCell('mv-s-tanker','0','Tankers','#633806')
        +statCell('mv-s-pass','0','Passenger','#27500A')
        +statCell('mv-s-fishing','0','Fishing','#5F5E5A')
        +statCell('mv-s-other','0','Other','#5F5E5A')
      +'</div>'

      // Region controls
      +'<div id="mv-ctrl" style="padding:8px 14px;border-bottom:0.5px solid #d0d9e8;background:#f0f4f9;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        +'<span style="font-size:11px;color:#6b7a8d">Region:</span>'
        +'<button class="mv-rb mv-on" onclick="mvSetRegion(this,\'region\')">Indian Waters</button>'
        +'<button class="mv-rb" onclick="mvSetRegion(this,\'india\')">India Coast</button>'
        +'<button class="mv-rb" onclick="mvSetRegion(this,\'arabian\')">Arabian Sea</button>'
        +'<button class="mv-rb" onclick="mvSetRegion(this,\'bay\')">Bay of Bengal</button>'
        +'<button class="mv-rb" onclick="mvSetRegion(this,\'strait\')">Malacca Strait</button>'
        +'<div style="margin-left:auto;font-size:11px;color:#9aa5b4;font-family:monospace" id="mv-upd">—</div>'
      +'</div>'

      // Map + side panel
      +'<div style="display:grid;grid-template-columns:1fr 290px">'
        +'<div id="mv-map" style="height:540px;z-index:1"></div>'
        +'<div style="border-left:0.5px solid #d0d9e8;display:flex;flex-direction:column;max-height:540px">'
          +'<div style="padding:10px 14px;border-bottom:0.5px solid #d0d9e8;font-size:12px;font-weight:500;color:#1a1a2e;background:#f0f4f9;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">'
            +'Vessels <span id="mv-vcount" style="font-size:10px;color:#9aa5b4;font-family:monospace">0 tracked</span>'
          +'</div>'
          +'<div id="mv-vlist" style="overflow-y:auto;flex:1;font-size:11px"></div>'
          +'<div id="mv-vdetail" style="display:none;padding:12px 14px;border-top:0.5px solid #d0d9e8;background:#f0f4f9;flex-shrink:0">'
            +'<div style="font-size:10px;font-weight:500;color:#003366;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Vessel details</div>'
            +'<div id="mv-detgrid" style="display:grid;grid-template-columns:1fr 1fr;gap:5px"></div>'
          +'</div>'
        +'</div>'
      +'</div>'

      // Legend
      +'<div style="padding:8px 16px;background:#fff;border-top:0.5px solid #d0d9e8;display:flex;gap:14px;flex-wrap:wrap;align-items:center">'
        +legItem('#185FA5','Cargo')
        +legItem('#BA7517','Tanker')
        +legItem('#3B6D11','Passenger')
        +legItem('#639922','Fishing')
        +legItem('#A32D2D','Military')
        +legItem('#888780','Other')
        +legItem('#A32D2D','Port','square')
        +'<div style="margin-left:auto;font-size:10px;color:#9aa5b4">Terrestrial AIS · Coverage strongest near ports · Open ocean gaps expected</div>'
      +'</div>';

    addScopedStyles();
  }

  function statCell(id, val, lbl, color) {
    return '<div style="padding:9px 12px;border-right:0.5px solid #d0d9e8;background:#fff">'
      +'<div id="'+id+'" style="font-size:18px;font-weight:500;font-family:monospace;'+(color?'color:'+color:'color:#1a1a2e')+'">'+val+'</div>'
      +'<div style="font-size:10px;color:#6b7a8d;text-transform:uppercase;letter-spacing:0.4px;margin-top:1px">'+lbl+'</div>'
      +'</div>';
  }

  function legItem(color, label, shape) {
    var dot = shape === 'square'
      ? '<div style="width:10px;height:10px;border-radius:2px;background:'+color+';flex-shrink:0"></div>'
      : '<div style="width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0"></div>';
    return '<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#5f6b7a">'+dot+label+'</div>';
  }

  function addScopedStyles() {
    if (document.getElementById('mv-styles')) return;
    var s = document.createElement('style');
    s.id = 'mv-styles';
    s.textContent =
      '.mv-rb{padding:4px 11px;border-radius:20px;font-size:11px;cursor:pointer;border:0.5px solid #b0bcd0;background:transparent;color:#5f6b7a;font-family:monospace;transition:all 0.12s}'
      +'.mv-rb:hover{background:#e8f0f8;color:#003366}'
      +'.mv-on{background:#003366!important;color:#fff!important;border-color:#003366!important}'
      +'.mv-vr{padding:9px 12px;border-bottom:0.5px solid #e4eaf2;cursor:pointer;transition:background 0.1s}'
      +'.mv-vr:hover{background:#f0f4f9}'
      +'.mv-vr.mv-sel{background:#E6F1FB}'
      +'@keyframes mv-pulse{0%,100%{opacity:1}50%{opacity:0.3}}'
      +'#mv-wsdot.connected{background:#4ade80;animation:mv-pulse 2s infinite}'
      +'#mv-wsdot.connecting{background:#facc15}'
      +'#mv-wsdot.error{background:#ef4444}';
    document.head.appendChild(s);
  }

  // ── LEAFLET MAP ──────────────────────────────────────
  function initLeaflet() {
    if (map) return;
    map = L.map('mv-map', {
      center: [15.0, 80.0],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 14,
    }).addTo(map);

    PORTS.forEach(function (p) {
      var icon = L.divIcon({
        className: '',
        html: '<div style="width:8px;height:8px;border-radius:2px;background:#A32D2D;border:1px solid #791F1F"></div>',
        iconAnchor: [4, 4],
      });
      L.marker([p.lat, p.lon], { icon: icon })
        .addTo(map)
        .bindTooltip(p.name, { permanent: false, className: 'mv-port-tip', direction: 'top' });
    });
  }

  // ── VESSEL ICON ──────────────────────────────────────
  function makeVesselIcon(category, heading, isSelected) {
    var color = isSelected
      ? '#003366'
      : (VESSEL_COLORS[category] || '#888780');
    var hdg = (heading != null && heading !== 511) ? heading : 0;
    var size = isSelected ? 32 : 24;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg"'
      + ' width="' + size + '" height="' + size + '"'
      + ' viewBox="0 0 14 14">'
      + '<polygon points="7,0 13,14 7,10 1,14"'
      + ' fill="' + color + '"'
      + ' stroke="#fff"'
      + ' stroke-width="1"'
      + ' transform="rotate(' + hdg + ', 7, 7)"/>'
      + '</svg>';

    return L.divIcon({
      className: '',
      html: svg,
      iconSize:   [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor:[0, -size/2],
    });
  }

  // ── POPUP HTML ───────────────────────────────────────
  function makePopup(v) {
    var cat = getVesselCategory(v.shipType || 0);
    var color = VESSEL_COLORS[cat] || '#888780';
    return '<div style="font-family:monospace;font-size:11px;min-width:180px">'
      + '<div style="font-size:13px;font-weight:500;color:#003366;margin-bottom:6px;border-bottom:0.5px solid #d0d9e8;padding-bottom:5px">'
      +   (v.shipName || 'Unknown Vessel')
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse">'
      + popRow('MMSI',    v.mmsi || '—')
      + popRow('Type',    '<span style="color:'+color+'">'+(cat.charAt(0).toUpperCase()+cat.slice(1))+'</span>')
      + popRow('Speed',   v.sog != null ? v.sog.toFixed(1)+' kts' : '—')
      + popRow('Heading', v.trueHeading != null ? v.trueHeading+'°' : '—')
      + popRow('Status',  navStatus(v.navStatus))
      + popRow('Flag',    v.flag || '—')
      + popRow('Dest.',   v.destination || '—')
      + '</table>'
      + '<div style="font-size:9px;color:#9aa5b4;margin-top:6px;text-align:right">aisstream.io · Live</div>'
      + '</div>';
  }

  function popRow(label, val) {
    return '<tr>'
      + '<td style="color:#9aa5b4;padding:2px 0;width:60px">'+label+'</td>'
      + '<td style="color:#1a1a2e;padding:2px 0">'+val+'</td>'
      + '</tr>';
  }

  function navStatus(code) {
    var map = {
      0:'Underway',1:'Anchored',2:'Not under command',3:'Restricted manoeuvring',
      5:'Moored',7:'Fishing',8:'Sailing',15:'Unknown',
    };
    return map[code] || 'Unknown';
  }

  // ── WEBSOCKET ────────────────────────────────────────
  function connectWs() {
    if (wsocket) { wsocket.close(); wsocket = null; }
    setWsStatus('connecting', 'Connecting...');

    wsocket = new WebSocket('ws://localhost:8765');

    wsocket.onopen = function () {
      setWsStatus('connected', 'Live · aisstream.io');
      wsRetryCount = 0;
      console.log('[MarineMap] Connected to local proxy');
    };

  wsocket.onmessage = function (event) {
    var data = event.data;

    // Handle both Blob and string responses from proxy
    if (data instanceof Blob) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var msg = JSON.parse(reader.result);
          handleMessage(msg);
        } catch (e) {
          console.warn('[MarineMap] Parse error:', e);
        }
      };
      reader.readAsText(data);
    } else {
      try {
        var msg = JSON.parse(data);
        handleMessage(msg);
      } catch (e) {
        console.warn('[MarineMap] Parse error:', e);
      }
    }
  };

    wsocket.onerror = function () {
      setWsStatus('error', 'Connection error');
    };

    wsocket.onclose = function (event) {
      console.error('[MarineMap] WS closed. Code:', event.code, 'Reason:', event.reason);
      setWsStatus('error', 'Closed: ' + event.code);
      if (wsRetryCount < 5) {
        wsRetryCount++;
        var delay = Math.min(5000 * wsRetryCount, 30000);
        wsRetryTimer = setTimeout(function () {
          connectWs();
        }, delay);
      }
    };
  }

  function setWsStatus(state, text) {
    var dot = document.getElementById('mv-wsdot');
    var sta = document.getElementById('mv-wsstat');
    if (dot) { dot.className = ''; dot.classList.add(state); }
    if (sta) sta.textContent = text;
  }

  // ── HANDLE INCOMING AIS MESSAGE ──────────────────────
  function handleMessage(msg) {
    var meta = msg.MetaData || {};
    var mmsi = String(meta.MMSI || '');
    if (!mmsi) return;

    var msgType = msg.MessageType;

    if (msgType === 'PositionReport') {
      var pos = (msg.Message || {}).PositionReport || {};
      var lat = pos.Latitude;
      var lon = pos.Longitude;
      if (lat == null || lon == null) return;
      if (lat === 0 && lon === 0) return;

      vessels[mmsi] = vessels[mmsi] || { mmsi: mmsi };
      vessels[mmsi].lat        = lat;
      vessels[mmsi].lon        = lon;
      vessels[mmsi].sog        = pos.Sog;
      vessels[mmsi].trueHeading= pos.TrueHeading !== 511 ? pos.TrueHeading : pos.Cog;
      vessels[mmsi].navStatus  = pos.NavigationalStatus;
      vessels[mmsi].lastSeen   = Date.now();
      vessels[mmsi].shipName   = vessels[mmsi].shipName || meta.ShipName || '';

      updateMarker(mmsi);
      updateStats();
      updateSideList();
      updateUpdTime();
    }

    if (msgType === 'ShipStaticData') {
      var sd = (msg.Message || {}).ShipStaticData || {};
      vessels[mmsi] = vessels[mmsi] || { mmsi: mmsi };
      vessels[mmsi].shipName   = (sd.Name || meta.ShipName || '').trim();
      vessels[mmsi].shipType   = sd.Type;
      vessels[mmsi].flag       = meta.flag || '';
      vessels[mmsi].imo        = sd.ImoNumber || '';
      vessels[mmsi].destination= (sd.Destination || '').trim();
      vessels[mmsi].length     = (sd.Dimension || {}).A + (sd.Dimension || {}).B || null;
      if (markers[mmsi]) {
        var cat = getVesselCategory(vessels[mmsi].shipType || 0);
        markers[mmsi].setIcon(makeVesselIcon(cat, vessels[mmsi].trueHeading, false));
        markers[mmsi].setPopupContent(makePopup(vessels[mmsi]));
      }
    }
  }

  // ── UPDATE / CREATE MARKER ───────────────────────────
  function updateMarker(mmsi) {
    var v = vessels[mmsi];
    if (!v || v.lat == null) return;
    var cat = getVesselCategory(v.shipType || 0);
    var isSel = selectedMmsi === mmsi;

    if (markers[mmsi]) {
      markers[mmsi].setLatLng([v.lat, v.lon]);
      markers[mmsi].setIcon(makeVesselIcon(cat, v.trueHeading, isSel));
    } else {
      var m = L.marker([v.lat, v.lon], {
        icon: makeVesselIcon(cat, v.trueHeading, isSel),
      }).addTo(map);
      m.bindPopup(makePopup(v), { maxWidth: 220 });
      m.on('click', function () { selectVessel(mmsi); });
      markers[mmsi] = m;
    }

    // Remove stale vessels older than 10 minutes
    var now = Date.now();
    Object.keys(vessels).forEach(function (id) {
      if (vessels[id].lastSeen && now - vessels[id].lastSeen > 600000) {
        if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
        delete vessels[id];
      }
    });
  }

  // ── SELECTED VESSEL ──────────────────────────────────
  var selectedMmsi = null;

  function selectVessel(mmsi) {
    selectedMmsi = mmsi;
    var v = vessels[mmsi];
    var det = document.getElementById('mv-vdetail');
    var dg = document.getElementById('mv-detgrid');
    if (!v || !det || !dg) return;

    det.style.display = 'block';
    var cat = getVesselCategory(v.shipType || 0);
    var fields = [
      { l:'Name',     v: v.shipName   || '—' },
      { l:'MMSI',     v: v.mmsi       || '—' },
      { l:'IMO',      v: v.imo        || '—' },
      { l:'Flag',     v: v.flag       || '—' },
      { l:'Type',     v: cat.charAt(0).toUpperCase()+cat.slice(1) },
      { l:'Length',   v: v.length     ? v.length+'m'  : '—' },
      { l:'Speed',    v: v.sog        != null ? v.sog.toFixed(1)+' kts' : '—' },
      { l:'Heading',  v: v.trueHeading!= null ? v.trueHeading+'°' : '—' },
      { l:'Status',   v: navStatus(v.navStatus) },
      { l:'Dest.',    v: v.destination || '—' },
    ];
    dg.innerHTML = fields.map(function (f) {
      return '<div>'
        + '<div style="font-size:9px;color:#9aa5b4;text-transform:uppercase;letter-spacing:0.4px">'+f.l+'</div>'
        + '<div style="font-size:11px;color:#1a1a2e;font-family:monospace;margin-top:1px">'+f.v+'</div>'
        + '</div>';
    }).join('');

    // Refresh marker icon to show selected state
    if (markers[mmsi]) {
      markers[mmsi].setIcon(makeVesselIcon(cat, v.trueHeading, true));
      markers[mmsi].openPopup();
    }
    updateSideList();
  }

  // ── STATS BAR ────────────────────────────────────────
  function updateStats() {
    var vs = Object.values(vessels);
    var cats = { cargo:0, tanker:0, passenger:0, fishing:0, military:0, other:0 };
    vs.forEach(function (v) { var c = getVesselCategory(v.shipType||0); cats[c]=(cats[c]||0)+1; });
    var sv = function(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; };
    sv('mv-s-total',  vs.length);
    sv('mv-s-cargo',  cats.cargo);
    sv('mv-s-tanker', cats.tanker);
    sv('mv-s-pass',   cats.passenger);
    sv('mv-s-fishing',cats.fishing);
    sv('mv-s-other',  (cats.military||0)+(cats.other||0));
  }

  // ── SIDE VESSEL LIST ─────────────────────────────────
  function updateSideList() {
    var vs = Object.values(vessels)
      .filter(function (v) { return v.lat != null; })
      .sort(function (a, b) { return (b.lastSeen||0)-(a.lastSeen||0); });

    var cnt = document.getElementById('mv-vcount');
    if (cnt) cnt.textContent = vs.length + ' tracked';

    var list = document.getElementById('mv-vlist');
    if (!list) return;

    list.innerHTML = vs.slice(0, 50).map(function (v) {
      var cat = getVesselCategory(v.shipType||0);
      var col = VESSEL_COLORS[cat]||'#888780';
      var lbl = cat.charAt(0).toUpperCase()+cat.slice(1);
      var isSel = selectedMmsi === v.mmsi;
      var name = (v.shipName||v.mmsi||'Unknown').trim();
      return '<div class="mv-vr'+(isSel?' mv-sel':'')+'" onclick="mvSelectVessel(\''+v.mmsi+'\')">'
        +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">'
          +'<div style="width:7px;height:7px;border-radius:50%;background:'+col+';flex-shrink:0"></div>'
          +'<div style="font-size:11px;font-weight:500;color:#1a1a2e;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:155px">'+name+'</div>'
          +'<div style="font-size:9px;padding:1px 5px;border-radius:3px;font-weight:500;background:'+col+'22;color:'+col+';flex-shrink:0">'+lbl+'</div>'
        +'</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px">'
          +'<div style="font-size:10px;color:#9aa5b4">Spd: <span style="color:#5f6b7a;font-family:monospace">'+(v.sog!=null?v.sog.toFixed(1)+'kt':'—')+'</span></div>'
          +'<div style="font-size:10px;color:#9aa5b4">Hdg: <span style="color:#5f6b7a;font-family:monospace">'+(v.trueHeading!=null?v.trueHeading+'°':'—')+'</span></div>'
          +'<div style="font-size:10px;color:#9aa5b4">MMSI: <span style="color:#5f6b7a;font-family:monospace">'+v.mmsi+'</span></div>'
          +'<div style="font-size:10px;color:#9aa5b4"><span style="color:#5f6b7a">'+navStatus(v.navStatus).slice(0,10)+'</span></div>'
        +'</div>'
        +'</div>';
    }).join('') || '<div style="padding:20px;text-align:center;color:#9aa5b4;font-size:12px">Waiting for vessel data...</div>';
  }

  // Expose for onclick
  window.mvSelectVessel = selectVessel;

  // ── REGION SWITCHER ──────────────────────────────────
  window.mvSetRegion = function (btn, key) {
    currentRegion = REGIONS[key];
    document.querySelectorAll('.mv-rb').forEach(function (b) { b.classList.remove('mv-on'); });
    btn.classList.add('mv-on');
    if (map) {
      var r = currentRegion;
      var clat = (r.latMin + r.latMax) / 2;
      var clon = (r.lonMin + r.lonMax) / 2;
      var latSpan = r.latMax - r.latMin;
      var zoom = latSpan > 20 ? 4 : latSpan > 12 ? 5 : 6;
      map.setView([clat, clon], zoom);
    }
  };

  // ── CLOCK ────────────────────────────────────────────
  function startClock() {
    function tick() {
      var d = new Date();
      var cl = document.getElementById('mv-clock');
      var dl = document.getElementById('mv-date');
      if (cl) cl.textContent = d.toLocaleTimeString('en-IN', {
        hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'Asia/Kolkata'
      });
      if (dl) dl.textContent = d.toLocaleDateString('en-IN', {
        weekday:'short', day:'numeric', month:'short', timeZone:'Asia/Kolkata'
      }) + ' IST';
    }
    tick();
    setInterval(tick, 1000);
  }

  function updateUpdTime() {
    var el = document.getElementById('mv-upd');
    if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', {
      hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata'
    });
  }

})();

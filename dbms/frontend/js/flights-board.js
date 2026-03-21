(function() {

  var REFRESH_MS  = 300000;
  var activeFilters = [];
  var currentAirport = 'BLR';
  var countdown = 300;
  var clockTimer = null;
  var refreshTimer = null;

  var IATA_CITY_MAP = {
    'BLR':'Bengaluru',    'BOM':'Mumbai',         'DEL':'New Delhi',
    'MAA':'Chennai',      'CCU':'Kolkata',         'HYD':'Hyderabad',
    'COK':'Kochi',        'AMD':'Ahmedabad',        'GOI':'Goa',
    'COI':'Goa',          'CCJ':'Kozhikode',        'TRV':'Thiruvananthapuram',
    'IXE':'Mangaluru',    'NAG':'Nagpur',           'PNQ':'Pune',
    'LKO':'Lucknow',      'ATQ':'Amritsar',         'JAI':'Jaipur',
    'GAU':'Guwahati',     'IXC':'Chandigarh',       'PAT':'Patna',
    'VNS':'Varanasi',     'IXB':'Bagdogra',         'BDQ':'Vadodara',
    'IDR':'Indore',       'STV':'Surat',            'TRZ':'Tiruchirappalli',
    'IXZ':'Port Blair',   'IXM':'Madurai',          'RPR':'Raipur',
    'DXB':'Dubai',        'DOH':'Doha',             'AUH':'Abu Dhabi',
    'MCT':'Muscat',       'BAH':'Bahrain',          'KWI':'Kuwait City',
    'RUH':'Riyadh',       'JED':'Jeddah',           'AMM':'Amman',
    'BEY':'Beirut',       'CAI':'Cairo',            'ADD':'Addis Ababa',
    'NBO':'Nairobi',      'JNB':'Johannesburg',     'CPT':'Cape Town',
    'SIN':'Singapore',    'KUL':'Kuala Lumpur',     'BKK':'Bangkok',
    'HKG':'Hong Kong',    'NRT':'Tokyo',            'HND':'Tokyo',
    'ICN':'Seoul',        'PEK':'Beijing',          'PVG':'Shanghai',
    'SYD':'Sydney',       'MEL':'Melbourne',        'BNE':'Brisbane',
    'AKL':'Auckland',     'CMB':'Colombo',          'MLE':'Malé',
    'KTM':'Kathmandu',    'DAC':'Dhaka',            'KHI':'Karachi',
    'LHE':'Lahore',       'ISB':'Islamabad',        'LHR':'London',
    'LGW':'London',       'STN':'London',           'CDG':'Paris',
    'ORY':'Paris',        'FRA':'Frankfurt',         'MUC':'Munich',
    'AMS':'Amsterdam',    'BRU':'Brussels',          'ZRH':'Zurich',
    'VIE':'Vienna',       'FCO':'Rome',             'MXP':'Milan',
    'MAD':'Madrid',       'BCN':'Barcelona',         'LIS':'Lisbon',
    'CPH':'Copenhagen',   'ARN':'Stockholm',         'HEL':'Helsinki',
    'OSL':'Oslo',         'IST':'Istanbul',          'SAW':'Istanbul',
    'ATH':'Athens',       'WAW':'Warsaw',            'PRG':'Prague',
    'BUD':'Budapest',     'JFK':'New York',          'EWR':'New York',
    'LGA':'New York',     'ORD':'Chicago',           'LAX':'Los Angeles',
    'SFO':'San Francisco','MIA':'Miami',             'DFW':'Dallas',
    'ATL':'Atlanta',      'BOS':'Boston',            'SEA':'Seattle',
    'YYZ':'Toronto',      'YVR':'Vancouver',         'YUL':'Montreal',
    'GRU':'São Paulo',    'GIG':'Rio de Janeiro',    'EZE':'Buenos Aires',
    'BOG':'Bogotá',       'MEX':'Mexico City',       'CUN':'Cancún',
  };

  var AIRPORT_SHORT_NAMES = {
    'BLR':'Kempegowda Intl',
    'BOM':'Chhatrapati Shivaji Maharaj Intl',
    'DEL':'Indira Gandhi Intl',
    'MAA':'Chennai Intl',
    'CCU':'Netaji Subhas Chandra Bose Intl',
    'HYD':'Rajiv Gandhi Intl',
    'COK':'Cochin Intl',
    'AMD':'Sardar Vallabhbhai Patel Intl',
    'GOI':'Goa Intl (Dabolim)',
    'COI':'Manohar Intl (New Goa)',
    'CCJ':'Calicut Intl',
    'TRV':'Trivandrum Intl',
    'IXE':'Mangaluru Intl',
    'NAG':'Dr. Babasaheb Ambedkar Intl',
    'PNQ':'Pune Intl',
    'LKO':'Chaudhary Charan Singh Intl',
    'ATQ':'Sri Guru Ram Dass Jee Intl',
    'JAI':'Jaipur Intl',
    'GAU':'Lokpriya Gopinath Bordoloi Intl',
    'IXC':'Chandigarh Intl',
    'PAT':'Lok Nayak Jayaprakash',
    'VNS':'Lal Bahadur Shastri Intl',
    'IXB':'Bagdogra',
    'BDQ':'Vadodara',
    'IDR':'Devi Ahilyabai Holkar Intl',
    'STV':'Surat',
    'TRZ':'Tiruchirappalli Intl',
    'IXZ':'Veer Savarkar Intl',
    'IXM':'Madurai',
    'RPR':'Swami Vivekananda',
  };

  function cityLabel(obj, selectedAirport) {
    obj = obj || {};
    var iata    = (obj.iata    || '').trim().toUpperCase();
    var apiCity = (obj.city    || '').trim();
    var country = (obj.country || '').trim();

    // Rule 5: home airport — use short name map, never full API string
    if (iata && iata === (selectedAirport || '').toUpperCase()) {
      var shortName = AIRPORT_SHORT_NAMES[iata] || iata;
      var homeCity  = IATA_CITY_MAP[iata] || '';
      return {
        main: shortName + ' (' + iata + ')',
        sub:  homeCity,
      };
    }

    // Priority: our local city map first, then API city field
    var city = (iata && IATA_CITY_MAP[iata]) || apiCity;

    // Rule 1: city + IATA both present
    if (city && iata) {
      return { main: city + ' (' + iata + ')', sub: country };
    }

    // Rule 2: city missing, country + IATA present
    if (!city && iata && country) {
      return { main: country + ' (' + iata + ')', sub: iata };
    }

    // Rule 3: only IATA
    if (!city && iata) {
      return { main: iata, sub: '' };
    }

    // Rule 4: nothing useful
    return { main: '—', sub: '' };
  }

  var AIRPORTS = [
    {iata:'BLR',city:'Bengaluru',     name:'Kempegowda International Airport'},
    {iata:'BOM',city:'Mumbai',        name:'Chhatrapati Shivaji Maharaj Intl'},
    {iata:'DEL',city:'New Delhi',     name:'Indira Gandhi International Airport'},
    {iata:'MAA',city:'Chennai',       name:'Chennai International Airport'},
    {iata:'CCU',city:'Kolkata',       name:'Netaji Subhas Chandra Bose Intl'},
    {iata:'HYD',city:'Hyderabad',     name:'Rajiv Gandhi International Airport'},
    {iata:'COK',city:'Kochi',         name:'Cochin International Airport'},
    {iata:'AMD',city:'Ahmedabad',     name:'Sardar Vallabhbhai Patel Intl'},
    {iata:'GOI',city:'Goa',           name:'Goa International Airport (Dabolim)'},
    {iata:'COI',city:'Goa',           name:'Manohar International (New Goa)'},
    {iata:'CCJ',city:'Kozhikode',     name:'Calicut International Airport'},
    {iata:'TRV',city:'Thiruvananthapuram','name':'Trivandrum International Airport'},
    {iata:'IXE',city:'Mangaluru',     name:'Mangaluru International Airport'},
    {iata:'NAG',city:'Nagpur',        name:'Dr. Babasaheb Ambedkar International'},
    {iata:'PNQ',city:'Pune',          name:'Pune International Airport'},
    {iata:'LKO',city:'Lucknow',       name:'Chaudhary Charan Singh International'},
    {iata:'ATQ',city:'Amritsar',      name:'Sri Guru Ram Dass Jee International'},
    {iata:'JAI',city:'Jaipur',        name:'Jaipur International Airport'},
    {iata:'GAU',city:'Guwahati',      name:'Lokpriya Gopinath Bordoloi Intl'},
    {iata:'IXC',city:'Chandigarh',    name:'Chandigarh International Airport'},
    {iata:'PAT',city:'Patna',         name:'Lok Nayak Jayaprakash Airport'},
    {iata:'VNS',city:'Varanasi',      name:'Lal Bahadur Shastri International'},
    {iata:'IXB',city:'Bagdogra',      name:'Bagdogra Airport'},
    {iata:'BDQ',city:'Vadodara',      name:'Vadodara Airport'},
    {iata:'IDR',city:'Indore',        name:'Devi Ahilyabai Holkar International'},
    {iata:'STV',city:'Surat',         name:'Surat Airport'},
    {iata:'TRZ',city:'Tiruchirappalli','name':'Tiruchirappalli International'},
    {iata:'IXZ',city:'Port Blair',    name:'Veer Savarkar International'},
    {iata:'IXM',city:'Madurai',       name:'Madurai Airport'},
    {iata:'RPR',city:'Raipur',        name:'Swami Vivekananda Airport'},
  ];

  // ── Populate airport dropdown ────────────────
  function populateAirportSelector() {
    var sel = document.getElementById('fb-airport-sel');
    if (!sel) return;
    sel.innerHTML = AIRPORTS.map(function(a) {
      return '<option value="'+a.iata+'"'+(a.iata===currentAirport?' selected':'')+'>'+
        a.city+' — '+a.name+' ('+a.iata+')</option>';
    }).join('');
  }

  // ── Change airport ────────────────────────────
  window.fbChangeAirport = function(iata) {
    currentAirport = iata;
    var ap = AIRPORTS.find(function(a){return a.iata===iata;}) || {};
    var el = document.getElementById('fb-iata');
    var en = document.getElementById('fb-airport-name');
    var ec = document.getElementById('fb-airport-city');
    if (el) el.textContent = iata;
    if (en) en.textContent = ap.name || iata;
    if (ec) ec.textContent = (ap.city||'') + ' — India';
    fbLoadFlights();
  };

  // ── Filter toggles ────────────────────────────
  window.fbToggleFilter = function(btn, f) {
    if (btn.classList.contains('fb-filter-on')) {
      activeFilters = activeFilters.filter(function(x){ return x !== f; });
      btn.classList.remove('fb-filter-on');
    } else {
      activeFilters.push(f);
      btn.classList.add('fb-filter-on');
    }
    fbRenderTable();
  };

  // ── Status badge ──────────────────────────────
  function statusBadge(raw, delay) {
    var s = (raw||'').toLowerCase().trim();
    if ((s==='active'||s==='scheduled') && delay > 0) s = 'delayed';
    var map = {
      'active':    ['En Route',   'fb-b-enroute'],
      'landed':    ['Landed',     'fb-b-landed'],
      'boarding':  ['Boarding',   'fb-b-boarding'],
      'delayed':   ['Delayed',    'fb-b-delayed'],
      'scheduled': ['Scheduled',  'fb-b-scheduled'],
      'cancelled': ['Cancelled',  'fb-b-cancelled'],
    };
    var v = map[s] || [raw||'—', 'fb-b-scheduled'];
    return '<span class="fb-badge '+v[1]+'">'+v[0]+'</span>';
  }

  // ── Delay pill ────────────────────────────────
  function delayPill(d) {
    if (!d || d <= 0)
      return '<span style="color:#9aa5b4">—</span>';
    return '<span style="display:inline-block;padding:1px 6px;border-radius:3px;'+
      'font-size:10px;font-family:monospace;background:#FAEEDA;color:#633806">+'+d+'m</span>';
  }

  // ── Format ISO time to HH:MM IST ─────────────
  function formatTime(iso) {
    if (!iso || iso === '—') return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('en-IN', {
        hour:'2-digit', minute:'2-digit',
        timeZone:'Asia/Kolkata',
      });
    } catch(e) { return '—'; }
  }

  // ── Render table with current data ───────────
  var _allFlights = [];

  window.fbRenderTable = function() {
    var q = (document.getElementById('fb-search').value||'').toLowerCase();
    var data = _allFlights.filter(function(f) {
      var dir = f._dir;
      var status = (f.flight_status||'').toLowerCase();
      var depDelay = ((f.departure||{}).delay||0);
      var arrDelay = ((f.arrival||{}).delay||0);
      var hasDelay = depDelay > 0 || arrDelay > 0;
      
      var noFilter = activeFilters.length === 0;
      var matchFilter = noFilter ||
        (activeFilters.includes('delayed')   && hasDelay) ||
        (activeFilters.includes('enroute')   && status === 'active') ||
        (activeFilters.includes('landed')    && status === 'landed') ||
        (activeFilters.includes('boarding')  && status === 'boarding') ||
        (activeFilters.includes('cancelled') && status === 'cancelled');

      if (!matchFilter) return false;
      if (!q) return true;

      var dep = f.departure || {};
      var arr = f.arrival   || {};
      var fn  = ((f.flight||{}).iata||'').toLowerCase();
      var al  = ((f.airline||{}).name||'').toLowerCase();
      return fn.includes(q)||al.includes(q)||
        (dep.city||'').toLowerCase().includes(q)||
        (arr.city||'').toLowerCase().includes(q)||
        (dep.country||'').toLowerCase().includes(q)||
        (arr.country||'').toLowerCase().includes(q);
    });

    var tbody = document.getElementById('fb-tbody');
    if (!tbody) return;

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="padding:30px;text-align:center;color:#6b7a8d">No flights match the current filters.</td></tr>';
      return;
    }

    var html = '';

    data.forEach(function(f, i) {
      var isArr = f._dir === 'arr';
      var rawStatus = (f.flight_status||'').toLowerCase();
      var delay = isArr ? ((f.arrival||{}).delay||0) : ((f.departure||{}).delay||0);

      // Row styling
      var trClass = (i % 2 === 0) ? 'fb-tr fb-tr-even' : 'fb-tr';
      
      var dirBadge = isArr ? '<span class="fb-dir-arr">ARR</span>' : '<span class="fb-dir-dep">DEP</span>';
      var fn = (f.flight||{}).iata || '—';
      var al = (f.airline||{}).name || '—';
      
      var dep = f.departure || {};
      var arr = f.arrival   || {};
      
      var from = cityLabel(dep, currentAirport);
      var to   = cityLabel(arr, currentAirport);

      // FROM cell
      var fromCell = '<td class="fb-td">'
        + '<div style="font-family:monospace;font-size:12px;color:#1a1a2e;white-space:normal">'
        +   from.main
        + '</div>'
        + (from.sub
          ? '<div style="font-size:10px;color:#9aa5b4;margin-top:1px">' + from.sub + '</div>'
          : '')
        + '</td>';

      // TO cell
      var toCell = '<td class="fb-td">'
        + '<div style="font-family:monospace;font-size:12px;color:#1a1a2e;white-space:normal">'
        +   to.main
        + '</div>'
        + (to.sub
          ? '<div style="font-size:10px;color:#9aa5b4;margin-top:1px">' + to.sub + '</div>'
          : '')
        + '</td>';

      var sched = isArr ? arr.scheduled : dep.scheduled;
      var act   = isArr ? arr.actual : dep.actual;
      
      html += '<tr class="'+trClass+'">' +
        '<td class="fb-td">' + dirBadge + '</td>' +
        '<td class="fb-td" style="font-family:monospace;font-weight:600">' + fn + '</td>' +
        '<td class="fb-td">' + al + '</td>' +
        fromCell +
        toCell +
        '<td class="fb-td" style="font-family:monospace">' + formatTime(sched) + '</td>' +
        '<td class="fb-td" style="font-family:monospace">' + formatTime(act) + '</td>' +
        '<td class="fb-td">' + delayPill(delay) + '</td>' +
        '<td class="fb-td">' + statusBadge(rawStatus, delay) + '</td>' +
      '</tr>';
    });

    tbody.innerHTML = html;

    // Update stats from _allFlights
    var totalC = _allFlights.length;
    var depC = _allFlights.filter(function(f){ return f._dir === 'dep'; }).length;
    var arrC = _allFlights.filter(function(f){ return f._dir === 'arr'; }).length;
    var delC = _allFlights.filter(function(f){ 
      return ((f.departure||{}).delay||0) > 0 || ((f.arrival||{}).delay||0) > 0;
    }).length;
    var ontime = totalC > 0 ? Math.round((totalC - delC) / totalC * 100) + '%' : '100%';

    if (document.getElementById('fb-s-total')) document.getElementById('fb-s-total').textContent = totalC;
    if (document.getElementById('fb-s-dep')) document.getElementById('fb-s-dep').textContent = depC;
    if (document.getElementById('fb-s-arr')) document.getElementById('fb-s-arr').textContent = arrC;
    if (document.getElementById('fb-s-del')) document.getElementById('fb-s-del').textContent = delC;
    if (document.getElementById('fb-s-ontime')) document.getElementById('fb-s-ontime').textContent = ontime;
  };

  // ── Data Fetching ─────────────────────────────
  window.fbLoadFlights = function() {
    var tbody = document.getElementById('fb-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding:30px;text-align:center;color:#6b7a8d">Loading flights...</td></tr>';
    
    document.getElementById('fb-quota-bar').style.display = 'none';

    Promise.all([
      fetch('/api/flights?airport=' + currentAirport + '&direction=arr').then(function(r) { return r.json(); }),
      fetch('/api/flights?airport=' + currentAirport + '&direction=dep').then(function(r) { return r.json(); })
    ]).then(function(results) {
      if (results[0].error || results[1].error) {
        if ((results[0].message || results[1].message) === 'quota_exceeded') {
           document.getElementById('fb-quota-bar').style.display = 'block';
           if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding:30px;text-align:center;color:#8b2000">API quota exceeded.</td></tr>';
        } else {
           if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding:30px;text-align:center;color:#8b2000">Error fetching flights.</td></tr>';
        }
        return;
      }

      var arr = (results[0].flights || []).map(function(f) { f._dir = 'arr'; return f; });
      var dep = (results[1].flights || []).map(function(f) { f._dir = 'dep'; return f; });
      
      _allFlights = arr.concat(dep);
      
      // Sort by scheduled time, closest first
      _allFlights.sort(function(a, b) {
        var aT = a._dir === 'arr' ? (a.arrival||{}).scheduled : (a.departure||{}).scheduled;
        var bT = b._dir === 'arr' ? (b.arrival||{}).scheduled : (b.departure||{}).scheduled;
        return new Date(aT) - new Date(bT);
      });

      var d = new Date();
      if (document.getElementById('fb-footer-left')) {
        document.getElementById('fb-footer-left').textContent = 'Last sync: ' + d.toLocaleTimeString('en-IN') + ' (Local)';
      }
      countdown = REFRESH_MS / 1000;
      startTimers();
      
      fbRenderTable();
    }).catch(function(err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding:30px;text-align:center;color:#8b2000">Connection error.</td></tr>';
      console.error(err);
    });
  };

  function clockTick() {
    var d = new Date();
    var elDate = document.getElementById('fb-date');
    var elTime = document.getElementById('fb-clock');
    if (elDate) {
      elDate.textContent = d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + ' IST';
    }
    if (elTime) {
      elTime.textContent = d.getHours().toString().padStart(2,'0') + ':' + 
                           d.getMinutes().toString().padStart(2,'0') + ':' + 
                           d.getSeconds().toString().padStart(2,'0');
    }
  }

  function startTimers() {
    if (clockTimer) clearInterval(clockTimer);
    if (refreshTimer) clearInterval(refreshTimer);
    
    clockTimer = setInterval(function() {
      clockTick();
      countdown--;
      if (countdown >= 0 && document.getElementById('fb-countdown')) {
        var m = Math.floor(countdown / 60);
        var s = countdown % 60;
        document.getElementById('fb-countdown').textContent = m + ':' + s.toString().padStart(2, '0');
      }
    }, 1000);

    refreshTimer = setInterval(fbLoadFlights, REFRESH_MS);
  }

  window.fbManualRefresh = function() {
    fbLoadFlights();
  };

  window.initFlightsBoard = function() {
    populateAirportSelector();
    fbChangeAirport(currentAirport); // triggers load
    clockTick();
  };

  window.stopFlightsBoardPoll = function() {
    if (clockTimer) clearInterval(clockTimer);
    if (refreshTimer) clearInterval(refreshTimer);
  };

})();

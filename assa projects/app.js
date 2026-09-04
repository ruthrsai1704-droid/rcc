/**
 * ============================================================================
 * Project: Kisan Cool Container (KCC) - Agricultural Cold-Chain IoT Platform
 * File: app.js
 * Architecture: Frontend JavaScript (Dual Mode: Live WebSocket / Standalone Fallback,
 *               Chart.js, 2D Heatmap, SHA-256 Privacy Hashing, Logistics Dispatch)
 * Author: Senior IoT Systems Architect & Full-Stack Lead Engineer
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. GLOBAL STATE & CONSTANTS
  // --------------------------------------------------------------------------
  const CONTAINER_ID = 'KCC-001';
  let socket = null;
  let reconnectTimer = null;
  let localSimTimer = null;
  let activeLogsFilter = 'all';
  let selectedCargoZone = 'mid-top';
  let isStandaloneMode = false;
  let simStep = 0;

  // Master State Store
  const state = {
    telemetry: {
      container_id: CONTAINER_ID,
      seq: 1042,
      temp_c: 4.2,
      humidity_pct: 89.4,
      ethylene_ppm: 0.72,
      vibration_g: 0.08,
      shock_peak_g: 0.24,
      battery_v: 4.08,
      battery_pct: 94,
      is_alert: false,
      alert_reason: 'NORMAL',
      lora_rssi_dbm: -74,
      lora_snr_db: 9.4,
      offline_sync: false,
      timestamp: new Date().toISOString(),
      zones: {
        'front-top': { temp_c: 4.0, humidity_pct: 90.1, ethylene_ppm: 0.65, status: 'optimal' },
        'front-bottom': { temp_c: 3.8, humidity_pct: 91.2, ethylene_ppm: 0.60, status: 'optimal' },
        'mid-top': { temp_c: 4.3, humidity_pct: 88.8, ethylene_ppm: 0.75, status: 'optimal' },
        'mid-bottom': { temp_c: 4.1, humidity_pct: 89.5, ethylene_ppm: 0.70, status: 'optimal' },
        'rear-top': { temp_c: 4.6, humidity_pct: 87.6, ethylene_ppm: 0.82, status: 'optimal' },
        'rear-bottom': { temp_c: 4.4, humidity_pct: 88.2, ethylene_ppm: 0.78, status: 'optimal' },
        'door-zone': { temp_c: 5.1, humidity_pct: 85.4, ethylene_ppm: 0.90, status: 'optimal' }
      }
    },
    history: [],
    farmerBatches: [
      {
        batch_id: 'LOT-TN-2026-081',
        farmer_name: 'M. Ramanathan',
        phone_masked: '+91 98*** **321',
        privacy_hash: '8f4c2b9a71e8d4a3e2f1c09876543210abcdef1234567890abcdef1234567890',
        crop_type: 'Tomatoes',
        quantity_kg: 1850,
        quality_grade: 'Grade-A Export',
        harvest_location: { locality: 'Theni Valley Cluster', lat: 10.0104, lng: 77.4768 },
        assigned_zone: 'mid-top',
        initial_shelf_life_days: 21,
        remaining_shelf_life_days: 19.4,
        spoilage_risk_pct: 4.8,
        created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString()
      },
      {
        batch_id: 'LOT-MH-2026-114',
        farmer_name: 'Sunita S. Deshmukh',
        phone_masked: '+91 94*** **874',
        privacy_hash: 'd3b07384d113edec49eaa6238ad5ff00abcdef99887766554433221100aabbcc',
        crop_type: 'Grapes',
        quantity_kg: 2400,
        quality_grade: 'Export Premium',
        harvest_location: { locality: 'Nashik Vineyard Zone 4', lat: 19.9975, lng: 73.7898 },
        assigned_zone: 'front-bottom',
        initial_shelf_life_days: 28,
        remaining_shelf_life_days: 26.8,
        spoilage_risk_pct: 2.1,
        created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString()
      }
    ],
    driverTrips: [
      {
        trip_id: 'TRIP-KCC-9021',
        truck_id: 'TN-72-AB-1234',
        driver_name: 'K. Selvaraj',
        driver_phone: '+91 97890 12345',
        container_id: CONTAINER_ID,
        source: 'Theni Agri Cold Hub',
        destination: 'Chennai Port Cold Storage Terminal',
        status: 'IN_TRANSIT',
        distance_km: 485,
        completed_km: 210,
        avg_speed_kmh: 58.4,
        shock_events_count: 1,
        last_shock_time: '10:45 AM',
        dispatched_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
      }
    ],
    advisoryLogs: [
      {
        id: 'ADV-1001',
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toLocaleTimeString(),
        type: 'LORA_TELEMETRY',
        channel: '433.000 MHz (SX1278)',
        target: 'Gateway-HUB-1',
        payload_hex: '0x4B43432D303031205345513A3130333820543A342E32',
        status: 'ACK_RECEIVED',
        details: 'Periodic 5s telemetry pulse confirmed with SNR 9.4dB, RSSI -74dBm.'
      },
      {
        id: 'ADV-1002',
        timestamp: new Date(Date.now() - 14 * 60 * 1000).toLocaleTimeString(),
        type: 'SMS_FARMER_ADVISORY',
        channel: 'GSM / LoRa Gateway',
        target: '+91 98*** **321 (M. Ramanathan)',
        payload_hex: '0x534D533A20546F6D61746F657320436F6C64',
        status: 'DISPATCHED',
        details: 'Advisory: Tomatoes in Container KCC-001 optimal at 4.2°C. Estimated shelf-life preserved at 96%.'
      },
      {
        id: 'ADV-1003',
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toLocaleTimeString(),
        type: 'DRIVER_LOGISTICS_ALERT',
        channel: 'In-Cabin Dashboard',
        target: 'Driver K. Selvaraj (TN-72-AB-1234)',
        payload_hex: '0x4C4F474953544943533A20524F55544520475245454E',
        status: 'DELIVERED',
        details: 'Logistics update: Cooling unit power steady. Road vibration low (0.08G). Next waypoint in 45km.'
      }
    ]
  };

  // Generate 25 initial history points
  const startTs = Date.now();
  for (let i = 24; i >= 0; i--) {
    const ptTime = new Date(startTs - i * 4000);
    const t = 4.1 + Math.sin(i * 0.4) * 0.3;
    const h = 89.2 + Math.cos(i * 0.3) * 1.2;
    const eth = 0.68 + (25 - i) * 0.002;
    const vib = 0.07 + Math.random() * 0.03;

    state.history.push({
      time: ptTime.toLocaleTimeString(),
      timestamp: ptTime.toISOString(),
      temp_c: parseFloat(t.toFixed(2)),
      humidity_pct: parseFloat(h.toFixed(1)),
      ethylene_ppm: parseFloat(eth.toFixed(2)),
      vibration_g: parseFloat(vib.toFixed(3)),
      shock_peak_g: parseFloat((vib * 1.8).toFixed(2)),
      battery_pct: 94
    });
  }

  // Chart Instances
  let tempHumChartInstance = null;
  let ethVibChartInstance = null;

  // --------------------------------------------------------------------------
  // 2. DOM REFERENCES
  // --------------------------------------------------------------------------
  const dom = {
    wsDot: document.getElementById('wsDot'),
    wsStatusText: document.getElementById('wsStatusText'),
    loraStatusText: document.getElementById('loraStatusText'),
    rssiVal: document.getElementById('rssiVal'),
    snrVal: document.getElementById('snrVal'),
    containerSelect: document.getElementById('containerSelect'),

    valTemp: document.getElementById('valTemp'),
    tempStatusTag: document.getElementById('tempStatusTag'),
    tempBounds: document.getElementById('tempBounds'),
    tempProgressFill: document.getElementById('tempProgressFill'),

    valHumidity: document.getElementById('valHumidity'),
    humStatusTag: document.getElementById('humStatusTag'),
    valCondensation: document.getElementById('valCondensation'),
    humProgressFill: document.getElementById('humProgressFill'),

    valEthylene: document.getElementById('valEthylene'),
    ethStatusTag: document.getElementById('ethStatusTag'),
    valRipening: document.getElementById('valRipening'),
    ethProgressFill: document.getElementById('ethProgressFill'),

    valVibration: document.getElementById('valVibration'),
    valPeakShock: document.getElementById('valPeakShock'),
    shockStatusTag: document.getElementById('shockStatusTag'),
    valRoadGrade: document.getElementById('valRoadGrade'),
    shockProgressFill: document.getElementById('shockProgressFill'),

    valBatteryPct: document.getElementById('valBatteryPct'),
    valBatteryVolts: document.getElementById('valBatteryVolts'),
    powerStatusTag: document.getElementById('powerStatusTag'),
    battProgressFill: document.getElementById('battProgressFill'),

    valTotalKg: document.getElementById('valTotalKg'),
    valActiveBatchesCount: document.getElementById('valActiveBatchesCount'),

    cargoGrid: document.getElementById('cargoGrid'),
    zoneDetailPanel: document.getElementById('zoneDetailPanel'),
    panelZoneTitle: document.getElementById('panelZoneTitle'),
    panelZoneStatusTag: document.getElementById('panelZoneStatusTag'),
    psTemp: document.getElementById('psTemp'),
    psHum: document.getElementById('psHum'),
    psEth: document.getElementById('psEth'),
    psLot: document.getElementById('psLot'),
    psFarmer: document.getElementById('psFarmer'),
    psShelfLife: document.getElementById('psShelfLife'),

    farmerUploadForm: document.getElementById('farmerUploadForm'),
    farmerName: document.getElementById('farmerName'),
    farmerPhone: document.getElementById('farmerPhone'),
    cropType: document.getElementById('cropType'),
    quantityKg: document.getElementById('quantityKg'),
    qualityGrade: document.getElementById('qualityGrade'),
    harvestLocality: document.getElementById('harvestLocality'),
    assignedZoneSelect: document.getElementById('assignedZoneSelect'),
    previewMaskedPhone: document.getElementById('previewMaskedPhone'),
    previewHash: document.getElementById('previewHash'),
    farmerBatchesTbody: document.getElementById('farmerBatchesTbody'),

    driverAssignForm: document.getElementById('driverAssignForm'),
    truckId: document.getElementById('truckId'),
    driverName: document.getElementById('driverName'),
    driverPhone: document.getElementById('driverPhone'),
    destinationRoute: document.getElementById('destinationRoute'),
    sourceLocation: document.getElementById('sourceLocation'),
    activeTripCard: document.getElementById('activeTripCard'),
    tripIdText: document.getElementById('tripIdText'),
    tripTruckText: document.getElementById('tripTruckText'),
    tripSourceCity: document.getElementById('tripSourceCity'),
    tripDestCity: document.getElementById('tripDestCity'),
    tripDriverText: document.getElementById('tripDriverText'),
    tripSpeedText: document.getElementById('tripSpeedText'),
    tripShockCount: document.getElementById('tripShockCount'),

    terminalOutput: document.getElementById('terminalOutput'),
    filterAll: document.getElementById('filterAll'),
    filterLora: document.getElementById('filterLora'),
    filterSms: document.getElementById('filterSms'),
    filterAlarms: document.getElementById('filterAlarms'),
    btnClearLogs: document.getElementById('btnClearLogs'),

    btnSimRoadShock: document.getElementById('btnSimRoadShock'),
    btnSimThermalBreach: document.getElementById('btnSimThermalBreach'),
    btnSimEthyleneSpike: document.getElementById('btnSimEthyleneSpike'),
    btnSimOfflineSync: document.getElementById('btnSimOfflineSync'),
    btnSimResetOptimal: document.getElementById('btnSimResetOptimal')
  };

  // --------------------------------------------------------------------------
  // 3. CRYPTO & DATA PRIVACY (Client-Side SHA-256)
  // --------------------------------------------------------------------------
  async function computeSha256(text) {
    try {
      if (window.crypto && crypto.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text + '_KISAN_SALT_2026');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {
      // Fallback
    }
    // Simple deterministic fallback hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0') + 'abcdef998877';
  }

  function maskPhone(phone) {
    const clean = String(phone).trim();
    if (clean.length < 8) return '+91 98*** **000';
    const prefix = clean.substring(0, 5);
    const suffix = clean.substring(clean.length - 3);
    return `${prefix}*** **${suffix}`;
  }

  async function updatePrivacyPreview() {
    const phone = dom.farmerPhone.value;
    if (!phone) {
      dom.previewMaskedPhone.textContent = '+91 98*** **210';
      dom.previewHash.textContent = 'SHA: e3b0c44298...';
      return;
    }
    const masked = maskPhone(phone);
    const hash = await computeSha256(phone);
    dom.previewMaskedPhone.textContent = masked;
    dom.previewHash.textContent = `SHA: ${hash.substring(0, 12)}...`;
  }

  // --------------------------------------------------------------------------
  // 4. CHART.JS REAL-TIME DUAL TELEMETRY CHARTS
  // --------------------------------------------------------------------------
  function initCharts() {
    const chartOptionsBase = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' },
            boxWidth: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(226, 232, 240, 0.6)' },
          ticks: { font: { family: "'JetBrains Mono', monospace", size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }
        }
      }
    };

    // Chart 1: Temperature & Humidity
    const ctx1 = document.getElementById('tempHumChart').getContext('2d');
    tempHumChartInstance = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Temperature (°C)',
            data: [],
            borderColor: '#059669',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 2.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.35,
            yAxisID: 'yTemp'
          },
          {
            label: 'Relative Humidity (% RH)',
            data: [],
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.08)',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.35,
            yAxisID: 'yHum'
          }
        ]
      },
      options: {
        ...chartOptionsBase,
        scales: {
          ...chartOptionsBase.scales,
          yTemp: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Temp (°C)', font: { size: 11, weight: '700' } },
            min: 0,
            max: 16,
            grid: { color: 'rgba(226, 232, 240, 0.6)' }
          },
          yHum: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Humidity (%RH)', font: { size: 11, weight: '700' } },
            min: 60,
            max: 100,
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    // Chart 2: Ethylene & Road Vibration
    const ctx2 = document.getElementById('ethVibChart').getContext('2d');
    ethVibChartInstance = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Ethylene Gas (ppm)',
            data: [],
            borderColor: '#d97706',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            borderWidth: 2.5,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.35,
            yAxisID: 'yEth'
          },
          {
            label: 'Vibration Shock (G)',
            data: [],
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.08)',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.2,
            yAxisID: 'yVib'
          }
        ]
      },
      options: {
        ...chartOptionsBase,
        scales: {
          ...chartOptionsBase.scales,
          yEth: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Ethylene (ppm)', font: { size: 11, weight: '700' } },
            min: 0,
            max: 6.0,
            grid: { color: 'rgba(226, 232, 240, 0.6)' }
          },
          yVib: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Shock (G)', font: { size: 11, weight: '700' } },
            min: 0,
            max: 3.5,
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    updateChartsWithHistory(state.history);
  }

  function updateChartsWithHistory(history) {
    if (!tempHumChartInstance || !ethVibChartInstance || !history) return;

    const labels = history.map(h => h.time);
    const temps = history.map(h => h.temp_c);
    const hums = history.map(h => h.humidity_pct);
    const eths = history.map(h => h.ethylene_ppm);
    const vibs = history.map(h => h.vibration_g);

    tempHumChartInstance.data.labels = labels;
    tempHumChartInstance.data.datasets[0].data = temps;
    tempHumChartInstance.data.datasets[1].data = hums;
    tempHumChartInstance.update();

    ethVibChartInstance.data.labels = labels;
    ethVibChartInstance.data.datasets[0].data = eths;
    ethVibChartInstance.data.datasets[1].data = vibs;
    ethVibChartInstance.update();
  }

  function appendChartPoint(point) {
    if (!tempHumChartInstance || !ethVibChartInstance || !point) return;

    const maxPoints = 30;

    tempHumChartInstance.data.labels.push(point.time);
    tempHumChartInstance.data.datasets[0].data.push(point.temp_c);
    tempHumChartInstance.data.datasets[1].data.push(point.humidity_pct);

    if (tempHumChartInstance.data.labels.length > maxPoints) {
      tempHumChartInstance.data.labels.shift();
      tempHumChartInstance.data.datasets[0].data.shift();
      tempHumChartInstance.data.datasets[1].data.shift();
    }
    tempHumChartInstance.update('none');

    ethVibChartInstance.data.labels.push(point.time);
    ethVibChartInstance.data.datasets[0].data.push(point.ethylene_ppm);
    ethVibChartInstance.data.datasets[1].data.push(point.vibration_g);

    if (ethVibChartInstance.data.labels.length > maxPoints) {
      ethVibChartInstance.data.labels.shift();
      ethVibChartInstance.data.datasets[0].data.shift();
      ethVibChartInstance.data.datasets[1].data.shift();
    }
    ethVibChartInstance.update('none');
  }

  // --------------------------------------------------------------------------
  // 5. UI BINDERS & RENDERERS
  // --------------------------------------------------------------------------
  function renderTelemetry(t) {
    if (!t) return;

    // 1. Temperature
    dom.valTemp.textContent = t.temp_c !== undefined ? t.temp_c.toFixed(1) : '4.2';
    if (t.temp_c > 9.5) {
      dom.tempStatusTag.textContent = 'CRITICAL';
      dom.tempStatusTag.className = 'status-tag critical';
      dom.tempProgressFill.style.background = '#ef4444';
    } else if (t.temp_c > 6.5) {
      dom.tempStatusTag.textContent = 'WARNING';
      dom.tempStatusTag.className = 'status-tag warning';
      dom.tempProgressFill.style.background = '#f59e0b';
    } else {
      dom.tempStatusTag.textContent = 'OPTIMAL';
      dom.tempStatusTag.className = 'status-tag optimal';
      dom.tempProgressFill.style.background = 'linear-gradient(90deg, #10b981, #059669)';
    }
    const tempPct = Math.min(100, Math.max(10, (t.temp_c / 15.0) * 100));
    dom.tempProgressFill.style.width = `${tempPct}%`;

    // 2. Humidity
    dom.valHumidity.textContent = t.humidity_pct !== undefined ? t.humidity_pct.toFixed(1) : '89.4';
    if (t.humidity_pct < 75.0) {
      dom.humStatusTag.textContent = 'DRYING';
      dom.humStatusTag.className = 'status-tag warning';
    } else {
      dom.humStatusTag.textContent = 'IDEAL';
      dom.humStatusTag.className = 'status-tag optimal';
    }
    dom.humProgressFill.style.width = `${t.humidity_pct || 89}%`;

    // 3. Ethylene
    dom.valEthylene.textContent = t.ethylene_ppm !== undefined ? t.ethylene_ppm.toFixed(2) : '0.72';
    if (t.ethylene_ppm > 3.0) {
      dom.ethStatusTag.textContent = 'SPOILAGE RISK';
      dom.ethStatusTag.className = 'status-tag critical';
      dom.valRipening.textContent = 'Accelerated';
      dom.valRipening.style.color = '#ef4444';
    } else if (t.ethylene_ppm > 2.0) {
      dom.ethStatusTag.textContent = 'ELEVATED';
      dom.ethStatusTag.className = 'status-tag warning';
      dom.valRipening.textContent = 'Moderate';
      dom.valRipening.style.color = '#f59e0b';
    } else {
      dom.ethStatusTag.textContent = 'BASAL';
      dom.ethStatusTag.className = 'status-tag optimal';
      dom.valRipening.textContent = 'Controlled';
      dom.valRipening.style.color = '#059669';
    }
    const ethPct = Math.min(100, Math.max(10, (t.ethylene_ppm / 5.0) * 100));
    dom.ethProgressFill.style.width = `${ethPct}%`;

    // 4. Vibration & Shock
    dom.valVibration.textContent = t.vibration_g !== undefined ? t.vibration_g.toFixed(2) : '0.08';
    dom.valPeakShock.textContent = `${(t.shock_peak_g || 0.24).toFixed(2)} G`;
    if (t.shock_peak_g > 1.8) {
      dom.shockStatusTag.textContent = 'SHOCK IMPACT';
      dom.shockStatusTag.className = 'status-tag critical';
      dom.valRoadGrade.textContent = 'Heavy Pothole';
    } else if (t.vibration_g > 0.35) {
      dom.shockStatusTag.textContent = 'ROUGH ROAD';
      dom.shockStatusTag.className = 'status-tag warning';
      dom.valRoadGrade.textContent = 'ISO Class C';
    } else {
      dom.shockStatusTag.textContent = 'SMOOTH';
      dom.shockStatusTag.className = 'status-tag optimal';
      dom.valRoadGrade.textContent = 'ISO Class A';
    }
    const vibPct = Math.min(100, Math.max(8, (t.vibration_g / 1.5) * 100));
    dom.shockProgressFill.style.width = `${vibPct}%`;

    // 5. Battery
    dom.valBatteryPct.textContent = t.battery_pct !== undefined ? t.battery_pct : 94;
    dom.valBatteryVolts.textContent = `${(t.battery_v || 4.08).toFixed(2)} V`;
    dom.battProgressFill.style.width = `${t.battery_pct || 94}%`;

    // 6. Network
    if (t.lora_rssi_dbm) dom.rssiVal.textContent = `${t.lora_rssi_dbm} dBm`;
    if (t.lora_snr_db) dom.snrVal.textContent = `${t.lora_snr_db} dB`;

    // 7. 2D Cargo Heatmap
    renderCargoZones(t.zones);
  }

  function renderCargoZones(zones) {
    if (!zones) return;

    Object.keys(zones).forEach(zoneKey => {
      const zData = zones[zoneKey];
      const cardEl = document.getElementById(`zone-${zoneKey}`);
      const tEl = document.getElementById(`zt-${zoneKey}`);
      const hEl = document.getElementById(`zh-${zoneKey}`);
      const eEl = document.getElementById(`ze-${zoneKey}`);

      if (cardEl && tEl && hEl && eEl) {
        tEl.textContent = `${zData.temp_c.toFixed(1)}°C`;
        hEl.textContent = `${zData.humidity_pct.toFixed(1)}%`;
        eEl.textContent = `${zData.ethylene_ppm.toFixed(2)} ppm`;

        cardEl.className = `cargo-zone-card ${zoneKey === 'door-zone' ? 'door ' : ''}${zData.status}`;
        if (zoneKey === selectedCargoZone) {
          cardEl.classList.add('active-selected');
        }
      }
    });

    updateZoneDetailPanel(selectedCargoZone);
  }

  function updateZoneDetailPanel(zoneKey) {
    selectedCargoZone = zoneKey;

    document.querySelectorAll('.cargo-zone-card').forEach(card => {
      card.classList.remove('active-selected');
    });
    const targetCard = document.getElementById(`zone-${zoneKey}`);
    if (targetCard) targetCard.classList.add('active-selected');

    const zoneData = state.telemetry?.zones ? state.telemetry.zones[zoneKey] : null;
    const formattedTitle = zoneKey.replace('-', ' ').toUpperCase();
    dom.panelZoneTitle.textContent = `Compartment Detail: Zone [${formattedTitle}]`;

    if (zoneData) {
      dom.psTemp.textContent = `${zoneData.temp_c.toFixed(1)} °C`;
      dom.psHum.textContent = `${zoneData.humidity_pct.toFixed(1)} %`;
      dom.psEth.textContent = `${zoneData.ethylene_ppm.toFixed(2)} ppm`;

      if (zoneData.status === 'critical') {
        dom.panelZoneStatusTag.textContent = 'CRITICAL THERMAL/GAS ALERT';
        dom.panelZoneStatusTag.className = 'status-tag critical';
      } else if (zoneData.status === 'warning') {
        dom.panelZoneStatusTag.textContent = 'THERMAL CAUTION';
        dom.panelZoneStatusTag.className = 'status-tag warning';
      } else {
        dom.panelZoneStatusTag.textContent = 'OPTIMAL PRESERVATION';
        dom.panelZoneStatusTag.className = 'status-tag optimal';
      }
    }

    const matchedBatch = state.farmerBatches.find(b => b.assigned_zone === zoneKey);
    if (matchedBatch) {
      dom.psLot.textContent = `${matchedBatch.batch_id} (${matchedBatch.crop_type}, ${matchedBatch.quantity_kg.toLocaleString()} kg)`;
      dom.psFarmer.textContent = `${matchedBatch.farmer_name} (${matchedBatch.harvest_location?.locality || 'Farm Cluster'})`;
      dom.psShelfLife.textContent = `${matchedBatch.remaining_shelf_life_days} Days Remaining (Risk: ${matchedBatch.spoilage_risk_pct}%)`;
    } else {
      dom.psLot.textContent = 'Empty / Reserve Cold Volume';
      dom.psFarmer.textContent = 'Unallocated Rack Space';
      dom.psShelfLife.textContent = 'N/A (Ready for Loading)';
    }
  }

  function renderFarmerBatches(batches) {
    if (!batches) return;
    state.farmerBatches = batches;

    const totalKg = batches.reduce((sum, b) => sum + (b.quantity_kg || 0), 0);
    dom.valTotalKg.textContent = totalKg.toLocaleString();
    dom.valActiveBatchesCount.textContent = `${batches.length} Farmers`;

    dom.farmerBatchesTbody.innerHTML = '';
    batches.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge-lot">${b.batch_id}</span></td>
        <td><strong>${b.farmer_name}</strong></td>
        <td>${b.phone_masked}</td>
        <td>${b.crop_type}</td>
        <td>${b.quantity_kg.toLocaleString()} kg</td>
        <td><span class="status-tag transit">${b.assigned_zone}</span></td>
        <td>
          <strong style="color: ${b.remaining_shelf_life_days < 7 ? '#dc2626' : '#059669'}">
            ${b.remaining_shelf_life_days} Days
          </strong>
          <span style="font-size:0.68rem; color:#64748b;">(${b.spoilage_risk_pct}% risk)</span>
        </td>
        <td><span class="badge-hash" title="${b.privacy_hash}">SHA:${b.privacy_hash.substring(0, 8)}...</span></td>
      `;
      dom.farmerBatchesTbody.appendChild(tr);

      const zoneTagEl = document.getElementById(`zlot-${b.assigned_zone}`);
      if (zoneTagEl) {
        zoneTagEl.textContent = `${b.batch_id} (${b.crop_type})`;
        zoneTagEl.classList.add('active');
      }
    });

    updateZoneDetailPanel(selectedCargoZone);
  }

  function renderDriverTrips(trips) {
    if (!trips || trips.length === 0) return;
    state.driverTrips = trips;
    const active = trips[0];

    dom.tripIdText.textContent = active.trip_id;
    dom.tripTruckText.textContent = `Truck: ${active.truck_id}`;
    dom.tripSourceCity.textContent = active.source;
    dom.tripDestCity.textContent = active.destination;
    dom.tripDriverText.textContent = active.driver_name;
    dom.tripSpeedText.textContent = `${active.avg_speed_kmh || 58.4} km/h`;
    dom.tripShockCount.textContent = `${active.shock_events_count || 0} Incidents (${active.last_shock_time || 'None'})`;
  }

  function renderAdvisoryLogs(logs) {
    if (!logs) return;
    state.advisoryLogs = logs;

    const filtered = logs.filter(item => {
      if (activeLogsFilter === 'all') return true;
      if (activeLogsFilter === 'LORA') return item.type.includes('LORA');
      if (activeLogsFilter === 'SMS') return item.type.includes('SMS');
      if (activeLogsFilter === 'ALARM') return item.type.includes('ALARM') || item.type.includes('CRITICAL');
      return true;
    });

    dom.terminalOutput.innerHTML = '';

    if (filtered.length === 0) {
      dom.terminalOutput.innerHTML = '<div style="color:#64748b; padding:12px;">No telemetry or advisory logs matching filter.</div>';
      return;
    }

    filtered.forEach(log => {
      const row = document.createElement('div');
      row.className = 'term-row';

      let badgeClass = 'lora';
      if (log.type.includes('SMS')) badgeClass = 'sms';
      if (log.type.includes('ALARM')) badgeClass = 'alarm';
      if (log.type.includes('DRIVER')) badgeClass = 'driver';

      row.innerHTML = `
        <span class="term-time">${log.timestamp}</span>
        <span class="term-badge ${badgeClass}">${log.type}</span>
        <div class="term-content">
          <span class="term-hex">${log.payload_hex || ''}</span>
          <span>${log.details}</span>
        </div>
      `;
      dom.terminalOutput.appendChild(row);
    });
  }

  // --------------------------------------------------------------------------
  // 6. LOCAL SIMULATION ENGINE (Fallback when Backend is Offline / File Mode)
  // --------------------------------------------------------------------------
  function runLocalSimulationTick() {
    simStep++;

    const tempWave = 4.1 + Math.sin(simStep * 0.15) * 0.35 + (Math.random() - 0.5) * 0.1;
    const humWave = 89.4 + Math.cos(simStep * 0.1) * 1.1 + (Math.random() - 0.5) * 0.3;
    const ethWave = 0.70 + Math.sin(simStep * 0.06) * 0.12 + (Math.random() - 0.5) * 0.02;
    const vibWave = 0.07 + (Math.random() > 0.94 ? Math.random() * 0.35 : Math.random() * 0.02);
    const peakWave = vibWave * (1.2 + Math.random() * 0.8);

    const zFT = parseFloat((tempWave - 0.2).toFixed(1));
    const zFB = parseFloat((tempWave - 0.4).toFixed(1));
    const zMT = parseFloat(tempWave.toFixed(1));
    const zMB = parseFloat((tempWave - 0.1).toFixed(1));
    const zRT = parseFloat((tempWave + 0.3).toFixed(1));
    const zRB = parseFloat((tempWave + 0.1).toFixed(1));
    const zDoor = parseFloat((tempWave + 0.8).toFixed(1));

    function getZoneStatus(t, e) {
      if (t > 9.5 || e > 3.2) return 'critical';
      if (t > 7.0 || e > 2.0) return 'warning';
      return 'optimal';
    }

    state.telemetry = {
      container_id: CONTAINER_ID,
      seq: ++state.telemetry.seq,
      temp_c: parseFloat(tempWave.toFixed(2)),
      humidity_pct: parseFloat(humWave.toFixed(1)),
      ethylene_ppm: parseFloat(ethWave.toFixed(2)),
      vibration_g: parseFloat(vibWave.toFixed(3)),
      shock_peak_g: parseFloat(peakWave.toFixed(2)),
      battery_v: 4.10,
      battery_pct: 94,
      is_alert: tempWave > 10.0 || ethWave > 3.0 || peakWave > 1.8,
      alert_reason: tempWave > 10.0 ? 'THERMAL_BREACH' : ethWave > 3.0 ? 'ETHYLENE_SPIKE' : peakWave > 1.8 ? 'ROAD_SHOCK' : 'NORMAL',
      lora_rssi_dbm: -74 + Math.floor(Math.random() * 6 - 3),
      lora_snr_db: parseFloat((9.2 + Math.random() * 0.8).toFixed(1)),
      offline_sync: false,
      timestamp: new Date().toISOString(),
      zones: {
        'front-top': { temp_c: zFT, humidity_pct: parseFloat((humWave + 0.6).toFixed(1)), ethylene_ppm: parseFloat((ethWave * 0.92).toFixed(2)), status: getZoneStatus(zFT, ethWave * 0.92) },
        'front-bottom': { temp_c: zFB, humidity_pct: parseFloat((humWave + 1.1).toFixed(1)), ethylene_ppm: parseFloat((ethWave * 0.88).toFixed(2)), status: getZoneStatus(zFB, ethWave * 0.88) },
        'mid-top': { temp_c: zMT, humidity_pct: parseFloat(humWave.toFixed(1)), ethylene_ppm: parseFloat(ethWave.toFixed(2)), status: getZoneStatus(zMT, ethWave) },
        'mid-bottom': { temp_c: zMB, humidity_pct: parseFloat((humWave + 0.2).toFixed(1)), ethylene_ppm: parseFloat((ethWave * 0.96).toFixed(2)), status: getZoneStatus(zMB, ethWave * 0.96) },
        'rear-top': { temp_c: zRT, humidity_pct: parseFloat((humWave - 1.1).toFixed(1)), ethylene_ppm: parseFloat((ethWave * 1.12).toFixed(2)), status: getZoneStatus(zRT, ethWave * 1.12) },
        'rear-bottom': { temp_c: zRB, humidity_pct: parseFloat((humWave - 0.7).toFixed(1)), ethylene_ppm: parseFloat((ethWave * 1.05).toFixed(2)), status: getZoneStatus(zRB, ethWave * 1.05) },
        'door-zone': { temp_c: zDoor, humidity_pct: parseFloat((humWave - 2.5).toFixed(1)), ethylene_ppm: parseFloat((ethWave * 1.25).toFixed(2)), status: getZoneStatus(zDoor, ethWave * 1.25) }
      }
    };

    const timeLabel = new Date().toLocaleTimeString();
    const newPoint = {
      time: timeLabel,
      timestamp: state.telemetry.timestamp,
      temp_c: state.telemetry.temp_c,
      humidity_pct: state.telemetry.humidity_pct,
      ethylene_ppm: state.telemetry.ethylene_ppm,
      vibration_g: state.telemetry.vibration_g,
      shock_peak_g: state.telemetry.shock_peak_g,
      battery_pct: state.telemetry.battery_pct
    };

    state.history.push(newPoint);
    if (state.history.length > 30) state.history.shift();

    renderTelemetry(state.telemetry);
    appendChartPoint(newPoint);
  }

  function startLocalSimulation() {
    if (localSimTimer) return;
    console.log('[KCC App] Running Autonomous Local Simulation Telemetry Engine.');
    localSimTimer = setInterval(runLocalSimulationTick, 3000);
  }

  function stopLocalSimulation() {
    if (localSimTimer) {
      clearInterval(localSimTimer);
      localSimTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // 7. WEBSOCKET REAL-TIME CONNECTION
  // --------------------------------------------------------------------------
  function connectWebSocket() {
    // If running via file:// or non-HTTP protocol, switch to standalone mode
    if (window.location.protocol === 'file:') {
      console.log('[KCC App] File protocol detected. Activating standalone telemetry simulation.');
      isStandaloneMode = true;
      dom.wsDot.className = 'pulse-dot green';
      dom.wsStatusText.textContent = 'STANDALONE SIM';
      startLocalSimulation();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    const wsUrl = `${protocol}//${host}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[WebSocket] Connected to KCC Node.js Backend.');
        isStandaloneMode = false;
        stopLocalSimulation();
        dom.wsDot.className = 'pulse-dot green';
        dom.wsStatusText.textContent = 'LIVE WS';
        if (reconnectTimer) {
          clearInterval(reconnectTimer);
          reconnectTimer = null;
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'INITIAL_STATE' || msg.type === 'TELEMETRY_UPDATE') {
            state.telemetry = msg.telemetry;
            if (msg.history) state.history = msg.history;
            if (msg.farmerBatches) state.farmerBatches = msg.farmerBatches;
            if (msg.driverTrips) state.driverTrips = msg.driverTrips;
            if (msg.advisoryLogs) state.advisoryLogs = msg.advisoryLogs;

            renderTelemetry(state.telemetry);
            if (msg.history) updateChartsWithHistory(state.history);
            if (msg.historyPoint) appendChartPoint(msg.historyPoint);
            renderFarmerBatches(state.farmerBatches);
            renderDriverTrips(state.driverTrips);
            renderAdvisoryLogs(state.advisoryLogs);
          } else if (msg.type === 'BATCH_REGISTERED') {
            if (msg.farmerBatches) renderFarmerBatches(msg.farmerBatches);
            if (msg.advisoryLogs) renderAdvisoryLogs(msg.advisoryLogs);
          } else if (msg.type === 'TRIP_ASSIGNED') {
            if (msg.driverTrips) renderDriverTrips(msg.driverTrips);
            if (msg.advisoryLogs) renderAdvisoryLogs(msg.advisoryLogs);
          }
        } catch (err) {
          console.error('[WebSocket] Parsing error:', err);
        }
      };

      socket.onclose = () => {
        console.warn('[WebSocket] Disconnected from server. Activating resilient local simulation fallback.');
        isStandaloneMode = true;
        dom.wsDot.className = 'pulse-dot green';
        dom.wsStatusText.textContent = 'SIM MODE';
        startLocalSimulation();

        if (!reconnectTimer) {
          reconnectTimer = setInterval(connectWebSocket, 4000);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch (e) {
      console.warn('[WebSocket] Init failed. Falling back to local simulation.');
      isStandaloneMode = true;
      startLocalSimulation();
    }
  }

  // --------------------------------------------------------------------------
  // 8. FORM SUBMISSIONS & LOGISTICS ACTIONS
  // --------------------------------------------------------------------------
  async function handleFarmerSubmit(e) {
    e.preventDefault();

    const name = dom.farmerName.value;
    const phone = dom.farmerPhone.value;
    const crop = dom.cropType.value;
    const qty = parseFloat(dom.quantityKg.value) || 1000;
    const grade = dom.qualityGrade.value;
    const localitySelect = dom.harvestLocality;
    const selectedOption = localitySelect.options[localitySelect.selectedIndex];
    const locality = selectedOption.value;
    const lat = parseFloat(selectedOption.getAttribute('data-lat')) || 19.9975;
    const lng = parseFloat(selectedOption.getAttribute('data-lng')) || 73.7898;
    const zone = dom.assignedZoneSelect.value;

    const privacyHash = await computeSha256(phone);
    const maskedPhone = maskPhone(phone);

    const newBatch = {
      batch_id: `LOT-${crop.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-4)}`,
      farmer_name: name.trim(),
      phone_masked: maskedPhone,
      privacy_hash: privacyHash,
      crop_type: crop,
      quantity_kg: qty,
      quality_grade: grade,
      harvest_location: { locality, lat, lng },
      assigned_zone: zone,
      initial_shelf_life_days: 21,
      remaining_shelf_life_days: 21,
      spoilage_risk_pct: 1.2,
      created_at: new Date().toISOString()
    };

    // If online with backend server, send POST
    if (!isStandaloneMode && window.location.protocol !== 'file:') {
      try {
        await fetch('/api/farmer/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newBatch)
        });
      } catch (err) {
        console.warn('[Farmer Upload] API failed, storing locally.');
      }
    }

    // Always update local state
    state.farmerBatches.unshift(newBatch);
    renderFarmerBatches(state.farmerBatches);

    // Add advisory log
    const adv = {
      id: `ADV-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'SMS_FARMER_INGESTION',
      channel: 'SMS Gateway / Secure Web',
      target: `${maskedPhone} (${newBatch.farmer_name})`,
      payload_hex: `0x42415443483A${newBatch.batch_id}`,
      status: 'DISPATCHED',
      details: `Produce batch ${newBatch.batch_id} (${newBatch.quantity_kg}kg ${newBatch.crop_type}) securely loaded into Zone [${newBatch.assigned_zone}]. SHA-256 Token: ${privacyHash.substring(0, 16)}...`
    };
    state.advisoryLogs.unshift(adv);
    renderAdvisoryLogs(state.advisoryLogs);

    dom.farmerUploadForm.reset();
    updatePrivacyPreview();
    alert(`Produce Batch ${newBatch.batch_id} registered with SHA-256 Privacy Hash!`);
  }

  async function handleDriverSubmit(e) {
    e.preventDefault();

    const truck = dom.truckId.value;
    const driver = dom.driverName.value;
    const phone = dom.driverPhone.value;
    const source = dom.sourceLocation.value;
    const destination = dom.destinationRoute.value;

    const newTrip = {
      trip_id: `TRIP-KCC-${Date.now().toString().slice(-4)}`,
      truck_id: String(truck).toUpperCase().trim(),
      driver_name: driver.trim(),
      driver_phone: phone ? maskPhone(phone) : '+91 97*** **345',
      container_id: CONTAINER_ID,
      source: source || 'Theni Cold Hub',
      destination: destination,
      status: 'DISPATCHED',
      distance_km: 380,
      completed_km: 0,
      avg_speed_kmh: 0,
      shock_events_count: 0,
      last_shock_time: 'None',
      dispatched_at: new Date().toISOString()
    };

    if (!isStandaloneMode && window.location.protocol !== 'file:') {
      try {
        await fetch('/api/driver/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newTrip)
        });
      } catch (err) {
        console.warn('[Driver Assign] API failed, storing locally.');
      }
    }

    state.driverTrips.unshift(newTrip);
    renderDriverTrips(state.driverTrips);

    const adv = {
      id: `ADV-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'DRIVER_DISPATCH_NOTICE',
      channel: 'In-Cabin LoRa Receiver',
      target: `Driver ${newTrip.driver_name} (${newTrip.truck_id})`,
      payload_hex: `0x44495350415443483A${newTrip.trip_id}`,
      status: 'DELIVERED',
      details: `Trip ${newTrip.trip_id} dispatched to ${newTrip.destination}. Container: ${newTrip.container_id}. LoRa 433MHz telemetry active.`
    };
    state.advisoryLogs.unshift(adv);
    renderAdvisoryLogs(state.advisoryLogs);

    dom.driverAssignForm.reset();
    alert(`Logistics Trip ${newTrip.trip_id} dispatched for Truck ${newTrip.truck_id}!`);
  }

  // --------------------------------------------------------------------------
  // 9. SIMULATION INJECTOR HANDLERS
  // --------------------------------------------------------------------------
  function triggerSimulation(type) {
    const timeLabel = new Date().toLocaleTimeString();

    if (type === 'road_shock') {
      state.telemetry.vibration_g = 0.88;
      state.telemetry.shock_peak_g = 2.65;
      state.telemetry.is_alert = true;
      state.telemetry.alert_reason = 'ROAD_SHOCK';
      if (state.driverTrips.length > 0) {
        state.driverTrips[0].shock_events_count++;
        state.driverTrips[0].last_shock_time = timeLabel;
        renderDriverTrips(state.driverTrips);
      }
      state.advisoryLogs.unshift({
        id: `ADV-${Date.now().toString().slice(-4)}`,
        timestamp: timeLabel,
        type: 'DRIVER_SHOCK_ALARM',
        channel: 'LoRa 433MHz Shock IRQ',
        target: `Truck ${state.driverTrips[0]?.truck_id || 'TN-72-AB-1234'}`,
        payload_hex: '0x53484F434B3A20322E363547',
        status: 'EMERGENCY_ALARM',
        details: 'Heavy Pothole Shock (2.65G) detected by MPU6050! Driver advised to inspect pallet fastening.'
      });
    } else if (type === 'thermal_breach') {
      state.telemetry.temp_c = 12.8;
      state.telemetry.humidity_pct = 74.2;
      state.telemetry.is_alert = true;
      state.telemetry.alert_reason = 'THERMAL_BREACH';
      state.advisoryLogs.unshift({
        id: `ADV-${Date.now().toString().slice(-4)}`,
        timestamp: timeLabel,
        type: 'CRITICAL_THERMAL_ALARM',
        channel: 'GSM SMS / LoRa Beacon',
        target: 'Farmer & Fleet Manager',
        payload_hex: '0x54454D503A2031322E3843',
        status: 'ALARM_DISPATCHED',
        details: 'THERMAL BREACH: Container Temp 12.8°C exceeds critical threshold (10°C). Compressor fault warning!'
      });
    } else if (type === 'ethylene_surge') {
      state.telemetry.ethylene_ppm = 4.65;
      state.telemetry.is_alert = true;
      state.telemetry.alert_reason = 'ETHYLENE_SPIKE';
      state.advisoryLogs.unshift({
        id: `ADV-${Date.now().toString().slice(-4)}`,
        timestamp: timeLabel,
        type: 'FARMER_SPOILAGE_ALARM',
        channel: 'SMS Gateway Broadcast',
        target: 'All Batch Farmers',
        payload_hex: '0x433248343A20342E363550504D',
        status: 'ALARM_DISPATCHED',
        details: 'Ethylene Surge (4.65 ppm) detected in Zone Mid-Top. Produce ripening rate accelerated +45%!'
      });
    } else if (type === 'offline_sync') {
      state.telemetry.offline_sync = true;
      state.advisoryLogs.unshift({
        id: `ADV-${Date.now().toString().slice(-4)}`,
        timestamp: timeLabel,
        type: 'LORA_OFFLINE_SYNC',
        channel: 'SPIFFS Flash Replay',
        target: 'LoRa 433MHz Gateway',
        payload_hex: '0x53594E433A20313420504B5453',
        status: 'SYNC_COMPLETE',
        details: 'Re-established RF Link. Flushed 14 buffered offline records from ESP32 SPIFFS flash.'
      });
    } else if (type === 'optimal_reset') {
      state.telemetry.temp_c = 3.9;
      state.telemetry.humidity_pct = 91.0;
      state.telemetry.ethylene_ppm = 0.62;
      state.telemetry.vibration_g = 0.06;
      state.telemetry.shock_peak_g = 0.15;
      state.telemetry.is_alert = false;
      state.telemetry.alert_reason = 'NORMAL';
      state.advisoryLogs.unshift({
        id: `ADV-${Date.now().toString().slice(-4)}`,
        timestamp: timeLabel,
        type: 'LORA_TELEMETRY',
        channel: '433.000 MHz (SX1278)',
        target: 'Gateway-HUB-1',
        payload_hex: '0x4F5054494D414C20534554',
        status: 'ACK_RECEIVED',
        details: 'Container KCC-001 restored to optimal 4.0°C cold-chain preservation setpoints.'
      });
    }

    const newPt = {
      time: timeLabel,
      timestamp: state.telemetry.timestamp,
      temp_c: state.telemetry.temp_c,
      humidity_pct: state.telemetry.humidity_pct,
      ethylene_ppm: state.telemetry.ethylene_ppm,
      vibration_g: state.telemetry.vibration_g,
      shock_peak_g: state.telemetry.shock_peak_g,
      battery_pct: state.telemetry.battery_pct
    };

    state.history.push(newPt);
    if (state.history.length > 30) state.history.shift();

    renderTelemetry(state.telemetry);
    appendChartPoint(newPt);
    renderAdvisoryLogs(state.advisoryLogs);

    // If backend is active, also trigger API
    if (!isStandaloneMode && window.location.protocol !== 'file:') {
      fetch('/api/simulate/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: type })
      }).catch(() => {});
    }
  }

  // --------------------------------------------------------------------------
  // 10. SETUP EVENT LISTENERS & INITIALIZATION
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    dom.farmerPhone.addEventListener('input', updatePrivacyPreview);
    dom.farmerUploadForm.addEventListener('submit', handleFarmerSubmit);
    dom.driverAssignForm.addEventListener('submit', handleDriverSubmit);

    document.querySelectorAll('.cargo-zone-card').forEach(card => {
      card.addEventListener('click', () => {
        const zoneKey = card.getAttribute('data-zone');
        if (zoneKey) updateZoneDetailPanel(zoneKey);
      });
    });

    const filterButtons = [
      { el: dom.filterAll, type: 'all' },
      { el: dom.filterLora, type: 'LORA' },
      { el: dom.filterSms, type: 'SMS' },
      { el: dom.filterAlarms, type: 'ALARM' }
    ];

    filterButtons.forEach(btn => {
      btn.el.addEventListener('click', () => {
        filterButtons.forEach(b => b.el.classList.remove('active'));
        btn.el.classList.add('active');
        activeLogsFilter = btn.type;
        renderAdvisoryLogs(state.advisoryLogs);
      });
    });

    dom.btnClearLogs.addEventListener('click', () => {
      state.advisoryLogs = [];
      renderAdvisoryLogs([]);
    });

    dom.btnSimRoadShock.addEventListener('click', () => triggerSimulation('road_shock'));
    dom.btnSimThermalBreach.addEventListener('click', () => triggerSimulation('thermal_breach'));
    dom.btnSimEthyleneSpike.addEventListener('click', () => triggerSimulation('ethylene_surge'));
    dom.btnSimOfflineSync.addEventListener('click', () => triggerSimulation('offline_sync'));
    dom.btnSimResetOptimal.addEventListener('click', () => triggerSimulation('optimal_reset'));
  }

  function init() {
    console.log('[KCC] Initializing Kisan Cool Container Platform...');
    initCharts();
    setupEventListeners();
    renderTelemetry(state.telemetry);
    renderFarmerBatches(state.farmerBatches);
    renderDriverTrips(state.driverTrips);
    renderAdvisoryLogs(state.advisoryLogs);
    connectWebSocket();

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

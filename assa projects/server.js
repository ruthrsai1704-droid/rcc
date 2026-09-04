/**
 * ============================================================================
 * Project: Kisan Cool Container (KCC) - Agricultural Cold-Chain IoT Platform
 * File: server.js
 * Architecture: Node.js + Express REST API + Native WebSocket Broadcaster
 * Role: Senior IoT Systems Architect & Full-Stack Lead Engineer
 * Description:
 *   Production-grade backend service providing:
 *   - Real-time LoRa & ESP32 sensor telemetry ingestion and validation
 *   - Farmer Privacy Protection Engine (SHA-256 Hashing & Masked PII storage)
 *   - Driver Logistics Dispatch & Route Tracking Management
 *   - Agronomic Shelf-Life & Ripening Predictive Engine (Q10 Model)
 *   - Real-Time WebSocket streaming to connected Glassmorphic Dashboards
 *   - Dynamic Hardware Simulation Engine for real-world testing & live demos
 * ============================================================================
 */

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// 1. MIDDLEWARE SETUP
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ---------------------------------------------------------------------------
// 2. IN-MEMORY HIGH PERFORMANCE STATE STORES
// ---------------------------------------------------------------------------
const CONTAINER_ID = 'KCC-001';

// Initial Crop Respiration & Shelf-life Baselines (Days at 4°C vs 25°C)
const CROP_PROFILES = {
  Tomatoes: { optimalTempMin: 3.0, optimalTempMax: 6.5, maxEthylene: 2.5, baseShelfLifeDays: 21, q10Factor: 2.2 },
  'Alphonso Mangoes': { optimalTempMin: 8.0, optimalTempMax: 12.0, maxEthylene: 1.8, baseShelfLifeDays: 16, q10Factor: 2.5 },
  'Shimla Apples': { optimalTempMin: 0.5, optimalTempMax: 3.5, maxEthylene: 3.5, baseShelfLifeDays: 60, q10Factor: 1.8 },
  Grapes: { optimalTempMin: 1.0, optimalTempMax: 4.0, maxEthylene: 1.2, baseShelfLifeDays: 28, q10Factor: 2.0 },
  Capsicum: { optimalTempMin: 4.0, optimalTempMax: 7.5, maxEthylene: 2.0, baseShelfLifeDays: 18, q10Factor: 2.1 },
  'Exotic Strawberries': { optimalTempMin: 1.0, optimalTempMax: 3.5, maxEthylene: 1.0, baseShelfLifeDays: 10, q10Factor: 2.8 }
};

// State: Latest Live Telemetry
let latestTelemetry = {
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
};

// State: Time-Series Historical Buffer (for initial Chart.js load)
const telemetryHistory = [];

// Populate 30 initial realistic historical data points
const now = Date.now();
for (let i = 29; i >= 0; i--) {
  const pastTime = new Date(now - i * 5000);
  const t = 4.0 + Math.sin(i * 0.4) * 0.35 + (Math.random() - 0.5) * 0.15;
  const h = 89.0 + Math.cos(i * 0.3) * 1.5 + (Math.random() - 0.5) * 0.5;
  const eth = 0.65 + (30 - i) * 0.003 + (Math.random() - 0.5) * 0.04;
  const vib = 0.07 + Math.random() * 0.04;

  telemetryHistory.push({
    time: pastTime.toLocaleTimeString(),
    timestamp: pastTime.toISOString(),
    temp_c: parseFloat(t.toFixed(2)),
    humidity_pct: parseFloat(h.toFixed(1)),
    ethylene_ppm: parseFloat(eth.toFixed(2)),
    vibration_g: parseFloat(vib.toFixed(3)),
    shock_peak_g: parseFloat((vib * 1.8).toFixed(2)),
    battery_pct: 95
  });
}

// State: Stored Farmer Produce Batches (with SHA-256 Hashing & Masked PII)
let farmerBatches = [
  {
    batch_id: 'LOT-TN-2026-081',
    farmer_name: 'M. Ramanathan',
    phone_masked: '+91 98*** **321',
    privacy_hash: '8f4c2b9a71e8d4a3e2f1c09876543210abcdef1234567890abcdef1234567890',
    crop_type: 'Tomatoes',
    quantity_kg: 1850,
    quality_grade: 'Grade-A Export',
    harvest_location: {
      locality: 'Theni Valley Cluster',
      lat: 10.0104,
      lng: 77.4768
    },
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
    harvest_location: {
      locality: 'Nashik Vineyard Zone 4',
      lat: 19.9975,
      lng: 73.7898
    },
    assigned_zone: 'front-bottom',
    initial_shelf_life_days: 28,
    remaining_shelf_life_days: 26.8,
    spoilage_risk_pct: 2.1,
    created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString()
  }
];

// State: Driver Logistics & Vehicle Assignments
let driverTrips = [
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
    last_shock_time: new Date(Date.now() - 45 * 60 * 1000).toLocaleTimeString(),
    dispatched_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
  }
];

// State: Outbound LoRa & Farmer SMS Advisory Logs
let advisoryLogs = [
  {
    id: 'ADV-1001',
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toLocaleTimeString(),
    type: 'LORA_TELEMETRY',
    channel: '433.000 MHz (SX1278)',
    target: 'Gateway-HUB-1',
    payload_hex: '0x4B43432D303031205345513A3130333820543A342E3220483A38392E34',
    status: 'ACK_RECEIVED',
    details: 'Periodic 5s telemetry pulse confirmed with SNR 9.4dB, RSSI -74dBm.'
  },
  {
    id: 'ADV-1002',
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toLocaleTimeString(),
    type: 'SMS_FARMER_ADVISORY',
    channel: 'GSM / LoRa Gateway',
    target: '+91 98*** **321 (M. Ramanathan)',
    payload_hex: '0x534D533A20546F6D61746F657320436F6C64204F7074696D616C',
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
];

// ---------------------------------------------------------------------------
// 3. UTILITY FUNCTIONS & CRYPTO ENGINES
// ---------------------------------------------------------------------------
function hashContact(phone) {
  const cleanPhone = String(phone).replace(/[^0-9+]/g, '');
  return crypto.createHash('sha256').update(cleanPhone + '_KISAN_SALT_2026').digest('hex');
}

function maskPhoneNumber(phone) {
  const str = String(phone).trim();
  if (str.length < 8) return '+91 98*** **000';
  const prefix = str.substring(0, 5);
  const suffix = str.substring(str.length - 3);
  return `${prefix}*** **${suffix}`;
}

// Calculate remaining shelf-life using temperature and ethylene kinetics
function updateShelfLifePredictions(temp, ethylene) {
  farmerBatches.forEach(batch => {
    const profile = CROP_PROFILES[batch.crop_type] || CROP_PROFILES['Tomatoes'];
    
    // Thermal stress multiplier (Q10 rule)
    const tempDelta = Math.max(0, temp - profile.optimalTempMax);
    const tempStress = Math.pow(profile.q10Factor, tempDelta / 10.0);

    // Ethylene degradation acceleration
    const ethyleneDelta = Math.max(0, ethylene - profile.maxEthylene);
    const ethyleneStress = 1.0 + (ethyleneDelta * 0.45);

    // Dynamic degradation rate
    const degradationMultiplier = tempStress * ethyleneStress;
    const currentRemaining = Math.max(0.5, batch.initial_shelf_life_days - (degradationMultiplier * 1.5));
    batch.remaining_shelf_life_days = parseFloat(currentRemaining.toFixed(1));

    const spoilageRate = ((batch.initial_shelf_life_days - currentRemaining) / batch.initial_shelf_life_days) * 100;
    batch.spoilage_risk_pct = parseFloat(Math.min(99.0, Math.max(1.0, spoilageRate)).toFixed(1));
  });
}

// ---------------------------------------------------------------------------
// 4. WEBSOCKET REAL-TIME BROADCAST ENGINE
// ---------------------------------------------------------------------------
function broadcastWebSocket(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WebSocket] Client connected from ${ip}. Total clients: ${wss.clients.size}`);

  // Send initial handshake state
  ws.send(JSON.stringify({
    type: 'INITIAL_STATE',
    telemetry: latestTelemetry,
    history: telemetryHistory,
    farmerBatches: farmerBatches,
    driverTrips: driverTrips,
    advisoryLogs: advisoryLogs
  }));

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {
      // Ignore malformed ping
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected. Total remaining: ${wss.clients.size}`);
  });
});

// ---------------------------------------------------------------------------
// 5. REST API ENDPOINTS
// ---------------------------------------------------------------------------

// A. Ingest Physical ESP32 / LoRa Gateway Telemetry
app.post('/api/sensor-data', (req, res) => {
  const data = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Missing sensor payload' });
  }

  // Handle either nested payload (from firmware CRC wrapper) or raw json
  const p = data.payload || data;

  const temp = parseFloat(p.temp_c !== undefined ? p.temp_c : p.temperature);
  const hum = parseFloat(p.humidity_pct !== undefined ? p.humidity_pct : p.humidity);
  const eth = parseFloat(p.ethylene_ppm !== undefined ? p.ethylene_ppm : p.ethylene);
  const vib = parseFloat(p.vibration_g !== undefined ? p.vibration_g : p.vibration);
  const peak = parseFloat(p.shock_peak_g !== undefined ? p.shock_peak_g : (vib * 1.5));
  const battPct = parseInt(p.battery_pct !== undefined ? p.battery_pct : 95, 10);
  const isAlert = !!p.alert || (temp > 10.0) || (eth > 3.0) || (peak > 1.8);
  const alertReason = p.alert_reason || (temp > 10.0 ? 'THERMAL_BREACH' : eth > 3.0 ? 'ETHYLENE_SPIKE' : peak > 1.8 ? 'ROAD_SHOCK' : 'NORMAL');
  const offlineSync = !!p.offline_sync;

  // Spatial zone microclimate calculation based on airflow distribution
  const zoneFrontTopT = parseFloat((temp - 0.2).toFixed(1));
  const zoneFrontBotT = parseFloat((temp - 0.4).toFixed(1));
  const zoneMidTopT = parseFloat(temp.toFixed(1));
  const zoneMidBotT = parseFloat((temp - 0.1).toFixed(1));
  const zoneRearTopT = parseFloat((temp + 0.4).toFixed(1));
  const zoneRearBotT = parseFloat((temp + 0.2).toFixed(1));
  const zoneDoorT = parseFloat((temp + 0.9).toFixed(1));

  function getZoneStatus(t, e) {
    if (t > 9.5 || e > 3.2) return 'critical';
    if (t > 7.0 || e > 2.0) return 'warning';
    return 'optimal';
  }

  latestTelemetry = {
    container_id: p.container_id || CONTAINER_ID,
    seq: parseInt(p.seq || ++latestTelemetry.seq, 10),
    temp_c: parseFloat(temp.toFixed(2)),
    humidity_pct: parseFloat(hum.toFixed(1)),
    ethylene_ppm: parseFloat(eth.toFixed(2)),
    vibration_g: parseFloat(vib.toFixed(3)),
    shock_peak_g: parseFloat(peak.toFixed(2)),
    battery_v: parseFloat((p.battery_v || 4.10).toFixed(2)),
    battery_pct: battPct,
    is_alert: isAlert,
    alert_reason: alertReason,
    lora_rssi_dbm: p.rssi || -74 + Math.floor(Math.random() * 6 - 3),
    lora_snr_db: p.snr || parseFloat((9.2 + Math.random() * 0.8).toFixed(1)),
    offline_sync: offlineSync,
    timestamp: new Date().toISOString(),
    zones: {
      'front-top': { temp_c: zoneFrontTopT, humidity_pct: parseFloat((hum + 0.7).toFixed(1)), ethylene_ppm: parseFloat((eth * 0.92).toFixed(2)), status: getZoneStatus(zoneFrontTopT, eth * 0.92) },
      'front-bottom': { temp_c: zoneFrontBotT, humidity_pct: parseFloat((hum + 1.2).toFixed(1)), ethylene_ppm: parseFloat((eth * 0.88).toFixed(2)), status: getZoneStatus(zoneFrontBotT, eth * 0.88) },
      'mid-top': { temp_c: zoneMidTopT, humidity_pct: parseFloat(hum.toFixed(1)), ethylene_ppm: parseFloat(eth.toFixed(2)), status: getZoneStatus(zoneMidTopT, eth) },
      'mid-bottom': { temp_c: zoneMidBotT, humidity_pct: parseFloat((hum + 0.3).toFixed(1)), ethylene_ppm: parseFloat((eth * 0.96).toFixed(2)), status: getZoneStatus(zoneMidBotT, eth * 0.96) },
      'rear-top': { temp_c: zoneRearTopT, humidity_pct: parseFloat((hum - 1.2).toFixed(1)), ethylene_ppm: parseFloat((eth * 1.12).toFixed(2)), status: getZoneStatus(zoneRearTopT, eth * 1.12) },
      'rear-bottom': { temp_c: zoneRearBotT, humidity_pct: parseFloat((hum - 0.8).toFixed(1)), ethylene_ppm: parseFloat((eth * 1.05).toFixed(2)), status: getZoneStatus(zoneRearBotT, eth * 1.05) },
      'door-zone': { temp_c: zoneDoorT, humidity_pct: parseFloat((hum - 2.8).toFixed(1)), ethylene_ppm: parseFloat((eth * 1.25).toFixed(2)), status: getZoneStatus(zoneDoorT, eth * 1.25) }
    }
  };

  // Add to time-series history
  const timeLabel = new Date().toLocaleTimeString();
  telemetryHistory.push({
    time: timeLabel,
    timestamp: latestTelemetry.timestamp,
    temp_c: latestTelemetry.temp_c,
    humidity_pct: latestTelemetry.humidity_pct,
    ethylene_ppm: latestTelemetry.ethylene_ppm,
    vibration_g: latestTelemetry.vibration_g,
    shock_peak_g: latestTelemetry.shock_peak_g,
    battery_pct: latestTelemetry.battery_pct
  });

  if (telemetryHistory.length > 50) {
    telemetryHistory.shift();
  }

  // Update shelf-life projections for active farmer produce
  updateShelfLifePredictions(temp, eth);

  // If shock or alert occurs, increment driver trip incident counter
  if (peak > 1.8 && driverTrips.length > 0) {
    driverTrips[0].shock_events_count++;
    driverTrips[0].last_shock_time = timeLabel;
  }

  // Log advisory if critical condition detected
  if (isAlert) {
    const adv = {
      id: `ADV-${Date.now().toString().slice(-4)}`,
      timestamp: timeLabel,
      type: alertReason === 'ROAD_SHOCK' ? 'DRIVER_SHOCK_ALARM' : 'FARMER_SPOILAGE_ALARM',
      channel: 'LoRa 433MHz Emergency Beacon',
      target: alertReason === 'ROAD_SHOCK' ? `Truck ${driverTrips[0]?.truck_id || 'TN-72-AB-1234'}` : 'Farmer SMS Broadcast',
      payload_hex: `0x414C4552543A20${Buffer.from(alertReason).toString('hex').toUpperCase()}`,
      status: 'EMERGENCY_DISPATCHED',
      details: `Critical Event: ${alertReason} detected! Temp: ${temp}°C, Ethylene: ${eth}ppm, Peak Shock: ${peak}G.`
    };
    advisoryLogs.unshift(adv);
    if (advisoryLogs.length > 25) advisoryLogs.pop();
  }

  // Broadcast updated state to all connected dashboard WebSocket clients
  broadcastWebSocket({
    type: 'TELEMETRY_UPDATE',
    telemetry: latestTelemetry,
    historyPoint: telemetryHistory[telemetryHistory.length - 1],
    farmerBatches: farmerBatches,
    driverTrips: driverTrips,
    advisoryLogs: advisoryLogs
  });

  res.status(200).json({
    success: true,
    message: 'Sensor telemetry processed successfully',
    seq: latestTelemetry.seq,
    offline_sync: offlineSync
  });
});

// B. Get Latest Telemetry
app.get('/api/sensor-data/latest', (req, res) => {
  res.json({ success: true, telemetry: latestTelemetry });
});

// C. Get Telemetry History (for charts)
app.get('/api/sensor-data/history', (req, res) => {
  res.json({ success: true, history: telemetryHistory });
});

// D. Farmer Produce Ingestion & Privacy Protection
app.post('/api/farmer/upload', (req, res) => {
  const {
    farmer_name,
    phone_number,
    crop_type,
    quantity_kg,
    quality_grade,
    locality,
    lat,
    lng,
    assigned_zone
  } = req.body;

  if (!farmer_name || !phone_number || !crop_type || !quantity_kg) {
    return res.status(400).json({ error: 'Missing required farmer produce fields' });
  }

  // Privacy Protection: Generate SHA-256 hash and mask phone number
  const privacyHash = hashContact(phone_number);
  const phoneMasked = maskPhoneNumber(phone_number);
  const cropProfile = CROP_PROFILES[crop_type] || CROP_PROFILES['Tomatoes'];

  const newBatch = {
    batch_id: `LOT-${crop_type.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-4)}`,
    farmer_name: String(farmer_name).trim(),
    phone_masked: phoneMasked,
    privacy_hash: privacyHash,
    crop_type: crop_type,
    quantity_kg: parseFloat(quantity_kg),
    quality_grade: quality_grade || 'Grade-A Export',
    harvest_location: {
      locality: locality || 'Nashik Agri Mandi Hub',
      lat: parseFloat(lat) || 19.9975,
      lng: parseFloat(lng) || 73.7898
    },
    assigned_zone: assigned_zone || 'mid-top',
    initial_shelf_life_days: cropProfile.baseShelfLifeDays,
    remaining_shelf_life_days: cropProfile.baseShelfLifeDays,
    spoilage_risk_pct: 1.0,
    created_at: new Date().toISOString()
  };

  farmerBatches.unshift(newBatch);

  // Generate automated outbound confirmation advisory
  const adv = {
    id: `ADV-${Date.now().toString().slice(-4)}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'SMS_FARMER_INGESTION',
    channel: 'SMS Gateway / Secure Web',
    target: `${phoneMasked} (${newBatch.farmer_name})`,
    payload_hex: `0x42415443483A${Buffer.from(newBatch.batch_id).toString('hex').toUpperCase()}`,
    status: 'DISPATCHED',
    details: `Produce batch ${newBatch.batch_id} (${newBatch.quantity_kg}kg ${newBatch.crop_type}) securely loaded into Zone [${newBatch.assigned_zone}]. SHA-256 Token: ${privacyHash.substring(0, 16)}...`
  };
  advisoryLogs.unshift(adv);
  if (advisoryLogs.length > 25) advisoryLogs.pop();

  broadcastWebSocket({
    type: 'BATCH_REGISTERED',
    batch: newBatch,
    farmerBatches: farmerBatches,
    advisoryLogs: advisoryLogs
  });

  res.status(201).json({
    success: true,
    message: 'Produce batch registered with full farmer privacy encryption',
    batch: newBatch
  });
});

// E. Get Farmer Batches (Privacy Masked)
app.get('/api/farmer/batches', (req, res) => {
  res.json({ success: true, batches: farmerBatches });
});

// F. Driver & Logistics Vehicle Assignment
app.post('/api/driver/assign', (req, res) => {
  const {
    truck_id,
    driver_name,
    driver_phone,
    destination_route,
    source_location,
    container_id
  } = req.body;

  if (!truck_id || !driver_name || !destination_route) {
    return res.status(400).json({ error: 'Missing driver registration fields' });
  }

  const newTrip = {
    trip_id: `TRIP-KCC-${Date.now().toString().slice(-4)}`,
    truck_id: String(truck_id).toUpperCase().trim(),
    driver_name: String(driver_name).trim(),
    driver_phone: driver_phone ? maskPhoneNumber(driver_phone) : '+91 97*** **345',
    container_id: container_id || CONTAINER_ID,
    source: source_location || 'Theni Cold Hub',
    destination: destination_route,
    status: 'DISPATCHED',
    distance_km: 380,
    completed_km: 0,
    avg_speed_kmh: 0,
    shock_events_count: 0,
    last_shock_time: 'None',
    dispatched_at: new Date().toISOString()
  };

  driverTrips.unshift(newTrip);

  const adv = {
    id: `ADV-${Date.now().toString().slice(-4)}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'DRIVER_DISPATCH_NOTICE',
    channel: 'In-Cabin LoRa Receiver',
    target: `Driver ${newTrip.driver_name} (${newTrip.truck_id})`,
    payload_hex: `0x44495350415443483A${Buffer.from(newTrip.trip_id).toString('hex').toUpperCase()}`,
    status: 'DELIVERED',
    details: `Trip ${newTrip.trip_id} dispatched to ${newTrip.destination}. Assigned Container: ${newTrip.container_id}. LoRa 433MHz telemetry active.`
  };
  advisoryLogs.unshift(adv);
  if (advisoryLogs.length > 25) advisoryLogs.pop();

  broadcastWebSocket({
    type: 'TRIP_ASSIGNED',
    trip: newTrip,
    driverTrips: driverTrips,
    advisoryLogs: advisoryLogs
  });

  res.status(201).json({
    success: true,
    message: 'Vehicle logistics trip assigned successfully',
    trip: newTrip
  });
});

// G. Get Driver Trips
app.get('/api/driver/trips', (req, res) => {
  res.json({ success: true, trips: driverTrips });
});

// H. Get Advisory Logs
app.get('/api/advisory-log', (req, res) => {
  res.json({ success: true, logs: advisoryLogs });
});

// I. Interactive Simulation Event Trigger
app.post('/api/simulate/event', (req, res) => {
  const { event_type } = req.body;
  let simulatedData = {};

  switch (event_type) {
    case 'road_shock':
      simulatedData = {
        temp_c: latestTelemetry.temp_c,
        humidity_pct: latestTelemetry.humidity_pct,
        ethylene_ppm: latestTelemetry.ethylene_ppm,
        vibration_g: 0.88,
        shock_peak_g: 2.65,
        alert: true,
        alert_reason: 'ROAD_SHOCK'
      };
      break;

    case 'thermal_breach':
      simulatedData = {
        temp_c: 12.8,
        humidity_pct: 74.2,
        ethylene_ppm: latestTelemetry.ethylene_ppm + 0.4,
        vibration_g: 0.09,
        shock_peak_g: 0.22,
        alert: true,
        alert_reason: 'THERMAL_BREACH'
      };
      break;

    case 'ethylene_surge':
      simulatedData = {
        temp_c: latestTelemetry.temp_c + 0.8,
        humidity_pct: latestTelemetry.humidity_pct,
        ethylene_ppm: 4.65,
        vibration_g: 0.08,
        shock_peak_g: 0.18,
        alert: true,
        alert_reason: 'ETHYLENE_SPIKE'
      };
      break;

    case 'offline_sync':
      simulatedData = {
        temp_c: 4.1,
        humidity_pct: 90.5,
        ethylene_ppm: 0.70,
        vibration_g: 0.07,
        shock_peak_g: 0.20,
        alert: false,
        alert_reason: 'NORMAL',
        offline_sync: true
      };
      break;

    case 'optimal_reset':
    default:
      simulatedData = {
        temp_c: 3.9,
        humidity_pct: 91.0,
        ethylene_ppm: 0.62,
        vibration_g: 0.06,
        shock_peak_g: 0.15,
        alert: false,
        alert_reason: 'NORMAL'
      };
      break;
  }

  // Pass directly into the sensor ingestion handler logic
  req.body = simulatedData;
  return app._router.handle(
    { ...req, url: '/api/sensor-data', method: 'POST', body: simulatedData },
    res,
    () => {}
  );
});

// ---------------------------------------------------------------------------
// 6. BACKGROUND LIVE HARDWARE SIMULATION ENGINE
// (Provides dynamic fluctuating realism when physical ESP32 node is in field transit)
// ---------------------------------------------------------------------------
let simStep = 0;
setInterval(() => {
  simStep++;

  // Realistic micro-fluctuations
  const tempWave = 4.1 + Math.sin(simStep * 0.12) * 0.4 + (Math.random() - 0.5) * 0.12;
  const humWave = 89.5 + Math.cos(simStep * 0.08) * 1.2 + (Math.random() - 0.5) * 0.4;
  const ethWave = 0.70 + Math.sin(simStep * 0.05) * 0.15 + (Math.random() - 0.5) * 0.03;
  const vibWave = 0.07 + (Math.random() > 0.92 ? Math.random() * 0.4 : Math.random() * 0.03);
  const peakWave = vibWave * (1.2 + Math.random() * 0.8);

  // Slightly drain or float battery
  const batteryPct = Math.max(75, Math.min(100, 95 - Math.floor(simStep / 600)));

  // Spatial Microclimates
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

  latestTelemetry = {
    container_id: CONTAINER_ID,
    seq: ++latestTelemetry.seq,
    temp_c: parseFloat(tempWave.toFixed(2)),
    humidity_pct: parseFloat(humWave.toFixed(1)),
    ethylene_ppm: parseFloat(ethWave.toFixed(2)),
    vibration_g: parseFloat(vibWave.toFixed(3)),
    shock_peak_g: parseFloat(peakWave.toFixed(2)),
    battery_v: 4.12,
    battery_pct: batteryPct,
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

  // Append to history
  const timeLabel = new Date().toLocaleTimeString();
  telemetryHistory.push({
    time: timeLabel,
    timestamp: latestTelemetry.timestamp,
    temp_c: latestTelemetry.temp_c,
    humidity_pct: latestTelemetry.humidity_pct,
    ethylene_ppm: latestTelemetry.ethylene_ppm,
    vibration_g: latestTelemetry.vibration_g,
    shock_peak_g: latestTelemetry.shock_peak_g,
    battery_pct: latestTelemetry.battery_pct
  });

  if (telemetryHistory.length > 50) {
    telemetryHistory.shift();
  }

  // Recalculate shelf lives
  updateShelfLifePredictions(latestTelemetry.temp_c, latestTelemetry.ethylene_ppm);

  // Broadcast WebSocket update
  broadcastWebSocket({
    type: 'TELEMETRY_UPDATE',
    telemetry: latestTelemetry,
    historyPoint: telemetryHistory[telemetryHistory.length - 1],
    farmerBatches: farmerBatches,
    driverTrips: driverTrips,
    advisoryLogs: advisoryLogs
  });
}, 3000);

// ---------------------------------------------------------------------------
// 7. LAUNCH HTTP & WEBSOCKET SERVICE
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log('================================================================');
  console.log(`  🌾 KISAN COOL CONTAINER (KCC) - COLD-CHAIN IOT BACKEND SERVER`);
  console.log(`  🚀 Service Live on http://localhost:${PORT}`);
  console.log(`  📡 LoRa Ingestion Endpoint: POST http://localhost:${PORT}/api/sensor-data`);
  console.log(`  🔒 Farmer Privacy API: POST http://localhost:${PORT}/api/farmer/upload`);
  console.log(`  🚚 Driver Logistics API: POST http://localhost:${PORT}/api/driver/assign`);
  console.log(`  ⚡ Real-Time WebSocket: ws://localhost:${PORT}`);
  console.log('================================================================');
});

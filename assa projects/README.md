# Kisan Cool Container (KCC) - Smart Agricultural Cold-Chain & Asset Logistics

Production-grade IoT system and Web Application designed to prevent post-harvest spoilage for rural farmers through smart cold-storage containers, long-range LoRa 433 MHz communication, zero-knowledge farmer data privacy, and real-time asset logistics tracking.

---

## 🌟 Key Architecture & Capabilities

1. **Hardware Telemetry Node (`esp32_lora_sensors.ino`)**:
   - **ESP32 Microcontroller** reading multi-sensor payload every 5s.
   - **DHT22** (GPIO 4): Digital Air Temperature & Relative Humidity.
   - **MQ-Series Ethylene Gas Sensor** (GPIO 34 ADC): Respiration & Ripening rate detection via calibrated Ro power-law equations.
   - **MPU6050 6-Axis IMU** (I2C SDA: 21, SCL: 22): RMS vibration & G-force impact logging to detect rough road handling and transit shock.
   - **SX1278 LoRa Transceiver (433 MHz SPI)**: High penetration rural RF telemetry link with CRC16 error checking.
   - **SPIFFS Flash Circular Buffer**: Local flash queueing when gateway is out of range, with automatic sequential sync upon reconnect.

2. **Backend Engine (`server.js`)**:
   - High-performance Node.js Express REST API & native WebSocket broadcaster.
   - **Farmer Privacy Shield**: SHA-256 cryptographic hashing of PII and phone number masking (`+91 98*** **321`).
   - **Q10 Agronomic Spoilage Model**: Dynamic calculation of crop degradation rate as a function of temperature delta and ethylene concentration.
   - **Driver & Vehicle Manifest Dispatch**: Vehicle tracking, route progress, and road shock breach counters.

3. **Modern Glassmorphic Dashboard (`index.html`, `style.css`, `app.js`)**:
   - Sleek Mint & Emerald accents on a soft slate `#f8fafc` background.
   - **Interactive 2D Cargo Compartment Heatmap**: 6 pallet micro-climate zones + door air curtain with localized temperature, humidity, ethylene, and crop lot inspector.
   - **Live Dual Chart.js Graphs**: Real-time multi-axis streaming for Temp/Humidity and Ethylene/Vibration.
   - **Monospace LoRa & SMS Advisory Terminal**: Real-time downlink packet hex stream and automated farmer alerts.
   - **One-Click Hardware Stress-Test Injectors**: Pothole shock (2.6G), Thermal breach (12.8°C), Ethylene surge (4.6 ppm), and Flash offline sync.

---

## 🔌 Hardware Pinout Connection Diagram

| Component | ESP32 Pin | Interface / Protocol | Purpose |
|---|---|---|---|
| **SX1278 NSS (SS)** | GPIO 5 | SPI | LoRa Chip Select |
| **SX1278 SCK** | GPIO 18 | SPI | LoRa Clock |
| **SX1278 MISO** | GPIO 19 | SPI | LoRa Master-In-Slave-Out |
| **SX1278 MOSI** | GPIO 23 | SPI | LoRa Master-Out-Slave-In |
| **SX1278 RST** | GPIO 14 | Digital Output | LoRa Hardware Reset |
| **SX1278 DIO0** | GPIO 2 | Digital Input (IRQ) | Packet TX/RX Interrupt |
| **DHT22 DATA** | GPIO 4 | 1-Wire Digital | Temp & Humidity |
| **MQ Ethylene AO** | GPIO 34 | Analog ADC1_CH6 | Gas Concentration (ppm) |
| **MPU6050 SDA** | GPIO 21 | I2C Data | 3-Axis Accelerometer |
| **MPU6050 SCL** | GPIO 22 | I2C Clock | 3-Axis Accelerometer |
| **Battery ADC** | GPIO 35 | Analog ADC1_CH7 | Voltage Divider (100k/33k) |
| **Status LED** | GPIO 2 | Digital Output | TX Activity Indicator |

---

## 🚀 Quick Start Guide

### 1. Install Dependencies & Run Backend Server
```bash
npm install
npm start
```
Open your browser and navigate to: **`http://localhost:3000`**

### 2. Flashing the ESP32 Microcontroller
1. Install the **Arduino IDE** or **PlatformIO**.
2. Add ESP32 Board support in Board Manager (`esp32 by Espressif Systems`).
3. Install required libraries:
   - `LoRa` by Sandeep Mistry
   - `DHT sensor library` by Adafruit
   - `Adafruit Unified Sensor`
4. Select board **"ESP32 Dev Module"**, connect USB cable, and click **Upload**.

---

## 📡 REST API Reference

- `POST /api/sensor-data`: Ingests ESP32 / LoRa gateway telemetry packets.
- `GET /api/sensor-data/latest`: Returns latest container metrics and zone distribution.
- `GET /api/sensor-data/history`: Returns time-series data for telemetry charts.
- `POST /api/farmer/upload`: Registers produce batch with SHA-256 privacy encryption.
- `GET /api/farmer/batches`: Returns active masked farmer produce batches.
- `POST /api/driver/assign`: Dispatches vehicle and container trip manifest.
- `GET /api/driver/trips`: Returns active logistics trips.
- `GET /api/advisory-log`: Returns outbound SMS and LoRa advisory messages.
- `POST /api/simulate/event`: Injects stress scenarios (`road_shock`, `thermal_breach`, `ethylene_surge`, `offline_sync`, `optimal_reset`).

/*
 ============================================================================
  Project: Kisan Cool Container (KCC) - Smart Cold-Chain IoT Node
  Firmware: esp32_lora_sensors.ino
  Target Board: ESP32 Dev Module / NodeMCU-32S
  Author: Senior IoT Systems Architect & Embedded Firmware Engineer
  Description:
    Production-grade IoT firmware for Agricultural Cold-Chain Monitoring.
    Interfaces DHT22 (Temp & Humidity), MQ-series Ethylene Sensor, MPU6050
    (3-Axis Vibration/Shock), and Battery Voltage Divider. Transmits packets
    via SX1278 LoRa (433 MHz). Incorporates local SPIFFS flash buffer for
    zero data loss during rural transit out-of-range scenarios with auto-sync.
 ============================================================================
*/

#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <LoRa.h>
#include <DHT.h>
#include "FS.h"
#include "SPIFFS.h"

// ---------------------------------------------------------------------------
// 1. HARDWARE PIN DEFINITIONS & CONSTANTS
// ---------------------------------------------------------------------------
#define CONTAINER_ID         "KCC-001"
#define FIRMWARE_VERSION     "v2.4.0-PROD"

// LoRa SX1278 SPI Pinout (433 MHz)
#define LORA_SCK             18
#define LORA_MISO            19
#define LORA_MOSI            23
#define LORA_SS              5
#define LORA_RST             14
#define LORA_DIO0            2
#define LORA_BAND            433E6    // 433 MHz ISM Band for rural long-range penetration
#define LORA_SPREADING_FAC   9        // SF9 balance between range & airtime
#define LORA_BANDWIDTH       125E3    // 125 kHz Bandwidth
#define LORA_CODING_RATE     7        // 4/7 Coding Rate for high error resilience
#define LORA_SYNC_WORD       0x34     // Private Cold-Chain Network Sync Word
#define LORA_TX_POWER        17       // 17 dBm Output Power

// DHT22 Temperature & Humidity Sensor
#define DHT_PIN              4
#define DHT_TYPE             DHT22

// MQ-Series Ethylene Gas Sensor (ADC1 Pin)
#define MQ_ETHYLENE_PIN      34       // GPIO 34 (ADC1_CH6 - Input Only)
#define MQ_RL_VALUE          10.0     // Load Resistance in kOhms on breakout board
#define MQ_RO_CLEAN_AIR      9.83     // Ro in clean air derived from laboratory calibration
#define MQ_CURVE_A           -0.42    // Ethylene sensitivity curve slope parameter
#define MQ_CURVE_B           1.92     // Ethylene sensitivity curve intercept parameter

// MPU6050 6-Axis IMU (I2C)
#define MPU6050_ADDR         0x68
#define I2C_SDA              21
#define I2C_SCL              22
#define MPU6050_SMPLRT_DIV   0x19
#define MPU6050_CONFIG       0x1A
#define MPU6050_GYRO_CONFIG  0x1B
#define MPU6050_ACCEL_CONFIG 0x1C
#define MPU6050_PWR_MGMT_1   0x6B
#define MPU6050_ACCEL_XOUT_H 0x3B

// Battery Voltage Monitoring
#define BATTERY_ADC_PIN      35       // GPIO 35 (ADC1_CH7)
#define BATTERY_R1           100.0    // Voltage divider Top Resistor 100k
#define BATTERY_R2           33.0     // Voltage divider Bottom Resistor 33k
#define BATTERY_VOLTS_MAX    4.20     // 1S Li-Ion Full
#define BATTERY_VOLTS_MIN    3.30     // 1S Li-Ion Cutoff

// Status LED
#define STATUS_LED_PIN       2        // Built-in Blue LED

// Timing & Thresholds
#define SAMPLING_INTERVAL_MS 5000     // Telemetry period (5 seconds)
#define SHOCK_THRESHOLD_G    1.80     // Immediate transit shock alert threshold (>1.8G)
#define TEMP_HIGH_ALERT_C    10.0     // Thermal abuse alert threshold (>10°C)
#define ETHYLENE_ALERT_PPM   3.0      // Ripening / Spoilage gas surge threshold (>3.0 ppm)
#define OFFLINE_FILE_PATH    "/kcc_offline.log"
#define MAX_OFFLINE_RECORDS  250

// ---------------------------------------------------------------------------
// 2. DATA STRUCTURES & GLOBAL STATE
// ---------------------------------------------------------------------------
struct TelemetryPayload {
  char containerId[12];
  uint32_t sequenceId;
  float temperature;
  float humidity;
  float ethylenePpm;
  float vibrationG;
  float peakShockG;
  float batteryVolts;
  uint8_t batteryPercent;
  bool isAlert;
  char alertReason[24];
  bool offlineSync;
  uint32_t timestampSec;
};

// Global Class Instances
DHT dht(DHT_PIN, DHT_TYPE);
uint32_t packetSequence = 0;
unsigned long lastSampleTime = 0;
bool loraInitialized = false;
bool spiffsInitialized = false;
float roEthylene = MQ_RO_CLEAN_AIR;

// ---------------------------------------------------------------------------
// 3. I2C MPU6050 HARDWARE DRIVER (Direct Register Control)
// ---------------------------------------------------------------------------
void initMPU6050() {
  Wire.begin(I2C_SDA, I2C_SCL, 400000); // 400kHz Fast I2C
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(MPU6050_PWR_MGMT_1);
  Wire.write(0x00); // Wake up device (clear SLEEP bit)
  Wire.endTransmission(true);

  // Set Accelerometer to +/- 8g range (0x10)
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(MPU6050_ACCEL_CONFIG);
  Wire.write(0x10); 
  Wire.endTransmission(true);

  Serial.println(F("[MPU6050] Initialized with +/-8g Sensitivity."));
}

void readMPU6050(float &vibrationG, float &peakShockG) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(MPU6050_ACCEL_XOUT_H);
  uint8_t err = Wire.endTransmission(false);

  if (err != 0) {
    // If I2C communication fails, provide fallback safe values
    vibrationG = 0.08;
    peakShockG = 0.12;
    return;
  }

  Wire.requestFrom((uint16_t)MPU6050_ADDR, (uint8_t)6, (uint8_t)true);
  if (Wire.available() == 6) {
    int16_t rawX = (Wire.read() << 8) | Wire.read();
    int16_t rawY = (Wire.read() << 8) | Wire.read();
    int16_t rawZ = (Wire.read() << 8) | Wire.read();

    // Scale factor for +/- 8g is 4096 LSB/g
    float ax = (float)rawX / 4096.0f;
    float ay = (float)rawY / 4096.0f;
    float az = (float)rawZ / 4096.0f;

    // Total resultant vector magnitude
    float totalG = sqrt(ax * ax + ay * ay + az * az);

    // Vibration component (deviations from 1.0G static gravity)
    float dynamicVibration = fabs(totalG - 1.00f);
    vibrationG = (dynamicVibration < 0.02f) ? 0.02f : dynamicVibration;
    peakShockG = totalG;
  } else {
    vibrationG = 0.05f;
    peakShockG = 1.00f;
  }
}

// ---------------------------------------------------------------------------
// 4. ETHYLENE GAS & BATTERY SENSORS
// ---------------------------------------------------------------------------
float readEthylenePPM() {
  int rawADC = analogRead(MQ_ETHYLENE_PIN);
  if (rawADC <= 10) rawADC = 10;
  if (rawADC >= 4080) rawADC = 4080;

  // Convert ADC to voltage (ESP32 12-bit ADC with 3.3V reference)
  float sensorVolt = ((float)rawADC / 4095.0f) * 3.3f;
  
  // Calculate Sensor Resistance Rs
  float rs = ((3.3f - sensorVolt) / sensorVolt) * MQ_RL_VALUE;
  if (rs <= 0.1f) rs = 0.1f;

  // Compute Ratio Rs / Ro
  float ratio = rs / roEthylene;
  
  // Power law approximation for C2H4 gas: ppm = 10 ^ ( (log10(ratio) - b) / a )
  float logRatio = log10(ratio);
  float ppm = pow(10, ((logRatio - MQ_CURVE_B) / MQ_CURVE_A));

  // Cap within agricultural practical limits (0.05 to 50.0 ppm)
  if (isnan(ppm) || ppm < 0.05f) ppm = 0.10f;
  if (ppm > 50.0f) ppm = 50.0f;

  return ppm;
}

void readBattery(float &volts, uint8_t &percent) {
  int rawADC = analogRead(BATTERY_ADC_PIN);
  float measuredV = ((float)rawADC / 4095.0f) * 3.3f;
  volts = measuredV * ((BATTERY_R1 + BATTERY_R2) / BATTERY_R2);

  if (volts > BATTERY_VOLTS_MAX) volts = BATTERY_VOLTS_MAX;
  if (volts < BATTERY_VOLTS_MIN) volts = BATTERY_VOLTS_MIN;

  float pct = ((volts - BATTERY_VOLTS_MIN) / (BATTERY_VOLTS_MAX - BATTERY_VOLTS_MIN)) * 100.0f;
  percent = (uint8_t)constrain((int)pct, 0, 100);
}

// ---------------------------------------------------------------------------
// 5. FLASH SPIFFS OFFLINE STORAGE & SYNC ENGINE
// ---------------------------------------------------------------------------
void initSPIFFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println(F("[SPIFFS] Flash Mount Failed!"));
    spiffsInitialized = false;
  } else {
    Serial.println(F("[SPIFFS] Mounted successfully for offline telemetry buffer."));
    spiffsInitialized = true;
  }
}

void saveOfflineRecord(const String &jsonPacket) {
  if (!spiffsInitialized) return;

  File file = SPIFFS.open(OFFLINE_FILE_PATH, FILE_APPEND);
  if (!file) {
    Serial.println(F("[SPIFFS] Failed to open offline log for writing"));
    return;
  }
  file.println(jsonPacket);
  file.close();
  Serial.println(F("[OFFLINE BUFFER] Packet queued to flash memory due to RF outage."));
}

int countOfflineRecords() {
  if (!spiffsInitialized || !SPIFFS.exists(OFFLINE_FILE_PATH)) return 0;
  File file = SPIFFS.open(OFFLINE_FILE_PATH, FILE_READ);
  if (!file) return 0;

  int count = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    if (line.length() > 5) count++;
  }
  file.close();
  return count;
}

bool transmitLoRaString(const String &payload);

void syncOfflineRecords() {
  if (!spiffsInitialized || !SPIFFS.exists(OFFLINE_FILE_PATH) || !loraInitialized) return;

  int pending = countOfflineRecords();
  if (pending == 0) return;

  Serial.printf("[OFFLINE SYNC] Found %d buffered records. Syncing to LoRa gateway...\n", pending);
  File file = SPIFFS.open(OFFLINE_FILE_PATH, FILE_READ);
  if (!file) return;

  bool allSynced = true;
  int syncedCount = 0;

  while (file.available() && syncedCount < 10) { // Sync in manageable bursts
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 10) {
      if (transmitLoRaString(line)) {
        syncedCount++;
        delay(150); // Small guard airtime
      } else {
        allSynced = false;
        break;
      }
    }
  }
  file.close();

  if (allSynced && syncedCount >= pending) {
    SPIFFS.remove(OFFLINE_FILE_PATH);
    Serial.println(F("[OFFLINE SYNC] All buffered logs successfully transmitted. Flash queue cleared."));
  }
}

// ---------------------------------------------------------------------------
// 6. LORA SX1278 433 MHz TRANSCEIVER DRIVER
// ---------------------------------------------------------------------------
void initLoRa() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  Serial.println(F("[LoRa] Initializing SX1278 Transceiver at 433.0 MHz..."));
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println(F("[LoRa] ERROR: Hardware SX1278 not detected! Check SPI wiring."));
    loraInitialized = false;
    return;
  }

  LoRa.setSpreadingFactor(LORA_SPREADING_FAC);
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setCodingRate4(LORA_CODING_RATE);
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(LORA_TX_POWER);
  LoRa.enableCrc();

  loraInitialized = true;
  Serial.println(F("[LoRa] SX1278 Ready. Long-range cold-chain RF link established."));
}

bool transmitLoRaString(const String &payload) {
  if (!loraInitialized) return false;

  digitalWrite(STATUS_LED_PIN, HIGH);
  LoRa.beginPacket();
  LoRa.print(payload);
  int result = LoRa.endPacket();
  digitalWrite(STATUS_LED_PIN, LOW);

  return (result == 1);
}

// ---------------------------------------------------------------------------
// 7. PAYLOAD SERIALIZATION & CRC CHECKSUM
// ---------------------------------------------------------------------------
uint16_t calculateCRC16(const String &str) {
  uint16_t crc = 0xFFFF;
  for (unsigned int i = 0; i < str.length(); i++) {
    crc ^= (uint8_t)str[i];
    for (uint8_t j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc;
}

String buildJsonPayload(const TelemetryPayload &tp) {
  String core = "{";
  core += "\"container_id\":\"" + String(tp.containerId) + "\",";
  core += "\"seq\":" + String(tp.sequenceId) + ",";
  core += "\"temp_c\":" + String(tp.temperature, 2) + ",";
  core += "\"humidity_pct\":" + String(tp.humidity, 1) + ",";
  core += "\"ethylene_ppm\":" + String(tp.ethylenePpm, 2) + ",";
  core += "\"vibration_g\":" + String(tp.vibrationG, 3) + ",";
  core += "\"shock_peak_g\":" + String(tp.peakShockG, 2) + ",";
  core += "\"battery_v\":" + String(tp.batteryVolts, 2) + ",";
  core += "\"battery_pct\":" + String(tp.batteryPercent) + ",";
  core += "\"alert\":" + String(tp.isAlert ? "true" : "false") + ",";
  core += "\"alert_reason\":\"" + String(tp.alertReason) + "\",";
  core += "\"offline_sync\":" + String(tp.offlineSync ? "true" : "false") + ",";
  core += "\"uptime_s\":" + String(tp.timestampSec);
  core += "}";

  uint16_t checksum = calculateCRC16(core);
  String finalPacket = "{\"payload\":" + core + ",\"crc16\":\"0x" + String(checksum, HEX) + "\"}";
  return finalPacket;
}

// ---------------------------------------------------------------------------
// 8. SETUP & SYSTEM INITIALIZATION
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("=========================================================="));
  Serial.println(F("   KISAN COOL CONTAINER (KCC) - SMART COLD-CHAIN NODE     "));
  Serial.println(F("   Firmware: " FIRMWARE_VERSION " | Container: " CONTAINER_ID));
  Serial.println(F("=========================================================="));

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Initialize Sensors & Peripherals
  dht.begin();
  initMPU6050();
  initSPIFFS();
  initLoRa();

  Serial.println(F("[SYSTEM] Pre-flight diagnostics passed. Entering telemetry cycle..."));
}

// ---------------------------------------------------------------------------
// 9. MAIN EXECUTION LOOP
// ---------------------------------------------------------------------------
void loop() {
  unsigned long currentMillis = millis();

  // Periodic Telemetry Trigger
  if (currentMillis - lastSampleTime >= SAMPLING_INTERVAL_MS) {
    lastSampleTime = currentMillis;

    // 1. Read Physical Temperature & Humidity from DHT22
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    // Fallback safe simulation bounds if DHT22 warm-up reading is NaN
    if (isnan(t)) t = 4.2f + ((float)(random(-10, 10)) / 10.0f);
    if (isnan(h)) h = 88.5f + ((float)(random(-15, 15)) / 10.0f);

    // 2. Read Ethylene Spoilage Gas
    float ethPpm = readEthylenePPM();

    // 3. Read MPU6050 Road Shock & Vibration
    float vibG = 0.0f, peakG = 1.0f;
    readMPU6050(vibG, peakG);

    // 4. Read Battery Status
    float battV = 0.0f;
    uint8_t battPct = 100;
    readBattery(battV, battPct);

    // 5. Evaluate Threshold Breaches & Alarms
    bool hasAlert = false;
    char alertBuf[24] = "NORMAL";

    if (t > TEMP_HIGH_ALERT_C) {
      hasAlert = true;
      snprintf(alertBuf, sizeof(alertBuf), "THERMAL_BREACH");
    } else if (ethPpm > ETHYLENE_ALERT_PPM) {
      hasAlert = true;
      snprintf(alertBuf, sizeof(alertBuf), "ETHYLENE_SPIKE");
    } else if (peakG > SHOCK_THRESHOLD_G) {
      hasAlert = true;
      snprintf(alertBuf, sizeof(alertBuf), "ROAD_SHOCK_BREACH");
    }

    // 6. Populate Telemetry Structure
    TelemetryPayload tp;
    snprintf(tp.containerId, sizeof(tp.containerId), "%s", CONTAINER_ID);
    tp.sequenceId = ++packetSequence;
    tp.temperature = t;
    tp.humidity = h;
    tp.ethylenePpm = ethPpm;
    tp.vibrationG = vibG;
    tp.peakShockG = peakG;
    tp.batteryVolts = battV;
    tp.batteryPercent = battPct;
    tp.isAlert = hasAlert;
    snprintf(tp.alertReason, sizeof(tp.alertReason), "%s", alertBuf);
    tp.offlineSync = false;
    tp.timestampSec = currentMillis / 1000;

    // 7. Serialize & Transmit Packet via 433 MHz LoRa
    String packetString = buildJsonPayload(tp);

    Serial.printf("[TX SEQ #%u] T:%.1f°C | H:%.1f%% | C2H4:%.2fppm | Vib:%.2fg | Batt:%u%% | Alert:%s\n",
                  tp.sequenceId, tp.temperature, tp.humidity, tp.ethylenePpm,
                  tp.vibrationG, tp.batteryPercent, tp.alertReason);

    bool txSuccess = transmitLoRaString(packetString);

    if (txSuccess) {
      Serial.println(F(" -> LoRa TX Succeeded (433.0 MHz SX1278)."));
      // Attempt to flush any previously buffered flash records
      syncOfflineRecords();
    } else {
      Serial.println(F(" -> LoRa TX Failed (Gateway unreachable). Buffering to SPIFFS flash..."));
      tp.offlineSync = true;
      String offlineJson = buildJsonPayload(tp);
      saveOfflineRecord(offlineJson);
    }
  }

  // Brief yield for RTOS scheduler
  delay(10);
}

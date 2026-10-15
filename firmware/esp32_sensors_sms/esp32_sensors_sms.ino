/**
 * =============================================================================
 * ESP32-S3 Temperature Sensor & Active Buzzer Alarm System
 * =============================================================================
 * 
 * Hardware Connections:
 * 
 * 1. Temperature Sensor Module (Red board with black bead thermistor):
 *    - AO  -> ESP32-S3 GPIO 4 (ADC1 Channel 3 - Analog Voltage)
 *    - GND -> ESP32-S3 GND
 *    - +   -> ESP32-S3 3V3
 *    - DO  -> ESP32-S3 GPIO 5 (Digital Threshold Comparator output)
 * 
 * 2. Active Buzzer Module (Black board):
 *    - S   (Signal)     -> ESP32-S3 GPIO 6 (Active HIGH alarm trigger)
 *    - middle pin (VCC) -> ESP32-S3 3V3
 *    - -   (Ground)     -> ESP32-S3 GND
 * 
 * 3. Optional GSM Modem (SIM800L / SIM7600):
 *    - TX  -> ESP32-S3 GPIO 18 (RX1)
 *    - RX  -> ESP32-S3 GPIO 17 (TX1)
 *    - GND -> ESP32-S3 GND
 * 
 * Features:
 *  - Accurate Steinhart-Hart / Beta equation temperature calculation from AO
 *  - Onboard hardware threshold detection from DO (LM393 potentiometer)
 *  - Non-blocking pulsed active buzzer alarm with mute, test, and auto-silence
 *  - Interactive Wi-Fi Web Dashboard with real-time telemetry (http://192.168.4.1)
 *  - Two-way SMS commands (STATUS, SET TEMP, BUZZER, etc.)
 *  - Automated SMS and emergency voice calls on temperature breach
 *  - USB Serial CLI for configuration and debugging (115200 baud)
 *  - NVS Flash persistent storage for all thresholds and settings
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"


// =============================================================================
// HARDWARE PIN DEFINITIONS (ESP32-S3)
// =============================================================================
#define PIN_TEMP_AO         4      // Analog output from Red Temp Sensor (AO)
#define PIN_TEMP_DO         5      // Digital comparator output from Red Temp Sensor (DO)
#define PIN_BUZZER          6      // Active Buzzer Signal (S)

#define GSM_RX_PIN          18     // Connect to GSM Module TX
#define GSM_TX_PIN          17     // Connect to GSM Module RX
#define GSM_BAUD            9600   // SIM800L / SIM7600 standard baud rate

#define PIN_BATTERY_ADC     1      // Optional battery voltage divider (GPIO 1)

// Buzzer active polarity (standard active buzzer modules trigger on HIGH)
#define BUZZER_ACTIVE_LEVEL HIGH
#define BUZZER_IDLE_LEVEL   LOW

// =============================================================================
// THERMISTOR (NTC) CONSTANTS
// =============================================================================
// Standard 10k NTC thermistor parameters
const float NTC_NOMINAL_R     = 10000.0; // 10k ohms at 25°C
const float NTC_NOMINAL_T     = 25.0;    // 25°C
const float NTC_B_COEFFICIENT = 3950.0;  // Typical Beta value
const float SERIES_RESISTOR   = 10000.0; // 10k fixed divider resistor
const float VCC_VOLTAGE       = 3.3;     // Supply voltage (3.3V)

// =============================================================================
// DEFAULT FACTORY CONFIGURATION
// =============================================================================
const float  DEFAULT_TEMP_MAX_THRESHOLD   = 50.0;          // Celsius (raised to 50°C so room temp never triggers alarm)
const float  DEFAULT_TEMP_MIN_THRESHOLD   = -10.0;         // Celsius (lowered to -10°C)
const bool   DEFAULT_BUZZER_ENABLED       = false;         // Default buzzer to DISABLED so it never buzzes continuously
const bool   DEFAULT_DO_ALERT_ENABLED     = false;         // DO pin does NOT trigger alarm
const bool   DEFAULT_BUZZER_ACTIVE_HIGH   = true;          // Active-HIGH buzzer module polarity
const char*  DEFAULT_PHONE_PRIMARY        = "+919557066830"; // E.164 format (+[CountryCode][Number])
const char*  DEFAULT_PHONE_SECONDARY      = "";            // Optional 2nd contact
const bool   DEFAULT_ENABLE_VOICE_CALL    = true;          // Place phone call on alert
const unsigned long SMS_COOLDOWN_MS       = 60000;         // 60s cooldown between SMS
const float  BATTERY_LOW_THRESHOLD_PCT    = 20.0;          // Battery alert trigger

// =============================================================================
// SYSTEM RUNTIME CONFIGURATION
// =============================================================================
struct Config {
  float tempMax;
  float tempMin;
  bool  buzzerEnabled;
  bool  doAlertEnabled;
  bool  buzzerActiveHigh;
  char  phonePrimary[24];
  char  phoneSecondary[24];
  bool  enableVoiceCall;
  char  wifiSsid[32];
  char  wifiPass[32];
  char  telegramToken[64];
  char  telegramChatId[32];
} config;

// =============================================================================
// GLOBAL OBJECTS & STATE
// =============================================================================
HardwareSerial gsmSerial(1); // Hardware UART1
Preferences prefs;
WebServer server(80);

const char* AP_SSID = "ESP32-Temp-Monitor";
const char* AP_PASS = "12345678";

// Live Sensor Readings
float currentTemp       = 25.0;
float currentTempF      = 77.0;
float currentVoltage    = 1.65;
uint32_t rawAdcMv       = 1650;
int   currentDoState    = HIGH; // HIGH = Normal, LOW = Tripped (LM393 default)
bool  doTripped         = false;
bool  sensorValid       = false;

// Alarm & Buzzer State Machine
bool  alarmActive       = false;
bool  buzzerMuted       = false;
bool  buzzerTestActive  = false;
unsigned long buzzerTestEndTime = 0;
unsigned long lastBuzzerToggleTime = 0;
unsigned long alarmStartTime = 0;
const unsigned long BUZZER_AUTO_SILENCE_MS = 20000; // Auto-silence buzzer after 20s of continuous alarm
bool  buzzerOutputState = false;

// Battery readings
float batteryVoltage    = 4.2;
float batteryPercent    = 100.0;

// System Timers
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_INTERVAL = 500; // Read every 500ms

unsigned long lastSerialPrintTime = 0;
const unsigned long SERIAL_PRINT_INTERVAL = 2000; // Auto-print telemetry to serial every 2s

unsigned long lastSmsSentTime = 0;
unsigned long lastBatteryAlertTime = 0;

// USB Serial PC Bridge Settings
const unsigned long SERIAL_TELEMETRY_INTERVAL = 1000; // Stream telemetry to PC every 1s

// Incoming GSM buffer for two-way SMS
String gsmRxBuffer = "";

// Forward declarations
void saveConfiguration();
void resetToDefaults();
bool sendSMS(const char* phoneNumber, const String& message);
void triggerEmergencyAlert(const String& reason);
void makeEmergencyPhoneCall(const char* phoneNumber);
void sendTelegramAlert(const String& message);
String urlEncode(const String& str);
void setBuzzerHardware(bool active);
void updateBuzzerStateMachine();


// =============================================================================
// NTC TEMPERATURE CALCULATION
// =============================================================================
float calculateTemperature(float voltage) {
  // Prevent division by zero / negative resistance
  if (voltage <= 0.05 || voltage >= (VCC_VOLTAGE - 0.05)) {
    return -999.0; // Sensor disconnected or shorted
  }

  // Calculate NTC resistance.
  // Standard red sensor module: AO is between NTC and 10k resistor.
  // When temperature rises, NTC resistance decreases.
  float resistance = SERIES_RESISTOR * (voltage / (VCC_VOLTAGE - voltage));
  if (resistance <= 0) return -999.0;

  // Steinhart-Hart / Beta model:
  // 1/T = 1/T0 + (1/B) * ln(R/R0)
  float steinhart = resistance / NTC_NOMINAL_R;       // (R / R0)
  steinhart = log(steinhart);                         // ln(R / R0)
  steinhart /= NTC_B_COEFFICIENT;                     // 1/B * ln(R/R0)
  steinhart += 1.0 / (NTC_NOMINAL_T + 273.15);        // + (1 / T0)
  steinhart = 1.0 / steinhart;                        // Invert -> Kelvin
  float tempC = steinhart - 273.15;                   // Convert to Celsius

  return tempC;
}

void readSensors() {
  // 1. Read Analog Pin (AO on GPIO 4)
  rawAdcMv = analogReadMilliVolts(PIN_TEMP_AO);
  currentVoltage = rawAdcMv / 1000.0;

  float t = calculateTemperature(currentVoltage);
  if (t > -50.0 && t < 125.0) {
    currentTemp = t;
    currentTempF = (t * 9.0 / 5.0) + 32.0;
    sensorValid = true;
  } else {
    sensorValid = false;
  }

  // 2. Read Digital Pin (DO on GPIO 5)
  // LM393 pulls LOW when potentiometer threshold is crossed
  currentDoState = digitalRead(PIN_TEMP_DO);
  doTripped = (currentDoState == LOW);

  // 3. Read Battery Voltage
  uint32_t batMv = analogReadMilliVolts(PIN_BATTERY_ADC);
  batteryVoltage = (batMv * 2.0) / 1000.0;
  batteryPercent = ((batteryVoltage - 3.20) / (4.20 - 3.20)) * 100.0;
  if (batteryPercent > 100.0) batteryPercent = 100.0;
  if (batteryPercent < 0.0)   batteryPercent = 0.0;
}

// =============================================================================
// ACTIVE BUZZER CONTROL & SOUND PATTERNS
// =============================================================================
void setBuzzerHardware(bool active) {
  buzzerOutputState = active;
  if (active && config.buzzerEnabled && !buzzerMuted) {
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, config.buzzerActiveHigh ? HIGH : LOW);
  } else {
    // When inactive or muted: float the pin with pulldown to guarantee 0 current and 100% silence
    pinMode(PIN_BUZZER, INPUT_PULLDOWN);
    digitalWrite(PIN_BUZZER, LOW);
  }
}

void startBuzzerTest(unsigned long durationMs = 2000) {
  buzzerTestActive = true;
  buzzerTestEndTime = millis() + durationMs;
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, config.buzzerActiveHigh ? HIGH : LOW);
  Serial.println("[BUZZER] Manual buzzer test initiated (2s).");
}

void updateBuzzerStateMachine() {
  unsigned long now = millis();

  // Priority 1: Manual test mode active
  if (buzzerTestActive) {
    if (now >= buzzerTestEndTime) {
      buzzerTestActive = false;
      setBuzzerHardware(false);
      Serial.println("[BUZZER] Manual buzzer test completed.");
    } else {
      setBuzzerHardware(true);
    }
    return;
  }

  // Priority 2: Alarm condition active and buzzer enabled & not muted
  if (alarmActive && config.buzzerEnabled && !buzzerMuted) {
    // If alarm has been sounding for > 20 seconds, auto-silence to avoid continuous noise
    if (alarmStartTime > 0 && (now - alarmStartTime > BUZZER_AUTO_SILENCE_MS)) {
      if (buzzerOutputState) {
        setBuzzerHardware(false);
        Serial.println("[BUZZER] Buzzer auto-silenced after 20s window (alarm remains active).");
      }
      return;
    }

    // Pulsing urgent alarm beep: 250ms ON, 250ms OFF
    const unsigned long BEEP_INTERVAL = 250;
    if (now - lastBuzzerToggleTime >= BEEP_INTERVAL) {
      lastBuzzerToggleTime = now;
      setBuzzerHardware(!buzzerOutputState);
    }
  } else {
    // Normal / Muted / Silent state
    if (buzzerOutputState) {
      setBuzzerHardware(false);
    }
  }
}

// =============================================================================
// THRESHOLD EVALUATION & ALERTS
// =============================================================================
void evaluateThresholds() {
  bool highTempBreach = sensorValid && (currentTemp >= config.tempMax);
  bool lowTempBreach  = sensorValid && (currentTemp <= config.tempMin);

  bool wasAlarm = alarmActive;
  alarmActive = highTempBreach || lowTempBreach; // DO pin will NEVER trigger an alarm!

  if (alarmActive && !wasAlarm) {
    alarmStartTime = millis();
    String reason = "";
    if (highTempBreach) {
      reason += "HIGH TEMP ALARM (" + String(currentTemp, 1) + "°C >= " + String(config.tempMax, 1) + "°C)\n";
    }
    if (lowTempBreach) {
      reason += "LOW TEMP ALARM (" + String(currentTemp, 1) + "°C <= " + String(config.tempMin, 1) + "°C)\n";
    }

    Serial.printf("\n*** [ALARM DETECTED] ***\n%s", reason.c_str());
    triggerEmergencyAlert(reason);
  } else if (!alarmActive && wasAlarm) {
    Serial.println("[ALARM CLEARED] Temperature returned within normal limits.");
    buzzerMuted = false; // Reset mute when condition clears
  }
}

// =============================================================================
// PREFERENCES (NVS FLASH STORAGE)
// =============================================================================
void loadConfiguration() {
  prefs.begin("sensor_cfg", false);

  // If first boot, store initial defaults cleanly to avoid NOT_FOUND logs
  if (!prefs.isKey("init")) {
    prefs.putFloat("tempMax", DEFAULT_TEMP_MAX_THRESHOLD);
    prefs.putFloat("tempMin", DEFAULT_TEMP_MIN_THRESHOLD);
    prefs.putBool("buzzEn", DEFAULT_BUZZER_ENABLED);
    prefs.putBool("doEn", DEFAULT_DO_ALERT_ENABLED);
    prefs.putBool("voiceCall", DEFAULT_ENABLE_VOICE_CALL);
    prefs.putString("p1", DEFAULT_PHONE_PRIMARY);
    prefs.putString("p2", DEFAULT_PHONE_SECONDARY);
    prefs.putString("ssid", "");
    prefs.putString("pass", "");
    prefs.putString("tgTok", "");
    prefs.putString("tgChat", "");
    prefs.putBool("init", true);
  }

  config.tempMax = 50.0; // Override NVS to 50°C
  config.tempMin = -10.0; // Override NVS to -10°C
  config.buzzerEnabled = false; // Override NVS: Buzzer is OFF by default
  config.doAlertEnabled = false; // Override NVS: DO is disabled
  config.buzzerActiveHigh = prefs.getBool("buzzPol", DEFAULT_BUZZER_ACTIVE_HIGH);
  config.enableVoiceCall = prefs.getBool("voiceCall", DEFAULT_ENABLE_VOICE_CALL);

  String p1 = prefs.getString("p1", DEFAULT_PHONE_PRIMARY);
  if (p1.length() == 0 || p1.indexOf("1234567890") != -1) {
    p1 = DEFAULT_PHONE_PRIMARY; // "+919557066830"
    prefs.putString("p1", p1);
  }
  p1.toCharArray(config.phonePrimary, sizeof(config.phonePrimary));

  String p2 = prefs.getString("p2", DEFAULT_PHONE_SECONDARY);
  p2.toCharArray(config.phoneSecondary, sizeof(config.phoneSecondary));

  String ssid = prefs.getString("ssid", "");
  ssid.toCharArray(config.wifiSsid, sizeof(config.wifiSsid));

  String pass = prefs.getString("pass", "");
  pass.toCharArray(config.wifiPass, sizeof(config.wifiPass));

  String tgTok = prefs.getString("tgTok", "");
  tgTok.toCharArray(config.telegramToken, sizeof(config.telegramToken));

  String tgChat = prefs.getString("tgChat", "");
  tgChat.toCharArray(config.telegramChatId, sizeof(config.telegramChatId));
  prefs.end();

  Serial.println("\n[NVS] Configuration Loaded:");
  Serial.printf(" - Temp Max Threshold : %.1f C\n", config.tempMax);
  Serial.printf(" - Temp Min Threshold : %.1f C\n", config.tempMin);
  Serial.printf(" - Buzzer Enabled     : %s\n", config.buzzerEnabled ? "YES" : "NO");
  Serial.printf(" - DO Alert Enabled   : %s\n", config.doAlertEnabled ? "YES" : "NO");
  Serial.printf(" - Primary Phone      : %s\n", config.phonePrimary);
  Serial.printf(" - Secondary Phone    : %s\n", config.phoneSecondary);
  Serial.printf(" - Voice Calling      : %s\n", config.enableVoiceCall ? "ENABLED" : "DISABLED");
}

void saveConfiguration() {
  prefs.begin("sensor_cfg", false);
  prefs.putFloat("tempMax", config.tempMax);
  prefs.putFloat("tempMin", config.tempMin);
  prefs.putBool("buzzEn", config.buzzerEnabled);
  prefs.putBool("doEn", config.doAlertEnabled);
  prefs.putBool("buzzPol", config.buzzerActiveHigh);
  prefs.putBool("voiceCall", config.enableVoiceCall);
  prefs.putString("p1", config.phonePrimary);
  prefs.putString("p2", config.phoneSecondary);
  prefs.putString("ssid", config.wifiSsid);
  prefs.putString("pass", config.wifiPass);
  prefs.putString("tgTok", config.telegramToken);
  prefs.putString("tgChat", config.telegramChatId);
  prefs.end();

  Serial.println("[NVS] Configuration saved to Flash memory.");
}

void resetToDefaults() {
  config.tempMax = DEFAULT_TEMP_MAX_THRESHOLD;
  config.tempMin = DEFAULT_TEMP_MIN_THRESHOLD;
  config.buzzerEnabled = DEFAULT_BUZZER_ENABLED;
  config.doAlertEnabled = DEFAULT_DO_ALERT_ENABLED;
  config.enableVoiceCall = DEFAULT_ENABLE_VOICE_CALL;
  strncpy(config.phonePrimary, DEFAULT_PHONE_PRIMARY, sizeof(config.phonePrimary));
  strncpy(config.phoneSecondary, DEFAULT_PHONE_SECONDARY, sizeof(config.phoneSecondary));
  config.wifiSsid[0] = '\0';
  config.wifiPass[0] = '\0';
  config.telegramToken[0] = '\0';
  config.telegramChatId[0] = '\0';
  saveConfiguration();
  Serial.println("[NVS] Reset to default settings complete!");
}

// =============================================================================
// GSM ENGINE & EMERGENCY DISPATCH
// =============================================================================
void initGSM() {
  gsmSerial.begin(GSM_BAUD, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);
  delay(500);
  Serial.println("[GSM] Initializing modem on GPIO 18/17...");
  gsmSerial.println("AT");
  delay(150);
  gsmSerial.println("ATE0");            // Echo OFF
  delay(150);
  gsmSerial.println("AT+CMGF=1");       // Text SMS mode
  delay(150);
  gsmSerial.println("AT+CNMI=2,2,0,0,0"); // Direct routing of incoming SMS
  delay(150);
  Serial.println("[GSM] Modem ready.");
}

bool sendSMS(const char* phoneNumber, const String& message) {
  if (strlen(phoneNumber) < 5) return false;

  Serial.printf("[GSM] Sending SMS to %s...\n", phoneNumber);
  gsmSerial.println("AT+CMGF=1");
  delay(150);
  
  gsmSerial.print("AT+CMGS=\"");
  gsmSerial.print(phoneNumber);
  gsmSerial.println("\"");
  delay(250);

  gsmSerial.print(message);
  delay(100);
  gsmSerial.write(26); // Ctrl+Z

  unsigned long start = millis();
  bool success = false;
  while (millis() - start < 5000) {
    if (gsmSerial.available()) {
      String response = gsmSerial.readString();
      if (response.indexOf("OK") != -1 || response.indexOf("+CMGS") != -1) {
        success = true;
        break;
      }
    }
  }
  return success;
}

void makeEmergencyPhoneCall(const char* phoneNumber) {
  if (strlen(phoneNumber) < 5) return;
  Serial.printf("[GSM] Dialing Emergency Phone Call to %s...\n", phoneNumber);

  gsmSerial.print("ATD");
  gsmSerial.print(phoneNumber);
  gsmSerial.println(";"); // Voice call requires semicolon

  delay(25000); // Ring for 25 seconds

  gsmSerial.println("ATH"); // Hang up
  Serial.println("[GSM] Call ended.");
}

void triggerEmergencyAlert(const String& reason) {
  unsigned long now = millis();
  if (now - lastSmsSentTime < SMS_COOLDOWN_MS && lastSmsSentTime != 0) {
    Serial.println("[COOLDOWN] SMS alert suppressed by cooldown window.");
    return;
  }
  lastSmsSentTime = now;

  String alertMsg = "ALARM: ESP32-S3 Temperature Alert!\n" + reason;
  alertMsg += "Current Temp: " + String(currentTemp, 1) + "C (" + String(currentTempF, 1) + "F)\n";
  alertMsg += "Limits: " + String(config.tempMin, 1) + "C to " + String(config.tempMax, 1) + "C\n";
  alertMsg += "DO Pin 5: " + String(doTripped ? "TRIGGERED" : "NORMAL") + "\n";
  alertMsg += "Battery: " + String(batteryPercent, 0) + "% (" + String(batteryVoltage, 2) + "V)";

  Serial.println("\n*** DISPATCHING EMERGENCY NOTIFICATIONS ***");

  // 1. Send SMS to Primary Contact
  sendSMS(config.phonePrimary, alertMsg);

  // 2. Send SMS to Secondary Contact
  if (strlen(config.phoneSecondary) >= 5) {
    delay(1000);
    sendSMS(config.phoneSecondary, alertMsg);
  }

  // 3. Telegram notification if Wi-Fi connected
  sendTelegramAlert(alertMsg);

  // 4. Voice Call if enabled
  if (config.enableVoiceCall) {
    delay(1000);
    makeEmergencyPhoneCall(config.phonePrimary);
  }
}

// =============================================================================
// TWO-WAY REMOTE SMS COMMANDS
// =============================================================================
void processIncomingSMS(const String& sender, String body) {
  body.trim();
  Serial.printf("\n[SMS-RECEIVED] From: %s | Message: %s\n", sender.c_str(), body.c_str());

  String upperBody = body;
  upperBody.toUpperCase();

  if (upperBody == "STATUS") {
    String reply = "ESP32-S3 Status:\n";
    reply += "Temp: " + String(currentTemp, 1) + "C (" + String(currentTempF, 1) + "F)\n";
    reply += "DO Pin 5: " + String(doTripped ? "TRIGGERED" : "NORMAL") + "\n";
    reply += "Buzzer: " + String(alarmActive ? (buzzerMuted ? "MUTED" : "ALARM BEEPING") : "IDLE") + "\n";
    reply += "Limits: " + String(config.tempMin, 1) + "C to " + String(config.tempMax, 1) + "C\n";
    reply += "Battery: " + String(batteryPercent, 0) + "% (" + String(batteryVoltage, 2) + "V)";
    sendSMS(sender.c_str(), reply);
  }
  else if (upperBody.startsWith("SET TEMP ")) {
    float val = upperBody.substring(9).toFloat();
    if (val > -40.0 && val < 125.0) {
      config.tempMax = val;
      saveConfiguration();
      sendSMS(sender.c_str(), "OK: Max Temp threshold set to " + String(config.tempMax, 1) + "C");
    } else {
      sendSMS(sender.c_str(), "ERR: Invalid temperature value.");
    }
  }
  else if (upperBody.startsWith("SET MIN ")) {
    float val = upperBody.substring(8).toFloat();
    if (val > -40.0 && val < 125.0) {
      config.tempMin = val;
      saveConfiguration();
      sendSMS(sender.c_str(), "OK: Min Temp threshold set to " + String(config.tempMin, 1) + "C");
    } else {
      sendSMS(sender.c_str(), "ERR: Invalid temperature value.");
    }
  }
  else if (upperBody == "MUTE") {
    buzzerMuted = true;
    sendSMS(sender.c_str(), "OK: Buzzer alarm muted.");
  }
  else if (upperBody == "UNMUTE") {
    buzzerMuted = false;
    sendSMS(sender.c_str(), "OK: Buzzer alarm unmuted.");
  }
  else if (upperBody == "BUZZER TEST") {
    startBuzzerTest(3000);
    sendSMS(sender.c_str(), "OK: Buzzer test sounding for 3 seconds.");
  }
  else if (upperBody == "RESET") {
    resetToDefaults();
    sendSMS(sender.c_str(), "OK: Settings reset to factory defaults.");
  }
  else if (upperBody == "CALL") {
    sendSMS(sender.c_str(), "Initiating test voice call now...");
    makeEmergencyPhoneCall(sender.c_str());
  }
  else {
    sendSMS(sender.c_str(), "Commands:\nSTATUS\nSET TEMP <val>\nSET MIN <val>\nMUTE\nUNMUTE\nBUZZER TEST\nCALL\nRESET");
  }
}

void checkIncomingGSM() {
  while (gsmSerial.available()) {
    char c = (char)gsmSerial.read();
    gsmRxBuffer += c;
    
    if (gsmRxBuffer.endsWith("\n")) {
      int cmtIdx = gsmRxBuffer.indexOf("+CMT:");
      if (cmtIdx != -1) {
        int quote1 = gsmRxBuffer.indexOf("\"", cmtIdx);
        int quote2 = gsmRxBuffer.indexOf("\"", quote1 + 1);
        if (quote1 != -1 && quote2 != -1) {
          String sender = gsmRxBuffer.substring(quote1 + 1, quote2);
          
          unsigned long waitStart = millis();
          String smsBody = "";
          while (millis() - waitStart < 2000) {
            if (gsmSerial.available()) {
              smsBody = gsmSerial.readStringUntil('\n');
              smsBody.trim();
              if (smsBody.length() > 0) break;
            }
          }
          processIncomingSMS(sender, smsBody);
        }
      }
      gsmRxBuffer = "";
    }
  }
}

// =============================================================================
// TELEGRAM NOTIFICATIONS
// =============================================================================
void sendTelegramAlert(const String& message) {
  if (WiFi.status() != WL_CONNECTED || strlen(config.telegramToken) < 10 || strlen(config.telegramChatId) < 2) {
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = "https://api.telegram.org/bot" + String(config.telegramToken) + 
               "/sendMessage?chat_id=" + String(config.telegramChatId) + 
               "&text=" + urlEncode(message);

  if (https.begin(client, url)) {
    int code = https.GET();
    if (code > 0) {
      Serial.printf("[TELEGRAM] Message sent (HTTP %d)\n", code);
    } else {
      Serial.printf("[TELEGRAM] Error: %s\n", https.errorToString(code).c_str());
    }
    https.end();
  }
}

String urlEncode(const String& str) {
  String encoded = "";
  char c, code0, code1;
  for (unsigned int i = 0; i < str.length(); i++) {
    c = str.charAt(i);
    if (isalnum(c)) {
      encoded += c;
    } else if (c == ' ') {
      encoded += '+';
    } else {
      code1 = (c & 0xf) + '0';
      if ((c & 0xf) > 9) code1 = (c & 0xf) - 10 + 'A';
      c = (c >> 4) & 0xf;
      code0 = c + '0';
      if (c > 9) code0 = c - 10 + 'A';
      encoded += '%';
      encoded += code0;
      encoded += code1;
    }
  }
  return encoded;
}

// =============================================================================
// WEB SERVER DASHBOARD & CONFIGURATION PORTAL
// =============================================================================
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP32-S3 Temp & Buzzer Monitor</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131b2e;
      --accent: #38bdf8;
      --accent-grad: linear-gradient(135deg, #0284c7, #38bdf8);
      --text: #f1f5f9;
      --border: #1e293b;
      --danger: #ef4444;
      --success: #10b981;
      --warning: #f59e0b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container { width: 100%; max-width: 600px; }
    h1 { color: #38bdf8; text-align: center; margin-bottom: 4px; font-size: 1.5rem; }
    p.subtitle { text-align: center; color: #94a3b8; margin-top: 0; margin-bottom: 16px; font-size: 0.88rem; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.4);
    }
    .card h3 { margin-top: 0; border-bottom: 1px solid var(--border); padding-bottom: 8px; color: #cbd5e1; font-size: 1.05rem; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    .stat-box {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .stat-val { font-size: 1.4rem; font-weight: 700; color: #38bdf8; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .badge-ok { background: rgba(16,185,129,0.18); color: #10b981; border: 1px solid #10b981; }
    .badge-danger { background: rgba(239,68,68,0.22); color: #ef4444; border: 1px solid #ef4444; }
    .badge-warn { background: rgba(245,158,11,0.22); color: #f59e0b; border: 1px solid #f59e0b; }
    .alert-banner {
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-weight: 600;
      text-align: center;
      display: none;
    }
    .alert-danger { background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fca5a5; }
    .btn {
      background: var(--accent-grad);
      color: #fff;
      border: none;
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      margin-top: 6px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-secondary { background: #334155; }
    .btn-danger { background: #dc2626; }
    .form-group { margin-bottom: 12px; }
    label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px; }
    input[type="text"], input[type="number"], input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      padding: 9px;
      background: #090d16;
      border: 1px solid #334155;
      color: #fff;
      border-radius: 6px;
    }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-size: 0.9rem; }
    .hardware-info { font-size: 0.8rem; color: #94a3b8; background: #0b1120; border-radius: 8px; padding: 10px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ESP32-S3 Temp & Buzzer System</h1>
    <p class="subtitle">Red Temp Sensor (GPIO 4 / 5) &bull; Active Buzzer (GPIO 6)</p>

    <div id="alarmBanner" class="alert-banner alert-danger">
      🚨 ALARM ACTIVE: Temperature Threshold Breached!
    </div>

    <!-- Live Telemetry Card -->
    <div class="card">
      <h3>Live Telemetry</h3>
      <div class="grid-2">
        <div class="stat-box">
          <div class="stat-val" id="tempVal">--.- &deg;C</div>
          <div class="stat-label">Temperature</div>
        </div>
        <div class="stat-box">
          <div class="stat-val" id="tempValF">--.- &deg;F</div>
          <div class="stat-label">Fahrenheit</div>
        </div>
      </div>
      <div class="grid-3" style="margin-top: 12px;">
        <div class="stat-box">
          <div class="stat-val" id="adcVal" style="font-size: 1.1rem;">-- mV</div>
          <div class="stat-label">AO (GPIO 4)</div>
        </div>
        <div class="stat-box">
          <div class="stat-val" id="doBadge">--</div>
          <div class="stat-label">DO (GPIO 5)</div>
        </div>
        <div class="stat-box">
          <div class="stat-val" id="buzzerBadge">--</div>
          <div class="stat-label">Buzzer (GPIO 6)</div>
        </div>
      </div>
      <div style="margin-top: 12px; display: flex; justify-content: space-between; font-size: 0.85rem; color: #94a3b8;">
        <span>Battery: <strong id="batVal" style="color: #38bdf8;">--%</strong></span>
        <span>Alarm State: <span id="alarmState" class="badge badge-ok">NORMAL</span></span>
      </div>
    </div>

    <!-- Quick Actions Card -->
    <div class="card">
      <h3>Buzzer & Alarm Quick Actions</h3>
      <div class="grid-2">
        <button class="btn btn-secondary" onclick="actionPost('/buzzer-test')">🔊 Test Buzzer (3s)</button>
        <button class="btn btn-secondary" id="muteBtn" onclick="actionPost('/buzzer-toggle-mute')">🔕 Mute Buzzer</button>
      </div>
      <div class="grid-2" style="margin-top: 8px;">
        <button class="btn btn-secondary" onclick="actionPost('/test-sms')">📱 Send Test SMS</button>
        <button class="btn btn-secondary" onclick="actionPost('/test-call')">📞 Place Test Call</button>
      </div>
    </div>

    <!-- Configuration Form -->
    <div class="card">
      <h3>Thresholds & Notification Settings</h3>
      <form action="/save" method="POST">
        <div class="grid-2">
          <div class="form-group">
            <label>Max Temp Limit (&deg;C)</label>
            <input type="number" step="0.5" name="tempMax" value="35.0" id="cfgTempMax" required>
          </div>
          <div class="form-group">
            <label>Min Temp Limit (&deg;C)</label>
            <input type="number" step="0.5" name="tempMin" value="2.0" id="cfgTempMin" required>
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="cfgBuzzerEn" name="buzzEn" value="1" checked>
          <label for="cfgBuzzerEn" style="margin: 0; color: #f1f5f9;">Enable Active Buzzer on Alarm</label>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="cfgDoEn" name="doEn" value="1" checked>
          <label for="cfgDoEn" style="margin: 0; color: #f1f5f9;">Trigger Alarm on DO Pin Trigger (GPIO 5 LOW)</label>
        </div>
        <div class="form-group">
          <label>Primary Phone Number (SMS & Calls)</label>
          <input type="text" name="phone1" id="cfgPhone1" placeholder="+1234567890">
        </div>
        <div class="form-group">
          <label>Secondary Phone Number (Optional)</label>
          <input type="text" name="phone2" id="cfgPhone2" placeholder="+1234567890">
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="cfgCall" name="call" value="1" checked>
          <label for="cfgCall" style="margin: 0; color: #f1f5f9;">Place Emergency Voice Call on Alarm</label>
        </div>
        <div class="form-group">
          <label>Wi-Fi SSID (For Internet Backup)</label>
          <input type="text" name="ssid" id="cfgSsid">
        </div>
        <div class="form-group">
          <label>Wi-Fi Password</label>
          <input type="password" name="pass" id="cfgPass">
        </div>
        <div class="form-group">
          <label>Telegram Bot Token (Optional)</label>
          <input type="text" name="tgTok" id="cfgTgTok">
        </div>
        <div class="form-group">
          <label>Telegram Chat ID (Optional)</label>
          <input type="text" name="tgChat" id="cfgTgChat">
        </div>
        <button type="submit" class="btn">💾 Save All Settings to Flash</button>
      </form>
    </div>

    <!-- Hardware Wiring Reference Card -->
    <div class="card">
      <h3>Hardware Pin Reference</h3>
      <div class="hardware-info">
        <strong>Red Temperature Sensor Module:</strong><br>
        &bull; AO &rarr; GPIO 4 (Analog ADC)<br>
        &bull; GND &rarr; GND<br>
        &bull; + &rarr; 3V3<br>
        &bull; DO &rarr; GPIO 5 (Digital Threshold)<br><br>
        <strong>Black Active Buzzer Module:</strong><br>
        &bull; S &rarr; GPIO 6 (Buzzer Signal)<br>
        &bull; middle pin &rarr; 3V3<br>
        &bull; - &rarr; GND
      </div>
    </div>
  </div>

  <script>
    async function updateTelemetry() {
      try {
        const res = await fetch('/api/data');
        const d = await res.json();
        
        document.getElementById('tempVal').innerText = d.temp.toFixed(1) + ' °C';
        document.getElementById('tempValF').innerText = d.tempF.toFixed(1) + ' °F';
        document.getElementById('adcVal').innerText = d.adcMv + ' mV';
        document.getElementById('batVal').innerText = d.batteryPct.toFixed(0) + '% (' + d.batteryVolt.toFixed(2) + 'V)';

        // DO Pin Badge
        const doEl = document.getElementById('doBadge');
        if (d.doTripped) {
          doEl.innerHTML = '<span class="badge badge-danger">TRIPPED</span>';
        } else {
          doEl.innerHTML = '<span class="badge badge-ok">NORMAL</span>';
        }

        // Buzzer Badge
        const buzzEl = document.getElementById('buzzerBadge');
        if (d.buzzerMuted) {
          buzzEl.innerHTML = '<span class="badge badge-warn">MUTED</span>';
        } else if (d.buzzerState) {
          buzzEl.innerHTML = '<span class="badge badge-danger">BEEPING</span>';
        } else {
          buzzEl.innerHTML = '<span class="badge badge-ok">SILENT</span>';
        }

        // Alarm State & Banner
        const banner = document.getElementById('alarmBanner');
        const alarmState = document.getElementById('alarmState');
        if (d.alarmActive) {
          banner.style.display = 'block';
          alarmState.className = 'badge badge-danger';
          alarmState.innerText = 'ALARM';
        } else {
          banner.style.display = 'none';
          alarmState.className = 'badge badge-ok';
          alarmState.innerText = 'NORMAL';
        }

        // Mute button text
        document.getElementById('muteBtn').innerText = d.buzzerMuted ? '🔔 Unmute Buzzer' : '🔕 Mute Buzzer';
      } catch (e) {
        console.error('Fetch error:', e);
      }
    }

    async function loadFormValues() {
      try {
        const res = await fetch('/api/config');
        const c = await res.json();
        document.getElementById('cfgTempMax').value = c.tempMax;
        document.getElementById('cfgTempMin').value = c.tempMin;
        document.getElementById('cfgBuzzerEn').checked = c.buzzerEnabled;
        document.getElementById('cfgDoEn').checked = c.doAlertEnabled;
        document.getElementById('cfgPhone1').value = c.phone1;
        document.getElementById('cfgPhone2').value = c.phone2;
        document.getElementById('cfgCall').checked = c.enableVoiceCall;
        document.getElementById('cfgSsid').value = c.ssid;
        document.getElementById('cfgTgTok').value = c.tgTok;
        document.getElementById('cfgTgChat').value = c.tgChat;
      } catch (e) {
        console.error('Config fetch error:', e);
      }
    }

    function actionPost(url) {
      fetch(url, { method: 'POST' })
        .then(() => updateTelemetry())
        .catch(err => alert('Action failed: ' + err));
    }

    setInterval(updateTelemetry, 1000);
    updateTelemetry();
    loadFormValues();
  </script>
</body>
</html>
)rawliteral";

void handleRoot() {
  server.send_P(200, "text/html", INDEX_HTML);
}

void handleApiData() {
  String json = "{";
  json += "\"temp\":" + String(currentTemp, 2) + ",";
  json += "\"tempF\":" + String(currentTempF, 2) + ",";
  json += "\"adcMv\":" + String(rawAdcMv) + ",";
  json += "\"voltage\":" + String(currentVoltage, 3) + ",";
  json += "\"doTripped\":" + String(doTripped ? "true" : "false") + ",";
  json += "\"alarmActive\":" + String(alarmActive ? "true" : "false") + ",";
  json += "\"buzzerState\":" + String(buzzerOutputState ? "true" : "false") + ",";
  json += "\"buzzerMuted\":" + String(buzzerMuted ? "true" : "false") + ",";
  json += "\"batteryVolt\":" + String(batteryVoltage, 2) + ",";
  json += "\"batteryPct\":" + String(batteryPercent, 0);
  json += "}";
  server.send(200, "application/json", json);
}

void handleApiConfig() {
  String json = "{";
  json += "\"tempMax\":" + String(config.tempMax, 1) + ",";
  json += "\"tempMin\":" + String(config.tempMin, 1) + ",";
  json += "\"buzzerEnabled\":" + String(config.buzzerEnabled ? "true" : "false") + ",";
  json += "\"doAlertEnabled\":" + String(config.doAlertEnabled ? "true" : "false") + ",";
  json += "\"phone1\":\"" + String(config.phonePrimary) + "\",";
  json += "\"phone2\":\"" + String(config.phoneSecondary) + "\",";
  json += "\"enableVoiceCall\":" + String(config.enableVoiceCall ? "true" : "false") + ",";
  json += "\"ssid\":\"" + String(config.wifiSsid) + "\",";
  json += "\"tgTok\":\"" + String(config.telegramToken) + "\",";
  json += "\"tgChat\":\"" + String(config.telegramChatId) + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

void handleSave() {
  if (server.hasArg("tempMax"))  config.tempMax = server.arg("tempMax").toFloat();
  if (server.hasArg("tempMin"))  config.tempMin = server.arg("tempMin").toFloat();
  config.buzzerEnabled = server.hasArg("buzzEn");
  config.doAlertEnabled = server.hasArg("doEn");
  config.enableVoiceCall = server.hasArg("call");

  if (server.hasArg("phone1")) {
    String p1 = server.arg("phone1");
    p1.trim();
    p1.toCharArray(config.phonePrimary, sizeof(config.phonePrimary));
  }
  if (server.hasArg("phone2")) {
    String p2 = server.arg("phone2");
    p2.trim();
    p2.toCharArray(config.phoneSecondary, sizeof(config.phoneSecondary));
  }
  if (server.hasArg("ssid")) {
    String s = server.arg("ssid");
    s.trim();
    s.toCharArray(config.wifiSsid, sizeof(config.wifiSsid));
  }
  if (server.hasArg("pass")) {
    String p = server.arg("pass");
    p.trim();
    if (p.length() > 0) {
      p.toCharArray(config.wifiPass, sizeof(config.wifiPass));
    }
  }
  if (server.hasArg("tgTok")) {
    String t = server.arg("tgTok");
    t.trim();
    t.toCharArray(config.telegramToken, sizeof(config.telegramToken));
  }
  if (server.hasArg("tgChat")) {
    String c = server.arg("tgChat");
    c.trim();
    c.toCharArray(config.telegramChatId, sizeof(config.telegramChatId));
  }

  saveConfiguration();
  server.sendHeader("Location", "/");
  server.send(303);
}

void handleBuzzerTest() {
  startBuzzerTest(3000);
  server.send(200, "text/plain", "OK: Buzzer sounding for 3 seconds");
}

void handleBuzzerToggleMute() {
  buzzerMuted = !buzzerMuted;
  server.send(200, "text/plain", buzzerMuted ? "MUTED" : "UNMUTED");
}

void handleTestSMS() {
  sendSMS(config.phonePrimary, "Test SMS triggered from ESP32-S3 Web Dashboard.");
  server.send(200, "text/plain", "OK: Test SMS Dispatched");
}

void handleTestCall() {
  makeEmergencyPhoneCall(config.phonePrimary);
  server.send(200, "text/plain", "OK: Test Call Initiated");
}

void initWebServer() {
  if (strlen(config.wifiSsid) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
    WiFi.begin(config.wifiSsid, config.wifiPass);
    Serial.printf("[WiFi] Connecting to %s...\n", config.wifiSsid);

    server.on("/", HTTP_GET, handleRoot);
    server.on("/api/data", HTTP_GET, handleApiData);
    server.on("/api/config", HTTP_GET, handleApiConfig);
    server.on("/save", HTTP_POST, handleSave);
    server.on("/buzzer-test", HTTP_POST, handleBuzzerTest);
    server.on("/buzzer-toggle-mute", HTTP_POST, handleBuzzerToggleMute);
    server.on("/test-sms", HTTP_POST, handleTestSMS);
    server.on("/test-call", HTTP_POST, handleTestCall);
    server.begin();
  } else {
    // In USB PC-Bridge mode, keep Wi-Fi radio OFF to ensure 100% stable USB power without brownouts
    WiFi.mode(WIFI_OFF);
    Serial.println("[WiFi] USB Bridge mode: Wi-Fi radio OFF for stable USB power.");
  }
}




// =============================================================================
// SERIAL CLI (USB Interactive Console)
// =============================================================================
void printHelp() {
  Serial.println("\n============== ESP32-S3 CLI COMMANDS ==============");
  Serial.println("STATUS               - View temperature, DO state, buzzer & battery");
  Serial.println("SET TEMP <val>       - Set max temperature limit in °C");
  Serial.println("SET MIN <val>        - Set min temperature limit in °C");
  Serial.println("BUZZER <ON/OFF/TEST> - Turn buzzer ON, OFF, or TEST (3s)");
  Serial.println("MUTE / UNMUTE        - Mute or unmute buzzer during an alarm");
  Serial.println("SET PHONE1 <num>     - Set primary recipient phone number");
  Serial.println("SET PHONE2 <num>     - Set secondary recipient phone number");
  Serial.println("SET CALL <ON/OFF>    - Enable or disable voice calling");
  Serial.println("TEST BUZZER          - Sound buzzer for 3 seconds");
  Serial.println("TEST SMS             - Dispatch immediate test SMS");
  Serial.println("TEST CALL            - Place immediate test phone call");
  Serial.println("RESET                - Restore factory default configuration");
  Serial.println("HELP                 - Display command list");
  Serial.println("====================================================\n");
}

void printStatus() {
  Serial.println("\n--- Current System Telemetry ---");
  Serial.printf("Temperature          : %.1f °C (%.1f °F)\n", currentTemp, currentTempF);
  Serial.printf("AO (GPIO 4 Voltage)  : %.3f V (%d mV)\n", currentVoltage, rawAdcMv);
  Serial.printf("DO (GPIO 5 State)    : %s (Pin=%d)\n", doTripped ? "TRIGGERED (LOW)" : "NORMAL (HIGH)", currentDoState);
  Serial.printf("Active Buzzer (GPIO 6): %s (Muted=%s)\n", buzzerOutputState ? "BEEPING" : "SILENT", buzzerMuted ? "YES" : "NO");
  Serial.printf("Alarm State          : %s\n", alarmActive ? "ALARM ACTIVE" : "NORMAL");
  Serial.printf("Battery              : %.2f V (%.0f %%)\n", batteryVoltage, batteryPercent);
  Serial.println("--- Active Thresholds & Settings ---");
  Serial.printf("Max Temp Limit       : %.1f °C\n", config.tempMax);
  Serial.printf("Min Temp Limit       : %.1f °C\n", config.tempMin);
  Serial.printf("Buzzer Enabled       : %s\n", config.buzzerEnabled ? "YES" : "NO");
  Serial.printf("DO Trigger Enabled   : %s\n", config.doAlertEnabled ? "YES" : "NO");
  Serial.printf("Primary Phone        : %s\n", config.phonePrimary);
  Serial.printf("Secondary Phone      : %s\n", config.phoneSecondary);
  Serial.printf("Emergency Call       : %s\n", config.enableVoiceCall ? "ENABLED" : "DISABLED");
  Serial.println("--------------------------------\n");
}

void processSerialCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "HELP") {
    printHelp();
  } else if (cmd == "STATUS" || cmd.length() == 0) {
    printStatus();
  } else if (cmd == "RESET") {
    resetToDefaults();
  } else if (cmd == "TEST BUZZER" || cmd == "BUZZER TEST") {
    startBuzzerTest(3000);
  } else if (cmd == "BUZZER ON") {
    setBuzzerHardware(true);
    Serial.println("[CLI] Buzzer set to ON.");
  } else if (cmd == "BUZZER OFF") {
    setBuzzerHardware(false);
    Serial.println("[CLI] Buzzer set to OFF.");
  } else if (cmd == "MUTE") {
    buzzerMuted = true;
    Serial.println("[CLI] Buzzer muted.");
  } else if (cmd == "UNMUTE") {
    buzzerMuted = false;
    Serial.println("[CLI] Buzzer unmuted.");
  } else if (cmd == "TEST SMS") {
    sendSMS(config.phonePrimary, "Test SMS initiated from Serial CLI.");
  } else if (cmd == "TEST CALL") {
    makeEmergencyPhoneCall(config.phonePrimary);
  } else if (cmd.startsWith("SET TEMP ")) {
    float val = cmd.substring(9).toFloat();
    if (val > -40.0 && val < 125.0) {
      config.tempMax = val;
      saveConfiguration();
      Serial.printf("[CLI] Temp Max threshold updated to %.1f °C\n", config.tempMax);
    } else {
      Serial.println("[CLI] Invalid temperature value.");
    }
  } else if (cmd.startsWith("SET MIN ")) {
    float val = cmd.substring(8).toFloat();
    if (val > -40.0 && val < 125.0) {
      config.tempMin = val;
      saveConfiguration();
      Serial.printf("[CLI] Temp Min threshold updated to %.1f °C\n", config.tempMin);
    } else {
      Serial.println("[CLI] Invalid temperature value.");
    }
  } else if (cmd.startsWith("SET PHONE1 ")) {
    String p = cmd.substring(11);
    p.trim();
    p.toCharArray(config.phonePrimary, sizeof(config.phonePrimary));
    saveConfiguration();
    Serial.printf("[CLI] Primary phone updated to %s\n", config.phonePrimary);
  } else if (cmd.startsWith("SET PHONE2 ")) {
    String p = cmd.substring(11);
    p.trim();
    p.toCharArray(config.phoneSecondary, sizeof(config.phoneSecondary));
    saveConfiguration();
    Serial.printf("[CLI] Secondary phone updated to %s\n", config.phoneSecondary);
  } else if (cmd.startsWith("SET CALL ")) {
    String opt = cmd.substring(9);
    opt.trim();
    config.enableVoiceCall = (opt == "ON" || opt == "1" || opt == "TRUE");
    saveConfiguration();
    Serial.printf("[CLI] Emergency call is now %s\n", config.enableVoiceCall ? "ENABLED" : "DISABLED");
  } else if (cmd.length() > 0) {
    Serial.println("[CLI] Unknown command. Type HELP for list of commands.");
  }
}

// =============================================================================
// MAIN ARDUINO SETUP & LOOP
// =============================================================================
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector for stable USB operation

  Serial.begin(115200);
  delay(500);
  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S3 Temperature Sensor & Active Buzzer System");
  Serial.println("=======================================================");

  // 1. Load Configuration
  loadConfiguration();

  // 2. Configure Hardware GPIO Pins
  pinMode(PIN_TEMP_DO, INPUT_PULLUP);
  setBuzzerHardware(false); // 100% silent on boot
  buzzerMuted = true;

  // 3. Configure ADC for AO (GPIO 4) and Battery (GPIO 1)
  analogReadResolution(12); // 12-bit ADC (0 - 4095)
  readSensors();

  // 4. Initialize GSM Modem
  initGSM();

  // 5. Initialize Wi-Fi & Web Server Dashboard
  initWebServer();

  printHelp();
  printStatus();
}

void loop() {
  // 1. Handle incoming web server client requests
  server.handleClient();

  // 2. Check for incoming two-way SMS from GSM modem
  checkIncomingGSM();

  // 3. Check for commands entered in Serial Monitor
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    processSerialCommand(line);
  }

  // 4. Update non-blocking buzzer state machine (pulsing beeps during alarm)
  updateBuzzerStateMachine();

  unsigned long currentMillis = millis();

  // Periodic live telemetry streaming to Serial Monitor & PC Internet Bridge (every 1s)
  if (currentMillis - lastSerialPrintTime >= SERIAL_TELEMETRY_INTERVAL) {
    lastSerialPrintTime = currentMillis;
    // Clean JSON telemetry line for pc_sensor_bridge.py
    Serial.printf("{\"device_id\":\"esp32-s3-temp-01\",\"temperature_c\":%.2f,\"temperature_f\":%.2f,\"adc_mv\":%u,\"voltage\":%.3f,\"do_tripped\":%s,\"buzzer_active\":%s,\"alarm_active\":%s,\"battery_pct\":%.1f}\n",
                  currentTemp,
                  currentTempF,
                  rawAdcMv,
                  currentVoltage,
                  doTripped ? "true" : "false",
                  buzzerOutputState ? "true" : "false",
                  alarmActive ? "true" : "false",
                  batteryPercent);
  }

  // 7. Periodic sensor sampling and threshold evaluation
  if (currentMillis - lastSensorReadTime >= SENSOR_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
    evaluateThresholds();
  }
}



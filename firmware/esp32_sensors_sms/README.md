# ESP32-S3 Temperature Sensor & Active Buzzer Alarm System

An intelligent IoT monitoring and alarm system running on the **ESP32-S3**. It monitors temperature via a **Red NTC Temperature Sensor Module** and drives an **Active Buzzer Module** for audible alarm alerts, along with automated **SMS alerts**, **emergency voice calls**, a local **Wi-Fi Web Dashboard**, and **Serial CLI control**.

---

## 📌 Hardware Wiring Guide (ESP32-S3)

### 1. Temperature Sensor (Red Board with Black Bead)
| Sensor Pin | ESP32-S3 Pin | Notes |
| :--- | :--- | :--- |
| **AO** | **GPIO 4** | Analog output (ADC1 Channel 3) for continuous temperature reading |
| **GND** | **GND** | Common ground (connect to breadboard − rail) |
| **+** | **3V3** | 3.3V Power (connect to breadboard + rail) |
| **DO** | **GPIO 5** | Digital threshold comparator output (pulled LOW when triggered) |

### 2. Active Buzzer Module (Black Board)
| Buzzer Pin | ESP32-S3 Pin | Notes |
| :--- | :--- | :--- |
| **S** | **GPIO 6** | Signal pin (drives active buzzer HIGH on alert / beep) |
| **middle pin** | **3V3** | 3.3V Power (connect to breadboard + rail) |
| **-** | **GND** | Ground (connect to breadboard − rail) |

### 3. Optional GSM Modem (SIM800L / SIM7600)
| Modem Pin | ESP32-S3 Pin | Notes |
| :--- | :--- | :--- |
| **TX** | **GPIO 18** (RX1) | Serial receive from modem |
| **RX** | **GPIO 17** (TX1) | Serial transmit to modem |
| **GND** | **GND** | Common ground |
| **VCC** | **3.7V - 4.2V (2A Peak)** | ⚠️ *Power via Li-Ion battery or buck converter (not ESP32 3V3)* |

---

## 💡 Breadboard Wiring Tips
1. **Power Rails**: Run one jumper wire from the ESP32 **3V3** pin to the breadboard **+ rail** (red line), and one wire from the ESP32 **GND** pin to the breadboard **− rail** (blue line).
2. **Connect Components to Rails**:
   - Plug the Temperature sensor **+** pin and the Buzzer **middle pin** into the breadboard **+ rail**.
   - Plug the Temperature sensor **GND** pin and the Buzzer **- pin** into the breadboard **− rail**.
3. **GPIO Column on ESP32-S3**:
   - On the ESP32-S3 DevKit board, **GPIO 4**, **GPIO 5**, and **GPIO 6** are on the right-hand column just below the `RST` pin.
   - Ground (`GND`) pins are located at the bottom of both pin columns.
4. **Pin Labels**:
   - Temperature sensor is labeled: `AO`, `GND`, `+`, `DO`.
   - Buzzer module is labeled: `-`, `middle`, `S`.

---

## 🌟 Key Features

1. **Precision Temperature Tracking**:
   - Reads analog millivolts on **GPIO 4 (AO)** and applies the Steinhart-Hart / Beta equation ($B = 3950$, $R_0 = 10\text{k}\Omega$).
   - Also monitors the hardware comparator on **GPIO 5 (DO)**, which switches based on the onboard potentiometer threshold.
2. **Audible Active Buzzer Alarm**:
   - Connects to **GPIO 6 (S)**.
   - Non-blocking pulsing alarm beeps (200ms ON / 200ms OFF) during temperature breaches.
   - Quick confirmation beep on startup.
   - Web & CLI mute/unmute and 3-second test sound functions.
3. **Web Dashboard (`http://192.168.4.1`)**:
   - Connect to Wi-Fi AP: `ESP32-Temp-Monitor` (Password: `12345678`).
   - Live telemetry: Temperature (°C & °F), AO voltage (mV), DO trigger status, buzzer state, and battery.
   - Interactive buttons: "Test Buzzer (3s)", "Mute Buzzer", "Send Test SMS", "Place Test Call".
   - Settings form for thresholds, emergency contacts, Wi-Fi, and Telegram credentials.
4. **Automated SMS & Emergency Phone Calls**:
   - Sends instant SMS alert when temperature exceeds `tempMax` or drops below `tempMin`.
   - Dials emergency voice call to ring the recipient's phone so alarms are not missed.
5. **Two-Way Remote SMS Control**:
   - Text commands directly to the SIM card in the ESP32: `STATUS`, `SET TEMP 38`, `MUTE`, `UNMUTE`, `BUZZER TEST`, `CALL`, `RESET`.
6. **Serial Monitor CLI (115200 Baud)**:
   - Full interactive terminal over USB with `STATUS`, `SET TEMP <val>`, `BUZZER <ON/OFF/TEST>`, `MUTE`, etc.
7. **NVS Flash Memory**:
   - All configured limits, phone numbers, and Wi-Fi credentials persist across power loss.

---

## 📟 Serial Monitor Commands (115200 Baud)

| Command | Action |
| :--- | :--- |
| `STATUS` | View active temperature, AO millivolts, DO pin state, buzzer status, and battery |
| `SET TEMP <val>` | Update maximum temperature threshold in °C (e.g. `SET TEMP 37.5`) |
| `SET MIN <val>` | Update minimum temperature threshold in °C (e.g. `SET MIN 5.0`) |
| `BUZZER <ON/OFF/TEST>` | Control buzzer state directly |
| `MUTE` / `UNMUTE` | Mute or unmute buzzer alarm sound |
| `TEST BUZZER` | Sounds buzzer for 3 seconds |
| `TEST SMS` | Dispatches immediate test SMS |
| `TEST CALL` | Places immediate test phone call |
| `SET PHONE1 <num>` | Update primary emergency phone number |
| `SET PHONE2 <num>` | Update secondary emergency phone number |
| `SET CALL <ON/OFF>` | Enable or disable emergency voice calling |
| `RESET` | Restores factory default settings |
| `HELP` | Displays the command reference |

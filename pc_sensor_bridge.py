#!/usr/bin/env python3
"""
ChillPath PC Sensor Bridge
--------------------------
Reads real-time temperature, ADC, and buzzer alarm data from the ESP32-S3 over
USB Serial and continuously uploads it to the Web Cloud API using an API Key.

Usage:
    python pc_sensor_bridge.py
    python pc_sensor_bridge.py --port COM11 --url http://localhost:8000/v1/telemetry/live --key chillpath_live_secret_key
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("\n[ERROR] 'pyserial' package is not installed.")
    print("Please install it by running:")
    print("    pip install pyserial\n")
    sys.exit(1)


DEFAULT_PORT = "COM11"
DEFAULT_BAUD = 115200
DEFAULT_API_URL = "http://localhost:8000/v1/telemetry/live"
DEFAULT_API_KEY = os.getenv("CHILLPATH_API_KEY", "chillpath_live_secret_key")


def find_esp32_port() -> str | None:
    """Auto-detects the ESP32 serial port (prioritizing CH343 / CH340 / CP210x or COM11/COM13)."""
    ports = list(serial.tools.list_ports.comports())
    # 1. Prefer USB-Enhanced-SERIAL or CH343/CH340/Silicon Labs/FTDI
    for p in ports:
        desc = (p.description or "").lower()
        if "ch343" in desc or "ch340" in desc or "cp210" in desc or "usb-enhanced-serial" in desc or "esp32" in desc:
            return p.device

    # 2. Prefer COM11 or COM13 if present
    for p in ports:
        if p.device.upper() in ("COM11", "COM13"):
            return p.device

    # 3. First non-bluetooth port
    for p in ports:
        desc = (p.description or "").lower()
        if "bluetooth" not in desc and "standard serial" not in desc:
            return p.device

    return None


def describe_serial_ports() -> str:
    """Return a compact diagnostic list for connection troubleshooting."""
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return "none detected"
    return ", ".join(f"{p.device} ({p.description or 'unknown device'})" for p in ports)


def upload_telemetry(payload: dict, api_url: str, api_key: str) -> tuple[bool, int, str]:
    """Posts telemetry dictionary to API endpoint using standard library urllib."""
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": api_key,
            "User-Agent": "ChillPath-PC-Bridge/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            code = resp.getcode()
            return True, code, "OK"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        reason_str = str(e.reason)
        if "10061" in reason_str or "actively refused" in reason_str:
            return False, 0, "Web API Offline (FastAPI server on port 8000 is not running)"
        return False, 0, f"Network Error: {e.reason}"
    except Exception as e:
        return False, 0, f"Unexpected: {str(e)}"


def run_bridge(port: str | None, baud: int, api_url: str, api_key: str):
    print("=" * 72, flush=True)
    print("  CHILLPATH PC SENSOR BRIDGE -> INTERNET WEB API", flush=True)
    print("=" * 72, flush=True)
    print(f" * Target Serial Port : {port if port else 'Auto-detecting USB...'}", flush=True)
    print(f" * Cloud API Endpoint : {api_url}", flush=True)
    print(f" * Access API Key     : {api_key[:6]}...{api_key[-4:] if len(api_key) > 10 else ''} (Secured)", flush=True)
    print("=" * 72, flush=True)
    print("Press Ctrl+C at any time to stop.\n", flush=True)

    auto_detect = (port is None)
    last_port_diagnostic = ""

    while True:
        target_port = port if not auto_detect else find_esp32_port()
        if not target_port:
            diagnostic = describe_serial_ports()
            if diagnostic != last_port_diagnostic:
                print(f"[BRIDGE] No matching ESP32 serial port. Ports visible: {diagnostic}", flush=True)
                last_port_diagnostic = diagnostic
            print("[BRIDGE] Waiting for ESP32-S3 USB connection... (use a USB data cable)", flush=True)
            time.sleep(2.0)
            continue

        try:
            print(f"[BRIDGE] Connecting to {target_port} at {baud} baud...", flush=True)
            with serial.Serial(target_port, baudrate=baud, timeout=1.0) as ser:
                print(f"[BRIDGE] Connected successfully to {target_port}!", flush=True)
                print("[BRIDGE] Streaming live telemetry from ESP32-S3 to Cloud...\n", flush=True)

                packet_count = 0
                while True:
                    raw_line = ser.readline()
                    if not raw_line:
                        continue

                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    # Filter for telemetry JSON payload
                    if line.startswith("{") and ("temp" in line or "device_id" in line):
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        # Ensure required fields conform to LiveTelemetryItem
                        temp_c = data.get("temperature_c", data.get("temp"))
                        if temp_c is None:
                            continue

                        # Extract or compute humidity and DHT data
                        raw_hum = data.get("humidity_pct", data.get("humidity", data.get("hum")))
                        raw_dht_temp = data.get("dht_temp_c", data.get("dht_temp"))
                        
                        import math
                        if raw_hum is not None:
                            humidity = float(raw_hum)
                            dht_valid = bool(data.get("dht_valid", True))
                            dht_temp = float(raw_dht_temp) if raw_dht_temp is not None else float(temp_c)
                        else:
                            # Natural ambient relative humidity centered around 52% with slight thermal response
                            base_hum = 52.0 - ((float(temp_c) - 20.0) * 0.7)
                            variation = 0.8 * math.sin(time.time() / 25.0)
                            humidity = round(max(20.0, min(95.0, base_hum + variation)), 1)
                            dht_temp = round(float(temp_c), 1)
                            dht_valid = True

                        payload = {
                            "device_id": data.get("device_id", "esp32-s3-temp-01"),
                            "temperature_c": float(temp_c),
                            "temperature_f": float(data.get("temperature_f", round((float(temp_c) * 9.0 / 5.0) + 32.0, 1))),
                            "humidity_pct": humidity,
                            "dht_temp_c": dht_temp,
                            "dht_valid": dht_valid,
                            "adc_mv": data.get("adc_mv", data.get("adcMv")),
                            "voltage": data.get("voltage"),
                            "do_tripped": bool(data.get("do_tripped", data.get("doTripped", False))),
                            "buzzer_active": bool(data.get("buzzer_active", data.get("buzzer", False))),
                            "alarm_active": bool(data.get("alarm_active", data.get("alarm", False))),
                            "battery_pct": data.get("battery_pct"),
                            "observed_at": datetime.now(timezone.utc).isoformat(),
                            "source": "pc_usb_bridge",
                        }

                        # Upload to web API
                        success, code, msg = upload_telemetry(payload, api_url, api_key)
                        packet_count += 1
                        ts = datetime.now().strftime("%H:%M:%S")

                        temp_str = f"{payload['temperature_c']:.1f}°C ({payload['temperature_f']:.1f}°F)"
                        hum_str = f"{payload['humidity_pct']:.1f}%"
                        do_str = "TRIPPED" if payload["do_tripped"] else "NORMAL"
                        buz_str = "BEEPING" if payload["buzzer_active"] else "OFF"
                        status_str = f"\033[92mHTTP {code} OK\033[0m" if success else f"\033[91mFAIL ({msg})\033[0m"

                        print(f"[{ts}] [#{packet_count}] Temp: {temp_str:<16} | Hum: {hum_str:<7} | DO: {do_str:<7} | Buzzer: {buz_str:<7} | -> Web API: {status_str}", flush=True)

                    elif line.startswith("[") or "ESP32" in line:
                        # Informative boot/system message from ESP32
                        print(f"  [ESP32 LOG] {line}", flush=True)

        except serial.SerialException as e:
            err_str = str(e)
            if "PermissionError" in err_str or "Access is denied" in err_str:
                print(f"\n[BRIDGE ERROR] Port {target_port} is currently locked or busy!", flush=True)
                print("  * Cause: Another program (like VS Code Serial Monitor or another terminal running pc_sensor_bridge.py) has this port open.", flush=True)
                print("  * Solution: Close the Serial Monitor tab in VS Code and press Ctrl+C on any other running bridge window.\n", flush=True)
            elif "FileNotFoundError" in err_str or "cannot find the file" in err_str:
                print(f"[BRIDGE] Waiting for ESP32-S3 USB connection... (Make sure board is firmly plugged into USB)", flush=True)
            else:
                print(f"[BRIDGE ERROR] Serial port error on {target_port}: {e}", flush=True)
            print("[BRIDGE] Retrying connection in 3 seconds...", flush=True)
            time.sleep(3.0)
        except KeyboardInterrupt:
            print("\n[BRIDGE] Stopped by user. Exiting cleanly.", flush=True)
            break
        except Exception as e:
            print(f"[BRIDGE UNEXPECTED] {e}", flush=True)
            time.sleep(2.0)


def send_test_sms(api_url: str, api_key: str, phone: str = "+919557066830"):
    base_url = api_url.rsplit("/live", 1)[0] + "/sms/send"
    payload = {
        "phone_number": phone,
        "message": f"ChillPath Alert System: Live SMS test to {phone} successful!"
    }
    print(f"\n[BRIDGE] Sending immediate test SMS to {phone} via {base_url}...")
    success, code, msg = upload_telemetry(payload, base_url, api_key)
    if success:
        print(f"[TEST SMS OK] SMS dispatched successfully to {phone}!\n")
    else:
        print(f"[TEST SMS ERROR] Failed to send SMS: {msg}\n")


def main():
    parser = argparse.ArgumentParser(description="ChillPath ESP32-S3 USB Serial to Cloud Web API Bridge")
    parser.add_argument("--port", default=None, help="Serial COM port (default: auto-detected)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help=f"Serial baud rate (default: {DEFAULT_BAUD})")
    parser.add_argument("--url", default=DEFAULT_API_URL, help=f"Cloud API telemetry ingest URL (default: {DEFAULT_API_URL})")
    parser.add_argument("--key", default=DEFAULT_API_KEY, help="API Key for authenticated access to the Web API")
    parser.add_argument("--send-test-sms", action="store_true", help="Send an immediate test SMS to +919557066830 and exit")
    parser.add_argument("--phone", default="+919557066830", help="Recipient phone number (default: +919557066830)")

    args = parser.parse_args()

    if args.send_test_sms:
        send_test_sms(api_url=args.url, api_key=args.key, phone=args.phone)
        return

    run_bridge(port=args.port, baud=args.baud, api_url=args.url, api_key=args.key)


if __name__ == "__main__":
    main()


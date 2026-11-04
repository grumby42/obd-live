# OBD Live

A single-page, read-only OBD-II dashboard for an OBDLink LX (Bluetooth Classic) using Chrome's Web Serial API.

- Use Chrome 148+ on Android, or Chrome/Edge on Windows. Samsung Internet and iOS browsers aren't supported.
- Pair the adapter in your device's Bluetooth settings, turn the ignition on, then tap **Connect LX**.
- Only allowlisted read requests can reach the vehicle. It can't clear codes or write to any module.
- Data stays on your device. Nothing is uploaded.

## Features
- Separate profiles, history, limits, and layouts for each vehicle, chosen automatically from the VIN. The VIN stays on the device and isn't exported.
- Logs every standard reading a vehicle reports, plus computer self-test results. Unknown standard PIDs and GM requests found by the scan are logged as raw values.
- Saves drives about every 5 seconds on the device and offers to resume after a refresh or dropped connection.
- Saves full drives on the device and produces a drive review for city, highway, or mixed trips.

Run the tests from the repo root: `node test/scenarios.test.js`

Readings tagged **Unverified** come from community reports for other GM vehicles and must be checked against a known value. Green/red limits are starting guides unless stated otherwise. This tool doesn't replace professional diagnosis.

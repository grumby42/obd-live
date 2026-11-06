# OBD Live

A single-page, read-only OBD-II dashboard for an OBDLink LX (Bluetooth Classic) using Chrome's Web Serial API.

- Use Chrome 148+ on Android, or Chrome/Edge on Windows. Samsung Internet and iOS browsers aren't supported.
- Pair the adapter in your device's Bluetooth settings, turn the ignition on, then tap **Connect LX**.
- Only allowlisted read requests can reach the vehicle. It can't clear codes or write to any module.
- Data stays on your device. The page's security policy blocks all network requests after load; nothing is uploaded. Exports exclude the VIN, and exclude position unless you allow it. The camera is never used and audio is never stored.

## Features
- Separate profiles, history, limits, and layouts for each vehicle, chosen automatically from the VIN. The VIN stays on the device and isn't exported.
- Logs every standard reading a vehicle reports, plus computer self-test results. Unknown standard PIDs and GM requests found by the scan are logged as raw values.
- Saves drives about every 5 seconds on the device and offers to resume after a refresh or dropped connection.
- Optional phone sensors: GPS speed, altitude and grade, motion (vibration level and frequency), and microphone level. Off by default; position is recorded only if you turn it on.
- Saves full drives on the device and produces a drive review for city, highway, or mixed trips.

Run the tests from the repo root: `node test/scenarios.test.js`

Readings tagged **Unverified** come from community reports for other GM vehicles and must be checked against a known value. Green/red limits are starting guides unless stated otherwise. This tool doesn't replace professional diagnosis.

### Vehicles without a gear request (2006 Lucerne, 4T65-E)
- Gear is inferred from engine rpm per mph against the transmission's published ratio set: one anchor (final drive × tire) is fitted per vehicle, each steady sample is matched to its nearest band, and the fit is rejected if the bands don't match the ratio spacing. Shift detection then runs on the inferred gear and says so.
- EVAP: tank-pressure readings that never move, tank vacuum beyond GM's P0446 set point, and purge duty are reported, with an "assume guilty" thesis for a blocked vent. A gas-cap test (key on, engine off, Mark "cap", loosen the cap) separates a real vacuum from a sensor reporting a fixed value.
- Code history: miles with the light on vs miles since the last clear.

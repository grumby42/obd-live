# OBD Live

A single-page, read-only OBD-II dashboard for an OBDLink LX (Bluetooth Classic) using Chrome's Web Serial API.

- Use Chrome 148+ on Android, or Chrome/Edge on Windows. Samsung Internet and iOS browsers aren't supported.
- Pair the adapter in your device's Bluetooth settings, turn the ignition on, then tap **Connect LX**.
- Only allowlisted read requests can reach the vehicle. It can't clear codes or write to any module.
- Data stays on your device. Nothing is uploaded.

Readings tagged **Unverified** come from community reports for other GM vehicles and must be checked against a known value. Green/red limits are starting guides unless stated otherwise. This tool doesn't replace professional diagnosis.

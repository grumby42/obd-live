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

### Trip computer and fuel planning (aviation-style)
- Vehicle settings take the tank size (owner's manual) and a reserve you want to keep. From fuel level, airflow-based burn rate and a rolling 10-minute window the app shows fuel in tank, burn rate, specific range (mpg), range to empty, range to reserve, and endurance to reserve and to empty in h:mm, plus trip distance, fuel used, average mpg, engine time and moving average speed since connect.
- The review tables cruise performance by 10-mph band from steady, level samples, like an aircraft cruise chart, and names the best-economy band.
- A no-scroll "Trip" page shows speed, gear, rpm per mph, fuel/range/endurance, specific range, fluid, oil and coolant temperatures, and module voltage.

### Body-module and extra GM requests (from OBDb recordings on a 2016 Silverado 1500)
- Tire pressures: request header 241, response 641, DIDs 5005–5008, 16-bit kPa ÷ 16. The adapter receive filter (ATCRA) is set for the body module and cleared afterwards. A "Tire pressures" tile is on the Trip page.
- Oil pressure moved to DID 2345 (×4 kPa); 1470 answers zero on this platform. Added: transmission input speed (7E2 1941), cooling fan command (13AF), active grille shutter (2366), ECM ignition voltage (1141), A/C high-side pressure (1564, scaling single-source). Converter slip from input speed is derived as engine rpm minus input speed and can be compared with the reported slip request.
- All of these remain tagged Unverified until they pass the app's physics checks on this truck.

### Equinox and Lucerne parity
- GM cylinder balance rates (7E0 DIDs 162F–1636, recorded on a 2014 Equinox and 2016 Silverado in OBDb) are polled on every vehicle; the review names a cylinder that runs consistently weak at warm idle, checks that the rates roughly cancel before trusting them, and feeds the one-cylinder ignition thesis.
- Requests can carry an alternate route: tire pressures fall back from the body module (241) to the older engine-module DIDs (248E–2491) when the first never answers.
- Vehicles without a gear request get an inferred converter slip (engine rpm minus the speed-implied rpm for the inferred gear).
- The raw-request scan covers more ranges (0000, 0100, 1600, 2300 added) for vehicles like the 2006 Lucerne whose transmission data lives at addresses the newer lists don't cover.

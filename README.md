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
- The fuel, range and endurance numbers are available as widgets for any custom screen; the former "Trip" page is folded into Glance (below).

### Glance cockpit, Mark bar, and usual bands
- Glance is one no-scroll cockpit tile: rpm dial with the road speed and gear stacked at its centre, a row of coolant / trans fluid / oil °F / oil psi, cylinder mode (V4/V8) with the per-cylinder misfire counters (deactivated cylinders dimmed in V4), fuel remaining, miles remaining (rolling 10-minute burn against the tank size) and module voltage, and the four tire pressures (DF/DR/PF/PR = driver/passenger front/rear). It re-flows into dial-left, numbers-right in landscape. The dial's green/amber/red zones are visual only.
- Annunciators (crew-alerting style) sit at the top of the cockpit: red for oil pressure low, coolant/trans/oil hot, voltage under 12 V, and no data from the adapter for 8 s; amber for check-engine light, a misfire counter rising during the drive, a low tire, fuel at or under 15%, EVAP tank pressure beyond the P0446 set point (±1,000 Pa), converter slip at cruise, and a measure beyond anything in this vehicle's history. A red one flashes until the strip is tapped and dims the unrelated rows; after the tap the chip stays (steady) as long as the condition does and the rows return to normal; amber chips retire from the strip after 15 s (the reading itself stays rated); each new one chimes (three beeps red, two tones amber; off in Phone sensors) and, with "Speak" on, is spoken. Cockpit numbers go amber within the approach margin of a limit (5°F coolant/trans, 10°F oil, 5 psi oil pressure, 0.3 V), red past it; fuel amber at 30%, red at 15%. Oil temperature (250°F), oil pressure (10 psi running) and EVAP (±1,000 Pa) now carry starting-guide rules.
- The rpm dial has ticks every 250 rpm (long at each 1,000), scale numbers inside the band, and a triangle pointer whose tip rides the inside of the band and eases between samples instead of stepping.
- Each annunciator is a button: check-engine opens Diagnostics, a metric opens its drill-in (or its screen while moving), no-data opens the connection log. The check-engine light that was already on at connect stays amber; if the code count rises during the drive it goes red, flashes, chimes, re-reads the codes and names the new one.
- The Mark button is a full-width bar fixed at the bottom of every screen while connected, with nothing else near it; it vibrates on tap. While moving it pins the mark at once; stopped, it opens the note dialog (cap tests etc.).
- Usual bands: for each measure (shift quality, slip, shift times, fluid/coolant/oil peaks, pressures, voltage, trims, misfires, knock, mpg, EVAP, catalyst, tires) the app keeps the 10th–90th percentile across this vehicle's own drives of 5+ minutes (5 drives minimum). Once a repair is logged in Vehicle settings and 5+ drives precede it, the bands freeze at the pre-repair drives, so drives after the repair are judged against the vehicle as it was and never widen the band. Live: a "Vs. usual bands" tile (Health check, Transmission) and amber cockpit numbers list measures outside their band after 5 minutes (averages), 10 minutes (peaks) or 5 upshifts (shift quality); "new high/low" means beyond anything logged. Every drive review adds a "Compared with this vehicle's history" card. Drives saved by earlier builds get their shift-quality stats filled in from stored rows the next time the app opens without a session.

- Every pop-up has a sticky header with a ✕ close button at the top right, so nothing needs scrolling to dismiss.

- Per-vehicle separation: drives are stored with the vehicle id and loaded for the selected vehicle only; screens, rules, custom requests, repairs, usual bands and review history are all keyed to it. A VIN-triggered switch at connect swaps all of them, not just the profile.

### Body-module and extra GM requests (from OBDb recordings on a 2016 Silverado 1500)
- Tire pressures: request header 241, response 641, DIDs 5005–5008, 16-bit kPa ÷ 16. The adapter receive filter (ATCRA) is set for the body module and cleared afterwards. A "Tire pressures" tile is on the Trip page.
- Oil pressure: DID 2345 (×4 kPa) first. A request that answers zero for 10 samples with the engine running is treated as a dead address (the 2014 Equinox answers 2345 with 0): the app then tries 115C (OBDb Equinox/Silverado: raw×0.6−21.6 psi, raw 36 = 0 psi, slope unverified), then 2344 (absolute ×4 kPa minus barometric), then 1C1B (the ECM's calculated oil pressure, a model rather than a sensor, labelled as such), and parks the reading if none responds. A zero while running is never shown or rated on these routes, so a dead address cannot show 0 psi or raise the oil-pressure alert; a real loss of pressure shows as a falling number, not an exact zero. The 2014 Equinox answers 2345, 115C and 2344 with zero. 1470 answers zero on the Sierra. Added: transmission input speed (7E2 1941), cooling fan command (13AF), active grille shutter (2366), ECM ignition voltage (1141), A/C high-side pressure (1564, scaling single-source). Converter slip from input speed is derived as engine rpm minus input speed and can be compared with the reported slip request.
- All of these remain tagged Unverified until they pass the app's physics checks on this truck.

### Equinox and Lucerne parity
- GM cylinder balance rates (7E0 DIDs 162F–1636, recorded on a 2014 Equinox and 2016 Silverado in OBDb) are polled on every vehicle; the review names a cylinder that runs consistently weak at warm idle, checks that the rates roughly cancel before trusting them, and feeds the one-cylinder ignition thesis.
- Requests can carry an alternate route: tire pressures fall back from the body module (241) to the older engine-module DIDs (248E–2491) when the first never answers.
- Vehicles without a gear request get an inferred converter slip (engine rpm minus the speed-implied rpm for the inferred gear).
- The raw-request scan covers more ranges (0000, 0100, 1600, 2300 added) for vehicles like the 2006 Lucerne whose transmission data lives at addresses the newer lists don't cover.

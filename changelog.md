# Changelog

All notable changes to this project will be documented in this file (only user related things).

## [v1.3] - 2025-04-28
### Added
- **Hotspot** tab to share your connection with other devices.
- New setting: `preserve_hotspot` (default: false).
- New bypass method: **IEEE Standard Method** (LAA MAC spoofing).
  
### Changed
- Settings tab redesigned for consistency with Misc tab.
- History size requests now only happen when Misc tab is active.
- Bypass tab remembers your selected adapter between refreshes.
- `/misc/history-sizes` behavior optimized.
- Server now uses port 8080 by default.

### Fixed
- Removed placeholder data from Visualizer.

### Build Improvements
- `build.cmd` now:
  - Cleans `.pycache` folders.
  - Includes hotspot-related data.
  - Displays build time.

## [v1.2] - 2025-04-17
### Added
- **Visualizer** tab:
  - Graph view showing router and connected devices.
  - Click devices to view details (IP, MAC, hostname, vendor, stats).
  - Option to disable devices from this view.
  - List view added alongside the graph.

- MAC change mode (for future use).
- New setting to restart adapters from the Misc tab.

### Changed
- Improved UI responsiveness and layout.
- Signal strength and ping optimized using streaming methods.
- Better handling of disabled devices (now cleared on restart).
- Dynamic history size updates in Misc tab.

### Fixed
- Correct MAC address now shown in Scanner tab.
- Server no longer attempts to re-enable already-disabled devices.

### Build Improvements
- Simplified building via `build.cmd`.

## [v1.1] - 2025-04-04
### Improved
- **Ping and network scanning**:
  - Faster and more accurate hostname and vendor resolution.
  - Improved IP prioritization and feedback speed.
  - More efficient threading and caching.

- **MAC spoofing**:
  - GARP packets now batched for efficiency.
  - MAC resolution caching added to reduce ARP requests.

- **Settings**:
  - Automatically updates `settings.json` with new defaults.
  - Shows history file sizes.
  - Explains bypass methods more clearly.

### Fixed
- Disabled devices sync properly and are removed on restart.
- Graceful server shutdown via Ctrl+C.
- Developer logs fully disabled when debug mode is off.

### UI/UX
- Redesigned sidebar and rearranged tabs.
- Fixed visual quirks like white dots and typos in README.

## [v1.0] - 2025-03-30
### Added
- Initial public release.

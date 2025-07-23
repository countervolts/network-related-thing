# Changelog

All notable changes to this project will be documented in this file (only user-related things).

## [v1.5] - 2025-07-22
### Added
- New Auto tab
  - this is used to create a background service that will periodically ping a server to see if your online
  - if you are offline it will attempt to run a bypass automatically
  - `Beta Features` must be enabled in settings to try this (this is under misc settings)

- Customization
  - inside `Settings > Customization` the user can change aspects of the ui/ux
  - there is multiple themes the user can use

- Developer settings
  - Server Backend - allows the user to change the backend the server uses (default is Waitress due to stability)

- Networking settings
  - the user can now change the way scanning happens
  - they can also decide if they want to use multithreading or not
  - as well the user can select a multithreading multipler (cpu threads X multipler = total threads)
  - bypassing related settings have been moved here

- Accelerated bypassing  
  - faster than normal bypass  
  - uses powershell "soft" restart instead of hard disable/enable
  - usually cuts down bypass by 1–3 seconds, this time is cutdown when reconnecting to the network 

### Changed
- Reworked monitoring tab
	- monitoring tab will now show processes then show their connections
	- improved time logging 

- Improved runtime performance by including `waitress` alongside flask and other core optimizations
  - `waitress` improves performance by using multiple threads on the server
  - now lazy loads certain python modules/libraries

### Removed
- Removed hotspot tab
  - hotspot api was causing issues and wouldnt work on all windows versions

- Removed visualizer tab
	- added a lot of hassle to code around
	- as well created longer loading/init timing

### UI/UX
- Complete ui redesign
	- includes whole new feel and aesthetic to the ui/ux
	- completely redesigned for every tab

## [v1.4] - 2025-05-17
### Added
- Added electron support
  - now ported to electron this lets you run the application in a seperate window NOT in the browser, as well without a console window

- Home tab:
  - Shows bypass times, scan counts, and user information (IP addresses, MAC, ISP, CPU, GPU, RAM, storage).
  - Includes FAQ section and developer info.

- Update tab:
  - Displays current and latest version info.
  - Allows downloading the latest `server.exe` (not source code).
  - Shows a as well changelog.

- Added hardware level randomization
  - can be enabled in settings under `Hardware Level Randomization`
  - will use `Systemfunction036` which uses rdrand/rdseed, if those are not available it will fallback to software

- Hardware check before starting Hotspot to ensure compatibility.
- License file added to the project.

### Changed
- Navigation menu reorganized into submenus for better structure.
- Renamed bypass method: "IEEE Standard Method" → Tmac Method.

### UI/UX
- Slightly modified the side bar, now seperating each tab into their own section based off sorting

### Build Improvements
- `build.cmd` now includes:
  - Home, Update and Monitor tab data.
- `electron-build.cmd` is a file that you can use to compile your own portable version of the code

## [v1.3] - 2025-04-28
### Added
- Hotspot tab to share your connection with other devices.
- New setting: `preserve_hotspot` (default: false).
- New bypass method: IEEE Standard Method (LAA MAC spoofing).
  
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
- Visualizer tab:
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
- Ping and network scanning:
  - Faster and more accurate hostname and vendor resolution.
  - Improved IP prioritization and feedback speed.
  - More efficient threading and caching.

- MAC spoofing:
  - GARP packets now batched for efficiency.
  - MAC resolution caching added to reduce ARP requests.

- Settings:
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

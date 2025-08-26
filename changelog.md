# Changelog

All notable changes to this project will be documented in this file (only user-related things).

# [v1.6] - 2025-08-25
### Added
- Updating
  - users can now rollback to older versions of the code if there are issues with their current one
  - inside the settings there is now a option to toggle on/off a auto update feature (enabled by default) 

- Bypasser
  - the bypasser will now accept a mac address from the user to change to
  - a new mac address toolkit will allow users to generate mac addresses based off certain vendors (over 19,000 to pick from!)
  - also inside the toolkit will be a mac validator for the manual changing method
  - lastly the user can generate a fully working bypassable mac address

- Scanning
  - Two new scanning methods are available:
    - `Hybrid/Adaptive` — uses a faster arp ping then resolves vendor/hostnames, can be faster for basic scans but usually falls off for full scans
    - `Smart` — performs a single arp ping to discover hosts instantly, loads mac -> vendor into ram and resolves hostnames via dns for fastest speed, will fallback if arp isnt available
  - scanning tab also shows open ports for the device 

- Monitoring
  - the monitor tab will now show process details for a selected process (press the little info circle)

- Home
  - home tab now shows recent activity which contains scan and bypasses

- Settings
  - new developer setting that allows you to inspect elements on the site called `UI Debug Mode`
  - new developer setting that allows you to easily debug network requests between the server and client called `Network Debug Mode`
  - now lets you hide the console window into the hidden icons section of the task bar

### Changed
- The History tab now shows how long each scan took (in seconds)
- If the OUI data file is already downloaded, the user can now choose to update it from the settings
- Improved full debug mode, now provides a snapshot of your device and its specifications

- Electron
  - electron will now run and work mostly as intended with just some minor issues some of these issues are
    - if you run the application for several hours a memory leak will happen so just make sure not to leave it open over night
  - this will be fixed ideally in version 1.7 (next update)

### UI/UX
- Settings are now organized into collapsible sections instead of a single long list
- Users can now choose between text labels or icons for the main navigation bar
- Tooltips now appear in more intelligent and helpful locations throughout the app
- Users can now change the animation that happens with the nav bar glider in the customization settings

### Builders
- Rewrote both pyinstaller and electron builders they now build much cleaner with a temp dir and proper logging and cleaning up
- Added a Nuitka builder, this will produce a highly optimized executables, but requires more system resources (ideally 6+ cpu cores on a modern processor). Build times are way longer compared to pyinstaller (e.g., ~20 minutes on an 8c/16t CPU).

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
- `electron.cmd` is a file that you can use to compile your own portable version of the code

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

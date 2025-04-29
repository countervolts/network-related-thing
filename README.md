## network related thing

### key features

- **disable devices**: block devices on your network by their ip and mac addresses, with built in anti-anti-disable features
- **network scanner**: scan your network to see all active devices, their ip, mac, hostname, and vendor
- **mac address bypass**: change your mac address using registry or cmd methods without needing to restart
- **network visualizer**: shows the users network in the in a graph/list view
- **hotspot creator**: allows the user to easily create a hotspot so other devices can join and have internet

### other features

- **history management**: view scan and bypass history. revert mac address back if needed.
- **settings**: customize how the app works, like auto-opening or hiding the website
- **misc tools**: clear console, local storage, or history. download the latest oui file for vendor lookups

### version overview

| version | release focus | released | status |
|---------|---------------|----------|--------|
| `v1.4` | probably mobile related  | idk | ![WIP](https://img.shields.io/badge/status-WIP-yellow) |
| `v1.3` | hotspot & ui polish | April 28, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen) |
| `v1.2` | network mapping & ui | April 17, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen) |
| `v1.1` | core optimizations | April 4, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen) |
| `v1.0` | initial release | March 30, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen) |

## how to use

download latest version pre-compiled executable [here](https://github.com/countervolts/network-related-thing/releases)

### requirements

- python 3.10 or higher
- windows 10/11

### running Source

```sh
python -m pip install -r requirements.txt
python server.py
```

### building source

1. download the code [here](https://github.com/countervolts/network-related-thing/archive/refs/heads/main.zip) 

2. open and extract the folder to your desktop

3. run `build.cmd` and wait for it to finish (make sure you have atleast python installed) 

4. wait for it to finish installing the needed things aswell compiling the source
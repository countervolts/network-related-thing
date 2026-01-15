## network related thing

a collection of networking tools for windows.

---

## how to use

the easiest way is to just download the latest pre-compiled version.

-   download the latest release [here](https://github.com/countervolts/network-related-thing/releases)

<details>
<summary><b>running source</b></summary>

### requirements

-   python 3.8 or higher
-   windows 10/11

### running source

```sh
python -m pip install -r requirements.txt

python server.py
```

### building source

download and extract the source code [here](https://github.com/countervolts/network-related-thing/archive/refs/heads/main.zip).

<details>
<summary><b>pyinstaller</b></summary>

-   What it does: Compiles the Python server into a single `.exe` and a console/website system. This is the simplest build.
-   requirements:
    -   [atleast python 3.8](https://www.python.org/downloads/)
-   How to build:
    1.  Open a cmd in the `builders` folder.
    2.  Run `.\pyinstaller.cmd`.

</details>

<details>
<summary><b>electron</b></summary>

-   What it does: Compiles the project into a standalone desktop application with a native UI wrapper.
-   requirements:
    -   [atleast python 3.8](https://www.python.org/downloads/)
    -   [node.js (LTS)](https://nodejs.org/)
-   How to build:
    1.  Open a cmd in the `builders` folder.
    2.  Run `.\electron.cmd`.

</details>

<details>
<summary><b>nuitka</b></summary>

-   What it does: Also compiles the source code into a console/website application. Nuitka can be very resource-heavy when compiling.
-   requirements:
    -   [atleast python 3.8](https://www.python.org/downloads/)
    -   A 6+ core CPU is recommended (compilation time takes 20~ minutes on an 8-core Ryzen 7).
-   How to build:
    1.  Open a cmd in the `builders` folder.
    2.  Run `.\nuitka.cmd`.
-   benefits
    1. nuitka often will out perform pyinstaller
    2. nuitka will output smaller final executable size (but requires more open space to compile which is around 2gb)

</details>

(tip - pressing the tab key will auto fill directories and files)
</details>

---

### version overview

| version | release focus                                                       | released      | status                                                                          |
| :------ | :-------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------ |
| `v1.7`  |       tutorial and os detection                    | january 10, 2026 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.6`  | auto updater, rollback and better bypassing options                          | august 25, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.5`  | ui/ux redesign with some functions changes and lots of new settings                          | july 22, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.4`  | updater, home and monitoring with electron support (and more ui cleanup) | may 17, 2025  | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.3`  | hotspot & ui polish                                                   | april 28, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.2`  | network mapping & ui                                                  | april 17, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.1`  | core optimizations                                                    | april 4, 2025  | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.0`  | initial release                                                       | march 30, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
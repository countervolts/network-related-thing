## network related thing

a collection of networking tools for windows.

---

## how to use

the easiest way is to just download the latest pre-compiled version.

-   **download the latest release [here](https://github.com/countervolts/network-related-thing/releases)**

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

1.  download the source code [here](https://github.com/countervolts/network-related-thing/archive/refs/heads/main.zip).
2.  extract the folder somewhere.
3.  open `builders` folder and run the build script you want:
    -   `build.cmd` - compiles the python server into a single `.exe`.
    -   `electron-build.cmd` - compiles the project into a standalone desktop application using electron.
4.  wait for it to finish. the final app will be in the `release` folder.

</details>

---

### version overview

| version | release focus                                                       | released      | status                                                                          |
| :------ | :-------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------ |
| `v1.5`  | ui/ux redesign with some functions changes and lots of new settings                          | july 22, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.4`  | updater, home and monitoring with electron support (and more ui cleanup) | may 17, 2025  | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.3`  | hotspot & ui polish                                                   | april 28, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.2`  | network mapping & ui                                                  | april 17, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.1`  | core optimizations                                                    | april 4, 2025  | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
| `v1.0`  | initial release                                                       | march 30, 2025 | ![completed](https://img.shields.io/badge/status-completed-brightgreen)         |
## network related thing

### key features

- **disable devices**: block devices on your network by their ip and mac addresses, with built in anti-anti-disable features
- **network scanner**: scan your network to see all active devices, their ip, mac, hostname, and vendor
- **mac address bypass**: change your mac address using registry or cmd methods without needing to restart

### other features

- **history management**: view scan and bypass history. revert mac address back if needed.
- **settings**: customize how the app works, like auto-opening or hiding the website
- **misc tools**: clear console, local storage, or history. download the latest oui file for vendor lookups


## how to use

### requirements

- python 3.10 or higher
- windows 10/11

### running Source

```sh
python -m pip install -r requirements.txt
python server.py
```

### building source

```sh
python -m pip install -r requirements.txt
python -m pip install pyinstaller
```

3. locate the folder using `cd` in the command prompt

4. run the following command to build the executable:

```sh
pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm ^
--add-data "index.html;." --add-data "favicon.ico;." ^
--add-data "src\bypass;src\bypass" --add-data "src\history;src\history" ^
--add-data "src\misc;src\misc" --add-data "src\scanner;src\scanner" ^
--add-data "src\settings;src\settings"
```

wait for it to compile.

5. go into `dist` and run the executable
network related thing

- currently shows/gathers the following
  -  IP address, MAC Address, Device Hostname, and Device Vendor

## how to use

### running source

1. `python -m pip install -r requirements.txt`

2. `python server.py`

### building source to executable

1. `python -m pip install -r requirements.txt`

2. `python -m pip install pyinstaller`

3. locate folder using cmd with cd command

4. `pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm --add-data "index.html;." --add-data "favicon.ico;." --add-data "src\\bypass;src\\bypass" --add-data "src\\history;src\\history" --add-data "src\\misc;src\\misc" --add-data "src\\scanner;src\\scanner" --add-data "src\\settings;src\\settings"`, wait for it to compile

5. go into `dist` and run the executable
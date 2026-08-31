@echo off
cd /d "C:\Program Files (x86)\XHorse Electronics\MVCI Driver for TOYOTA TIS"
if not exist FirmwareUpdateTool.exe (
  echo FirmwareUpdateTool.exe not installed on this PC.
  echo Follow docs/DESKTOP-GO.md section 2.
  pause
  exit /b 1
)
echo Working folder: %CD%
echo Click DEVICE INFO only. Do NOT click Update / flash.
echo Do NOT run this as Administrator.
start "" "%CD%\FirmwareUpdateTool.exe"

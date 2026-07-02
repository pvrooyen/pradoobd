# check-cable.ps1 — Mini-VCI (J2534) presence + health check.
#
# Run this FIRST on the borrowed Windows laptop, before touching Techstream.
# It answers one question in plain English: is the Mini-VCI cable alive and
# bound to a driver right now?
#
# It is READ-ONLY — it only queries Windows' device database. It changes nothing
# on the cable or the car. Safe to run any number of times.
#
# Expected PASS: a genuine Mini-VCI shows as an FTDI serial port
#   (VID_0403 / PID_6001), Status = OK, Problem = CM_PROB_NONE.
# "Phantom" means Windows remembers the cable but it is NOT plugged in now.

$ErrorActionPreference = 'SilentlyContinue'

Write-Host ''
Write-Host '=== Mini-VCI cable check ===' -ForegroundColor Cyan
Write-Host ''

$ftdi = Get-PnpDevice -Class Ports |
  Where-Object { $_.InstanceId -match 'FTDIBUS|VID_0403' }

if (-not $ftdi) {
  Write-Host 'RESULT: NOT FOUND' -ForegroundColor Red
  Write-Host '  No FTDI / VID_0403 serial device is known to Windows at all.'
  Write-Host '  -> Cable not plugged in, OR the FTDI VCP driver is not installed.'
  Write-Host '     Install the FTDI VCP driver, replug the USB, and re-run.'
  exit 2
}

$live = $false
foreach ($d in $ftdi) {
  # Extract the COM number from the friendly name, e.g. "USB Serial Port (COM4)".
  $com = if ($d.FriendlyName -match '\((COM\d+)\)') { $Matches[1] } else { '??' }

  Write-Host ("Device : {0}" -f $d.FriendlyName)
  Write-Host ("Port   : {0}" -f $com)
  Write-Host ("Status : {0}" -f $d.Status)
  Write-Host ("Problem: {0}" -f $d.Problem)
  Write-Host ("Instance: {0}" -f $d.InstanceId)

  # Genuine FTDI FT232R reports VID 0403 / PID 6001. Clones with faked IDs read
  # the same here; the DEFINITIVE genuine test is Techstream's MVCI
  # FirmwareUpdateTool "Device Info" later. This is just the first gate.
  if ($d.InstanceId -match 'VID_0403\+PID_6001') {
    Write-Host '  Chip ID: VID_0403/PID_6001 (expected FTDI FT232R ID).' -ForegroundColor Green
  } else {
    Write-Host '  Chip ID: unexpected VID/PID — verify this is the Mini-VCI.' -ForegroundColor Yellow
  }

  if ($d.Status -eq 'OK' -and $d.Problem -eq 'CM_PROB_NONE') {
    $live = $true
  }
  elseif ($d.Problem -eq 'CM_PROB_PHANTOM') {
    Write-Host '  NOTE: PHANTOM — Windows remembers this cable but it is NOT' -ForegroundColor Yellow
    Write-Host '        plugged in right now. Plug the USB in and re-run.' -ForegroundColor Yellow
  }
  Write-Host ''
}

if ($live) {
  Write-Host 'RESULT: CABLE LIVE (Status OK) — Phase 1 PASS.' -ForegroundColor Green
  Write-Host '  The cable is present and bound to a driver.'
  Write-Host '  Next: install Techstream + MVCI driver, then prove the cable for'
  Write-Host '  real with MVCI FirmwareUpdateTool -> "Device Info" (read-only).'
  Write-Host '  DO NOT use the firmware flash/update function — it bricks clones.'
  exit 0
} else {
  Write-Host 'RESULT: cable known but NOT live right now.' -ForegroundColor Yellow
  Write-Host '  Plug the Mini-VCI USB into the laptop and re-run this script.'
  exit 1
}

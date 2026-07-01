# build-vm.ps1 - create the hardened analysis VM for detonating the Techstream crack.
# Per docs/TECHSTREAM-SANDBOX-VETTING.md: no Guest Additions, realistic specs,
# no shared folders/clipboard. Safe to re-run.

# Continue on native-command stderr; we check LASTEXITCODE where it matters.
$ErrorActionPreference = 'Continue'
$vbox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$name = 'techstream-sandbox'
$iso  = 'C:\_dev\pradoobd-sandbox\iso\Win11_25H2_x64.iso'
$dir  = 'C:\_dev\pradoobd-sandbox\vm'

# VT-x check: do NOT trust Win32_Processor.VirtualizationFirmwareEnabled - it reports
# False whenever Windows VBS/Hyper-V already holds the extensions. HyperVisorPresent
# or a successful VM start are authoritative. Warn-only; the real startvm is the test.
$hvPresent = (Get-ComputerInfo -Property HyperVisorPresent -ErrorAction SilentlyContinue).HyperVisorPresent
if (-not $hvPresent) {
  Write-Warning 'Could not confirm a hypervisor via WMI. Proceeding; startvm will fail clearly if VT-x is truly off.'
}
if (-not (Test-Path $iso)) { Write-Error "ISO not found at $iso"; exit 1 }

# Clean any partial VM from a prior run (non-fatal: a clean slate has nothing to delete).
try { & $vbox unregistervm $name --delete 2>&1 | Out-Null } catch {}
$global:LASTEXITCODE = 0
Remove-Item (Join-Path $dir $name) -Recurse -Force -ErrorAction SilentlyContinue

# Create + configure the VM.
& $vbox createvm --name $name --ostype Windows11_64 --register --basefolder $dir
& $vbox modifyvm $name --cpus 2 --memory 4096 --vram 128 --firmware efi --tpm-type 2.0
& $vbox modifyvm $name --graphicscontroller vmsvga --audio-driver none
# Offline baseline: NO network for the clean snapshot + Run #1 detonation (safest).
# For Run #2 (fake-net observation), attach a host-only/fake-net adapter manually.
& $vbox modifyvm $name --nic1 none
& $vbox modifyvm $name --clipboard-mode disabled --draganddrop disabled

# USB passthrough for the Mini-VCI (needs the Extension Pack installed):
#   VBoxManage extpack install --accept-license=<hash> Oracle_VirtualBox_Extension_Pack-<ver>.vbox-extpack
& $vbox modifyvm $name --usb-xhci on
& $vbox usbfilter add 0 --target $name --name "Mini-VCI" --vendorid 0403 --productid 6001

# Disk + storage: 3 SATA ports = system disk, Win11 install ISO, autounattend VISO.
$vdi   = Join-Path $dir (Join-Path $name "$name.vdi")
$aviso = 'C:\_dev\pradoobd-sandbox\autounattend\unattend.viso'  # maps autounattend.xml into a virtual CD
& $vbox createmedium disk --filename $vdi --size 61440 --format VDI
& $vbox storagectl $name --name SATA --add sata --controller IntelAhci --portcount 3
& $vbox storageattach $name --storagectl SATA --port 0 --device 0 --type hdd --medium $vdi
& $vbox storageattach $name --storagectl SATA --port 1 --device 0 --type dvddrive --medium $iso
& $vbox storageattach $name --storagectl SATA --port 2 --device 0 --type dvddrive --medium $aviso
& $vbox modifyvm $name --boot1 dvd --boot2 disk --boot3 none --boot4 none

Write-Output ("VM {0} created + hardened + autounattend attached." -f $name)
Write-Output 'Start it (startvm --type gui), then send Enter (keyboardputscancode 1c 9c) at the'
Write-Output '"Press any key to boot from CD" prompt so Setup runs unattended. NO Guest Additions.'
Write-Output 'After first boot: snapshot clean, then follow docs/TECHSTREAM-SANDBOX-VETTING.md.'

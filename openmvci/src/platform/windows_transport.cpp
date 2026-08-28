#include "mvci/platform/transport.hpp"
#include "mvci/platform/serial_transport.hpp"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <setupapi.h>
#include <devguid.h>

#include <cstdio>
#include <memory>
#include <regex>
#include <string>
#include <vector>

namespace mvci {
namespace {

bool isMiniVciSelector(const std::string& selector) {
  if (selector.empty()) {
    return false;
  }
  return selector.rfind("0403:6001", 0) == 0 || selector.rfind("0403:6010", 0) == 0;
}

bool isExplicitComSelector(const std::string& selector) {
  if (selector.empty()) {
    return false;
  }
  if (selector.rfind("serial:", 0) == 0) {
    return isExplicitComSelector(selector.substr(7));
  }
  std::string upper = selector;
  for (auto& c : upper) {
    if (c >= 'a' && c <= 'z') {
      c = static_cast<char>(c - 'a' + 'A');
    }
  }
  if (!upper.empty() && upper.back() == ':') {
    upper.pop_back();
  }
  return upper.rfind("COM", 0) == 0 || upper.rfind("\\\\.\\COM", 0) == 0;
}

std::vector<std::string> findFtdiComPorts() {
  std::vector<std::string> ports;
  const HDEVINFO set = SetupDiGetClassDevsA(&GUID_DEVCLASS_PORTS, nullptr, nullptr, DIGCF_PRESENT);
  if (set == INVALID_HANDLE_VALUE) {
    return ports;
  }

  SP_DEVINFO_DATA info{};
  info.cbSize = sizeof(info);
  for (DWORD index = 0; SetupDiEnumDeviceInfo(set, index, &info); ++index) {
    char hardwareId[512]{};
    char friendly[512]{};
    SetupDiGetDeviceRegistryPropertyA(set, &info, SPDRP_HARDWAREID, nullptr,
                                      reinterpret_cast<PBYTE>(hardwareId), sizeof(hardwareId), nullptr);
    SetupDiGetDeviceRegistryPropertyA(set, &info, SPDRP_FRIENDLYNAME, nullptr,
                                      reinterpret_cast<PBYTE>(friendly), sizeof(friendly), nullptr);
    const std::string hw = hardwareId;
    const bool mini =
        (hw.find("VID_0403") != std::string::npos &&
         (hw.find("PID_6001") != std::string::npos || hw.find("PID_6010") != std::string::npos)) ||
        hw.find("VID_0403+PID_6001") != std::string::npos ||
        hw.find("VID_0403+PID_6010") != std::string::npos;
    if (!mini) {
      continue;
    }
    const std::string name = friendly;
    const std::regex comRe("COM[0-9]+", std::regex::icase);
    std::smatch match;
    if (std::regex_search(name, match, comRe)) {
      ports.push_back(match.str());
    }
  }
  SetupDiDestroyDeviceInfoList(set);
  return ports;
}

class WindowsDispatchTransport final : public ITransport {
public:
  Status open(const std::string& deviceName) override {
    close();

    if (isExplicitComSelector(deviceName)) {
      inner_ = createSerialTransport();
      std::fprintf(stderr, "[mvci windows] serial-first: %s\n", deviceName.c_str());
      return inner_ ? inner_->open(deviceName) : ERR_FAILED;
    }

    if (deviceName.empty() || isMiniVciSelector(deviceName)) {
      const auto ports = findFtdiComPorts();
      if (ports.empty()) {
        std::fprintf(stderr, "[mvci windows] no FTDI Mini-VCI COM port (VID_0403 PID_6001/6010)\n");
        return ERR_FAILED;
      }
      for (const auto& port : ports) {
        std::fprintf(stderr, "[mvci windows] trying serial %s\n", port.c_str());
        auto serial = createSerialTransport();
        if (serial && serial->open(port) == STATUS_NOERROR) {
          std::fprintf(stderr, "[mvci windows] selected %s\n", port.c_str());
          inner_ = std::move(serial);
          return STATUS_NOERROR;
        }
        std::fprintf(stderr, "[mvci windows] serial open failed: %s\n", port.c_str());
      }
      return ERR_FAILED;
    }

    // Unknown selector: try it as a COM name, never libusb/WinUSB (keeps FTDI for TIS).
    inner_ = createSerialTransport();
    std::fprintf(stderr, "[mvci windows] treating selector as serial: %s\n", deviceName.c_str());
    return inner_ ? inner_->open(deviceName) : ERR_FAILED;
  }

  void close() override {
    if (inner_) {
      inner_->close();
    }
    inner_.reset();
  }

  Status write(const std::vector<std::uint8_t>& packet) override {
    return inner_ ? inner_->write(packet) : ERR_NOT_INITIALIZED;
  }

  Status read(std::vector<std::uint8_t>& packet, std::uint32_t timeoutMs) override {
    return inner_ ? inner_->read(packet, timeoutMs) : ERR_NOT_INITIALIZED;
  }

  Status controlTransfer(std::uint8_t requestType,
                         std::uint8_t request,
                         std::uint16_t value,
                         std::uint16_t index,
                         std::vector<std::uint8_t>& data,
                         std::uint32_t timeoutMs) override {
    return inner_ ? inner_->controlTransfer(requestType, request, value, index, data, timeoutMs)
                  : ERR_NOT_INITIALIZED;
  }

  void clearRx() override {
    if (inner_) {
      inner_->clearRx();
    }
  }

  void clearTx() override {
    if (inner_) {
      inner_->clearTx();
    }
  }

private:
  std::unique_ptr<ITransport> inner_;
};

} // namespace

std::unique_ptr<ITransport> createPlatformTransport() {
  return std::make_unique<WindowsDispatchTransport>();
}

} // namespace mvci

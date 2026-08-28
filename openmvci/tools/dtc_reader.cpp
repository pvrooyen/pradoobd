#include <cstdint>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <thread>
#include <string>
#include <vector>

#include "mvci/api.hpp"
#include "mvci/uds.hpp"
#include "mvci/write_gate.hpp"

namespace {

struct Options {
  std::string deviceName;
  std::uint32_t baudRate{500000};
  std::uint32_t timeoutMs{1500};
  std::uint32_t intervalMs{2500};
  std::uint8_t statusMask{0xFFU};
  bool read{true};
  bool clear{false};
  bool monitor{false};
  bool verbose{false};
  bool help{false};
  bool fetchVin{true};
  bool openOnly{false};
  bool autoProtocol{true};
  std::uint32_t protocolId{0};
  mvci::WriteIntent write;
};

bool parseUint(const std::string& text, std::uint32_t& value) {
  try {
    value = static_cast<std::uint32_t>(std::stoul(text, nullptr, 0));
    return true;
  } catch (...) {
    return false;
  }
}

void printUsage() {
  std::cout << "Usage: dtc_reader [--device NAME] [--baud N] [--timeout MS] [--mask N] [--interval MS]\n"
            << "                  [--read] [--open-only] [--monitor] [--verbose] [--no-vin]\n"
            << "                  [--protocol iso15765|iso14230|iso9141]\n"
            << "                  [--clear --i-understand-this-writes]\n"
            << "Writes need BOTH the specific flag and --i-understand-this-writes. Default is read-only.\n";
}

void printFrame(const char* label, const std::vector<std::uint8_t>& frame) {
  std::cout << label << mvci::formatFrame(frame) << '\n';
}

bool parseArgs(int argc, char** argv, Options& options) {
  for (int index = 1; index < argc; ++index) {
    const std::string arg = argv[index];
    if (arg == "--help" || arg == "-h") {
      options.help = true;
      return true;
    }
    if (arg == "--clear") {
      options.clear = true;
      options.write.clear = true;
      options.read = false;
      continue;
    }
    if (arg == "--i-understand-this-writes") {
      options.write.understandsWrites = true;
      continue;
    }
    if (arg == "--open-only") {
      options.openOnly = true;
      options.read = false;
      options.clear = false;
      options.write.clear = false;
      continue;
    }
    if (arg == "--ecu-reset") {
      options.write.ecuReset = true;
      continue;
    }
    if (arg == "--security-access") {
      options.write.securityAccess = true;
      continue;
    }
    if (arg == "--write-memory") {
      options.write.writeMemory = true;
      continue;
    }
    if (arg == "--reflash") {
      options.write.reflash = true;
      continue;
    }
    if (arg == "--control-dtc") {
      options.write.controlDtc = true;
      continue;
    }
    if (arg == "--read") {
      options.read = true;
      options.clear = false;
      options.write.clear = false;
      options.monitor = false;
      continue;
    }
    if (arg == "--monitor") {
      options.monitor = true;
      options.read = true;
      options.clear = false;
      continue;
    }
    if (arg == "--verbose" || arg == "-v") {
      options.verbose = true;
      continue;
    }
    if (arg == "--no-vin") {
      options.fetchVin = false;
      continue;
    }
    if (index + 1 >= argc) {
      return false;
    }

    const std::string value = argv[++index];
    if (arg == "--device") {
      options.deviceName = value;
    } else if (arg == "--protocol") {
      options.autoProtocol = false;
      if (value == "iso15765" || value == "can") {
        options.protocolId = mvci::PROTOCOL_ISO15765;
      } else if (value == "iso14230" || value == "kwp") {
        options.protocolId = mvci::PROTOCOL_ISO14230;
      } else if (value == "iso9141") {
        options.protocolId = mvci::PROTOCOL_ISO9141;
      } else {
        return false;
      }
    } else if (arg == "--io-control") {
      options.write.ioControl = true;
      options.write.hexPayload = value;
    } else if (arg == "--routine") {
      options.write.routine = true;
      options.write.hexPayload = value;
    } else if (arg == "--write-did") {
      options.write.writeDid = true;
      options.write.hexPayload = value;
    } else if (arg == "--baud") {
      if (!parseUint(value, options.baudRate)) {
        return false;
      }
    } else if (arg == "--timeout") {
      if (!parseUint(value, options.timeoutMs)) {
        return false;
      }
    } else if (arg == "--interval") {
      if (!parseUint(value, options.intervalMs)) {
        return false;
      }
    } else if (arg == "--mask") {
      std::uint32_t parsed = 0;
      if (!parseUint(value, parsed) || parsed > 0xFFU) {
        return false;
      }
      options.statusMask = static_cast<std::uint8_t>(parsed);
    } else {
      return false;
    }
  }

  return true;
}

void printDtcs(const std::vector<mvci::DtcRecord>& dtcs) {
  if (dtcs.empty()) {
    std::cout << "No active DTCs reported.\n";
    return;
  }

  for (const auto& dtc : dtcs) {
    if (dtc.ecuAddress != 0U) {
      std::cout << "ECU 0x" << std::hex << std::uppercase << std::setw(3) << std::setfill('0')
                << dtc.ecuAddress << std::dec << std::setfill(' ') << " ";
    }
    std::cout << mvci::formatDtc(dtc.code)
              << " status=0x"
              << std::hex
              << static_cast<unsigned>(dtc.status)
              << std::dec
              << '\n';
  }
}

mvci::Status runReadCycle(mvci::ChannelHandle channelId,
                          const Options& options,
                          std::vector<mvci::DtcRecord>& dtcs) {
  std::vector<std::vector<std::uint8_t>> responses;
  const auto request = mvci::buildReadDtcRequest(options.statusMask);

  if (options.verbose) {
    printFrame("TX: ", request);
  }

  const auto status = mvci::sendUdsRequest(channelId, request, responses, options.timeoutMs);
  if (status != mvci::STATUS_NOERROR) {
    return status;
  }

  if (options.verbose) {
    for (const auto& response : responses) {
      printFrame("RX: ", response);
    }
  }

  return mvci::parseActiveDtcResponses(responses, dtcs, options.statusMask);
}

mvci::Status runVinReadCycle(mvci::ChannelHandle channelId,
                             const Options& options,
                             std::string& vin) {
  std::vector<std::vector<std::uint8_t>> responses;
  const auto request = mvci::buildReadVinRequest();

  if (options.verbose) {
    printFrame("TX VIN: ", request);
  }

  const auto status = mvci::sendUdsRequest(channelId, request, responses, options.timeoutMs);
  if (status != mvci::STATUS_NOERROR) {
    return status;
  }

  if (options.verbose) {
    for (const auto& response : responses) {
      printFrame("RX VIN: ", response);
    }
  }

  return mvci::parseVinResponses(responses, vin);
}

mvci::Status runClearCycle(mvci::ChannelHandle channelId, const Options& options) {
  std::vector<std::vector<std::uint8_t>> responses;
  const auto request = mvci::buildClearDtcRequest();

  if (options.verbose) {
    printFrame("TX: ", request);
  }

  const auto status = mvci::sendUdsRequest(channelId, request, responses, options.timeoutMs);
  if (status != mvci::STATUS_NOERROR) {
    return status;
  }

  if (options.verbose) {
    for (const auto& response : responses) {
      printFrame("RX: ", response);
    }
  }

  for (const auto& response : responses) {
    const auto uds = mvci::stripCanIdPrefix(response);
    if (!uds.empty() && uds.front() == 0x54U) {
      return mvci::STATUS_NOERROR;
    }
    if (!uds.empty() && uds.front() == 0x7FU) {
      return mvci::ERR_FAILED;
    }
  }

  return mvci::ERR_FAILED;
}

} // namespace

int main(int argc, char** argv) {
  Options options;
  if (!parseArgs(argc, argv, options)) {
    printUsage();
    return 1;
  }

  if (options.help) {
    printUsage();
    return 0;
  }

  const auto gate = mvci::evaluateWriteGate(options.write);
  if (gate.result == mvci::WriteGateResult::Blocked) {
    std::cerr << gate.message << '\n';
    return 1;
  }
  if (gate.result == mvci::WriteGateResult::Allowed && !mvci::writeIsImplemented(options.write)) {
    std::cerr << "WRITE BLOCKED: that write service is a stub; nothing sent\n";
    return 1;
  }

  if (!options.read && !options.clear && !options.openOnly) {
    options.read = true;
  }

  mvci::DeviceHandle deviceId = 0;
  mvci::ChannelHandle channelId = 0;

  auto status = PassThruOpen(options.deviceName.empty() ? nullptr : options.deviceName.c_str(), &deviceId);
  if (status != mvci::STATUS_NOERROR) {
    std::cerr << "PassThruOpen failed: " << mvci::statusToString(status) << '\n';
    return 1;
  }
  std::cout << "PassThruOpen OK\n";

  char fw[80] = {};
  char dll[80] = {};
  char api[80] = {};
  if (PassThruReadVersion(deviceId, fw, dll, api) == mvci::STATUS_NOERROR) {
    std::cout << "Version fw=" << fw << " dll=" << dll << " api=" << api << '\n';
  }

  if (options.openOnly) {
    PassThruClose(deviceId);
    std::cout << "Open/close desk test passed (no car protocol).\n";
    return 0;
  }

  struct Attempt {
    std::uint32_t protocol;
    std::uint32_t baud;
    bool kwpFastInit;
  };
  std::vector<Attempt> attempts;
  if (!options.autoProtocol) {
    const std::uint32_t baud = (options.protocolId == mvci::PROTOCOL_ISO15765)
                                   ? options.baudRate
                                   : (options.baudRate == 500000U ? 10400U : options.baudRate);
    attempts.push_back({options.protocolId, baud, options.protocolId == mvci::PROTOCOL_ISO14230});
  } else {
    attempts.push_back({mvci::PROTOCOL_ISO15765, options.baudRate, false});
    attempts.push_back({mvci::PROTOCOL_ISO14230, 10400U, true});
    attempts.push_back({mvci::PROTOCOL_ISO9141, 10400U, false});
  }

  status = mvci::ERR_FAILED;
  for (const auto& attempt : attempts) {
    std::cout << "Trying " << mvci::protocolName(attempt.protocol) << " @ " << attempt.baud << " ...\n";
    status = PassThruConnect(deviceId, attempt.protocol, 0, attempt.baud, &channelId);
    if (status != mvci::STATUS_NOERROR) {
      std::cerr << "  PassThruConnect failed: " << mvci::statusToString(status) << '\n';
      continue;
    }

    if (attempt.kwpFastInit) {
      std::vector<std::vector<std::uint8_t>> initRx;
      const auto initStatus =
          mvci::sendRawRequest(channelId, attempt.protocol, mvci::buildKwpStartCommunication(),
                               initRx, options.timeoutMs);
      std::cout << "  KWP startCommunication: " << mvci::statusToString(initStatus) << '\n';
    }

    if (options.clear && !options.autoProtocol) {
      break;
    }

    bool vinOk = false;
    bool dtcOk = false;
    if (options.fetchVin) {
      std::string vin;
      const auto vinStatus = runVinReadCycle(channelId, options, vin);
      if (vinStatus == mvci::STATUS_NOERROR) {
        std::cout << "VIN: " << vin << '\n';
        vinOk = true;
      } else {
        std::cout << "  VIN unavailable on " << mvci::protocolName(attempt.protocol) << ": "
                  << mvci::statusToString(vinStatus) << '\n';
      }
    }

    std::vector<mvci::DtcRecord> dtcs;
    const auto dtcStatus = runReadCycle(channelId, options, dtcs);
    if (dtcStatus == mvci::STATUS_NOERROR) {
      dtcOk = true;
      printDtcs(dtcs);
    } else {
      std::cout << "  DTC read unavailable on " << mvci::protocolName(attempt.protocol) << ": "
                << mvci::statusToString(dtcStatus) << '\n';
    }

    if (vinOk || dtcOk) {
      std::cout << "Cable talks on " << mvci::protocolName(attempt.protocol) << '\n';
      status = mvci::STATUS_NOERROR;
      if (options.clear || options.monitor) {
        break;
      }
      PassThruDisconnect(channelId);
      PassThruClose(deviceId);
      return 0;
    }

    PassThruDisconnect(channelId);
    channelId = 0;
    status = mvci::ERR_TIMEOUT;
  }

  if (channelId == 0 && !options.clear) {
    std::cerr << "No protocol answered (CAN timeout is expected on this K-line 1KD; K-line also failed).\n";
    PassThruClose(deviceId);
    return 1;
  }

  if (status != mvci::STATUS_NOERROR && !options.clear) {
    std::cerr << "Read DTC request failed: " << mvci::statusToString(status) << '\n';
    if (status == mvci::ERR_TIMEOUT) {
      std::cerr << "Hint: ignition ON; USB Mini-VCI in laptop and 16-pin in the Prado.\n";
    }
    if (channelId != 0) {
      PassThruDisconnect(channelId);
    }
    PassThruClose(deviceId);
    return 1;
  }

  const auto cleanup = [&]() {
    if (channelId != 0) {
      PassThruDisconnect(channelId);
    }
    PassThruClose(deviceId);
  };

  if (options.clear) {
    std::cerr << "WRITE SENT: 14 (ClearDiagnosticInformation) \n";
    status = runClearCycle(channelId, options);
    if (status != mvci::STATUS_NOERROR) {
      std::cerr << "Clear DTC request failed: " << mvci::statusToString(status) << '\n';
      cleanup();
      return 1;
    }
    std::cout << "DTC clear request accepted.\n";
    cleanup();
    return 0;
  }

  while (options.monitor) {
    std::this_thread::sleep_for(std::chrono::milliseconds(options.intervalMs));
    std::vector<mvci::DtcRecord> dtcs;
    status = runReadCycle(channelId, options, dtcs);
    if (status != mvci::STATUS_NOERROR) {
      std::cerr << "Read DTC request failed: " << mvci::statusToString(status) << '\n';
      cleanup();
      return 1;
    }
    printDtcs(dtcs);
  }

  cleanup();
  return 0;
}
#pragma once

// Dual-flag write gate for OpenMVCI CLIs.
// A vehicle write may run only if Pierre typed the flag name AND the process
// was started with --i-understand-this-writes. Unknown / incomplete writes
// refuse before any transport open (zero bytes on the wire).

#include <string>

namespace mvci {

struct WriteIntent {
  bool clear{false};
  bool ioControl{false};
  bool routine{false};
  bool ecuReset{false};
  bool securityAccess{false};
  bool writeDid{false};
  bool writeMemory{false};
  bool reflash{false};
  bool controlDtc{false};
  bool understandsWrites{false};
  std::string hexPayload;
};

enum class WriteGateResult {
  ReadsOnly,
  Allowed,
  Blocked,
};

struct WriteGateDecision {
  WriteGateResult result{WriteGateResult::ReadsOnly};
  const char* message{""};
};

inline bool anyWriteRequested(const WriteIntent& intent) {
  return intent.clear || intent.ioControl || intent.routine || intent.ecuReset ||
         intent.securityAccess || intent.writeDid || intent.writeMemory || intent.reflash ||
         intent.controlDtc;
}

inline WriteGateDecision evaluateWriteGate(const WriteIntent& intent) {
  if (!anyWriteRequested(intent)) {
    return {WriteGateResult::ReadsOnly, ""};
  }
  if (!intent.understandsWrites) {
    return {WriteGateResult::Blocked,
            "WRITE BLOCKED: vehicle write requested without --i-understand-this-writes"};
  }
  if ((intent.ioControl || intent.routine || intent.writeDid) && intent.hexPayload.empty()) {
    return {WriteGateResult::Blocked,
            "WRITE BLOCKED: --io-control/--routine/--write-did require explicit hex"};
  }
  return {WriteGateResult::Allowed, ""};
}

// Writes other than --clear are stubs: even with both flags, send nothing.
inline bool writeIsImplemented(const WriteIntent& intent) {
  return intent.clear && !intent.ioControl && !intent.routine && !intent.ecuReset &&
         !intent.securityAccess && !intent.writeDid && !intent.writeMemory && !intent.reflash &&
         !intent.controlDtc;
}

} // namespace mvci

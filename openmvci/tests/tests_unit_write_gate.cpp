#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include <string>

#include "mvci/write_gate.hpp"

TEST_CASE("reads-only when no write flags") {
  mvci::WriteIntent intent;
  const auto decision = mvci::evaluateWriteGate(intent);
  CHECK(decision.result == mvci::WriteGateResult::ReadsOnly);
  CHECK_FALSE(mvci::anyWriteRequested(intent));
}

TEST_CASE("clear without dual flag is blocked — zero TX") {
  mvci::WriteIntent intent;
  intent.clear = true;
  const auto decision = mvci::evaluateWriteGate(intent);
  CHECK(decision.result == mvci::WriteGateResult::Blocked);
  CHECK(std::string(decision.message).find("WRITE BLOCKED") != std::string::npos);
}

TEST_CASE("clear with --i-understand-this-writes is allowed") {
  mvci::WriteIntent intent;
  intent.clear = true;
  intent.understandsWrites = true;
  const auto decision = mvci::evaluateWriteGate(intent);
  CHECK(decision.result == mvci::WriteGateResult::Allowed);
  CHECK(mvci::writeIsImplemented(intent));
}

TEST_CASE("routine without hex is blocked even with dual flag") {
  mvci::WriteIntent intent;
  intent.routine = true;
  intent.understandsWrites = true;
  const auto decision = mvci::evaluateWriteGate(intent);
  CHECK(decision.result == mvci::WriteGateResult::Blocked);
}

TEST_CASE("routine with hex is allowed by gate but not implemented (still no TX)") {
  mvci::WriteIntent intent;
  intent.routine = true;
  intent.understandsWrites = true;
  intent.hexPayload = "3101";
  const auto decision = mvci::evaluateWriteGate(intent);
  CHECK(decision.result == mvci::WriteGateResult::Allowed);
  CHECK_FALSE(mvci::writeIsImplemented(intent));
}

TEST_CASE("io-control without hex is blocked") {
  mvci::WriteIntent intent;
  intent.ioControl = true;
  intent.understandsWrites = true;
  CHECK(mvci::evaluateWriteGate(intent).result == mvci::WriteGateResult::Blocked);
}

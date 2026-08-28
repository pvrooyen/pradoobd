#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "mvci/platform/serial_native.hpp"

TEST_CASE("serial path helpers recognize COM and serial: prefixes") {
#ifdef _WIN32
  CHECK(mvci::serial_native::looksLikeSerialPath("COM3"));
  CHECK(mvci::serial_native::looksLikeSerialPath("COM3:"));
  CHECK(mvci::serial_native::looksLikeSerialPath("serial:COM3"));
  CHECK(mvci::serial_native::looksLikeSerialPath("\\\\.\\COM3"));
  CHECK(mvci::serial_native::normalizePortPath("COM3") == "\\\\.\\COM3");
  CHECK(mvci::serial_native::normalizePortPath("serial:COM10") == "\\\\.\\COM10");
  CHECK_FALSE(mvci::serial_native::looksLikeSerialPath("0403:6001"));
#else
  CHECK(mvci::serial_native::looksLikeSerialPath("/dev/ttyUSB0"));
  CHECK(mvci::serial_native::looksLikeSerialPath("serial:/dev/ttyUSB0"));
  CHECK(mvci::serial_native::normalizePortPath("serial:/dev/ttyUSB0") == "/dev/ttyUSB0");
  CHECK_FALSE(mvci::serial_native::looksLikeSerialPath("0403:6001"));
#endif
}

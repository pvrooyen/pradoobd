#pragma once

// OS serial I/O used by SerialTransport. Framing and Mini-VCI bootstrap stay
// in serial_transport.cpp. Windows uses the FTDI VCP COM port (CreateFile),
// never WinUSB/libusb.

#include "mvci/j2534.hpp"

#include <cstdint>
#include <string>
#include <vector>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  ifndef NOMINMAX
#    define NOMINMAX
#  endif
#  include <windows.h>
#else
#  include <cerrno>
#  include <cstring>
#  include <fcntl.h>
#  include <sys/ioctl.h>
#  include <termios.h>
#  include <unistd.h>
#  if defined(__APPLE__)
#    include <IOKit/serial/ioss.h>
#  endif
#endif

namespace mvci {
namespace serial_native {

#ifdef _WIN32
using Handle = HANDLE;
inline const Handle kInvalid = INVALID_HANDLE_VALUE;
inline bool isValid(Handle h) { return h != nullptr && h != INVALID_HANDLE_VALUE; }
#else
using Handle = int;
inline constexpr Handle kInvalid = -1;
inline bool isValid(Handle h) { return h >= 0; }
#endif

inline std::string lastErrorString() {
#ifdef _WIN32
  const DWORD err = GetLastError();
  char buf[256]{};
  const DWORD n = FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                                 nullptr, err, 0, buf, sizeof(buf), nullptr);
  if (n == 0) {
    return "win32 error " + std::to_string(err);
  }
  std::string text(buf, buf + n);
  while (!text.empty() && (text.back() == '\n' || text.back() == '\r' || text.back() == ' ')) {
    text.pop_back();
  }
  return text;
#else
  return std::strerror(errno);
#endif
}

inline bool isRecoverableIoError() {
#ifdef _WIN32
  const DWORD err = GetLastError();
  return err == ERROR_DEVICE_NOT_CONNECTED || err == ERROR_INVALID_HANDLE ||
         err == ERROR_ACCESS_DENIED || err == ERROR_OPERATION_ABORTED ||
         err == ERROR_BAD_COMMAND || err == ERROR_GEN_FAILURE;
#else
  return errno == ENODEV || errno == ENXIO || errno == EIO || errno == ENOTCONN || errno == EBADF;
#endif
}

inline std::string normalizePortPath(std::string path) {
  constexpr const char* kPrefix = "serial:";
  if (path.rfind(kPrefix, 0) == 0) {
    path.erase(0, 7);
  }
#ifdef _WIN32
  if (!path.empty() && path.back() == ':') {
    path.pop_back();
  }
  if (path.size() >= 3) {
    std::string upper = path;
    for (auto& c : upper) {
      if (c >= 'a' && c <= 'z') {
        c = static_cast<char>(c - 'a' + 'A');
      }
    }
    if (upper.rfind("COM", 0) == 0) {
      return std::string("\\\\.\\") + upper;
    }
  }
  if (path.rfind("\\\\.\\", 0) == 0 || path.rfind("//./", 0) == 0) {
    return path;
  }
#endif
  return path;
}

inline bool looksLikeSerialPath(const std::string& path) {
  if (path.empty()) {
    return false;
  }
#ifdef _WIN32
  std::string upper = path;
  for (auto& c : upper) {
    if (c >= 'a' && c <= 'z') {
      c = static_cast<char>(c - 'a' + 'A');
    }
  }
  if (upper.rfind("SERIAL:", 0) == 0) {
    return looksLikeSerialPath(path.substr(7));
  }
  if (upper.rfind("\\\\.\\COM", 0) == 0 || upper.rfind("COM", 0) == 0) {
    return true;
  }
  return false;
#else
  if (path.rfind("serial:", 0) == 0) {
    return path.size() > 7 && path[7] == '/';
  }
  return path[0] == '/';
#endif
}

inline Handle openPort(const std::string& nativePath) {
#ifdef _WIN32
  Handle h = CreateFileA(nativePath.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr,
                         OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  return h;
#else
  return ::open(nativePath.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
#endif
}

inline void closePort(Handle& h) {
  if (!isValid(h)) {
    return;
  }
#ifdef _WIN32
  CloseHandle(h);
#else
  ::close(h);
#endif
  h = kInvalid;
}

inline Status configure(Handle h, unsigned int baud, bool rtscts) {
  if (!isValid(h)) {
    return ERR_NOT_INITIALIZED;
  }
#ifdef _WIN32
  DCB dcb{};
  dcb.DCBlength = sizeof(DCB);
  if (!GetCommState(h, &dcb)) {
    return ERR_FAILED;
  }
  dcb.BaudRate = baud;
  dcb.ByteSize = 8;
  dcb.Parity = NOPARITY;
  dcb.StopBits = ONESTOPBIT;
  dcb.fBinary = TRUE;
  dcb.fParity = FALSE;
  dcb.fOutxCtsFlow = rtscts ? TRUE : FALSE;
  dcb.fOutxDsrFlow = FALSE;
  dcb.fDsrSensitivity = FALSE;
  dcb.fTXContinueOnXoff = FALSE;
  dcb.fOutX = FALSE;
  dcb.fInX = FALSE;
  dcb.fErrorChar = FALSE;
  dcb.fNull = FALSE;
  dcb.fAbortOnError = FALSE;
  dcb.fDtrControl = DTR_CONTROL_ENABLE;
  dcb.fRtsControl = rtscts ? RTS_CONTROL_HANDSHAKE : RTS_CONTROL_ENABLE;
  if (!SetCommState(h, &dcb)) {
    return ERR_FAILED;
  }
  COMMTIMEOUTS timeouts{};
  timeouts.ReadIntervalTimeout = MAXDWORD;
  timeouts.ReadTotalTimeoutMultiplier = 0;
  timeouts.ReadTotalTimeoutConstant = 0;
  timeouts.WriteTotalTimeoutMultiplier = 0;
  timeouts.WriteTotalTimeoutConstant = 2000;
  if (!SetCommTimeouts(h, &timeouts)) {
    return ERR_FAILED;
  }
  PurgeComm(h, PURGE_RXCLEAR | PURGE_TXCLEAR);
  return STATUS_NOERROR;
#else
  termios tty{};
  if (::tcgetattr(h, &tty) != 0) {
    return ERR_FAILED;
  }
  cfmakeraw(&tty);
  tty.c_cflag |= (CLOCAL | CREAD);
  tty.c_cflag &= ~CSIZE;
  tty.c_cflag |= CS8;
  tty.c_cflag &= ~PARENB;
  tty.c_cflag &= ~CSTOPB;
  if (rtscts) {
    tty.c_cflag |= CRTSCTS;
  } else {
    tty.c_cflag &= ~CRTSCTS;
  }
  tty.c_cflag &= ~HUPCL;
  tty.c_cc[VMIN] = 0;
  tty.c_cc[VTIME] = 0;

  speed_t standard = 0;
  switch (baud) {
    case 9600: standard = B9600; break;
    case 19200: standard = B19200; break;
    case 38400: standard = B38400; break;
    case 57600: standard = B57600; break;
    case 115200: standard = B115200; break;
    case 230400: standard = B230400; break;
    default: break;
  }
  if (standard != 0) {
    cfsetispeed(&tty, standard);
    cfsetospeed(&tty, standard);
  } else {
    cfsetispeed(&tty, B9600);
    cfsetospeed(&tty, B9600);
  }
  if (::tcsetattr(h, TCSANOW, &tty) != 0) {
    return ERR_FAILED;
  }
#  if defined(__APPLE__)
  if (standard == 0) {
    const speed_t custom = static_cast<speed_t>(baud);
    if (::ioctl(h, IOSSIOSPEED, &custom) < 0) {
      return ERR_FAILED;
    }
  }
#  endif
  ::tcflush(h, TCIOFLUSH);
  return STATUS_NOERROR;
#endif
}

inline void afterOpen(Handle h) {
#ifndef _WIN32
  if (!isValid(h)) {
    return;
  }
  const int flags = ::fcntl(h, F_GETFL, 0);
  if (flags >= 0) {
    ::fcntl(h, F_SETFL, flags & ~O_NONBLOCK);
  }
  (void)::ioctl(h, TIOCEXCL);
#else
  (void)h;
#endif
}

inline void setModem(Handle h, bool dtr, bool rts) {
  if (!isValid(h)) {
    return;
  }
#ifdef _WIN32
  EscapeCommFunction(h, dtr ? SETDTR : CLRDTR);
  EscapeCommFunction(h, rts ? SETRTS : CLRRTS);
#else
  int modem = 0;
  if (::ioctl(h, TIOCMGET, &modem) != 0) {
    return;
  }
  if (dtr) {
    modem |= TIOCM_DTR;
  } else {
    modem &= ~TIOCM_DTR;
  }
  if (rts) {
    modem |= TIOCM_RTS;
  } else {
    modem &= ~TIOCM_RTS;
  }
  (void)::ioctl(h, TIOCMSET, &modem);
#endif
}

inline void flushRx(Handle h) {
  if (!isValid(h)) {
    return;
  }
#ifdef _WIN32
  PurgeComm(h, PURGE_RXCLEAR | PURGE_RXABORT);
#else
  ::tcflush(h, TCIFLUSH);
#endif
}

inline void flushTx(Handle h) {
  if (!isValid(h)) {
    return;
  }
#ifdef _WIN32
  PurgeComm(h, PURGE_TXCLEAR | PURGE_TXABORT);
#else
  ::tcflush(h, TCOFLUSH);
#endif
}

inline void flushIo(Handle h) {
  if (!isValid(h)) {
    return;
  }
#ifdef _WIN32
  PurgeComm(h, PURGE_RXCLEAR | PURGE_TXCLEAR | PURGE_RXABORT | PURGE_TXABORT);
#else
  ::tcflush(h, TCIOFLUSH);
#endif
}

inline Status writeAll(Handle h, const std::uint8_t* data, std::size_t len) {
  if (!isValid(h)) {
    return ERR_NOT_INITIALIZED;
  }
  std::size_t offset = 0;
  while (offset < len) {
#ifdef _WIN32
    DWORD written = 0;
    if (!WriteFile(h, data + offset, static_cast<DWORD>(len - offset), &written, nullptr)) {
      return ERR_FAILED;
    }
    if (written == 0) {
      return ERR_FAILED;
    }
    offset += static_cast<std::size_t>(written);
#else
    const auto written = ::write(h, data + offset, len - offset);
    if (written < 0) {
      if (errno == EINTR) {
        continue;
      }
      return ERR_FAILED;
    }
    offset += static_cast<std::size_t>(written);
#endif
  }
  return STATUS_NOERROR;
}

inline Status readSome(Handle h, std::vector<std::uint8_t>& out, std::uint32_t timeoutMs) {
  out.clear();
  if (!isValid(h)) {
    return ERR_NOT_INITIALIZED;
  }
#ifdef _WIN32
  COMMTIMEOUTS timeouts{};
  timeouts.ReadIntervalTimeout = MAXDWORD;
  timeouts.ReadTotalTimeoutMultiplier = MAXDWORD;
  timeouts.ReadTotalTimeoutConstant = timeoutMs == 0 ? 1 : timeoutMs;
  timeouts.WriteTotalTimeoutMultiplier = 0;
  timeouts.WriteTotalTimeoutConstant = 2000;
  if (!SetCommTimeouts(h, &timeouts)) {
    return ERR_FAILED;
  }
  unsigned char buffer[512];
  DWORD got = 0;
  if (!ReadFile(h, buffer, sizeof(buffer), &got, nullptr)) {
    return ERR_FAILED;
  }
  if (got == 0) {
    return ERR_TIMEOUT;
  }
  out.assign(buffer, buffer + got);
  return STATUS_NOERROR;
#else
  timeval tv{};
  tv.tv_sec = static_cast<long>(timeoutMs / 1000U);
  tv.tv_usec = static_cast<int>((timeoutMs % 1000U) * 1000U);
  fd_set rfds;
  FD_ZERO(&rfds);
  FD_SET(h, &rfds);
  const int ready = ::select(h + 1, &rfds, nullptr, nullptr, &tv);
  if (ready < 0) {
    if (errno == EINTR) {
      return ERR_TIMEOUT;
    }
    return ERR_FAILED;
  }
  if (ready == 0) {
    return ERR_TIMEOUT;
  }
  unsigned char buffer[512];
  const auto got = ::read(h, buffer, sizeof(buffer));
  if (got < 0) {
    if (errno == EINTR) {
      return ERR_TIMEOUT;
    }
    return ERR_FAILED;
  }
  if (got == 0) {
    return ERR_TIMEOUT;
  }
  out.assign(buffer, buffer + got);
  return STATUS_NOERROR;
#endif
}

} // namespace serial_native
} // namespace mvci

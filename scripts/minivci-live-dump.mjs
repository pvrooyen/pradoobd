#!/usr/bin/env node
/**
 * Live Mini-VCI dump for the 2005 Prado (1KD-FTV) over FTDI VCP (COM3).
 * Read-only. Not ELM327 — never sends ATZ. Never sends write services.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SerialPort } from 'serialport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CAPTURES = path.join(ROOT, 'captures');
const PORT_PATH = process.env.MVCI_PORT || 'COM3';
const FAST = process.env.FAST === '1';
const LIVE_MS = Number(process.env.LIVE_MS) || (FAST ? 45000 : 12 * 60 * 1000);
const SNAPSHOT_GAP_MS = Number(process.env.SNAPSHOT_GAP_MS) || 2500;
const BAUDS = (process.env.MVCI_BAUDS || '115200,500000,230400,38400,9600')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

const WRITE_SERVICES = new Set([
  0x04, 0x11, 0x14, 0x27, 0x28, 0x2e, 0x2f, 0x31, 0x34, 0x35, 0x36, 0x37, 0x38, 0x3b, 0x3d, 0x85,
]);
const READ_SERVICES = new Set([
  0x01, 0x02, 0x03, 0x06, 0x07, 0x09, 0x0a, 0x19, 0x1a, 0x21, 0x22, 0x23, 0x3e,
]);

const MAGIC = 0x4d564349;
const PROTO_CAN = 5;
const PROTO_ISO15765 = 6;
const PROTO_ISO9141 = 3;
const PROTO_ISO14230 = 4;
const FLAG_PAD = 0x40;

const hex = (buf) => Buffer.from(buf).toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim();
const u8 = (...bytes) => Buffer.from(bytes);
const nowIso = () => new Date().toISOString();
const ms = () => Date.now();

function assertReadOnly(payload) {
  if (!payload || payload.length === 0) return;
  const svc = payload[0];
  if (WRITE_SERVICES.has(svc)) {
    throw new Error(`WRITE BLOCKED: service 0x${svc.toString(16)}`);
  }
  if (!READ_SERVICES.has(svc)) {
    throw new Error(`WRITE BLOCKED: unknown service 0x${svc.toString(16)} (fail-safe)`);
  }
}

const kStartStage1 = u8(0x03, 0x00, 0x03);
const kStartStage2 = u8(0x0c, 0x00, 0x07, 0x00, 0x01, 0x4d, 0x56, 0x43, 0x49, 0x2d, 0x54, 0x62);
const kStartStage3 = u8(
  0x13, 0x00, 0xd0, 0x4d, 0x01, 0xf7, 0x76, 0x39, 0x07, 0x6b,
  0x27, 0x40, 0xea, 0x48, 0xfd, 0x6e, 0xa4, 0xa9, 0x00,
);
const kAck1FtdiStatus = u8(0x01, 0x60);
const kAck2WithStatus = u8(0x01, 0x60, 0x0e, 0x00, 0x09, 0x00, 0x01, 0xb0, 0xcb, 0x49, 0x68, 0x07, 0x45, 0xc8, 0x7f, 0xa9);
const kAck2NoStatus = u8(0x0e, 0x00, 0x09, 0x00, 0x01, 0xb0, 0xcb, 0x49, 0x68, 0x07, 0x45, 0xc8, 0x7f, 0xa9);
const kAck3WithStatus = u8(0x01, 0x60, 0x0b, 0x00, 0x71, 0x08, 0x8e, 0x8d, 0x8d, 0xa6, 0xaa, 0xdf, 0x2f);
const kAck3NoStatus = u8(0x0b, 0x00, 0x71, 0x08, 0x8e, 0x8d, 0x8d, 0xa6, 0xaa, 0xdf, 0x2f);
const kKeepaliveOut = u8(0x0b, 0x00, 0x31, 0x18, 0x19, 0x2b, 0x97, 0x53, 0x24, 0xce, 0x3e);
const kKeepaliveAckWithStatus = u8(0x01, 0x60, 0x0b, 0x00, 0x64, 0x3b, 0x58, 0x62, 0x53, 0xa7, 0xd6, 0x65, 0x29);
const kKeepaliveAckNoStatus = u8(0x0b, 0x00, 0x64, 0x3b, 0x58, 0x62, 0x53, 0xa7, 0xd6, 0x65, 0x29);
const kTickleQueryOut = u8(0x0b, 0x00, 0x71, 0xa1, 0xe8, 0x84, 0xc4, 0xa2, 0x9c, 0xe0, 0xad);
const kTickleAckWithStatus = u8(0x01, 0x60, 0x0b, 0x00, 0xd2, 0xb9, 0x82, 0x0d, 0x1c, 0x58, 0x7c, 0xb4, 0x63);
const kTickleAckNoStatus = u8(0x0b, 0x00, 0xd2, 0xb9, 0x82, 0x0d, 0x1c, 0x58, 0x7c, 0xb4, 0x63);

const replaySteps = [
  { tx: u8(0x0b, 0x00, 0x25, 0x8a, 0x95, 0x1b, 0xe3, 0x6d, 0xfa, 0x9e, 0xc0),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0xa3, 0xc7, 0xc2, 0x27, 0xd0, 0x0b, 0x16, 0x50, 0x17),
         u8(0x0b, 0x00, 0xa3, 0xc7, 0xc2, 0x27, 0xd0, 0x0b, 0x16, 0x50, 0x17)] },
  { tx: kTickleQueryOut, rx: [kTickleAckWithStatus, kTickleAckNoStatus] },
  { tx: u8(0x23, 0x00, 0xfb, 0xb3, 0xd4, 0x3c, 0xbb, 0x46, 0x84, 0xb2, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0x44, 0xdb, 0xf5, 0x35, 0x3a, 0x31, 0xed, 0x0c, 0x3a, 0x3e, 0x04, 0xf8, 0xc1, 0x6b,
           0x73, 0x90, 0xc6),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0x6a, 0x85, 0xd0, 0x98, 0x32, 0xea, 0x3d, 0x1e, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0x9a, 0x28, 0x9a, 0xd9, 0x38, 0x5d, 0x0b, 0x6f, 0x00, 0xb4, 0xee, 0x06, 0x45, 0xdd,
           0xf5, 0xb3, 0x87),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0x78, 0xa4, 0x9f, 0x19, 0x4b, 0xcd, 0x31, 0xaa, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0xe5, 0x1a, 0x46, 0x7a, 0x60, 0x37, 0xe2, 0x64, 0x8d, 0x55, 0xee, 0x6f, 0x97, 0xf3,
           0x36, 0xc0, 0x37),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0x0d, 0xc4, 0x7f, 0x17, 0xbd, 0x49, 0x42, 0x01, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0x43, 0x4f, 0x23, 0xad, 0x5d, 0x7a, 0xcb, 0xaf, 0x5e, 0xdf, 0xea, 0xb2, 0x31, 0xca,
           0x79, 0xb6, 0x93),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0xdc, 0xb5, 0xa5, 0x84, 0x50, 0xc3, 0xea, 0x72, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0xca, 0xb6, 0x74, 0x6b, 0xc1, 0x6b, 0xa9, 0x9c, 0xd8, 0x54, 0x2d, 0x0c, 0xf8, 0x2c,
           0x6c, 0xd7, 0xd4),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0xc1, 0xdc, 0x74, 0x4e, 0xb4, 0xda, 0x05, 0x60, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0x31, 0xd0, 0x0a, 0xcb, 0x0d, 0x37, 0xf9, 0x0a, 0x81, 0x1d, 0xc6, 0x5d, 0x8d, 0xad,
           0x33, 0xa0, 0xd8),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0x4c, 0xc0, 0x0d, 0xc4, 0x1d, 0x6e, 0x14, 0x9a, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0x8a, 0xaa, 0xdf, 0xe0, 0x00, 0x42, 0x34, 0x15, 0xe1, 0x6f, 0xa9, 0x96, 0xf0, 0x95,
           0xfc, 0x69, 0x2c),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: u8(0x23, 0x00, 0x89, 0x87, 0x3c, 0x4f, 0x1d, 0x6b, 0xef, 0x52, 0x7c, 0xbc, 0x8d, 0x47, 0x05, 0x50,
           0x4d, 0x98, 0xa3, 0x3c, 0xef, 0xc3, 0x31, 0x82, 0x62, 0xf2, 0x74, 0x9b, 0x98, 0xf2, 0x25, 0x20,
           0x5b, 0x4b, 0x1f),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70),
         u8(0x0b, 0x00, 0x1a, 0x3f, 0xb2, 0x62, 0x6f, 0x47, 0xde, 0x78, 0x70)] },
  { tx: kTickleQueryOut, rx: [kTickleAckWithStatus, kTickleAckNoStatus] },
  { tx: u8(0x1b, 0x00, 0xff, 0xe0, 0xff, 0x28, 0x6b, 0xdf, 0xfa, 0x7c, 0x27, 0x28, 0xfb, 0x14, 0x1f, 0xca,
           0xab, 0xfe, 0xbf, 0x98, 0x58, 0x87, 0xe6, 0x29, 0xc4, 0x5e, 0x2c),
    rx: [u8(0x01, 0x60, 0x0b, 0x00, 0xb6, 0x19, 0xc7, 0xf0, 0xb5, 0xc3, 0xbd, 0xf8, 0xa0),
         u8(0x0b, 0x00, 0xb6, 0x19, 0xc7, 0xf0, 0xb5, 0xc3, 0xbd, 0xf8, 0xa0)] },
  { tx: kKeepaliveOut, rx: [kKeepaliveAckWithStatus, kKeepaliveAckNoStatus] },
];

const LIVE_PIDS = [
  { id: '01:00', req: [0x01, 0x00], name: 'Supported PIDs 01-20' },
  { id: '01:20', req: [0x01, 0x20], name: 'Supported PIDs 21-40' },
  { id: '01:40', req: [0x01, 0x40], name: 'Supported PIDs 41-60' },
  { id: '01:60', req: [0x01, 0x60], name: 'Supported PIDs 61-80' },
  { id: '01:01', req: [0x01, 0x01], name: 'Monitor status' },
  { id: '01:04', req: [0x01, 0x04], name: 'Engine load', unit: '%', decode: (d) => d[0] / 2.55 },
  { id: '01:05', req: [0x01, 0x05], name: 'Coolant temp', unit: '°C', decode: (d) => d[0] - 40 },
  { id: '01:0B', req: [0x01, 0x0b], name: 'MAP', unit: 'kPa', decode: (d) => d[0] },
  { id: '01:0C', req: [0x01, 0x0c], name: 'RPM', unit: 'rpm', decode: (d) => ((d[0] << 8) | d[1]) / 4 },
  { id: '01:0D', req: [0x01, 0x0d], name: 'Speed', unit: 'km/h', decode: (d) => d[0] },
  { id: '01:0F', req: [0x01, 0x0f], name: 'IAT', unit: '°C', decode: (d) => d[0] - 40 },
  { id: '01:10', req: [0x01, 0x10], name: 'MAF', unit: 'g/s', decode: (d) => ((d[0] << 8) | d[1]) / 100 },
  { id: '01:11', req: [0x01, 0x11], name: 'Throttle', unit: '%', decode: (d) => d[0] / 2.55 },
  { id: '01:1C', req: [0x01, 0x1c], name: 'OBD standard' },
  { id: '01:1F', req: [0x01, 0x1f], name: 'Run time', unit: 's', decode: (d) => (d[0] << 8) | d[1] },
  { id: '01:21', req: [0x01, 0x21], name: 'Distance MIL on', unit: 'km', decode: (d) => (d[0] << 8) | d[1] },
  { id: '01:22', req: [0x01, 0x22], name: 'Rail pressure rel', unit: 'kPa' },
  { id: '01:23', req: [0x01, 0x23], name: 'Rail pressure', unit: 'kPa', decode: (d) => ((d[0] << 8) | d[1]) * 10 },
  { id: '01:2C', req: [0x01, 0x2c], name: 'Commanded EGR', unit: '%', decode: (d) => d[0] / 2.55 },
  { id: '01:2D', req: [0x01, 0x2d], name: 'EGR error', unit: '%' },
  { id: '01:33', req: [0x01, 0x33], name: 'Baro', unit: 'kPa', decode: (d) => d[0] },
  { id: '01:42', req: [0x01, 0x42], name: 'Module voltage', unit: 'V', decode: (d) => ((d[0] << 8) | d[1]) / 1000 },
  { id: '01:46', req: [0x01, 0x46], name: 'Ambient temp', unit: '°C', decode: (d) => d[0] - 40 },
  { id: '01:5C', req: [0x01, 0x5c], name: 'Oil temp', unit: '°C', decode: (d) => d[0] - 40 },
  { id: '01:5E', req: [0x01, 0x5e], name: 'Fuel rate', unit: 'L/h' },
];

const SNAPSHOT_PIDS = LIVE_PIDS.filter((p) =>
  ['01:04', '01:05', '01:0B', '01:0C', '01:0D', '01:0F', '01:11', '01:1F', '01:23', '01:2C', '01:33', '01:42'].includes(p.id),
);

const MODE22_NAMED = [
  { pid: 0x0115, name: 'Coolant temp enhanced' },
  { pid: 0x0118, name: 'Rail pressure target' },
  { pid: 0x0119, name: 'Rail pressure actual' },
  { pid: 0x011a, name: 'Boost pressure' },
  { pid: 0x011b, name: 'Boost target' },
  { pid: 0x0121, name: 'MAF enhanced' },
  { pid: 0x0122, name: 'EGR position' },
  { pid: 0x0123, name: 'EGR target' },
  { pid: 0x0130, name: 'Injection quantity' },
  { pid: 0x0131, name: 'Injection timing' },
  { pid: 0x0140, name: 'Turbo VN vane' },
  { pid: 0x0150, name: 'Glow plug status' },
  { pid: 0x0160, name: 'Injector corr cyl 1' },
  { pid: 0x0161, name: 'Injector corr cyl 2' },
  { pid: 0x0162, name: 'Injector corr cyl 3' },
  { pid: 0x0163, name: 'Injector corr cyl 4' },
];

function contains(hay, needle) {
  if (needle.length === 0 || hay.length < needle.length) return false;
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function tryDecodeObfuscated(buf) {
  if (buf.length < 4 || (buf[0] & 0x7f) !== 0x49) return buf;
  const key = [0x88, 0xfa, 0x78];
  const decoded = Buffer.from(buf);
  decoded[0] = 0x49;
  for (let i = 1; i < decoded.length; i++) decoded[i] ^= key[(i - 1) % 3];
  if (decoded[1] === 0x43 && decoded[3] === 0x4d && (decoded[2] === 0x56 || decoded[2] === 0x57)) {
    return decoded;
  }
  return buf;
}

function encodeMvci(channel, protocol, flags, payload) {
  const buf = Buffer.alloc(24 + payload.length);
  buf.writeUInt32LE(MAGIC, 0);
  buf.writeUInt32LE(channel, 4);
  buf.writeUInt32LE(protocol, 8);
  buf.writeUInt32LE(flags, 12);
  buf.writeUInt32LE(0, 16);
  buf.writeUInt32LE(payload.length, 20);
  Buffer.from(payload).copy(buf, 24);
  return buf;
}

function canPayload(canId, uds) {
  return Buffer.from([
    (canId >>> 24) & 0xff,
    (canId >>> 16) & 0xff,
    (canId >>> 8) & 0xff,
    canId & 0xff,
    ...uds,
  ]);
}

function kwpFrame(target, source, data) {
  const hdr = [0x80, target, source, data.length, ...data];
  const cks = hdr.reduce((a, b) => (a + b) & 0xff, 0);
  return Buffer.from([...hdr, cks]);
}

function extractMvciFrames(buffer) {
  const frames = [];
  let buf = buffer;
  while (buf.length >= 4) {
    let magicPos = -1;
    for (let i = 0; i + 3 < buf.length; i++) {
      if (buf.readUInt32LE(i) === MAGIC) {
        magicPos = i;
        break;
      }
    }
    if (magicPos < 0) {
      buf = buf.length > 3 ? buf.subarray(buf.length - 3) : buf;
      break;
    }
    if (magicPos > 0) buf = buf.subarray(magicPos);
    if (buf.length < 24) break;
    const psz = buf.readUInt32LE(20);
    if (psz > 1 << 20) {
      buf = buf.subarray(1);
      continue;
    }
    const total = 24 + psz;
    if (buf.length < total) break;
    frames.push(buf.subarray(0, total));
    buf = buf.subarray(total);
  }
  return { frames, rest: buf };
}

function stripFtdi(buf) {
  if (buf.length >= 2 && buf[0] === 0x01 && buf[1] === 0x60) return buf.subarray(2);
  return buf;
}

function decodeMode01(pid, data) {
  if (!data || data.length === 0) return { value: null };
  try {
    const v = pid.decode ? pid.decode(data) : null;
    return { value: v };
  } catch {
    return { value: null };
  }
}

function parseDtcBytes(data) {
  const codes = [];
  if (!data || data.length < 2) return codes;
  // Mode 03: 43 N A B A B...
  let i = 0;
  if (data[0] === 0x43 || data[0] === 0x47 || data[0] === 0x4a) i = 1;
  if (i < data.length && data.length - i >= 1 && (data.length - i) % 2 === 1) i += 1; // count byte
  for (; i + 1 < data.length; i += 2) {
    const a = data[i];
    const b = data[i + 1];
    if (a === 0 && b === 0) continue;
    const type = (a >> 6) & 0x03;
    const first = ['P', 'C', 'B', 'U'][type];
    const n = ((a & 0x3f) << 8) | b;
    codes.push(`${first}${n.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return codes;
}

function parseVin(data) {
  if (!data) return null;
  let bytes = data;
  if (bytes[0] === 0x49 && bytes[1] === 0x02) bytes = bytes.subarray(3);
  if (bytes[0] === 0x62 && bytes[1] === 0xf1 && bytes[2] === 0x90) bytes = bytes.subarray(3);
  const s = Buffer.from(bytes).toString('ascii').replace(/[^\x20-\x7E]/g, '');
  return s.length >= 8 ? s : null;
}

class MiniVci {
  constructor(logLine) {
    this.port = null;
    this.rx = Buffer.alloc(0);
    this.logLine = logLine;
    this.baud = 0;
    this.ready = false;
    this.ctrl = 'assert';
    this.nextTickle = 0;
    this.rawExchanges = [];
  }

  async open(baud, ctrlMode) {
    await this.close();
    this.baud = baud;
    this.ctrl = ctrlMode;
    this.rx = Buffer.alloc(0);
    this.ready = false;
    this.port = new SerialPort({
      path: PORT_PATH,
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      autoOpen: false,
    });
    await new Promise((resolve, reject) => {
      this.port.open((err) => (err ? reject(err) : resolve()));
    });
    this.port.on('data', (chunk) => {
      const decoded = tryDecodeObfuscated(chunk);
      this.rx = Buffer.concat([this.rx, decoded]);
      this.logLine({ t: nowIso(), dir: 'RX', hex: hex(chunk), n: chunk.length, baud: this.baud });
    });
    this.port.on('error', (err) => {
      this.logLine({ t: nowIso(), dir: 'ERR', error: String(err) });
    });
    const dtr = ctrlMode !== 'none';
    const rts = ctrlMode !== 'none';
    await new Promise((resolve) => this.port.set({ dtr, rts }, () => resolve()));
    if (ctrlMode === 'pulse') {
      await new Promise((resolve) => this.port.set({ dtr: false, rts: false }, () => resolve()));
      await sleep(120);
      await new Promise((resolve) => this.port.set({ dtr: true, rts: true }, () => resolve()));
      await sleep(120);
    }
    this.port.flush();
    this.logLine({ t: nowIso(), event: 'open', path: PORT_PATH, baud, ctrlMode });
  }

  async close() {
    if (!this.port) return;
    try {
      await new Promise((resolve) => this.port.close(() => resolve()));
    } catch {
      /* ignore */
    }
    this.port = null;
  }

  async write(buf) {
    const b = Buffer.from(buf);
    this.logLine({ t: nowIso(), dir: 'TX', hex: hex(b), n: b.length });
    await new Promise((resolve, reject) => {
      this.port.write(b, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      this.port.drain((err) => (err ? reject(err) : resolve()));
    });
  }

  drainRx() {
    this.rx = Buffer.alloc(0);
  }

  async waitFor(accepted, timeoutMs) {
    const deadline = ms() + timeoutMs;
    let stream = Buffer.alloc(0);
    while (ms() < deadline) {
      if (this.rx.length) {
        const chunk = this.rx;
        this.rx = Buffer.alloc(0);
        stream = Buffer.concat([stream, chunk]);
        const stripped = stripFtdi(stream);
        for (const exp of accepted) {
          if (contains(stream, exp) || contains(stripped, exp) || contains(chunk, exp)) {
            return true;
          }
        }
        if (stream.length > 4096) stream = stream.subarray(stream.length - 1024);
      } else {
        await sleep(15);
      }
    }
    return false;
  }

  async collect(timeoutMs) {
    const deadline = ms() + timeoutMs;
    let got = Buffer.alloc(0);
    while (ms() < deadline) {
      if (this.rx.length) {
        got = Buffer.concat([got, this.rx]);
        this.rx = Buffer.alloc(0);
      } else {
        await sleep(20);
      }
    }
    return got;
  }

  async bootstrap() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      this.drainRx();
      await this.write(kStartStage1);
      const s1 = await this.waitFor([kAck1FtdiStatus, kStartStage1], 350);
      this.logLine({ t: nowIso(), event: 'bootstrap-stage1', attempt, acked: s1 });
      await this.write(kStartStage2);
      const s2 = await this.waitFor([kAck2WithStatus, kAck2NoStatus], 900);
      this.logLine({ t: nowIso(), event: 'bootstrap-stage2', attempt, acked: s2 });
      if (!s2) continue;
      await this.write(kStartStage3);
      const s3 = await this.waitFor([kAck3WithStatus, kAck3NoStatus], 900);
      this.logLine({ t: nowIso(), event: 'bootstrap-stage3', attempt, acked: s3 });
      if (!s3) continue;
      let postOk = true;
      for (let i = 0; i < replaySteps.length; i++) {
        const step = replaySteps[i];
        await this.write(step.tx);
        const ok = await this.waitFor(step.rx, 250);
        this.logLine({ t: nowIso(), event: 'post-bootstrap', step: i + 1, ok });
        if (!ok) {
          postOk = false;
          break;
        }
      }
      if (!postOk) {
        this.logLine({ t: nowIso(), event: 'post-bootstrap-partial', attempt });
      }
      this.ready = true;
      this.nextTickle = ms() + 220;
      this.logLine({ t: nowIso(), event: 'bootstrap-ok', attempt, postOk, baud: this.baud, ctrl: this.ctrl });
      return true;
    }
    return false;
  }

  async tickle() {
    if (!this.ready) return;
    if (ms() < this.nextTickle) return;
    try {
      await this.write(kTickleQueryOut);
      await this.waitFor([kTickleAckWithStatus, kTickleAckNoStatus], 120);
      await this.write(kKeepaliveOut);
      await this.waitFor([kKeepaliveAckWithStatus, kKeepaliveAckNoStatus], 120);
    } catch (err) {
      this.logLine({ t: nowIso(), event: 'tickle-fail', error: String(err) });
    }
    this.nextTickle = ms() + 220;
  }

  async requestUds({ protocol, flags, canId, uds, timeoutMs = 800, channel = 1 }) {
    assertReadOnly(uds);
    await this.tickle();
    this.drainRx();
    let payload;
    if (protocol === PROTO_ISO15765 || protocol === PROTO_CAN) {
      payload = canPayload(canId, uds);
    } else {
      payload = Buffer.from(uds);
    }
    const frame = encodeMvci(channel, protocol, flags, payload);
    await this.write(frame);
    const raw = await this.collect(timeoutMs);
    const { frames } = extractMvciFrames(Buffer.concat([raw]));
    const udsHits = [];
    for (const f of frames) {
      const psz = f.readUInt32LE(20);
      const pl = f.subarray(24, 24 + psz);
      udsHits.push({ proto: f.readUInt32LE(8), payloadHex: hex(pl), payload: [...pl] });
    }
    // Also hunt for positive UDS in the raw stream (ISO-TP / KWP mixed)
    const pos = 0x40 + uds[0];
    let found = null;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === pos) {
        found = [...raw.subarray(i, Math.min(raw.length, i + 32))];
        break;
      }
    }
    this.rawExchanges.push({
      t: nowIso(),
      protocol,
      canId: canId ? `0x${canId.toString(16)}` : null,
      req: hex(uds),
      rxHex: raw.length ? hex(raw) : '',
      frames: udsHits,
      found,
    });
    return { raw, frames: udsHits, found };
  }
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

function summarizePid(pid, result) {
  const out = { id: pid.id, name: pid.name, unit: pid.unit || '', value: null, rawHex: '', ok: false };
  if (!result) return out;
  const src = result.found || (result.frames && result.frames[0] && result.frames[0].payload);
  if (!src) return out;
  try {
    const buf = Buffer.from(src);
    if (buf.length === 0) return out;
    let dataStart = 0;
    if (buf[0] === 0x41 && buf.length > 2 && buf[1] === pid.req[1]) dataStart = 2;
    else if (buf[0] === 0 && buf[1] === 0 && buf.length > 6 && buf[4] === 0x41) dataStart = 6;
    const data = buf.subarray(dataStart);
    out.rawHex = hex(data);
    out.ok = true;
    if (data.length > 0) {
      const decoded = decodeMode01(pid, data[0] === 0x41 ? data.subarray(2) : data);
      out.value = decoded.value;
    }
  } catch (err) {
    out.rawHex = `err ${err.message}`;
  }
  return out;
}

async function main() {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(CAPTURES, `prado-live-${stamp}.ndjson`);
  const jsonPath = path.join(CAPTURES, `prado-live-${stamp}.json`);
  const mdPath = path.join(CAPTURES, `prado-live-${stamp}.md`);
  const logFd = fs.openSync(logPath, 'a');
  const logLine = (obj) => {
    fs.writeSync(logFd, JSON.stringify(obj) + '\n');
    if (obj.event || obj.dir === 'ERR') {
      console.log(JSON.stringify(obj));
    }
  };

  console.log(`=== Mini-VCI LIVE DUMP ${nowIso()} ===`);
  console.log(`port=${PORT_PATH} duration=${LIVE_MS}ms log=${logPath}`);
  console.log('SAFETY: READ-ONLY — no clear / active test / reset / reflash');
  console.log('Drive normally. I will snapshot RPM/speed/load/boost/rail/EGR continuously.');

  const capture = {
    meta: {
      tool: 'minivci-live-dump',
      stampIso: new Date().toISOString(),
      mock: false,
      port: PORT_PATH,
      durationMs: LIVE_MS,
      note: '2005 Prado 120 1KD-FTV Mini-VCI J2534 over FTDI VCP. Not ELM327.',
    },
    adapter: { id: 'Mini-VCI FTDI 0403:6001 COM3', protocol: 'unknown' },
    bootstrap: { ok: false },
    vin: null,
    dtcs: [],
    pending: [],
    freeze: [],
    supported: [],
    snapshots: [],
    mode22: { hits: [], missCount: 0 },
    modules: [],
    rawLog: [],
    errors: [],
  };

  const vci = new MiniVci(logLine);
  let bootOk = false;
  const ctrlModes = (process.env.MVCI_CTRL || 'none,assert,pulse').split(',').map((s) => s.trim());

  outer: for (const baud of BAUDS) {
    for (const ctrl of ctrlModes) {
      try {
        console.log(`Trying baud=${baud} ctrl=${ctrl}`);
        await vci.open(baud, ctrl);
        await sleep(80);
        const ok = await vci.bootstrap();
        if (ok) {
          bootOk = true;
          capture.bootstrap = { ok: true, baud, ctrl };
          capture.adapter.protocol = `Mini-VCI serial ${baud} ${ctrl}`;
          break outer;
        }
        const leftover = await vci.collect(200);
        if (leftover.length) {
          logLine({ t: nowIso(), event: 'bootstrap-rx-leftover', baud, ctrl, hex: hex(leftover) });
        }
        await vci.close();
      } catch (err) {
        capture.errors.push({ t: nowIso(), where: 'open/bootstrap', baud, ctrl, error: String(err) });
        logLine({ t: nowIso(), event: 'open-fail', baud, ctrl, error: String(err) });
        try { await vci.close(); } catch { /* ignore */ }
      }
    }
  }

  if (!bootOk) {
    console.log('BOOTSTRAP FAILED — cable may still be talking; dumping leftover RX and raw probes.');
    capture.bootstrap = { ok: false };
  }

  const deadline = ms() + LIVE_MS;
  const canIds = [0x7df, 0x7e0, 0x7e1];
  const protocols = [
    { name: 'ISO15765-11/500', protocol: PROTO_ISO15765, flags: FLAG_PAD },
    { name: 'CAN-11/500', protocol: PROTO_CAN, flags: 0 },
    { name: 'ISO14230', protocol: PROTO_ISO14230, flags: 0 },
    { name: 'ISO9141', protocol: PROTO_ISO9141, flags: 0 },
  ];
  let locked = null;

  async function oneShot(proto, canId, uds, timeoutMs) {
    if (proto.protocol === PROTO_ISO14230 || proto.protocol === PROTO_ISO9141) {
      const framed = kwpFrame(0x10, 0xf1, uds);
      assertReadOnly(uds);
      await vci.tickle();
      vci.drainRx();
      const frame = encodeMvci(1, proto.protocol, 0, framed);
      await vci.write(frame);
      const raw = await vci.collect(timeoutMs);
      const { frames } = extractMvciFrames(raw);
      const pos = 0x40 + uds[0];
      let found = null;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === pos) {
          found = [...raw.subarray(i, Math.min(raw.length, i + 32))];
          break;
        }
      }
      const udsHits = frames.map((f) => ({
        proto: f.readUInt32LE(8),
        payloadHex: hex(f.subarray(24)),
        payload: [...f.subarray(24)],
      }));
      vci.rawExchanges.push({
        t: nowIso(), protocol: proto.protocol, canId: null, req: hex(uds),
        rxHex: raw.length ? hex(raw) : '', frames: udsHits, found,
      });
      return { raw, frames: udsHits, found };
    }
    return vci.requestUds({
      protocol: proto.protocol,
      flags: proto.flags,
      canId,
      uds,
      timeoutMs,
    });
  }

  async function tryRequest(label, uds, timeoutMs = 700) {
    const results = [];
    const order = locked
      ? [{ proto: locked, canId: locked.canId }]
      : protocols.flatMap((proto) =>
          (proto.protocol === PROTO_ISO15765 || proto.protocol === PROTO_CAN ? canIds : [0]).map((canId) => ({
            proto,
            canId,
          })),
        );
    for (const { proto, canId } of order) {
      try {
        const res = await oneShot(proto, canId, uds, timeoutMs);
        results.push({ proto: proto.name, canId, ...res, rxLen: res.raw.length });
        if (res.found || res.frames.length) {
          if (!locked) {
            locked = { ...proto, canId };
            capture.adapter.protocol = `${proto.name} can=${canId ? '0x' + canId.toString(16) : 'kline'}`;
            console.log(`LOCKED protocol ${capture.adapter.protocol}`);
          }
          return { ok: true, proto: proto.name, canId, ...res, all: results };
        }
      } catch (err) {
        capture.errors.push({ t: nowIso(), label, error: String(err) });
      }
    }
    return { ok: false, found: null, frames: [], all: results };
  }

  // Identity
  console.log('--- VIN / DTCs ---');
  const tmo = FAST ? 350 : 900;
  const vinObd = await tryRequest('VIN-OBD', [0x09, 0x02], tmo);
  const vinUds = FAST ? { found: null } : await tryRequest('VIN-UDS', [0x22, 0xf1, 0x90], tmo);
  capture.vin = parseVin(vinObd.found) || parseVin(vinUds.found) || null;
  if (capture.vin) console.log('VIN', capture.vin);

  const stored = await tryRequest('DTC-03', [0x03], tmo);
  const pending = await tryRequest('DTC-07', [0x07], tmo);
  const perm = FAST ? { found: null } : await tryRequest('DTC-0A', [0x0a], tmo);
  const udsDtc = FAST ? { found: null } : await tryRequest('DTC-19', [0x19, 0x02, 0xff], tmo);
  capture.dtcs = [
    ...parseDtcBytes(stored.found).map((c) => ({ code: c, kind: 'stored' })),
    ...parseDtcBytes(pending.found).map((c) => ({ code: c, kind: 'pending' })),
    ...parseDtcBytes(perm.found).map((c) => ({ code: c, kind: 'permanent' })),
  ];
  if (udsDtc.found) capture.dtcs.push({ code: hex(udsDtc.found), kind: 'uds-raw' });
  console.log('DTCs', JSON.stringify(capture.dtcs));

  if (!FAST) {
    await tryRequest('FF-02', [0x02, 0x02], 600);
    await tryRequest('CALID', [0x09, 0x04], 600);
    await tryRequest('CVN', [0x09, 0x06], 600);
  }

  if (!locked) {
    console.log('No ECU lock after identity — CAN silent, K-line-first from here');
    protocols.splice(0, protocols.length,
      { name: 'ISO14230', protocol: PROTO_ISO14230, flags: 0 },
      { name: 'ISO9141', protocol: PROTO_ISO9141, flags: 0 },
      { name: 'ISO15765-11/500', protocol: PROTO_ISO15765, flags: FLAG_PAD },
    );
    canIds.splice(0, canIds.length, 0x7df);
  }

  const flush = () => {
    try {
      capture.rawLog = vci.rawExchanges.slice(-500);
      fs.writeFileSync(jsonPath, JSON.stringify(capture, null, 2));
      writeMd(mdPath, capture);
    } catch (err) {
      console.error('flush failed', err);
    }
  };

  // Supported PIDs + one full live pass
  console.log('--- live PID discovery ---');
  const discovered = [];
  const pidsToScan = FAST ? SNAPSHOT_PIDS : LIVE_PIDS;
  for (const pid of pidsToScan) {
    if (ms() > deadline) break;
    try {
      const res = await tryRequest(pid.id, pid.req, 400);
      const sum = summarizePid(pid, res);
      if (sum.ok) {
        discovered.push(sum);
        capture.supported.push({ id: pid.id, name: pid.name });
        console.log(`HIT ${pid.id} ${pid.name} ${sum.value ?? ''} ${pid.unit || ''} raw=${sum.rawHex}`);
      }
    } catch (err) {
      capture.errors.push({ t: nowIso(), label: pid.id, error: String(err) });
      console.error('PID fail', pid.id, err.message);
    }
  }
  flush();

  // Named Mode 22
  console.log('--- Mode 22 named ---');
  const m22list = FAST ? MODE22_NAMED.filter((m) => [0x0119, 0x011a, 0x0122].includes(m.pid)) : MODE22_NAMED;
  for (const m of m22list) {
    if (ms() > deadline) break;
    const res = await tryRequest(`22:${m.pid.toString(16)}`, [0x22, (m.pid >> 8) & 0xff, m.pid & 0xff], 400);
    if (res.found || (res.frames && res.frames.length)) {
      const rawHex = res.found ? hex(res.found) : res.frames[0].payloadHex;
      capture.mode22.hits.push({ pid: `0x${m.pid.toString(16)}`, name: m.name, rawHex });
      console.log(`M22 HIT 0x${m.pid.toString(16)} ${m.name} ${rawHex}`);
    } else {
      capture.mode22.missCount++;
    }
  }

  // Module ping (read ident only)
  console.log('--- module ping ---');
  const addrs = FAST ? [0x10] : [0x10, 0x18, 0x28, 0x29, 0x60, 0x70, 0x7b];
  for (const addr of addrs) {
    if (ms() > deadline) break;
    try {
      const res = await vci.requestUds({
        protocol: PROTO_ISO15765,
        flags: FLAG_PAD,
        canId: 0x700 + addr,
        uds: [0x1a, 0x80],
        timeoutMs: 300,
      });
      const hit = !!(res.found || res.frames.length || res.raw.length > 24);
      capture.modules.push({ addr: `0x${addr.toString(16)}`, hit, rx: res.raw.length });
    } catch (err) {
      capture.modules.push({ addr: `0x${addr.toString(16)}`, error: String(err) });
    }
  }

  let snapN = 0;
  let mode22Cursor = 0x0100;
  const MODE22_END = 0x01ff;
  console.log('--- snapshot loop (drive) ---');
  console.log(FAST ? '>>> FAST idle snapshot then stop <<<' : '>>> KEEP DRIVING — no rev needed. Light-load snapshots are useful. <<<');

  while (ms() < deadline) {
    snapN += 1;
    const tRel = LIVE_MS - (deadline - ms());
    const values = [];
    for (const pid of SNAPSHOT_PIDS) {
      if (ms() > deadline) break;
      const res = await tryRequest(`snap-${pid.id}`, pid.req, 350);
      values.push(summarizePid(pid, res));
    }
    capture.snapshots.push({ label: `t=${tRel}ms #${snapN}`, values });
    const rpm = values.find((v) => v.id === '01:0C');
    const spd = values.find((v) => v.id === '01:0D');
    const mapv = values.find((v) => v.id === '01:0B');
    console.log(
      `SNAP ${snapN} rpm=${rpm?.value ?? '?'} spd=${spd?.value ?? '?'} map=${mapv?.value ?? '?'} leftover_ms=${deadline - ms()}`,
    );

    // Mode 22 brute between snapshots (small batches)
    for (let n = 0; n < 8 && mode22Cursor <= MODE22_END && ms() < deadline; n++, mode22Cursor++) {
      const pid = mode22Cursor;
      const res = await tryRequest(`22sweep:${pid.toString(16)}`, [0x22, (pid >> 8) & 0xff, pid & 0xff], 180);
      if (res.found || res.frames.length) {
        const rawHex = res.found ? hex(res.found) : res.frames[0].payloadHex;
        capture.mode22.hits.push({ pid: `0x${pid.toString(16)}`, rawHex });
        console.log(`M22 SWEEP HIT 0x${pid.toString(16)} ${rawHex}`);
      } else {
        capture.mode22.missCount++;
      }
    }

    flush();
    if (FAST) break;
    const wait = Math.max(0, SNAPSHOT_GAP_MS - 50);
    const slice = Math.min(wait, deadline - ms());
    if (slice > 0) await sleep(slice);
  }

  capture.rawLog = vci.rawExchanges;
  fs.writeFileSync(jsonPath, JSON.stringify(capture, null, 2));
  writeMd(mdPath, capture);
  await vci.close();
  fs.closeSync(logFd);
  console.log(`DONE json=${jsonPath}`);
  console.log(`DONE md=${mdPath}`);
  console.log(`DONE ndjson=${logPath}`);
  console.log(`VIN=${capture.vin || 'none'} DTCs=${capture.dtcs.length} snaps=${capture.snapshots.length} m22=${capture.mode22.hits.length}`);
}

function writeMd(mdPath, c) {
  const lines = [];
  lines.push(`# Prado OBD live capture — ${c.meta.stampIso}`);
  lines.push('');
  lines.push(`- Adapter: \`${c.adapter.id}\``);
  lines.push(`- Protocol: \`${c.adapter.protocol}\``);
  lines.push(`- Bootstrap: ${c.bootstrap.ok ? `OK baud=${c.bootstrap.baud} ctrl=${c.bootstrap.ctrl}` : 'FAILED'}`);
  lines.push(`- VIN: \`${c.vin || '(none)'}\``);
  lines.push('');
  lines.push(`## Trouble codes (${c.dtcs.length})`);
  if (c.dtcs.length === 0) lines.push('- none reported (or no ECU response)');
  else for (const d of c.dtcs) lines.push(`- **${d.code}** (${d.kind})`);
  lines.push('');
  lines.push(`## Supported / answered PIDs (${c.supported.length})`);
  lines.push(c.supported.map((s) => `\`${s.id}\` ${s.name}`).join(' · ') || '(none)');
  lines.push('');
  for (const snap of c.snapshots) {
    lines.push(`## Snapshot — ${snap.label}`);
    lines.push('| PID | Name | Value | Unit | Raw |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const v of snap.values) {
      lines.push(`| \`${v.id}\` | ${v.name} | ${v.value ?? ''} | ${v.unit} | \`${v.rawHex}\` |`);
    }
    lines.push('');
  }
  lines.push(`## Mode 22 — ${c.mode22.hits.length} hits, ${c.mode22.missCount} rejected`);
  lines.push('| ID | Candidate | Raw |');
  lines.push('| --- | --- | --- |');
  for (const h of c.mode22.hits) {
    lines.push(`| \`${h.pid}\` | ${h.name || ''} | \`${h.rawHex}\` |`);
  }
  lines.push('');
  lines.push('## Modules');
  for (const m of c.modules) lines.push(`- ${m.addr} hit=${m.hit} rx=${m.rx ?? ''} ${m.error || ''}`);
  lines.push('');
  if (c.errors.length) {
    lines.push('## Errors');
    for (const e of c.errors.slice(-30)) lines.push(`- ${e.t} ${e.where || e.label || ''} ${e.error}`);
  }
  fs.writeFileSync(mdPath, lines.join('\n'));
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});

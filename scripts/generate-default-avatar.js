import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function createPng(width, height, r, g, b) {
    // Basic uncompressed/deflated RGBA PNG
    const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8); // 8-bit depth
    ihdrData.writeUInt8(6, 9); // RGBA
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);

    function crc32(buf) {
        let c = 0 ^ (-1);
        for (let i = 0; i < buf.length; i++) {
            c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
        }
        return (c ^ (-1)) >>> 0;
    }

    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }

    function makeChunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(typeAndData), 0);
        return Buffer.concat([len, typeAndData, crc]);
    }

    const ihdrChunk = makeChunk('IHDR', ihdrData);

    // Raw image data: for each scanline: filter type byte (0) + width * 4 bytes
    const rowSize = 1 + width * 4;
    const rawData = Buffer.alloc(height * rowSize);
    const cx = width / 2;
    const cy = height / 2;
    const radius = width / 2;

    for (let y = 0; y < height; y++) {
        const offset = y * rowSize;
        rawData[offset] = 0; // Filter None
        for (let x = 0; x < width; x++) {
            const pixelOffset = offset + 1 + x * 4;
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Draw circle with blush background (#FAF7F5 = 250, 247, 245)
            // and burgundy avatar icon (#5E3435 = 94, 52, 53)
            if (dist <= radius) {
                // Inside avatar circle: check if head or shoulders
                const headDist = Math.sqrt((x - cx) * (x - cx) + (y - (cy - 10)) * (y - (cy - 10)));
                const shoulderDist = Math.sqrt((x - cx) * (x - cx) + (y - (cy + 42)) * (y - (cy + 42)));

                if (headDist <= 16 || (shoulderDist <= 32 && y > cy + 4)) {
                    // Burgundy silhouette
                    rawData[pixelOffset] = 94;
                    rawData[pixelOffset + 1] = 52;
                    rawData[pixelOffset + 2] = 53;
                    rawData[pixelOffset + 3] = 255;
                } else {
                    // Soft blush background
                    rawData[pixelOffset] = 250;
                    rawData[pixelOffset + 1] = 247;
                    rawData[pixelOffset + 2] = 245;
                    rawData[pixelOffset + 3] = 255;
                }
            } else {
                // Transparent outside circle
                rawData[pixelOffset] = 0;
                rawData[pixelOffset + 1] = 0;
                rawData[pixelOffset + 2] = 0;
                rawData[pixelOffset + 3] = 0;
            }
        }
    }

    const compressed = zlib.deflateSync(rawData);
    const idatChunk = makeChunk('IDAT', compressed);
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const pngBuffer = createPng(100, 100);

const targetDirs = [
    path.join(rootDir, 'images'),
    path.join(rootDir, 'www', 'images')
];

for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, 'default-avatar.png');
    fs.writeFileSync(filePath, pngBuffer);
    console.log('Created valid default-avatar.png at:', filePath);
}

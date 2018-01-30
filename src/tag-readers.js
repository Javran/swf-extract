import { SWFBuffer } from './swf-buffer'
import { SwfTags } from './swf-tags'

/*
   for parsing from rawData of tags
   which is the sliced version whose content starts
   at index 0
*/
const tagReaders = {}

const define = (code, reader) => {
  tagReaders[code] = buffer => ({
    code,
    ...reader(buffer),
  })
}

define(SwfTags.DefineBits, buffer => {
  const buff = new SWFBuffer(buffer)
  const length = buffer.length
  const characterId = buff.readUIntLE(16)
  const jpegData = buff.buffer.slice(buff.pointer, buff.pointer + length - 2)
  buff.incr(length - 2)
  return {
    characterId,
    jpegData,
  }
})

define(SwfTags.JPEGTables, buffer => {
  const buff = new SWFBuffer(buffer)
  const length = buffer.length
  const jpegData = buff.buffer.slice(buff.pointer, buff.pointer + length)
  buff.incr(length)
  return {
    jpegData,
  }
})

define(SwfTags.DefineBitsJPEG2, buffer => {
  const buff = new SWFBuffer(buffer)
  const length = buffer.length
  const characterId = buff.readUIntLE(16)
  const imageData = buff.buffer.slice(buff.pointer, buff.pointer + length - 2)
  buff.incr(length - 2)
  return {
    characterId,
    imageData,
  }
})

define(SwfTags.DefineBitsJPEG3, buffer => {
  const buff = new SWFBuffer(buffer)
  const length = buffer.length
  const characterId = buff.readUIntLE(16)
  const alphaDataOffset = buff.readUIntLE(32)
  const imageData = buff.buffer.slice(buff.pointer, buff.pointer+alphaDataOffset)
  buff.incr(alphaDataOffset)
  const restLength = length - 6 - alphaDataOffset
  const bitmapAlphaData = buff.buffer.slice(buff.pointer, buff.pointer+restLength)
  buff.incr(restLength)
  return {
    characterId,
    alphaDataOffset,
    imageData,
    bitmapAlphaData,
  }
})

const gDefineBitsLosslessHandler = code => buffer => {
  const buff = new SWFBuffer(buffer)
  const length = buffer.length
  const characterId = buff.readUIntLE(16)
  /*
     bitmapFormat:
     - 3: 8-bit colormapped image
     - 4: 15-bit RGB image (no such value for DefineBitsLossless2)
     - 5: 32-bit ARGB image
   */
  const bitmapFormat = buff.readUInt8()
  const bitmapWidth = buff.readUIntLE(16)
  const bitmapHeight = buff.readUIntLE(16)
  let bitmapColorTableSize = null
  let restLength = length - 7
  if (bitmapFormat === 3) {
    bitmapColorTableSize = buff.readUInt8()
    --restLength
  }
  const zlibBitmapData = buff.buffer.slice(buff.pointer, buff.pointer+restLength)
  buff.incr(restLength)
  return {
    code,
    characterId,
    bitmapFormat,
    bitmapWidth, bitmapHeight,
    bitmapColorTableSize,
    zlibBitmapData,
  }
}

tagReaders[SwfTags.DefineBitsLossless] =
  gDefineBitsLosslessHandler(SwfTags.DefineBitsLossless)

tagReaders[SwfTags.DefineBitsLossless2] =
  gDefineBitsLosslessHandler(SwfTags.DefineBitsLossless2)

define(SwfTags.DefineBitsJPEG4, buffer => {
  const buff = new SWFBuffer(buffer)
  const length = buffer.length
  const characterId = buff.readUIntLE(16)
  const alphaDataOffset = buff.readUIntLE(32)
  const deblockParam = buff.readUIntLE(16)
  const imageData = buff.buffer.slice(buff.pointer, buff.pointer+alphaDataOffset)
  buff.incr(alphaDataOffset)
  const restLength = length - 8 - alphaDataOffset
  const bitmapAlphaData = buff.buffer.slice(buff.pointer, buff.pointer + restLength)
  buff.incr(restLength)
  return {
    characterId,
    alphaDataOffset,
    deblockParam,
    imageData,
    bitmapAlphaData,
  }
})

define(SwfTags.DefineSound, buffer => {
  const buff = new SWFBuffer(buffer)
  const soundId = buff.readUIntLE(16)
  // UB[4] + UB[2] + UB[1] + UB[1] = 8 bits = sizeof uint8
  const infoBits = buff.readUInt8()
  /* eslint-disable no-bitwise */
  const soundFormat = (infoBits >>> 4) & 0b1111
  const soundRate = (infoBits >>> 2) & 0b0011
  const soundSize = (infoBits >>> 1) & 0b0001
  const soundType = infoBits & 0b0001
  /* eslint-enable no-bitwise */
  const soundSampleCount = buff.readUIntLE(32)
  const soundData = buff.buffer.slice(buff.pointer)
  return {
    soundId,
    soundFormat,
    soundRate,
    soundSize,
    soundType,
    soundSampleCount,
    soundData,
  }
})

export { tagReaders }

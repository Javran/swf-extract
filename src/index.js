/**
 * Simple module for reading SWF properties
 *
 * (c) 2014 Rafael Leal Dias <rafaeldias.c at gmail dot com>
 * MIT LICENCE
 *
 */
import zlib from 'zlib'
import lzma from 'lzma-purejs'
import Stream from 'stream'

import SWFBuffer from './lib/swf-buffer'
import SWFTags from './lib/swf-tags'

const readSWFTags = buff => {
  const tags = []

  while (buff.pointer < buff.buffer.length) {
    const tagHeader = buff.readTagCodeAndLength()
    const tag = {
      header: tagHeader,
      rawData: buff.buffer.slice(buff.pointer, buff.pointer+tagHeader.length),
    }
    buff.incr(tagHeader.length)
    tags.push(tag)
  }
  if (
    tags.length === 0 ||
    tags[tags.length-1].header.code !== 0
  ) {
    console.warn('End tag is not the last one in this SWF file')
  }
  return tags
}

/**
 * Reads tags and their contents, passaing a SWF object to callback
 *
 * @param {SWFBuffer} buff
 * @param {Buffer} compressed_buff
 * @api private
 *
 */
const readSWFBuff = (buff, compressedBuff) => {
  buff.seek(3)// start

  const swf = {
    version: buff.readUInt8(),
    fileLength: {
      compressed: compressedBuff.length,
      uncompressed: buff.readUIntLE(32),
    },
    // Returns a RECT object. i.e : { x : 0, y : 0, width : 200, height: 300 }
    frameSize: buff.readRect(),
    frameRate: buff.readUIntLE(16)/256,
    frameCount: buff.readUIntLE(16),
  }

  swf.tags = readSWFTags(buff)
  return swf
}

/**
 * Uncompress SWF and start reading it
 *
 * @param {Buffer} swf
 *
 */
const uncompress = swf => {
  const next = undefined
  let compressedBuff = swf.slice(8)
  let uncompressedBuff

  const [swfType] = swf
  // uncompressed
  if (swfType === 0x46) {
    return readSWFBuff(new SWFBuffer(swf), swf)
  }
  // zlib compressed
  if (swfType === 0x43) {
    uncompressedBuff = Buffer.concat([swf.slice(0, 8), zlib.unzipSync(compressedBuff)])
    return readSWFBuff(new SWFBuffer(uncompressedBuff), swf)
  }

  // lzma compressed
  if (swfType === 0x5a) {
    const lzmaProperties = compressedBuff.slice(4, 9)
    compressedBuff = compressedBuff.slice(9)

    const inputStream = new Stream()
    {
      const inpState = {pos: 0}
      inputStream.readByte = () => {
        if (inpState.pos < compressedBuff.length) {
          const v = compressedBuff[inpState.pos]
          ++inpState.pos
          return v
        } else {
          return -1
        }
      }
    }

    const outputStream = new Stream()
    {
      const outState = {
        buffer: new Buffer(16384),
        pos: 0,
      }
      outputStream.writeByte = _byte => {
        if (outState.pos >= outState.buffer.length) {
          const curLen = outState.buffer.length
          outState.buffer = Buffer.concat(
            [outState.buffer, new Buffer(curLen)],curLen*2
          )
        }
        outState.buffer[outState.pos] = _byte
        ++outState.pos
      }
      outputStream.getBuffer = () =>
        (outState.pos !== outState.buffer.length) ?
          outState.buffer.slice(0,outState.pos) :
          outState.buffer
    }

    lzma.decompress(lzmaProperties, inputStream, outputStream, -1)
    uncompressedBuff = Buffer.concat([swf.slice(0, 8), outputStream.getBuffer()])

    return readSWFBuff(new SWFBuffer(uncompressedBuff), swf, next)
  }

  throw new Error(`Unknown SWF compression type: ${swfType}`)
}

const readFromBuffer = buffer => {
  if (! Buffer.isBuffer(buffer))
    throw new Error(`expecting a buffer`)

  return uncompress(buffer)
}

export { readFromBuffer, SWFTags }

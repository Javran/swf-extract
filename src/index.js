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

import { SWFBuffer } from './swf-buffer'

const readSWFTags = (buff, callbacks) => {
  while (buff.pointer < buff.buffer.length) {
    const {code,length} = buff.readTagCodeAndLength()
    const pos = buff.pointer
    setTimeout(() =>
      callbacks.tag(code,length,buff.buffer,pos))
    buff.incr(length)
  }
  setTimeout(() => callbacks.done())
}

/**
 * Reads tags and their contents, passing a SWF object to callback
 *
 * @param {SWFBuffer} buff
 * @param {Buffer} compressed_buff
 * @api private
 *
 */
const readSWFBuff = (buff, compressedBuff, callbacks) => {
  // skipping magic numbers
  buff.seek(3)

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
  setTimeout(() => callbacks.header(swf))
  readSWFTags(buff, callbacks)
}

/**
 * Uncompress SWF and start reading it
 *
 * @param {Buffer} swf
 *
 */
const uncompress = (swf, callbacks) => {
  const [swfType] = swf
  // uncompressed
  if (swfType === 0x46) {
    return readSWFBuff(new SWFBuffer(swf), swf, callbacks)
  }
  // zlib compressed
  if (swfType === 0x43) {
    const compressedBuff = swf.slice(8)
    const uncompressedBuff =
      Buffer.concat([swf.slice(0, 8), zlib.unzipSync(
        compressedBuff,
        /*

           suppress default error handling in case the file is truncated

           ref: https://nodejs.org/api/zlib.html as of Jan 03, 2018

         */
        { finishFlush: zlib.constants.Z_SYNC_FLUSH }
      )])
    return readSWFBuff(new SWFBuffer(uncompressedBuff), swf, callbacks)
  }

  // lzma compressed
  if (swfType === 0x5a) {
    /*
       reference: https://helpx.adobe.com/flash-player/kb/exception-thrown-you-decompress-lzma-compressed.html

       - 0~3: ZWS + version
       - 4~7: Uncompressed length
       - 8~11: Compressed length bytes
       - 12~16: LZMA properties
       - 17~: Compressed data
     */

    const compressedBuff = swf.slice(17)
    const lzmaProperties = swf.slice(12,16+1)
    const uncompressedLenBuff = swf.slice(4,7+1)
    /* eslint-disable no-bitwise */
    const uncompressedLength =
      uncompressedLenBuff[0] +
      (uncompressedLenBuff[1] << 8) +
      (uncompressedLenBuff[2] << 16) +
      (uncompressedLenBuff[3] << 24) - 8
    /* eslint-enable no-bitwise */

    /*
    // this part works with
    // but it's just too slow to be useful
    const lzma2 = require('lzma')


    const recompressLenBuff = Buffer.alloc(8,0)
    recompressLenBuff[0] = uncompressedLength & 0xFF
    recompressLenBuff[1] = (uncompressedLength >> 8) & 0xFF
    recompressLenBuff[2] = (uncompressedLength >> 16) & 0xFF
    recompressLenBuff[3] = (uncompressedLength >> 24) & 0xFF
    const lzmaData = Buffer.concat([lzmaProperties,recompressLenBuff,compressedBuff])


    if (true) {
      const uncompressedBuff = Buffer.from(lzma2.decompress(lzmaData))
      return readSWFBuff(new SWFBuffer(uncompressedBuff), swf, callbacks)
    }

    */

    const inputStream = new Stream()

    {
      let pos = 0
      inputStream.readByte = () => {
        if (pos < compressedBuff.length) {
          const v = compressedBuff[pos]
          ++pos
          return v
        } else {
          return -1
        }
      }
    }

    const outputStream = new Stream()

    {
      const buffer = new Buffer(uncompressedLength)
      let pos = 0

      outputStream.writeByte = _byte => {
        buffer[pos] = _byte
        ++pos
      }

      outputStream.getBuffer = () =>
        (pos !== buffer.length) ?
          buffer.slice(0,pos) :
          buffer
    }

    lzma.decompress(lzmaProperties, inputStream, outputStream, -1)
    const uncompressedBuff = Buffer.concat([swf.slice(0, 8), outputStream.getBuffer()])
    return readSWFBuff(new SWFBuffer(uncompressedBuff), swf, callbacks)
  }

  setTimeout(() => callbacks.error(new Error(`Unknown SWF compression type: ${swfType}`)))
}

/*
   callbacks:

   error(e)

   header(swf)
   tag(code,length,buffer,pos)
   done()

 */
const readFromBuffer = (buffer,callbacks) => {
  if (! Buffer.isBuffer(buffer))
    throw new Error(`expecting a buffer`)

  return uncompress(buffer,callbacks)
}

const readFromBufferP = buffer => new Promise(
  (resolve, reject) => {
    const data = {tags: []}
    readFromBuffer(buffer,{
      error: e => reject(e),
      header: swf => Object.assign(data,swf),
      tag: (code, length, swfBuf, pos) => {
        const tag = {
          code, length,
          rawData: Buffer.from(swfBuf.buffer,pos,length),
        }
        data.tags.push(tag)
      },
      done: () => resolve(data),
    })
  })

export * from './tag-readers'
export * from './swf-tags'
export * from './extract-images'
export * from './extract-sounds'
export { readFromBuffer, readFromBufferP }

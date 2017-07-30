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
      Buffer.concat([swf.slice(0, 8), zlib.unzipSync(compressedBuff)])
    return readSWFBuff(new SWFBuffer(uncompressedBuff), swf, callbacks)
  }

  // lzma compressed
  if (swfType === 0x5a) {
    let compressedBuff = swf.slice(8)

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
export { readFromBuffer, readFromBufferP }

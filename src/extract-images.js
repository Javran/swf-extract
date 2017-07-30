import _ from 'lodash'
import JPEGDecoder from 'jpg-stream/decoder'
import PNGEncoder from 'png-stream/encoder'
import zlib from 'zlib'
import stream from 'stream'
import concat from 'concat-frames'
import toArray from 'stream-to-array'

import { SwfTags } from './swf-tags'
import { tagReaders } from './tag-readers'

const imageTagCodes = [
  SwfTags.DefineBits,
  SwfTags.DefineBitsJPEG2,
  SwfTags.DefineBitsJPEG3,
  SwfTags.DefineBitsLossless,
  SwfTags.DefineBitsLossless2,
  SwfTags.DefineBitsJPEG4,
]

const extractors = {}

// each extractor either returns a value or a Promise
const define = (code, extractor) => {
  extractors[code] = (tagData, context) => {
    const extractorResult = extractor(tagData, context)
    if (typeof extractorResult.then === 'function') {
      return new Promise(resolve =>
        extractorResult.then(r =>
          resolve({code, ...r})))
    } else {
      return {
        code,
        ...extractorResult,
      }
    }
  }
}

const pngMagic = Buffer.from('0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A'.split(' ').map(Number))
const gifMagic = Buffer.from('0x47 0x49 0x46 0x38 0x39 0x61'.split(' ').map(Number))
const recognizeHeader = buffer => {
  if (pngMagic.equals(Buffer.from(buffer.buffer, 0, pngMagic.length)))
    return 'png'
  if (gifMagic.equals(Buffer.from(buffer.buffer, 0, gifMagic.length)))
    return 'gif'
  return 'jpeg'
}

const defineDummy = code =>
  define(code, tagData => {
    const {characterId} = tagData
    return {
      characterId,
      imgType: 'TODO',
      imgData: 'TODO',
    }
  })

define(SwfTags.DefineBits, (tagData, context) => {
  const {characterId, jpegData} = tagData
  const attachJpegTables = context.thunkAttachJpegTables()
  return {
    characterId,
    imgType: 'jpeg',
    imgData: attachJpegTables(jpegData),
  }
})

define(SwfTags.DefineBitsJPEG2, tagData => {
  const {characterId, imageData} = tagData
  const imgType = recognizeHeader(imageData)
  return {
    characterId,
    imgType,
    imgData: imageData,
  }
})

define(SwfTags.DefineBitsJPEG3, tagData => {
  const {characterId, imageData} = tagData
  const imgType = recognizeHeader(imageData)
  if (imgType !== 'jpeg') {
    return {
      characterId,
      imgType,
      imgData: imageData,
    }
  }

  const {bitmapAlphaData} = tagData
  return new Promise((resolve, reject) => {
    const enc = new PNGEncoder(undefined, undefined, {colorSpace: 'rgba'})
    zlib.unzip(bitmapAlphaData, (err, alphaBuf) => {
      if (err)
        reject(new Error(err))
      const bufferStream = new stream.PassThrough()
      bufferStream.end(imageData)
      bufferStream
        .pipe(new JPEGDecoder())
        .pipe(concat(([frame]) => {
          const input = frame.pixels
          const output = new Buffer(frame.width * frame.height * 4)
          for (let i = 0; i < alphaBuf.length; ++i) {
            output[4 * i] = input[3 * i]
            output[4 * i + 1] = input[3 * i + 1]
            output[4 * i + 2] = input[3 * i + 2]
            output[4 * i + 3] = alphaBuf[i]
          }
          enc.format.width = frame.width
          enc.format.height = frame.height
          enc.end(output)
        }))
    })

    toArray(enc).then(parts => {
      const buffers = parts
        .map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))
      // console.log(imgType)
      resolve({
        characterId,
        imgType: 'png',
        imgData: Buffer.concat(buffers),
      })
    })
  })
})

defineDummy(SwfTags.DefineBitsLossless)
defineDummy(SwfTags.DefineBitsLossless2)
defineDummy(SwfTags.DefineBitsJPEG4)

const mkContext = rawTags => ({
  // call without argument for the memoization to work.
  // returns a thunk that evaluates a function which can be used to
  // attach the JPEGTables tag in front of a DefineBits tag
  thunkAttachJpegTables: _.memoize(() => {
    const jpegTablesCandidates =
      rawTags.filter(rt => rt.code === SwfTags.JPEGTables)

    if (jpegTablesCandidates.length > 1) {
      console.warn('There may only be one JPEGTables tag in a SWF file')
      return _.identity
    }

    if (jpegTablesCandidates.length === 0) {
      console.warn('Expecting a JPEGTables tag but found none')
      return _.identity
    }

    const [jpegTablesRawTag] = jpegTablesCandidates
    const jpegTablesTag = tagReaders[SwfTags.JPEGTables](jpegTablesRawTag.rawData)

    // nothing to attach if JPEGTables turns out to be empty
    if (jpegTablesTag.jpegData.length === 0) {
      return _.identity
    } else {
      return imgBuffer =>
        Buffer.concat([
          jpegTablesTag.jpegData,
          imgBuffer,
        ])
    }
  }),
})

/*
   extracts image data Buffer from raw tags.

   tags are assume to be an Object of at least following structure:
   - code: number
   - rawData: Buffer that contains raw data of that tag, starts right after
     the length field of a tag.

   returns an Array of Promises for every image tag

   every resolved result is guaranteed to have the following structure:

   - code: number
   - characterId: number
   - imgType: jpg / png / gif
   - imgData: Buffer

 */
const extractImages = rawTags => {
  const context = mkContext(rawTags)

  return rawTags
    .filter(t => imageTagCodes.includes(t.code))
    .map(rawTag => new Promise(resolve => {
      // parse tag into structures as described by spec
      const tag = tagReaders[rawTag.code](rawTag.rawData)
      Promise.resolve(extractors[tag.code](tag, context)).then(resolve)
    }))
}

export { extractImages }

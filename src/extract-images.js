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

const coverageFlag = false
const coverage =
  coverageFlag ?
    // eslint-disable-next-line no-console
    msg => console.log(`coverage: ${msg}`) :
    () => undefined

// each extractor either returns either a value or a Promise
const extractors = {}

// use this only for extractors that don't return a Promise
const define = (code, extractor) => {
  extractors[code] = (tagData, context) => ({
    code,
    ...extractor(tagData, context),
  })
}

const pngMagic = Buffer.from('0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A'.split(' ').map(Number))
const gifMagic = Buffer.from('0x47 0x49 0x46 0x38 0x39 0x61'.split(' ').map(Number))
const recognizeHeader = buffer => {
  if (pngMagic.equals(buffer.slice(0, pngMagic.length)))
    return 'png'
  if (gifMagic.equals(buffer.slice(0, gifMagic.length)))
    return 'gif'
  return 'jpeg'
}

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

const gDefineBitsJPEG3or4Handler = code => tagData => {
  const {characterId, imageData} = tagData
  const imgType = recognizeHeader(imageData)
  if (imgType !== 'jpeg') {
    return {
      code,
      characterId,
      imgType,
      imgData: imageData,
    }
  }

  const {bitmapAlphaData} = tagData
  return new Promise((resolve, reject) => {
    const enc = new PNGEncoder(undefined, undefined, {colorSpace: 'rgba'})
    zlib.unzip(bitmapAlphaData, (err, alphaBufPre) => {
      // INVARIANT: alphaBuf is either null or a non-empty buffer
      let alphaBuf = null
      if (err) {
        /*
           Due to a bug present in node zlib (https://github.com/nodejs/node/issues/17041)
           unzipping an empty buffer can raise "unexpected end of file" error.
           We fix this here so that our impl does not depend on the version of node
           being used.

           Theoretically every zlib.unzip call needs to be guarded, but for this package,
           other two zlib.unzip call happens at sites that an empty uncompressed Buffer
           does not make sense. So I think the current fix is good enough.
         */
        if (bitmapAlphaData.length > 0) {
          return reject(new Error(err))
        }
        // leaving alphaBuf as null
      } else {
        // ensure alphaBuf is only assigned an non-empty Buffer
        if (alphaBufPre.length > 0)
          alphaBuf = alphaBufPre
      }
      const bufferStream = new stream.PassThrough()
      bufferStream.end(imageData)
      bufferStream
        .pipe(new JPEGDecoder())
        .pipe(concat(([frame]) => {
          const input = frame.pixels
          const pCount = frame.width*frame.height
          const output = new Buffer(pCount*4)
          if (alphaBuf !== null && alphaBuf.length !== pCount) {
            console.error(`expect alphaBuf to have size ${pCount} while getting ${alphaBuf.length}`)
          }
          const getAlphaBuf =
            alphaBuf === null ? _ignored => 0xff :
            i => alphaBuf[i]

          for (let i = 0; i < pCount; ++i) {
            output[4*i] = input[3*i]
            output[4*i+1] = input[3*i+1]
            output[4*i+2] = input[3*i+2]
            output[4*i+3] = getAlphaBuf(i)
          }
          enc.format.width = frame.width
          enc.format.height = frame.height
          enc.end(output)
        }))
    })
    toArray(enc).then(parts => {
      const buffers = parts
        .map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))
      resolve({
        code,
        characterId,
        imgType: 'png',
        imgData: Buffer.concat(buffers),
      })
    })
  })
}

extractors[SwfTags.DefineBitsJPEG3] =
  gDefineBitsJPEG3or4Handler(SwfTags.DefineBitsJPEG3)
extractors[SwfTags.DefineBitsJPEG4] =
  gDefineBitsJPEG3or4Handler(SwfTags.DefineBitsJPEG4)

extractors[SwfTags.DefineBitsLossless] = tagData => new Promise(
  (resolve,reject) => {
    const {
      characterId, bitmapFormat,
      bitmapWidth, bitmapHeight,
      bitmapColorTableSize, zlibBitmapData,
    } = tagData

    const enc = new PNGEncoder(bitmapWidth, bitmapHeight, {colorSpace: 'rgb'})
    zlib.unzip(zlibBitmapData, (err, dataBuf) => {
      if (err)
        return reject(new Error(err))
      const output = new Buffer(bitmapWidth * bitmapHeight * 3)
      /* eslint-disable no-bitwise */
      if (
        // 15-bit RGB image
        bitmapFormat === 4 ||
        // 24-bit RGB image
        bitmapFormat === 5
      ) {
        if (bitmapFormat === 4)
          coverage(`DefineBitsLossless 15-bit`)
        let index = 0
        let ptr = 0
        for (let y = 0; y < bitmapHeight; ++y) {
          for (let x = 0; x < bitmapWidth; ++x) {
            if (bitmapFormat === 4) {
              // 15-bit RGB image
              const val = dataBuf[ptr] << 8 + dataBuf[ptr + 1]
              // pix15red
              output[index] = (val & 0x7c00) >> 10
              // pix15green
              output[index+1] = (val & 0x3e0) >> 5
              // pix15blue
              output[index+2] = val & 0x1f
              ptr += 2
              index += 3
            } else {
              // 24-bit RGB image
              ++ptr // skip reversed byte
              output[index] = dataBuf[ptr]
              output[index+1] = dataBuf[ptr+1]
              output[index+2] = dataBuf[ptr+2]
              ptr += 3
              index += 3
            }
          }
          if (bitmapWidth % 2 !== 0) {
            ptr += 2 // skip padding
          }
        }
      } else if (bitmapFormat === 3) {
        // 8-bit colormapped image
        const colorMap = []
        let index = 0
        let ptr = 0
        for (let i = 0; i < bitmapColorTableSize + 1; ++i) {
          colorMap.push([dataBuf[ptr], dataBuf[ptr+1], dataBuf[ptr+2]])
          ptr += 3
        }
        for (let y = 0; y < bitmapHeight; ++y) {
          for (let x = 0; x < bitmapWidth; ++x) {
            const idx = dataBuf[ptr]
            ++ptr
            const color = idx < colorMap.length ? colorMap[idx] : [0, 0, 0]
            output[index] = color[0]
            output[index+1] = color[1]
            output[index+2] = color[2]
            index += 3
          }
          // skip padding
          ptr += (4 - bitmapWidth % 4) % 4
        }
      } else {
        return reject(new Error(`unhandled bitmapFormat: ${bitmapFormat}`))
      }
      /* eslint-enable no-bitwise */
      enc.end(output)
    })

    toArray(enc).then(parts => {
      const buffers = parts
        .map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))
      resolve({
        code: SwfTags.DefineBitsLossless,
        characterId,
        imgType: 'png',
        imgData: Buffer.concat(buffers),
      })
    })
  }
)

extractors[SwfTags.DefineBitsLossless2] = tagData => {
  const {
    characterId, bitmapFormat,
    bitmapWidth, bitmapHeight,
    bitmapColorTableSize, zlibBitmapData,
  } = tagData

  return new Promise((resolve, reject) => {
    const enc = new PNGEncoder(bitmapWidth, bitmapHeight, {colorSpace: 'rgba'})

    zlib.unzip(zlibBitmapData,(err, dataBuf) => {
      if (err) {
        return reject(new Error(err))
      }
      const output = new Buffer(bitmapWidth * bitmapHeight * 4)
      let index = 0
      let ptr = 0
      if (bitmapFormat === 5) {
        // 32-bit ARGB image
        for (let y = 0; y < bitmapHeight; ++y) {
          for (let x = 0; x < bitmapWidth; ++x) {
            const alpha = dataBuf[ptr]
            output[index] = dataBuf[ptr+1]
            output[index+1] = dataBuf[ptr+2]
            output[index+2] = dataBuf[ptr+3]
            output[index+3] = alpha
            index += 4
            ptr += 4
          }
        }
      } else if (bitmapFormat === 3) {
        // 8-bit colormapped image
        const colorMap = []
        for (let i = 0; i < bitmapColorTableSize + 1; ++i) {
          colorMap.push([dataBuf[ptr], dataBuf[ptr+1], dataBuf[ptr+2], dataBuf[ptr+3]])
          ptr += 4
        }
        for (let y = 0; y < bitmapHeight; ++y) {
          for (let x = 0; x < bitmapWidth; ++x) {
            const idx = dataBuf[ptr]
            const color = idx < colorMap.length ? colorMap[idx] : [0, 0, 0, 0]
            output[index] = color[0]
            output[index+1] = color[1]
            output[index+2] = color[2]
            output[index+3] = color[3]
            ptr += 1
            index += 4
          }
          // skip padding
          ptr += (4 - bitmapWidth % 4) % 4
        }
      } else {
        return reject(new Error(`unhandled bitmapFormat: ${bitmapFormat}`))
      }
      enc.end(output)
    })

    toArray(enc).then(parts => {
      const buffers = parts
        .map(part => Buffer.isBuffer(part) ? part : Buffer.from(part))
      resolve({
        code: SwfTags.DefineBitsLossless2,
        characterId,
        imgType: 'png',
        imgData: Buffer.concat(buffers),
      })
    })
  }).catch(e => {
    console.error(e)
  })
}

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
      coverage('JPEGTables non-empty')
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

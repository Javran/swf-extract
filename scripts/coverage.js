/* eslint-disable no-console */
const fs = require('fs')
const { readFromBufferP, extractImages } = require('../dist')

const rawData = fs.readFileSync('../samples/sample1.swf');

(async () => {
  const swf = await readFromBufferP(rawData)
  console.time('extract')
  const tr = ({code, characterId, imgType, imgData}) =>
    ({code, characterId, imgType, imgDataLen: imgData.length})
  const ts = await Promise.all(extractImages(swf.tags))
  console.timeEnd('extract')

  ts.map(t => console.log(tr(t)))
})()

/*

   coverage:

   - SwfTags.DefineBits

     - empty JPEGTables: sample1.swf
     - non-empty JPEGTables

   - SwfTags.DefineBitsJPEG2

     - png: sample1.swf
     - gif: sample1.swf
     - jpeg: sample1.swf

   - SwfTags.DefineBitsJPEG3

     - png: sample1.swf
     - gif: sample1.swf
     - jpeg: sample1.swf

   - SwfTags.DefineBitsLossless

     - 15-bit RGB
     - 24-bit RGB: sample1.swf
     - 8-bit colormapped image: sample1.swf

   - SwfTags.DefineBitsLossless2

     - 32-bit ARGB image: sample1.swf
     - 8-bit colormapped image: sample1.swf

   - SwfTags.DefineBitsJPEG4

     - png: sample1.swf
     - gif: sample1.swf
     - jpeg: sample1.swf

 */

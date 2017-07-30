/* eslint-disable no-console */
const fs = require('fs')
const _ = require('lodash')

const { readFromBufferP } = require('../dist')

const cmp = (x,y) => {
  const newX = Object.assign({},x)
  delete newX.fileLength
  const newY = Object.assign({},y)
  delete newY.fileLength
  return _.isEqual(newX,newY)
}

[
  ['raw', '../samples/sample1-raw.swf'],
  ['zlib', '../samples/sample1-zlib.swf'],
  ['lzma', '../samples/sample1-lzma.swf'],
].reduce(
  (p, [ty, fName]) => p.then(results => {
    const rawData = fs.readFileSync(fName)
    const testLabel = `test.${ty}`
    console.time(testLabel)
    return readFromBufferP(rawData).then(d => {
      console.timeEnd(testLabel)
      return (results.push(d), results)
    })
  }),
  Promise.resolve([]))
 .then(results => {
   console.log(_.sum(results[0].tags.map(x => x.rawData.length)))
   console.log(cmp(results[0],results[1]))
 })

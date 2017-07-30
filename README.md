## SWF Extract

Extract resources from SWF files.

For now this project aims at extracting image data from SWF files. More things would be implemented in future.

## Installation

```shell
$ npm install swf-extract
```

## Usage

```javascript
const {readFromBufferP, extractImages} = require('swf-extract')

// `rawData` could come from file, network, etc.
// as long as it end up being a Buffer.
const rawData = fs.readFileSync(<path-to-your-file>)

(async () => {
  const swf = await readFromBufferP(rawData)
  // the result of calling `extractImages` resolves to an Array of Promises
  const ts = await Promise.all(extractImages(swf.tags))
  console.log(ts)
})()
```

## Acknowledgement

This project cannot be possible without work from the following 3 packages:

- [swf-reader](https://github.com/rafaeldias/swf-reader)
- [gizeta/swf-reader](https://github.com/Gizeta/swf-reader)
- [swf-image-extractor](https://github.com/Gizeta/swf-image-extractor)

The original author is [Rafael Leal Dias][rdleal-git], who works out most of the parsing logics.
Then it's modified & improved by [Gizeta](https://github.com/Gizeta) to include many supports and bug fixes,
who is also the author of `swf-image-extractor`,
which provides the original implementation of image extraction from SWF files.

## License

MIT

[nodejs]: http://www.nodejs.org
[swf-format]: http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/swf/pdf/swf-file-format-spec.pdf
[rdleal-git]: https://github.com/rafaeldias

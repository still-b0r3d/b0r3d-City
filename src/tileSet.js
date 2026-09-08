/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

// Tiles must be 16px square. The sheet itself no longer has to be square, or have a
// perfect-square tile count -- tile geometry is derived from the loaded image's own
// pixel dimensions in _verifyImage below, so growing the tileset is just appending more
// 16px-tall rows to the bottom of the image, in any quantity.
var TILE_SIZE = 16;


function TileSet(image, callback, errorCallback) {
  if (!(this instanceof TileSet))
    return new TileSet(image, callback, errorCallback);

  if (callback === undefined || errorCallback === undefined) {
    if (callback === undefined && errorCallback === undefined)
      throw new Error('Tileset constructor called with no callback or errorCallback');
    else
      throw new Error('Tileset constructor called with no ' + (callback === undefined ? 'callback' : 'errorCallback'));
  }

  this.isValid = false;

  if (!(image instanceof Image)) {
    // Spin the event loop
    window.setTimeout(errorCallback, 0);
    return;
  }

  this._verifyImage(image, callback, errorCallback);
}


TileSet.prototype._verifyImage = function(image, callback, errorCallback) {
  var width = image.width;
  var height = image.height;

  // We expect the sheet's width and height to each be an exact multiple of the tile
  // size -- no longer required to be square or a perfect-square tile count.
  if (width % TILE_SIZE !== 0 || height % TILE_SIZE !== 0) {
    // Spin the event loop
    window.setTimeout(errorCallback, 0);
    return;
  }

  var tileWidth = this.tileWidth = TILE_SIZE;
  var TILES_PER_ROW = width / TILE_SIZE;

  // We paint the image onto a canvas so we can split it up
  var c = document.createElement('canvas');
  c.width = tileWidth;
  c.height = tileWidth;
  var cx = c.getContext('2d');

  // Count how many tiles we have created
  var tileCount = TILES_PER_ROW * (height / TILE_SIZE);
  var notifications = 0;
  var self = this;

  // Callback triggered by an image load. Checks to see if we are done creating images,
  // and if so notifies the caller.
  var imageLoad = function() {
    notifications++;

    if (notifications === tileCount) {
      self.isValid = true;
      // Spin the event loop
      window.setTimeout(callback, 0);
      return;
    }
  };

  // Break up the source image into tiles by painting each tile onto a canvas, computing the dataURI
  // of the canvas, and using that to create a new image, which we install on ourselves as a new property
  for (var i = 0; i < tileCount; i++) {
    cx.clearRect(0, 0, tileWidth, tileWidth);

    var sourceX = i % TILES_PER_ROW * tileWidth;
    var sourceY = Math.floor(i / TILES_PER_ROW) * tileWidth;
    cx.drawImage(image, sourceX, sourceY, tileWidth, tileWidth, 0, 0, tileWidth, tileWidth);

    this[i] = new Image();
    this[i].onload = imageLoad;
    this[i].src = c.toDataURL();
  }
};


export { TileSet };
